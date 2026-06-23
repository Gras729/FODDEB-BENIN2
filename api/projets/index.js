/**
 * FODDEB — api/projets/index.js
 * Route Vercel : /api/projets
 * Publique : list (projets publiés) · get
 * Protégée : create · update · delete
 * POST /api/projets — Body : { action, ...payload }
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
    console.error('[projets]', e.message);
    return err(res, 'Erreur interne', 500);
  }
}

async function actionListPublic({ domaine, departement, limit = 20, offset = 0 }, res) {
  let q = supabase
    .from('projets')
    .select('id, titre, description, departement, budget, beneficiaires, date_debut, date_fin, image_url, responsable, statut, progression, domaine, created_at', { count: 'exact' })
    .in('statut', ['en_cours', 'termine'])
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (domaine)     q = q.eq('domaine', domaine);
  if (departement) q = q.eq('departement', departement);

  const { data, error, count } = await q;
  if (error) return err(res, 'Erreur : ' + error.message);
  return ok(res, { data, total: count });
}

async function actionList({ statut, limit = 100, offset = 0, search }, res, membre) {
  if (!hasRole(membre, 'manager')) return err(res, 'Accès refusé.', 403);

  let q = supabase
    .from('projets')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (statut) q = q.eq('statut', statut);
  if (search) q = q.ilike('titre', `%${search}%`);

  const { data, error, count } = await q;
  if (error) return err(res, 'Erreur : ' + error.message);
  return ok(res, { data, total: count });
}

async function actionGet({ id }, res) {
  if (!id) return err(res, 'ID requis.');
  const { data, error } = await supabase.from('projets').select('*').eq('id', id).single();
  if (error || !data) return err(res, 'Projet introuvable.', 404);

  // Charger les activités liées
  const { data: activites } = await supabase
    .from('activites')
    .select('*')
    .eq('projet_id', id)
    .order('date');

  return ok(res, { data: { ...data, activites: activites || [] } });
}

async function actionCreate(body, res, membre, ip) {
  const { titre, description, departement, budget, beneficiaires, date_debut, date_fin,
          image_url, fichier_url, fichier_nom, responsable, domaine, partenaires, objectifs } = body;

  if (!titre) return err(res, 'Titre requis.');

  const { data, error } = await supabase.from('projets').insert({
    membre_id:    membre.id,
    titre,
    description:  description  || null,
    departement:  departement  || null,
    budget:       Number(budget)       || 0,
    beneficiaires: beneficiaires       || null,
    date_debut:   date_debut           || null,
    date_fin:     date_fin             || null,
    image_url:    image_url            || null,
    fichier_url:  fichier_url          || null,
    fichier_nom:  fichier_nom          || null,
    responsable:  responsable          || null,
    domaine:      domaine              || null,
    partenaires:  partenaires          || null,
    objectifs:    objectifs            || null,
    statut:       'brouillon',
    progression:  0,
  }).select('id').single();

  if (error) return err(res, 'Erreur création : ' + error.message);
  await log('projet_create', membre.id, { id: data.id, titre }, ip);
  return ok(res, { id: data.id, message: 'Projet créé.' }, 201);
}

async function actionUpdate({ id, ...updates }, res, membre, ip) {
  if (!id) return err(res, 'ID requis.');

  // Seul admin/manager ou le créateur peut modifier
  if (!hasRole(membre, 'manager')) {
    const { data: projet } = await supabase.from('projets').select('membre_id').eq('id', id).single();
    if (!projet || projet.membre_id !== membre.id) return err(res, 'Accès refusé.', 403);
  }

  if (updates.budget)     updates.budget     = Number(updates.budget)     || 0;
  if (updates.depense)    updates.depense     = Number(updates.depense)    || 0;
  if (updates.progression) updates.progression = Math.min(100, Math.max(0, Number(updates.progression)));

  const { error } = await supabase.from('projets').update(updates).eq('id', id);
  if (error) return err(res, 'Erreur mise à jour : ' + error.message);

  await log('projet_update', membre.id, { target: id }, ip);
  return ok(res, { message: 'Projet mis à jour.' });
}

async function actionDelete({ id }, res, membre, ip) {
  if (!hasRole(membre, 'admin')) return err(res, 'Réservé aux administrateurs.', 403);
  if (!id) return err(res, 'ID requis.');

  const { error } = await supabase.from('projets').delete().eq('id', id);
  if (error) return err(res, 'Erreur suppression : ' + error.message);

  await log('projet_delete', membre.id, { target: id }, ip);
  return ok(res, { message: 'Projet supprimé.' });
}
