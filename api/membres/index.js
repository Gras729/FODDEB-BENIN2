/**
 * FODDEB — api/membres/index.js (CommonJS)
 */
const bcrypt = require('bcryptjs');
const { supabase, ok, err, authGuard, hasRole, log } = require('../../lib/supabase');

const PUBLIC_ACTIONS = ['create', 'check_email', 'check_phone', 'check_cni'];

module.exports = async function handler(req, res) {
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
      case 'create':        return await actionCreate(body, res, ip);
      case 'check_email':   return await actionCheckUnique('email', body.value, res);
      case 'check_phone':   return await actionCheckUnique('telephone', body.value, res);
      case 'check_cni':     return await actionCheckUnique('num_cni', body.value, res);
      case 'list':          return await actionList(body, res);
      case 'get':           return await actionGet(body, res, membre);
      case 'update':        return await actionUpdate(body, res, membre, ip);
      case 'delete':        return await actionDelete(body, res, membre, ip);
      case 'update_role':   return await actionUpdateRole(body, res, membre, ip);
      case 'update_statut': return await actionUpdateStatut(body, res, membre, ip);
      default:              return err(res, 'Action inconnue');
    }
  } catch (e) {
    console.error('[membres]', e.message);
    return err(res, 'Erreur interne : ' + e.message, 500);
  }
};

async function actionCheckUnique(field, value, res) {
  if (!value) return err(res, 'Valeur manquante');
  const { data } = await supabase.from('membres').select('id').eq(field, value).maybeSingle();
  return ok(res, { available: !data });
}

async function actionCreate({ prenom, nom, email, telephone, password, ...rest }, res, ip) {
  if (!prenom || !nom || !email || !password) return err(res, 'Champs obligatoires manquants.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err(res, 'Email invalide.');
  if (password.length < 8) return err(res, 'Mot de passe trop court (8 caractères min).');

  const hash = await bcrypt.hash(password, 12);
  const { data, error } = await supabase.from('membres').insert({
    prenom, nom, email: email.toLowerCase().trim(),
    telephone: telephone || null, password_hash: hash,
    role: 'member', statut: 'en_attente',
    organisation: rest.organisation || null,
    departement:  rest.departement  || null,
    domaine:      rest.domaine      || null,
    num_cni:      rest.num_cni      || null,
    newsletter:   rest.newsletter   || false,
    date_adhesion: new Date().toISOString().split('T')[0],
  }).select('id').single();

  if (error) {
    if (error.code === '23505') return err(res, 'Email ou téléphone déjà utilisé.');
    return err(res, 'Erreur création : ' + error.message);
  }
  await log('membre_create', data.id, { email }, ip);
  return ok(res, { id: data.id, message: 'Demande soumise.' }, 201);
}

async function actionList({ statut, role, limit = 100, offset = 0, search }, res) {
  let q = supabase.from('membres')
    .select('id,prenom,nom,email,telephone,role,statut,organisation,departement,domaine,date_adhesion,created_at', { count: 'exact' })
    .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (statut) q = q.eq('statut', statut);
  if (role)   q = q.eq('role', role);
  if (search) q = q.or(`prenom.ilike.%${search}%,nom.ilike.%${search}%,email.ilike.%${search}%`);
  const { data, error, count } = await q;
  if (error) return err(res, 'Erreur : ' + error.message);
  return ok(res, { data, total: count });
}

async function actionGet({ id }, res, auteur) {
  if (auteur.id !== id && !hasRole(auteur, 'manager')) return err(res, 'Accès refusé.', 403);
  const { data, error } = await supabase.from('membres')
    .select('id,prenom,nom,email,telephone,organisation,departement,role,statut,domaine,num_cni,newsletter,photo_url,cni_url,recepisse_url,signature_url,date_adhesion,notes,created_at,updated_at')
    .eq('id', id).single();
  if (error || !data) return err(res, 'Membre introuvable.', 404);
  return ok(res, { data });
}

async function actionUpdate({ id, ...updates }, res, auteur, ip) {
  if (!id) return err(res, 'ID requis.');
  if (auteur.id !== id && !hasRole(auteur, 'admin')) return err(res, 'Accès refusé.', 403);
  delete updates.role; delete updates.statut; delete updates.password_hash; delete updates.email;
  if (updates.password) {
    if (updates.password.length < 8) return err(res, 'Mot de passe trop court.');
    updates.password_hash = await bcrypt.hash(updates.password, 12);
    delete updates.password;
  }
  const { error } = await supabase.from('membres').update(updates).eq('id', id);
  if (error) return err(res, 'Erreur : ' + error.message);
  await log('membre_update', auteur.id, { target: id }, ip);
  return ok(res, { message: 'Profil mis à jour.' });
}

async function actionDelete({ id }, res, auteur, ip) {
  if (!hasRole(auteur, 'admin')) return err(res, 'Réservé aux administrateurs.', 403);
  if (!id) return err(res, 'ID requis.');
  const { error } = await supabase.from('membres').delete().eq('id', id);
  if (error) return err(res, 'Erreur : ' + error.message);
  await log('membre_delete', auteur.id, { target: id }, ip);
  return ok(res, { message: 'Membre supprimé.' });
}

async function actionUpdateRole({ id, role }, res, auteur, ip) {
  if (!hasRole(auteur, 'admin')) return err(res, 'Réservé aux administrateurs.', 403);
  if (!id || !role) return err(res, 'ID et rôle requis.');
  if (!['member','manager','admin'].includes(role)) return err(res, 'Rôle invalide.');
  const { error } = await supabase.from('membres').update({ role }).eq('id', id);
  if (error) return err(res, 'Erreur : ' + error.message);
  await log('membre_update_role', auteur.id, { target: id, role }, ip);
  return ok(res, { message: 'Rôle mis à jour.' });
}

async function actionUpdateStatut({ id, statut }, res, auteur, ip) {
  if (!hasRole(auteur, 'manager')) return err(res, 'Accès refusé.', 403);
  if (!id || !statut) return err(res, 'ID et statut requis.');
  if (!['actif','inactif','suspendu','en_attente'].includes(statut)) return err(res, 'Statut invalide.');
  const { error } = await supabase.from('membres').update({ statut }).eq('id', id);
  if (error) return err(res, 'Erreur : ' + error.message);
  await log('membre_update_statut', auteur.id, { target: id, statut }, ip);
  return ok(res, { message: 'Statut mis à jour.' });
}
