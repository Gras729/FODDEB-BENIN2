/**
 * FODDEB — lib/supabase.js (CommonJS)
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('[FODDEB] Variables Supabase manquantes.');
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

function ok(res, data = {}, status = 200) {
  return res.status(status).json({ success: true, ...data });
}

function err(res, message, status = 400) {
  return res.status(status).json({ success: false, error: message });
}

async function authGuard(req) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;

  const now = new Date().toISOString();
  const { data: session } = await supabase
    .from('sessions')
    .select('membre_id, expires_at')
    .eq('token', token)
    .gt('expires_at', now)
    .single();

  if (!session) return null;

  const { data: membre } = await supabase
    .from('membres')
    .select('id, prenom, nom, email, role, statut')
    .eq('id', session.membre_id)
    .single();

  if (!membre || membre.statut !== 'actif') return null;
  return membre;
}

const ROLE_LEVEL = { member: 1, manager: 2, admin: 3 };

function hasRole(membre, roleMin) {
  return (ROLE_LEVEL[membre.role] || 0) >= (ROLE_LEVEL[roleMin] || 99);
}

async function log(action, membreId = null, data = {}, ip = null) {
  await supabase.from('logs').insert({ action, membre_id: membreId, data, ip });
}

function makeRef(prefix) {
  return `${prefix}-${Date.now()}`;
}

module.exports = { supabase, ok, err, authGuard, hasRole, log, makeRef };
