/**
 * FODDEB — api/contacts/index.js
 * Route Vercel : /api/contacts
 * Publique : send
 * Protégée : list · update_statut · delete
 */

import nodemailer                                  from 'nodemailer';
import { supabase, ok, err, authGuard, hasRole }  from '../../lib/supabase.js';

const PUBLIC_ACTIONS = ['send'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 'Méthode non autorisée', 405);

  const { action, ...body } = req.body || {};
  if (!action) return err(res, 'Action manquante');

  let membre = null;
  if (!PUBLIC_ACTIONS.includes(action)) {
    membre = await authGuard(req);
    if (!membre) return err(res, 'Non authentifié.', 401);
  }

  try {
    switch (action) {
      case 'send':           return await actionSend(body, res);
      case 'list':           return await actionList(body, res, membre);
      case 'update_statut':  return await actionUpdateStatut(body, res, membre);
      case 'delete':         return await actionDelete(body, res, membre);
      default:               return err(res, 'Action inconnue');
    }
  } catch (e) {
    console.error('[contacts]', e.message);
    return err(res, 'Erreur interne', 500);
  }
}

async function actionSend({ prenom, nom, email, telephone, organisation, sujet, message, newsletter = false }, res) {
  if (!prenom || !nom || !email || !message) return err(res, 'Champs requis manquants.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err(res, 'Email invalide.');
  if (message.length < 10) return err(res, 'Message trop court.');

  const { error } = await supabase.from('contacts').insert({
    prenom, nom,
    email:        email.toLowerCase(),
    telephone:    telephone    || null,
    organisation: organisation || null,
    sujet:        sujet        || null,
    message,
    newsletter:   Boolean(newsletter),
    statut:       'nouveau',
  });

  if (error) return err(res, 'Erreur enregistrement : ' + error.message);

  // Notification email admin
  try {
    const t = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
    await t.sendMail({
      from:    `"FODDEB" <${process.env.GMAIL_USER}>`,
      to:      process.env.ADMIN_EMAIL || process.env.GMAIL_USER,
      subject: `[FODDEB Contact] ${sujet || 'Nouveau message'}`,
      html:    `<p><strong>${prenom} ${nom}</strong> (${email}) vous a écrit :</p><p>${message}</p>`,
    });
  } catch (mailErr) {
    console.warn('[contacts] Email admin non envoyé :', mailErr.message);
  }

  // Inscription newsletter si demandée
  if (newsletter) {
    await supabase.from('newsletter').upsert(
      { email: email.toLowerCase(), nom: `${prenom} ${nom}`, source: 'contact', statut: 'active' },
      { onConflict: 'email', ignoreDuplicates: false }
    );
  }

  return ok(res, { message: 'Message envoyé avec succès.' });
}

async function actionList({ statut, limit = 100, offset = 0 }, res, membre) {
  if (!hasRole(membre, 'manager')) return err(res, 'Accès refusé.', 403);

  let q = supabase
    .from('contacts')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (statut) q = q.eq('statut', statut);

  const { data, error, count } = await q;
  if (error) return err(res, 'Erreur : ' + error.message);
  return ok(res, { data, total: count });
}

async function actionUpdateStatut({ id, statut }, res, membre) {
  if (!hasRole(membre, 'manager')) return err(res, 'Accès refusé.', 403);
  if (!id || !statut) return err(res, 'ID et statut requis.');
  const { error } = await supabase.from('contacts').update({ statut }).eq('id', id);
  if (error) return err(res, 'Erreur mise à jour.');
  return ok(res, { message: 'Statut mis à jour.' });
}

async function actionDelete({ id }, res, membre) {
  if (!hasRole(membre, 'admin')) return err(res, 'Réservé aux administrateurs.', 403);
  if (!id) return err(res, 'ID requis.');
  const { error } = await supabase.from('contacts').delete().eq('id', id);
  if (error) return err(res, 'Erreur suppression.');
  return ok(res, { message: 'Contact supprimé.' });
}
