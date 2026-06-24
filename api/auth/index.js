/**
 * FODDEB — api/auth/index.js (CommonJS)
 */
const bcrypt     = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto     = require('crypto');
const { supabase, ok, err, log } = require('../../lib/supabase');

const OTP_TTL_MIN   = 5;
const MAX_ATTEMPTS  = 5;
const SESSION_TTL_H = 24;

function makeTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
}

module.exports = async function handler(req, res) {
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
    return err(res, 'Erreur interne : ' + e.message, 500);
  }
};

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

  const code      = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000).toISOString();

  await supabase.from('otp').delete().eq('email', email.toLowerCase());
  await supabase.from('otp').insert({
    membre_id:  membre.id,
    email:      email.toLowerCase(),
    code:       await bcrypt.hash(code, 10),
    expires_at: expiresAt,
    attempts:   0,
  });

  try {
    const t = makeTransport();
    await t.sendMail({
      from:    `"FODDEB" <${process.env.GMAIL_USER}>`,
      to:      email,
      subject: 'Votre code de connexion FODDEB',
      html:    `<p>Bonjour ${membre.prenom},</p><p>Code : <strong style="font-size:24px">${code}</strong></p><p>Expire dans ${OTP_TTL_MIN} minutes.</p>`,
    });
  } catch (mailErr) {
    console.error('[auth] Email OTP non envoyé :', mailErr.message);
  }

  await log('auth_login', membre.id, { email }, ip);
  return ok(res, { message: 'Code OTP envoyé.' });
}

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
    return err(res, 'Trop de tentatives.', 429);
  }

  const valid = await bcrypt.compare(String(code), otpRow.code);
  if (!valid) {
    await supabase.from('otp').update({ attempts: otpRow.attempts + 1 }).eq('id', otpRow.id);
    return err(res, 'Code incorrect.', 401);
  }

  await supabase.from('otp').update({ used: true }).eq('id', otpRow.id);

  const token     = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_H * 3600 * 1000).toISOString();

  await supabase.from('sessions').insert({
    membre_id:  otpRow.membre_id,
    token,
    expires_at: expiresAt,
    ip,
    user_agent: '',
  });

  const { data: membre } = await supabase
    .from('membres')
    .select('id, prenom, nom, email, role, statut, photo_url')
    .eq('id', otpRow.membre_id)
    .single();

  await log('auth_verify_otp', otpRow.membre_id, { email }, ip);
  return ok(res, { token, membre, expiresAt });
}

async function actionResetPassword({ email, code, newPassword }, res, ip) {
  if (!code) {
    if (!email) return err(res, 'Email requis.');
    const { data: membre } = await supabase
      .from('membres').select('id, prenom, email').eq('email', email.toLowerCase()).single();

    if (membre) {
      const otpCode   = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000).toISOString();
      await supabase.from('otp').delete().eq('email', email.toLowerCase());
      await supabase.from('otp').insert({
        membre_id: membre.id, email: email.toLowerCase(),
        code: await bcrypt.hash(otpCode, 10), expires_at: expiresAt, attempts: 0,
      });
      try {
        const t = makeTransport();
        await t.sendMail({
          from: `"FODDEB" <${process.env.GMAIL_USER}>`, to: email,
          subject: 'Réinitialisation mot de passe FODDEB',
          html: `<p>Code : <strong>${otpCode}</strong> — expire dans ${OTP_TTL_MIN} min.</p>`,
        });
      } catch(e) { console.error('[reset]', e.message); }
    }
    return ok(res, { message: 'Si l\'email existe, un code a été envoyé.' });
  }

  if (!email || !code || !newPassword) return err(res, 'Données incomplètes.');
  if (newPassword.length < 8) return err(res, 'Mot de passe trop court (8 caractères min).');

  const now = new Date().toISOString();
  const { data: otpRow } = await supabase
    .from('otp').select('*').eq('email', email.toLowerCase())
    .eq('used', false).gt('expires_at', now)
    .order('created_at', { ascending: false }).limit(1).single();

  if (!otpRow) return err(res, 'Code expiré ou invalide.', 401);
  const valid = await bcrypt.compare(String(code), otpRow.code);
  if (!valid) return err(res, 'Code incorrect.', 401);

  await supabase.from('otp').update({ used: true }).eq('id', otpRow.id);
  const hash = await bcrypt.hash(newPassword, 12);
  await supabase.from('membres').update({ password_hash: hash }).eq('id', otpRow.membre_id);

  await log('auth_reset_password', otpRow.membre_id, {}, ip);
  return ok(res, { message: 'Mot de passe réinitialisé.' });
}

async function actionLogout({ token }, res) {
  if (!token) return err(res, 'Token requis.');
  await supabase.from('sessions').delete().eq('token', token);
  return ok(res, { message: 'Déconnecté.' });
}
