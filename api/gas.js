/**
 * FODDEB — api/gas.js
 * Proxy serverless Vercel → Google Apps Script
 * ─────────────────────────────────────────────────────────────────
 * Rôle : recevoir les requêtes POST du frontend, les forwarder vers
 *        GAS via la variable d'environnement GAS_URL.
 *        La vraie URL GAS n'est jamais exposée côté client.
 *
 * Variable d'environnement requise dans Vercel :
 *   GAS_URL = https://script.google.com/macros/s/XXX/exec
 *
 * Déploiement :
 *   Placer ce fichier dans /api/gas.js à la racine du projet.
 *   Vercel détecte automatiquement /api/ comme fonctions serverless.
 * ─────────────────────────────────────────────────────────────────
 */

export default async function handler(req, res) {

  // Preflight CORS — navigateurs envoient OPTIONS avant POST
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  // Uniquement POST accepté
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }

  const GAS_URL = process.env.GAS_URL;
  if (!GAS_URL) {
    console.error('[gas.js] Variable GAS_URL manquante dans les env Vercel');
    return res.status(500).json({ success: false, error: 'Configuration serveur manquante' });
  }

  // En-têtes CORS
  // Si ALLOWED_ORIGINS est vide → tout accepter (dev / premier déploiement)
  // Si défini → liste séparée par virgules ex: https://foddeb.vercel.app,https://foddeb.com
  const origin          = req.headers.origin || '*';
  const allowedList     = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
  const originAccepted  = allowedList.length === 0 || allowedList.includes(origin);

  if (!originAccepted) {
    return res.status(403).json({ success: false, error: 'Origine non autorisée : ' + origin });
  }

  res.setHeader('Access-Control-Allow-Origin',  origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    // Extraire le body — Vercel le parse selon Content-Type
    let payload;
    if (typeof req.body === 'string') {
      payload = req.body;
    } else {
      payload = JSON.stringify(req.body);
    }

    // Forward vers GAS
    const gasResp = await fetch(GAS_URL, {
      method:   'POST',
      headers:  { 'Content-Type': 'text/plain' }, // GAS attend text/plain (pas de preflight)
      redirect: 'follow',
      body:     payload,
    });

    if (!gasResp.ok) {
      console.error('[gas.js] GAS HTTP error:', gasResp.status);
      return res.status(502).json({ success: false, error: 'Erreur passerelle GAS (' + gasResp.status + ')' });
    }

    const data = await gasResp.json();

    // Retourner la réponse GAS telle quelle
    return res.status(200).json(data);

  } catch (err) {
    console.error('[gas.js] Erreur proxy :', err.message);
    return res.status(500).json({ success: false, error: 'Erreur interne du proxy' });
  }
}
