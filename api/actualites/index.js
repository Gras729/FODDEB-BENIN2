/**
 * FODDEB — api/actualites/index.js
 * Route Vercel : /api/actualites
 * Publique : list_public · get
 * Protégée : list · create · update · delete
 */

import { supabase, ok, err, authGuard, hasRole, log } from '../../lib/supabase.js';

const PUBLIC_ACTIONS = ['list_public', 'get'];

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
      case 'list_public': return await actionListPublic(body, res);
      case 'list':        return await actionList(body, res, membre);
      case 'get':         return await actionGet(body, res);
      case 'create':      return await actionCreate(body, res, membre, ip);
      case 'update':      return await actionUpdate(body, res, membre, ip);
      case 'delete':      return await actionDelete(body, res, membre, ip);
      default:            return err(res, 'Action inconnue');
    }
  } catch (e) {
    console.error('[actualites]', e.message);
    return err(res, 'Erreur interne', 500);
  }
}

async function actionListPublic({ categorie, tag, limit = 10, offset = 0 }, res) {
  let q = supabase
    .from('actualites')
    .select('id, titre, categorie, excerpt, auteur, date_publication, tags, image_url', { count: 'exact' })
    .eq('statut', 'publie')
    .order('date_publication', { ascending: false })
    .range(offset, offset + limit - 1);

  if (categorie) q = q.eq('categorie', categorie);
  if (tag)       q = q.contains('tags', [tag]);

  const { data, error, count } = await q;
  if (error) return err(res, 'Erreur : ' + error.message);
  return ok(res, { data, total: count });
}

async function actionList({ statut, limit = 100, offset = 0 }, res, membre) {
  if (!hasRole(membre, 'manager')) return err(res, 'Accès refusé.', 403);

  let q = supabase
    .from('actualites')
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
  const { data, error } = await supabase.from('actualites').select('*').eq('id', id).single();
  if (error || !data) return err(res, 'Actualité introuvable.', 404);
  return ok(res, { data });
}

async function actionCreate(body, res, membre, ip) {
  if (!hasRole(membre, 'manager')) return err(res, 'Accès refusé.', 403);

  const { titre, categorie, excerpt, contenu, auteur, date_publication, statut = 'brouillon', tags = [], image_url } = body;
  if (!titre) return err(res, 'Titre requis.');

  const { data, error } = await supabase.from('actualites').insert({
    titre,
    categorie:        categorie        || null,
    excerpt:          excerpt          || null,
    contenu:          contenu          || null,
    auteur:           auteur           || `${membre.prenom} ${membre.nom}`,
    date_publication: date_publication || null,
    statut,
    tags:             Array.isArray(tags) ? tags : [],
    image_url:        image_url        || null,
  }).select('id').single();

  if (error) return err(res, 'Erreur création : ' + error.message);
  await log('actualite_create', membre.id, { id: data.id, titre }, ip);
  return ok(res, { id: data.id, message: 'Actualité créée.' }, 201);
}

async function actionUpdate({ id, ...updates }, res, membre, ip) {
  if (!hasRole(membre, 'manager')) return err(res, 'Accès refusé.', 403);
  if (!id) return err(res, 'ID requis.');

  if (updates.tags && !Array.isArray(updates.tags)) updates.tags = [updates.tags];

  const { error } = await supabase.from('actualites').update(updates).eq('id', id);
  if (error) return err(res, 'Erreur mise à jour : ' + error.message);

  await log('actualite_update', membre.id, { target: id }, ip);
  return ok(res, { message: 'Actualité mise à jour.' });
}

async function actionDelete({ id }, res, membre, ip) {
  if (!hasRole(membre, 'admin')) return err(res, 'Réservé aux administrateurs.', 403);
  if (!id) return err(res, 'ID requis.');

  const { error } = await supabase.from('actualites').delete().eq('id', id);
  if (error) return err(res, 'Erreur suppression : ' + error.message);

  await log('actualite_delete', membre.id, { target: id }, ip);
  return ok(res, { message: 'Actualité supprimée.' });
}
