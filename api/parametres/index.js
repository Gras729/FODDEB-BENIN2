/**
 * FODDEB — api/parametres/index.js
 * Route Vercel : /api/parametres
 * Protégée : get (manager+) · update (admin uniquement)
 */

import { supabase, ok, err, authGuard, hasRole } from '../../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 'Méthode non autorisée', 405);

  const membre = await authGuard(req);
  if (!membre) return err(res, 'Non authentifié.', 401);

  const { action, ...body } = req.body || {};

  try {
    switch (action) {
      case 'get':    return await actionGet(res, membre);
      case 'update': return await actionUpdate(body, res, membre);
      default:       return err(res, 'Action inconnue');
    }
  } catch (e) {
    console.error('[parametres]', e.message);
    return err(res, 'Erreur interne', 500);
  }
}

async function actionGet(res, membre) {
  if (!hasRole(membre, 'manager')) return err(res, 'Accès refusé.', 403);

  const { data, error } = await supabase
    .from('parametres')
    .select('cle, valeur')
    .order('cle');

  if (error) return err(res, 'Erreur lecture : ' + error.message);

  // Transformer en objet clé/valeur
  const result = {};
  (data || []).forEach(r => { result[r.cle] = r.valeur; });

  return ok(res, { data: result });
}

async function actionUpdate(body, res, membre) {
  if (!hasRole(membre, 'admin')) return err(res, 'Réservé aux administrateurs.', 403);

  const ALLOWED = [
    'SITE_NAME', 'SITE_URL', 'ADMIN_EMAIL',
    'SITE_TEL', 'SITE_ADRESSE',
    'COTISATION_ANNUELLE', 'COTISATION_INSCRIPTION',
  ];

  const updates = [];
  ALLOWED.forEach(cle => {
    if (body[cle] !== undefined && body[cle] !== null) {
      updates.push({ cle, valeur: String(body[cle]).trim() });
    }
  });

  if (!updates.length) return err(res, 'Aucune valeur valide à mettre à jour.');

  const { error } = await supabase
    .from('parametres')
    .upsert(updates, { onConflict: 'cle' });

  if (error) return err(res, 'Erreur mise à jour : ' + error.message);
  return ok(res, { message: 'Paramètres mis à jour.', updated: updates.map(u => u.cle) });
}
