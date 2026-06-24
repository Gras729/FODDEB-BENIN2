/**
 * FODDEB — assets/js/config.js
 * Constantes publiques côté frontend.
 * Charger en PREMIER dans chaque page HTML, avant api.js et utils.js.
 *
 * Valeurs PUBLIQUES uniquement :
 *   - reCAPTCHA SITE key  → publique par conception Google
 *   - Toutes les clés secrètes restent dans les variables Vercel
 */
window.FODDEB_CONFIG = Object.freeze({
  RECAPTCHA_SITE_KEY: '6LdU3tksAAAAAOAIdgtC7xsQURksQ9mHAZ3MVLXF',
  APP_NAME:    'FODDEB',
  APP_VERSION: '3.0.0',
});

// Injection dynamique reCAPTCHA v3
(function () {
  const s  = document.createElement('script');
  s.src    = 'https://www.google.com/recaptcha/api.js?render='
             + window.FODDEB_CONFIG.RECAPTCHA_SITE_KEY;
  s.async  = true;
  document.head.appendChild(s);
})();
