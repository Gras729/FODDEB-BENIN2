/**
 * FODDEB — api/auth/index.js
 * Route Vercel : /api/auth
 * Actions : login · verify_otp · reset_password · logout · me
 *
 * POST /api/auth
 * Body : { action, ...payload }
 */

import bcrypt                         from 'bcryptjs';
import nodemailer                     from 'nodemailer';
import crypto                         from 'crypto';
import { supabase, ok, err, log }     from '../../lib/supabase.js';

const OTP_TTL_MIN    = 5;
const MAX_ATTEMPTS   = 5;
const SESSION_TTL_H  = 24;

// ── Transporteur Gmail SMTP ──────────────────────────────────
function makeTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

// ────────────────────────────────────────────────────────────
// ROUTEUR
// ────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 'Méthode non autorisée', 405);

  const { action, ...body } = req.body || {};
  if (!action) return err(res, 'Action manquante');

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    switch (action) {
      case 'login':          return await actionLogin(body, res, ip);
      case 'verify_otp':     return await actionVerifyOtp(body, res, ip);
      case 'reset_password': return await actionResetPassword(body, res, ip);
      case 'logout':         return await actionLogout(body, res);
      default:               return err(res, 'Action inconnue');
    }
  } catch (e) {
    console.error('[auth]', e.message);
    return err(res, 'Erreur interne', 500);
  }
}

// ────────────────────────────────────────────────────────────
// LOGIN : vérifie email + mot de passe → envoie OTP
// ────────────────────────────────────────────────────────────

async function actionLogin({ email, password }, res, ip) {
  if (!email || !password) return err(res, 'Email et mot de passe requis.');

  const { data: membre, error } = await supabase
    .from('membres')
    .select('id, prenom, email, password_hash, statut, role')
    .eq('email', email.toLowerCase().trim())
    .single();

  if (error || !membre) return err(res, 'Identifiants invalides.', 401);
  if (membre.statut !== 'actif') return err(res, 'Compte inactif ou suspendu.', 403);

  const valid = await bcrypt.compare(password, membre.password_hash || '');
  if (!valid) return err(res, 'Identifiants invalides.', 401);

  // Génération OTP 6 chiffres
  const code      = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000).toISOString();

  // Invalider les anciens OTP de cet email
  await supabase.from('otp').delete().eq('email', email.toLowerCase());

  await supabase.from('otp').insert({
    membre_id:  membre.id,
    email:      email.toLowerCase(),
    code:       await bcrypt.hash(code, 10),
    expires_at: expiresAt,
    attempts:   0,
  });

  // Envoi email
  const transport = makeTransport();
  await transport.sendMail({
    from:    `"FODDEB" <${process.env.GMAIL_USER}>`,
    to:      email,
    subject: 'Votre code de connexion FODDEB',
    html: `
      <p>Bonjour ${membre.prenom},</p>
      <p>Votre code de connexion est : <strong style="font-size:24px">${code}</strong></p>
      <p>Ce code expire dans ${OTP_TTL_MIN} minutes.</p>
      <p>Si vous n'avez pas demandé ce code, ignorez cet email.</p>
    `,
  });

  await log('auth_login', membre.id, { email }, ip);
  return ok(res, { message: 'Code OTP envoyé.' });
}

// ────────────────────────────────────────────────────────────
// VERIFY OTP : vérifie le code → crée session → retourne token
// ────────────────────────────────────────────────────────────

async function actionVerifyOtp({ email, code }, res, ip) {
  if (!email || !code) return err(res, 'Email et code requis.');

  const now = new Date().toISOString();

  const { data: otpRow } = await supabase
    .from('otp')
    .select('*')
    .eq('email', email.toLowerCase())
    .eq('used', false)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!otpRow) return err(res, 'Code expiré ou invalide.', 401);

  if (otpRow.attempts >= MAX_ATTEMPTS) {
    await supabase.from('otp').update({ used: true }).eq('id', otpRow.id);
    return err(res, 'Trop de tentatives. Reconnectez-vous.', 429);
  }

  const valid = await bcrypt.compare(String(code), otpRow.code);
  if (!valid) {
    await supabase.from('otp')
      .update({ attempts: otpRow.attempts + 1 })
      .eq('id', otpRow.id);
    return err(res, 'Code incorrect.', 401);
  }

  // Invalider l'OTP
  await supabase.from('otp').update({ used: true }).eq('id', otpRow.id);

  // Créer session
  const token     = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_H * 3600 * 1000).toISOString();

  await supabase.from('sessions').insert({
    membre_id:  otpRow.membre_id,
    token,
    expires_at: expiresAt,
    ip,
    user_agent: '',
  });

  // Retourner les infos membres (sans hash)
  const { data: membre } = await supabase
    .from('membres')
    .select('id, prenom, nom, email, role, statut, photo_url')
    .eq('id', otpRow.membre_id)
    .single();

  await log('auth_verify_otp', otpRow.membre_id, { email }, ip);
  return ok(res, { token, membre, expiresAt });
}

// ────────────────────────────────────────────────────────────
// RESET PASSWORD : envoie OTP de réinitialisation
// ────────────────────────────────────────────────────────────

async function actionResetPassword({ email, code, newPassword }, res, ip) {
  // Étape 1 : demande de reset → envoi OTP
  if (!code) {
    if (!email) return err(res, 'Email requis.');

    const { data: membre } = await supabase
      .from('membres')
      .select('id, prenom, email')
      .eq('email', email.toLowerCase())
      .single();

    if (!membre) return ok(res, { message: 'Si l\'email existe, un code a été envoyé.' });

    const otpCode   = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000).toISOString();

    await supabase.from('otp').delete().eq('email', email.toLowerCase());
    await supabase.from('otp').insert({
      membre_id:  membre.id,
      email:      email.toLowerCase(),
      code:       await bcrypt.hash(otpCode, 10),
      expires_at: expiresAt,
      attempts:   0,
    });

    const transport = makeTransport();
    await transport.sendMail({
      from:    `"FODDEB" <${process.env.GMAIL_USER}>`,
      to:      email,
      subject: 'Réinitialisation de votre mot de passe FODDEB',
      html: `
        <p>Bonjour ${membre.prenom},</p>
        <p>Code de réinitialisation : <strong style="font-size:24px">${otpCode}</strong></p>
        <p>Expire dans ${OTP_TTL_MIN} minutes.</p>
      `,
    });

    return ok(res, { message: 'Si l\'email existe, un code a été envoyé.' });
  }

  // Étape 2 : code + nouveau mot de passe
  if (!email || !code || !newPassword) return err(res, 'Données incomplètes.');
  if (newPassword.length < 8) return err(res, 'Mot de passe trop court (8 caractères min).');

  const now = new Date().toISOString();

  const { data: otpRow } = await supabase
    .from('otp')
    .select('*')
    .eq('email', email.toLowerCase())
    .eq('used', false)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!otpRow) return err(res, 'Code expiré ou invalide.', 401);

  const valid = await bcrypt.compare(String(code), otpRow.code);
  if (!valid) return err(res, 'Code incorrect.', 401);

  await supabase.from('otp').update({ used: true }).eq('id', otpRow.id);

  const hash = await bcrypt.hash(newPassword, 12);
  await supabase.from('membres').update({ password_hash: hash }).eq('id', otpRow.membre_id);

  await log('auth_reset_password', otpRow.membre_id, {}, ip);
  return ok(res, { message: 'Mot de passe réinitialisé.' });
}

// ────────────────────────────────────────────────────────────
// LOGOUT : supprime la session
// ────────────────────────────────────────────────────────────

async function actionLogout({ token }, res) {
  if (!token) return err(res, 'Token requis.');
  await supabase.from('sessions').delete().eq('token', token);
  return ok(res, { message: 'Déconnecté.' });
}
