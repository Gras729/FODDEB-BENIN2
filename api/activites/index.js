/**
 * FODDEB — api/activites/index.js
 * Route Vercel : /api/activites
 * Protégée : list · create · update · delete
 */

import { supabase, ok, err, authGuard, hasRole, log } from '../../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 'Méthode non autorisée', 405);

  const membre = await authGuard(req);
  if (!membre) return err(res, 'Non authentifié.', 401);

  const { action, ...body } = req.body || {};
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    switch (action) {
      case 'list':   return await actionList(body, res);
      case 'create': return await actionCreate(body, res, membre, ip);
      case 'update': return await actionUpdate(body, res, membre, ip);
      case 'delete': return await actionDelete(body, res, membre, ip);
      default:       return err(res, 'Action inconnue');
    }
  } catch (e) {
    console.error('[activites]', e.message);
    return err(res, 'Erreur interne', 500);
  }
}

async function actionList({ projet_id, statut }, res) {
  if (!projet_id) return err(res, 'projet_id requis.');
  let q = supabase.from('activites').select('*').eq('projet_id', projet_id).order('date');
  if (statut) q = q.eq('statut', statut);
  const { data, error } = await q;
  if (error) return err(res, 'Erreur : ' + error.message);
  return ok(res, { data });
}

async function actionCreate({ projet_id, titre, description, date, statut = 'planifiee' }, res, membre, ip) {
  if (!projet_id || !titre) return err(res, 'projet_id et titre requis.');
  const { data, error } = await supabase.from('activites').insert({
    projet_id, titre,
    description: description || null,
    date:        date        || null,
    statut,
  }).select('id').single();

  if (error) return err(res, 'Erreur création : ' + error.message);
  await log('activite_create', membre.id, { id: data.id, projet_id }, ip);
  return ok(res, { id: data.id, message: 'Activité créée.' }, 201);
}

async function actionUpdate({ id, ...updates }, res, membre, ip) {
  if (!id) return err(res, 'ID requis.');
  const { error } = await supabase.from('activites').update(updates).eq('id', id);
  if (error) return err(res, 'Erreur mise à jour : ' + error.message);
  await log('activite_update', membre.id, { target: id }, ip);
  return ok(res, { message: 'Activité mise à jour.' });
}

async function actionDelete({ id }, res, membre, ip) {
  if (!hasRole(membre, 'manager')) return err(res, 'Accès refusé.', 403);
  if (!id) return err(res, 'ID requis.');
  const { error } = await supabase.from('activites').delete().eq('id', id);
  if (error) return err(res, 'Erreur suppression : ' + error.message);
  await log('activite_delete', membre.id, { target: id }, ip);
  return ok(res, { message: 'Activité supprimée.' });
}
