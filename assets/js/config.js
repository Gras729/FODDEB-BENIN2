/**
 * FODDEB — assets/js/config.js
 * ─────────────────────────────────────────────────────────────────
 * Constantes publiques côté frontend.
 * À charger en PREMIER dans chaque page HTML, avant api.js et utils.js.
 *
 * Règle : ici uniquement des valeurs PUBLIQUES par design.
 *   - reCAPTCHA SITE key  → publique (Google la valide côté serveur)
 *   - reCAPTCHA SECRET key → reste dans GAS (Script Properties)
 *   - FedaPay clés         → restent dans GAS (Script Properties)
 *   - GAS_URL              → reste dans Vercel env (via /api/gas)
 *
 * Pour modifier la site key : changer ici uniquement, pas dans 5 HTML.
 * ─────────────────────────────────────────────────────────────────
 */

window.FODDEB_CONFIG = Object.freeze({

  // reCAPTCHA v3 — site key publique par conception Google
  // La secret key reste dans GAS (Script Properties : RECAPTCHA_SECRET)
  RECAPTCHA_SITE_KEY: '6LdU3tksAAAAAOAIdgtC7xsQURksQ9mHAZ3MVLXF',

  // Proxy Vercel → GAS — ne pas modifier
  // La vraie URL GAS est dans les variables d'environnement Vercel (GAS_URL)
  API_ENDPOINT: '/api/gas',

  // Informations application
  APP_NAME:    'FODDEB',
  APP_VERSION: '2.2.0',

});

// ─────────────────────────────────────────────────────────────────
// Injection dynamique du script reCAPTCHA v3
// Remplace les 5 balises <script src="recaptcha..."> dans les HTML.
// À supprimer dans : admin/login.html, auth/login.html,
//                    auth/register.html, index.html, pages/contact.html
// ─────────────────────────────────────────────────────────────────
(function () {
  var s  = document.createElement('script');
  s.src  = 'https://www.google.com/recaptcha/api.js?render='
           + window.FODDEB_CONFIG.RECAPTCHA_SITE_KEY;
  s.async = true;
  document.head.appendChild(s);
})();
