/**
 * FODDEB — api/newsletter/index.js
 * Route Vercel : /api/newsletter
 * Publique : subscribe · unsubscribe
 * Protégée : list · delete
 */

import { supabase, ok, err, authGuard, hasRole, log } from '../../lib/supabase.js';

const PUBLIC_ACTIONS = ['subscribe', 'unsubscribe'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 'Méthode non autorisée', 405);

  const { action, ...body } = req.body || {};
  if (!action) return err(res, 'Action manquante');

  let membre = null;
  if (!PUBLIC_ACTIONS.includes(action)) {
    membre = await authGuard(req);
    if (!membre) return err(res, 'Non authentifié.', 401);
  }

  try {
    switch (action) {
      case 'subscribe':   return await actionSubscribe(body, res);
      case 'unsubscribe': return await actionUnsubscribe(body, res);
      case 'list':        return await actionList(body, res, membre);
      case 'delete':      return await actionDelete(body, res, membre);
      default:            return err(res, 'Action inconnue');
    }
  } catch (e) {
    console.error('[newsletter]', e.message);
    return err(res, 'Erreur interne', 500);
  }
}

async function actionSubscribe({ email, nom, source = 'site' }, res) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return err(res, 'Email invalide.');

  const { error } = await supabase.from('newsletter').upsert(
    { email: email.toLowerCase(), nom: nom || null, source, statut: 'active' },
    { onConflict: 'email', ignoreDuplicates: false }
  );

  if (error) return err(res, 'Erreur inscription : ' + error.message);
  return ok(res, { message: 'Inscription confirmée.' });
}

async function actionUnsubscribe({ email }, res) {
  if (!email) return err(res, 'Email requis.');
  const { error } = await supabase
    .from('newsletter')
    .update({ statut: 'unsubscribed' })
    .eq('email', email.toLowerCase());

  if (error) return err(res, 'Erreur désabonnement.');
  return ok(res, { message: 'Désabonnement effectué.' });
}

async function actionList({ limit = 200, offset = 0, statut }, res, membre) {
  if (!hasRole(membre, 'manager')) return err(res, 'Accès refusé.', 403);

  let q = supabase
    .from('newsletter')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (statut) q = q.eq('statut', statut);

  const { data, error, count } = await q;
  if (error) return err(res, 'Erreur : ' + error.message);
  return ok(res, { data, total: count });
}

async function actionDelete({ id }, res, membre) {
  if (!hasRole(membre, 'admin')) return err(res, 'Réservé aux administrateurs.', 403);
  if (!id) return err(res, 'ID requis.');
  const { error } = await supabase.from('newsletter').delete().eq('id', id);
  if (error) return err(res, 'Erreur suppression.');
  return ok(res, { message: 'Abonné supprimé.' });
}
