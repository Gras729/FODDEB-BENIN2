/**
 * FODDEB — api/dons/index.js
 * Route Vercel : /api/dons
 * Actions publiques : create (initie le don via FedaPay) · fedapay_webhook
 * Actions protégées : list · get · update · delete
 */

import { supabase, ok, err, authGuard, hasRole, makeRef, log } from '../../lib/supabase.js';

const FEDAPAY_SECRET = process.env.FEDAPAY_SECRET_KEY;
const FEDAPAY_BASE   = 'https://api.fedapay.com/v1';
const PUBLIC_ACTIONS = ['create', 'fedapay_webhook'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 'Méthode non autorisée', 405);

  const { action, ...body } = req.body || {};
  if (!action) return err(res, 'Action manquante');

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  let membre = null;
  if (!PUBLIC_ACTIONS.includes(action)) {
    membre = await authGuard(req);
    if (!membre) return err(res, 'Non authentifié.', 401);
  }

  try {
    switch (action) {
      case 'create':           return await actionCreate(body, res, ip);
      case 'fedapay_webhook':  return await actionWebhook(body, res, req);
      case 'list':             return await actionList(body, res, membre);
      case 'get':              return await actionGet(body, res, membre);
      case 'update':           return await actionUpdate(body, res, membre, ip);
      case 'delete':           return await actionDelete(body, res, membre, ip);
      default:                 return err(res, 'Action inconnue');
    }
  } catch (e) {
    console.error('[dons]', e.message);
    return err(res, 'Erreur interne', 500);
  }
}

// ────────────────────────────────────────────────────────────
// CRÉER UN DON — initie la transaction FedaPay
// ────────────────────────────────────────────────────────────

async function actionCreate({ prenom, nom, email, montant, type_don = 'don_libre', mode = 'mobile_money' }, res, ip) {
  if (!prenom || !nom || !email || !montant)
    return err(res, 'Champs requis : prénom, nom, email, montant.');
  if (isNaN(montant) || Number(montant) <= 0)
    return err(res, 'Montant invalide.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return err(res, 'Email invalide.');

  const ref = makeRef('DON');

  // Appel FedaPay
  const fedaRes = await fetch(`${FEDAPAY_BASE}/transactions`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${FEDAPAY_SECRET}`,
    },
    body: JSON.stringify({
      description: `Don FODDEB — ${type_don}`,
      amount:      Number(montant),
      currency:    { iso: 'XOF' },
      callback_url: process.env.SITE_URL + '/api/dons',
      customer:    { firstname: prenom, lastname: nom, email },
      metadata:    { ref, type_don },
    }),
  });

  const fedaData = await fedaRes.json();

  if (!fedaRes.ok || !fedaData.v1?.transaction?.id) {
    console.error('[FedaPay]', fedaData);
    return err(res, 'Erreur initialisation FedaPay.');
  }

  const fedapayRef    = String(fedaData.v1.transaction.id);
  const paymentToken  = fedaData.v1.token?.token || null;

  // Insérer le don en base
  const { data, error } = await supabase.from('dons').insert({
    ref,
    prenom,
    nom,
    email:       email.toLowerCase(),
    montant:     Number(montant),
    type_don,
    statut:      'pending',
    mode,
    fedapay_ref: fedapayRef,
    date_don:    new Date().toISOString().split('T')[0],
  }).select('id').single();

  if (error) return err(res, 'Erreur enregistrement don : ' + error.message);

  await log('don_create', null, { ref, montant, email }, ip);

  return ok(res, {
    id:           data.id,
    ref,
    fedapay_ref:  fedapayRef,
    payment_url:  paymentToken ? `https://app.fedapay.com/checkout/${paymentToken}` : null,
    message:      'Transaction initiée.',
  }, 201);
}

// ────────────────────────────────────────────────────────────
// WEBHOOK FEDAPAY — mise à jour du statut
// ────────────────────────────────────────────────────────────

async function actionWebhook(body, res, req) {
  // FedaPay envoie un body avec transaction + event
  const { transaction, event } = body || {};
  if (!transaction) return err(res, 'Payload invalide.', 400);

  const fedapayId = String(transaction.id || '');
  const status    = transaction.status; // approved | declined | cancelled

  const statutMap = {
    approved:  'approved',
    declined:  'declined',
    cancelled: 'cancelled',
  };

  const statut = statutMap[status] || null;
  if (!statut) return ok(res, { ignored: true });

  const { error } = await supabase
    .from('dons')
    .update({ statut })
    .eq('fedapay_ref', fedapayId);

  if (error) console.error('[webhook dons]', error.message);

  await log('fedapay_webhook', null, { fedapayId, statut, event });
  return ok(res, { received: true });
}

// ────────────────────────────────────────────────────────────
// LISTE (admin/manager)
// ────────────────────────────────────────────────────────────

async function actionList({ statut, limit = 100, offset = 0 }, res, membre) {
  if (!hasRole(membre, 'manager')) return err(res, 'Accès refusé.', 403);

  let query = supabase
    .from('dons')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (statut) query = query.eq('statut', statut);

  const { data, error, count } = await query;
  if (error) return err(res, 'Erreur liste : ' + error.message);

  return ok(res, { data, total: count });
}

// ────────────────────────────────────────────────────────────
// FICHE DON
// ────────────────────────────────────────────────────────────

async function actionGet({ id }, res, membre) {
  if (!hasRole(membre, 'manager')) return err(res, 'Accès refusé.', 403);
  if (!id) return err(res, 'ID requis.');

  const { data, error } = await supabase.from('dons').select('*').eq('id', id).single();
  if (error || !data) return err(res, 'Don introuvable.', 404);

  return ok(res, { data });
}

// ────────────────────────────────────────────────────────────
// METTRE À JOUR (admin uniquement)
// ────────────────────────────────────────────────────────────

async function actionUpdate({ id, ...updates }, res, membre, ip) {
  if (!hasRole(membre, 'admin')) return err(res, 'Réservé aux administrateurs.', 403);
  if (!id) return err(res, 'ID requis.');

  // Champs autorisés à la mise à jour manuelle
  const allowed = ['statut', 'notes', 'date_don'];
  const patch   = {};
  allowed.forEach(k => { if (updates[k] !== undefined) patch[k] = updates[k]; });

  const { error } = await supabase.from('dons').update(patch).eq('id', id);
  if (error) return err(res, 'Erreur mise à jour : ' + error.message);

  await log('don_update', membre.id, { target: id }, ip);
  return ok(res, { message: 'Don mis à jour.' });
}

// ────────────────────────────────────────────────────────────
// SUPPRIMER (admin uniquement)
// ────────────────────────────────────────────────────────────

async function actionDelete({ id }, res, membre, ip) {
  if (!hasRole(membre, 'admin')) return err(res, 'Réservé aux administrateurs.', 403);
  if (!id) return err(res, 'ID requis.');

  const { error } = await supabase.from('dons').delete().eq('id', id);
  if (error) return err(res, 'Erreur suppression : ' + error.message);

  await log('don_delete', membre.id, { target: id }, ip);
  return ok(res, { message: 'Don supprimé.' });
}
