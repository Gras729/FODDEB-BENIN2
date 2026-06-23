/**
 * FODDEB — api/bailleurs/index.js
 * Route Vercel : /api/bailleurs
 * Protégée : list · get · create · update · delete (manager+)
 */

import { supabase, ok, err, authGuard, hasRole, log } from '../../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 'Méthode non autorisée', 405);

  const membre = await authGuard(req);
  if (!membre) return err(res, 'Non authentifié.', 401);
  if (!hasRole(membre, 'manager')) return err(res, 'Accès refusé.', 403);

  const { action, ...body } = req.body || {};
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    switch (action) {
      case 'list':   return await actionList(body, res);
      case 'get':    return await actionGet(body, res);
      case 'create': return await actionCreate(body, res, membre, ip);
      case 'update': return await actionUpdate(body, res, membre, ip);
      case 'delete': return await actionDelete(body, res, membre, ip);
      default:       return err(res, 'Action inconnue');
    }
  } catch (e) {
    console.error('[bailleurs]', e.message);
    return err(res, 'Erreur interne', 500);
  }
}

async function actionList({ statut, limit = 100, offset = 0 }, res) {
  let q = supabase
    .from('bailleurs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (statut) q = q.eq('statut', statut);

  const { data, error, count } = await q;
  if (error) return err(res, 'Erreur : ' + error.message);
  return ok(res, { data, total: count });
}

async function actionGet({ id }, res) {
  if (!id) return err(res, 'ID requis.');
  const { data, error } = await supabase.from('bailleurs').select('*').eq('id', id).single();
  if (error || !data) return err(res, 'Bailleur introuvable.', 404);
  return ok(res, { data });
}

async function actionCreate(body, res, membre, ip) {
  const { nom, type = 'Institution', pays, montant = 0, decaisse = 0,
          projets, contact, email, date_debut, date_fin, statut = 'actif', notes } = body;

  if (!nom) return err(res, 'Nom requis.');

  const { data, error } = await supabase.from('bailleurs').insert({
    nom, type, pays: pays || null,
    montant: Number(montant) || 0,
    decaisse: Number(decaisse) || 0,
    projets: projets || null,
    contact: contact || null,
    email: email   || null,
    date_debut: date_debut || null,
    date_fin:   date_fin   || null,
    statut, notes: notes || null,
  }).select('id').single();

  if (error) return err(res, 'Erreur création : ' + error.message);
  await log('bailleur_create', membre.id, { id: data.id, nom }, ip);
  return ok(res, { id: data.id, message: 'Bailleur créé.' }, 201);
}

async function actionUpdate({ id, ...updates }, res, membre, ip) {
  if (!id) return err(res, 'ID requis.');
  if (updates.montant  !== undefined) updates.montant  = Number(updates.montant)  || 0;
  if (updates.decaisse !== undefined) updates.decaisse = Number(updates.decaisse) || 0;

  const { error } = await supabase.from('bailleurs').update(updates).eq('id', id);
  if (error) return err(res, 'Erreur mise à jour : ' + error.message);

  await log('bailleur_update', membre.id, { target: id }, ip);
  return ok(res, { message: 'Bailleur mis à jour.' });
}

async function actionDelete({ id }, res, membre, ip) {
  if (!hasRole(membre, 'admin')) return err(res, 'Réservé aux administrateurs.', 403);
  if (!id) return err(res, 'ID requis.');

  const { error } = await supabase.from('bailleurs').delete().eq('id', id);
  if (error) return err(res, 'Erreur suppression : ' + error.message);

  await log('bailleur_delete', membre.id, { target: id }, ip);
  return ok(res, { message: 'Bailleur supprimé.' });
}
