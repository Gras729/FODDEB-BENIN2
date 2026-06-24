/* ============================================================
   FODDEB — assets/js/services/auth.js
   Authentification : login → OTP serveur → session locale
   Backend : API routes Vercel (plus GAS)
   ============================================================ */

'use strict';

const FODDEB_AUTH = (() => {

  const SESSION_KEY = 'foddeb_membre';
  const TOKEN_KEY   = 'foddeb_token';

  /* ══════════════════════════════════════════════════════════
     ÉTAPE 1 — Login email + password
     Appelle /api/auth { action: 'login' }
     Le serveur envoie un OTP par Gmail SMTP.
  ══════════════════════════════════════════════════════════ */
  const stepLogin = async (email, password) => {
    const res = await FODDEB_API.auth.login(email, password);
    // Stocker l'email temporairement pour l'étape OTP
    sessionStorage.setItem('foddeb_pending_email', email.toLowerCase().trim());
    return { success: true, message: res.message };
  };

  /* ══════════════════════════════════════════════════════════
     ÉTAPE 2 — Vérification OTP
     Appelle /api/auth { action: 'verify_otp' }
     Le serveur retourne { token, membre, expiresAt }
  ══════════════════════════════════════════════════════════ */
  const stepVerifyOTP = async (code) => {
    const email = sessionStorage.getItem('foddeb_pending_email');
    if (!email) throw new Error('Session expirée. Recommencez la connexion.');

    const res = await FODDEB_API.auth.verifyOtp(email, code);

    // Persister la session
    localStorage.setItem(TOKEN_KEY,   res.token);
    localStorage.setItem(SESSION_KEY, JSON.stringify(res.membre));
    sessionStorage.setItem('foddeb_session_token', res.token);
    sessionStorage.removeItem('foddeb_pending_email');

    return { success: true, user: res.membre };
  };

  /* ══════════════════════════════════════════════════════════
     DÉCONNEXION
  ══════════════════════════════════════════════════════════ */
  const logout = async (redirect = '/') => {
    const token = localStorage.getItem(TOKEN_KEY);
    try {
      if (token) await FODDEB_API.auth.logout(token);
    } catch (e) {
      console.warn('[auth] logout serveur :', e.message);
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem('foddeb_session_token');
    sessionStorage.removeItem('foddeb_pending_email');
    if (redirect) window.location.href = redirect;
  };

  /* ══════════════════════════════════════════════════════════
     SESSION — Lecture locale
  ══════════════════════════════════════════════════════════ */
  const getUser = () => {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY));
    } catch { return null; }
  };

  const getToken = () => localStorage.getItem(TOKEN_KEY) || null;

  const isLoggedIn = () => !!getToken() && !!getUser();

  /* ══════════════════════════════════════════════════════════
     GUARDS — Protection des pages
  ══════════════════════════════════════════════════════════ */
  const requireAuth = (roles = []) => {
    const user = getUser();
    if (!user || !getToken()) {
      sessionStorage.setItem('foddeb_redirect', window.location.href);
      window.location.href = '/auth/login.html';
      return false;
    }
    if (roles.length && !roles.includes(user.role)) {
      window.location.href = '/403.html';
      return false;
    }
    return user;
  };

  const requireAdmin   = () => requireAuth(['admin']);
  const requireManager = () => requireAuth(['admin', 'manager']);
  const requireMember  = () => requireAuth(['admin', 'manager', 'member']);

  /* ══════════════════════════════════════════════════════════
     RESET MOT DE PASSE
  ══════════════════════════════════════════════════════════ */
  const resetRequest = async (email) => {
    await FODDEB_API.auth.resetRequest(email);
    sessionStorage.setItem('foddeb_reset_email', email.toLowerCase().trim());
    return { success: true };
  };

  const resetConfirm = async (code, newPassword) => {
    const email = sessionStorage.getItem('foddeb_reset_email');
    if (!email) throw new Error('Session expirée. Recommencez.');
    await FODDEB_API.auth.resetConfirm(email, code, newPassword);
    sessionStorage.removeItem('foddeb_reset_email');
    return { success: true };
  };

  /* ══════════════════════════════════════════════════════════
     UTILS
  ══════════════════════════════════════════════════════════ */
  const maskEmail = (email) => {
    if (!email) return '';
    const [name, domain] = email.split('@');
    return name.slice(0, 2) + '***@' + domain;
  };

  const getRoleLabel = (role) => ({
    admin:   'Administrateur',
    manager: 'Manager',
    member:  'Membre',
  }[role] || role);

  const getRoleBadgeColor = (role) => ({
    admin:   '#2d8a4e',
    manager: '#f0a500',
    member:  '#64748b',
  }[role] || '#64748b');

  return {
    stepLogin,
    stepVerifyOTP,
    logout,
    getUser,
    getToken,
    isLoggedIn,
    requireAuth,
    requireAdmin,
    requireManager,
    requireMember,
    resetRequest,
    resetConfirm,
    maskEmail,
    getRoleLabel,
    getRoleBadgeColor,
  };

})();

window.FODDEB_AUTH = FODDEB_AUTH;
