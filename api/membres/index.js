/**
 * FODDEB — api/membres/index.js
 * Route Vercel : /api/membres
 * Actions publiques : create · check_email · check_phone · check_cni
 * Actions protégées : list · get · update · delete · update_role · update_statut
 *
 * POST /api/membres
 * Body : { action, ...payload }
 * Header Authorization : Bearer <token>  (actions protégées)
 */

import bcrypt                                     from 'bcryptjs';
import { supabase, ok, err, authGuard, hasRole, log } from '../../lib/supabase.js';

// Actions accessibles sans authentification
const PUBLIC_ACTIONS = ['create', 'check_email', 'check_phone', 'check_cni'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 'Méthode non autorisée', 405);

  const { action, ...body } = req.body || {};
  if (!action) return err(res, 'Action manquante');

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  // Guard auth pour les actions protégées
  let membre = null;
  if (!PUBLIC_ACTIONS.includes(action)) {
    membre = await authGuard(req);
    if (!membre) return err(res, 'Non authentifié.', 401);
  }

  try {
    switch (action) {
      // ── PUBLIQUES ──────────────────────────────────────────
      case 'create':       return await actionCreate(body, res, ip);
      case 'check_email':  return await actionCheckUnique('email',     body.value, res);
      case 'check_phone':  return await actionCheckUnique('telephone', body.value, res);
      case 'check_cni':    return await actionCheckUnique('num_cni',   body.value, res);

      // ── PROTÉGÉES ──────────────────────────────────────────
      case 'list':          return await actionList(body, res);
      case 'get':           return await actionGet(body, res, membre);
      case 'update':        return await actionUpdate(body, res, membre, ip);
      case 'delete':        return await actionDelete(body, res, membre, ip);
      case 'update_role':   return await actionUpdateRole(body, res, membre, ip);
      case 'update_statut': return await actionUpdateStatut(body, res, membre, ip);

      default: return err(res, 'Action inconnue');
    }
  } catch (e) {
    console.error('[membres]', e.message);
    return err(res, 'Erreur interne', 500);
  }
}

// ────────────────────────────────────────────────────────────
// VÉRIFICATION UNICITÉ
// ────────────────────────────────────────────────────────────

async function actionCheckUnique(field, value, res) {
  if (!value) return err(res, 'Valeur manquante');
  const { data } = await supabase
    .from('membres')
    .select('id')
    .eq(field, value)
    .maybeSingle();
  return ok(res, { available: !data });
}

// ────────────────────────────────────────────────────────────
// CRÉER UN MEMBRE (adhésion publique)
// ────────────────────────────────────────────────────────────

async function actionCreate(body, res, ip) {
  const { prenom, nom, email, telephone, password, ...rest } = body;

  if (!prenom || !nom || !email || !password)
    return err(res, 'Champs obligatoires : prénom, nom, email, mot de passe.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return err(res, 'Format email invalide.');
  if (password.length < 8)
    return err(res, 'Mot de passe trop court (8 caractères minimum).');

  const hash = await bcrypt.hash(password, 12);

  const { data, error } = await supabase.from('membres').insert({
    prenom,
    nom,
    email:         email.toLowerCase().trim(),
    telephone:     telephone || null,
    password_hash: hash,
    role:          'member',
    statut:        'en_attente',
    organisation:  rest.organisation  || null,
    departement:   rest.departement   || null,
    domaine:       rest.domaine       || null,
    num_cni:       rest.num_cni       || null,
    newsletter:    rest.newsletter    || false,
    date_adhesion: new Date().toISOString().split('T')[0],
  }).select('id').single();

  if (error) {
    if (error.code === '23505') return err(res, 'Email ou téléphone déjà utilisé.');
    return err(res, 'Erreur création : ' + error.message);
  }

  await log('membre_create', data.id, { email }, ip);
  return ok(res, { id: data.id, message: 'Demande d\'adhésion soumise.' }, 201);
}

// ────────────────────────────────────────────────────────────
// LISTE DES MEMBRES (admin/manager)
// ────────────────────────────────────────────────────────────

async function actionList(body, res) {
  const { statut, role, limit = 100, offset = 0, search } = body;

  let query = supabase
    .from('membres')
    .select('id, prenom, nom, email, telephone, role, statut, organisation, departement, domaine, date_adhesion, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (statut) query = query.eq('statut', statut);
  if (role)   query = query.eq('role', role);
  if (search) query = query.or(`prenom.ilike.%${search}%,nom.ilike.%${search}%,email.ilike.%${search}%`);

  const { data, error, count } = await query;
  if (error) return err(res, 'Erreur liste : ' + error.message);

  return ok(res, { data, total: count });
}

// ────────────────────────────────────────────────────────────
// FICHE MEMBRE
// ────────────────────────────────────────────────────────────

async function actionGet({ id }, res, auteur) {
  // Un membre peut lire sa propre fiche ; admin/manager peuvent tout lire
  if (auteur.id !== id && !hasRole(auteur, 'manager'))
    return err(res, 'Accès refusé.', 403);

  const { data, error } = await supabase
    .from('membres')
    .select('id, prenom, nom, email, telephone, organisation, departement, role, statut, domaine, num_cni, newsletter, photo_url, cni_url, recepisse_url, signature_url, date_adhesion, notes, created_at, updated_at')
    .eq('id', id)
    .single();

  if (error || !data) return err(res, 'Membre introuvable.', 404);
  return ok(res, { data });
}

// ────────────────────────────────────────────────────────────
// MISE À JOUR PROFIL
// ────────────────────────────────────────────────────────────

async function actionUpdate({ id, ...updates }, res, auteur, ip) {
  if (!id) return err(res, 'ID requis.');
  if (auteur.id !== id && !hasRole(auteur, 'admin'))
    return err(res, 'Accès refusé.', 403);

  // Champs interdits à la mise à jour via cette action
  delete updates.role;
  delete updates.statut;
  delete updates.password_hash;
  delete updates.email;

  if (updates.password) {
    if (updates.password.length < 8) return err(res, 'Mot de passe trop court.');
    updates.password_hash = await bcrypt.hash(updates.password, 12);
    delete updates.password;
  }

  const { error } = await supabase.from('membres').update(updates).eq('id', id);
  if (error) return err(res, 'Erreur mise à jour : ' + error.message);

  await log('membre_update', auteur.id, { target: id }, ip);
  return ok(res, { message: 'Profil mis à jour.' });
}

// ────────────────────────────────────────────────────────────
// SUPPRIMER (admin uniquement)
// ────────────────────────────────────────────────────────────

async function actionDelete({ id }, res, auteur, ip) {
  if (!hasRole(auteur, 'admin')) return err(res, 'Réservé aux administrateurs.', 403);
  if (!id) return err(res, 'ID requis.');

  const { error } = await supabase.from('membres').delete().eq('id', id);
  if (error) return err(res, 'Erreur suppression : ' + error.message);

  await log('membre_delete', auteur.id, { target: id }, ip);
  return ok(res, { message: 'Membre supprimé.' });
}

// ────────────────────────────────────────────────────────────
// CHANGER RÔLE (admin uniquement)
// ────────────────────────────────────────────────────────────

async function actionUpdateRole({ id, role }, res, auteur, ip) {
  if (!hasRole(auteur, 'admin')) return err(res, 'Réservé aux administrateurs.', 403);
  if (!id || !role) return err(res, 'ID et rôle requis.');

  const ROLES_VALIDES = ['member', 'manager', 'admin'];
  if (!ROLES_VALIDES.includes(role)) return err(res, 'Rôle invalide.');

  const { error } = await supabase.from('membres').update({ role }).eq('id', id);
  if (error) return err(res, 'Erreur : ' + error.message);

  await log('membre_update_role', auteur.id, { target: id, role }, ip);
  return ok(res, { message: 'Rôle mis à jour.' });
}

// ────────────────────────────────────────────────────────────
// CHANGER STATUT (admin/manager)
// ────────────────────────────────────────────────────────────

async function actionUpdateStatut({ id, statut }, res, auteur, ip) {
  if (!hasRole(auteur, 'manager')) return err(res, 'Accès refusé.', 403);
  if (!id || !statut) return err(res, 'ID et statut requis.');

  const STATUTS_VALIDES = ['actif', 'inactif', 'suspendu', 'en_attente'];
  if (!STATUTS_VALIDES.includes(statut)) return err(res, 'Statut invalide.');

  const { error } = await supabase.from('membres').update({ statut }).eq('id', id);
  if (error) return err(res, 'Erreur : ' + error.message);

  await log('membre_update_statut', auteur.id, { target: id, statut }, ip);
  return ok(res, { message: 'Statut mis à jour.' });
}
