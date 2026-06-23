/**
 * FODDEB — lib/supabase.js
 * Client Supabase server-side (service_role).
 * Ce fichier est EXCLUSIVEMENT utilisé par les API routes Vercel (côté serveur).
 * La clé service_role n'est jamais exposée au navigateur.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('[FODDEB] Variables d\'environnement Supabase manquantes.');
}

// Client avec clé service_role : contourne RLS, accès total.
export const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ────────────────────────────────────────────────────────────
// HELPERS RÉPONSE
// ────────────────────────────────────────────────────────────

/** Réponse JSON succès */
export function ok(res, data = {}, status = 200) {
  return res.status(status).json({ success: true, ...data });
}

/** Réponse JSON erreur */
export function err(res, message, status = 400) {
  return res.status(status).json({ success: false, error: message });
}

// ────────────────────────────────────────────────────────────
// AUTHENTIFICATION — vérification du token de session
// ────────────────────────────────────────────────────────────

/**
 * Vérifie le token Bearer dans Authorization.
 * Retourne { membre } si valide, null sinon.
 * @param {import('http').IncomingMessage} req
 */
export async function authGuard(req) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;

  const now = new Date().toISOString();

  const { data: session, error } = await supabase
    .from('sessions')
    .select('membre_id, expires_at')
    .eq('token', token)
    .gt('expires_at', now)
    .single();

  if (error || !session) return null;

  const { data: membre } = await supabase
    .from('membres')
    .select('id, prenom, nom, email, role, statut')
    .eq('id', session.membre_id)
    .single();

  if (!membre || membre.statut !== 'actif') return null;
  return membre;
}

/**
 * Vérifie le rôle minimum requis.
 * Hiérarchie : member < manager < admin
 */
const ROLE_LEVEL = { member: 1, manager: 2, admin: 3 };

export function hasRole(membre, roleMin) {
  return (ROLE_LEVEL[membre.role] || 0) >= (ROLE_LEVEL[roleMin] || 99);
}

// ────────────────────────────────────────────────────────────
// LOG
// ────────────────────────────────────────────────────────────

export async function log(action, membreId = null, data = {}, ip = null) {
  await supabase.from('logs').insert({ action, membre_id: membreId, data, ip });
}

// ────────────────────────────────────────────────────────────
// GÉNÉRATION DE RÉFÉRENCE UNIQUE
// ────────────────────────────────────────────────────────────

export function makeRef(prefix) {
  return `${prefix}-${Date.now()}`;
}
