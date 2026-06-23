/* ============================================================
   FODDEB — auth.js  (assets/js/services/auth.js)
   Gestion authentification : login, OTP, session, rôles
   ============================================================ */

'use strict';

const FODDEB_AUTH = (() => {

  const OTP_TTL_MS    = 5 * 60 * 1000; // 5 minutes
  const MAX_ATTEMPTS  = 5;
  const LOCKOUT_MS    = 15 * 60 * 1000; // 15 minutes

  /* -------- Stockage temporaire OTP (sessionStorage) -------- */
  const otpStore = {
    save(userId, otp) {
      sessionStorage.setItem('foddeb_otp', JSON.stringify({
        userId, otp, expires: Date.now() + OTP_TTL_MS, attempts: 0
      }));
    },
    get() {
      try { return JSON.parse(sessionStorage.getItem('foddeb_otp')); } catch { return null; }
    },
    clear() { sessionStorage.removeItem('foddeb_otp'); },
    isExpired() {
      const d = this.get();
      return !d || Date.now() > d.expires;
    },
    incrementAttempts() {
      const d = this.get();
      if (!d) return;
      d.attempts = (d.attempts || 0) + 1;
      sessionStorage.setItem('foddeb_otp', JSON.stringify(d));
      return d.attempts;
    }
  };

  /* -------- Brute-force protection -------- */
  const lockout = {
    key:    'foddeb_lockout',
    check() {
      const d = JSON.parse(localStorage.getItem(this.key) || '{}');
      if (d.until && Date.now() < d.until) {
        const remaining = Math.ceil((d.until - Date.now()) / 60000);
        throw new Error(`Trop de tentatives. Réessayez dans ${remaining} min.`);
      }
    },
    register() {
      const d = JSON.parse(localStorage.getItem(this.key) || '{"count":0}');
      d.count = (d.count || 0) + 1;
      if (d.count >= MAX_ATTEMPTS) {
        d.until = Date.now() + LOCKOUT_MS;
        d.count = 0;
      }
      localStorage.setItem(this.key, JSON.stringify(d));
    },
    reset() { localStorage.removeItem(this.key); }
  };

  /* ============================================================
     ÉTAPE 1 — Vérification identifiant + mot de passe
  ============================================================ */
  const stepLogin = async (identifier, password) => {
    lockout.check();

    const passwordHash = await FODDEB.hashPassword(password);
    let user;

    try {
      const res = await FODDEB_API.auth.login(identifier, passwordHash);
      user = res.user;
    } catch (err) {
      lockout.register();
      throw err;
    }

    // Stocker userId temporairement pour l'étape OTP
    sessionStorage.setItem('foddeb_pending_user', JSON.stringify(user));

    // Générer et envoyer OTP
    const otp = FODDEB.generateOTP();
    otpStore.save(user.id, otp);

    // En production : appel API pour envoi email
    await FODDEB_API.auth.sendOTP(user.id, user.email);
    // En développement — afficher dans console pour tests
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      console.info(`[DEV] OTP pour ${user.email} : ${otp}`);
    }

    lockout.reset();
    return { success: true, email: user.email, maskedEmail: maskEmail(user.email) };
  };

  /* ============================================================
     ÉTAPE 2 — Validation OTP
  ============================================================ */
  const stepVerifyOTP = async (otpInput) => {
    const stored = otpStore.get();

    if (!stored)           throw new Error('Session expirée. Recommencez.');
    if (otpStore.isExpired()) { otpStore.clear(); throw new Error('Code OTP expiré. Recommencez.'); }

    const attempts = otpStore.incrementAttempts();
    if (attempts > 3) { otpStore.clear(); throw new Error('Trop de tentatives OTP. Recommencez.'); }

    // Validation côté serveur
    const res = await FODDEB_API.auth.verifyOTP(stored.userId, otpInput);
    if (!res.valid) throw new Error(`Code OTP incorrect. ${3 - attempts} essai(s) restant(s).`);

    // OTP validé → ouvrir session et sauvegarder le token de session
    const user = JSON.parse(sessionStorage.getItem('foddeb_pending_user') || '{}');
    FODDEB.session.set(user);
    // sessionToken retourné par le GAS — stocker pour les appels sécurisés
    if (res.sessionToken) FODDEB.session.setToken(res.sessionToken);
    otpStore.clear();
    sessionStorage.removeItem('foddeb_pending_user');

    return { success: true, user };
  };

  /* ============================================================
     DÉCONNEXION
  ============================================================ */
  const logout = (redirect = '/login.html') => {
    FODDEB.session.clear();
    otpStore.clear();
    sessionStorage.removeItem('foddeb_pending_user');
    window.location.href = redirect;
  };

  /* ============================================================
     GUARDS — Protection des pages
  ============================================================ */
  const requireAuth = (roles = []) => {
    const user = FODDEB.session.get();
    if (!user) {
      sessionStorage.setItem('foddeb_redirect', window.location.href);
      window.location.href = '/login.html';
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
  const requireMember  = () => requireAuth(['admin', 'manager', 'member', 'donor']);

  /* ============================================================
     UTILS
  ============================================================ */
  const maskEmail = (email) => {
    const [name, domain] = email.split('@');
    return name.slice(0, 2) + '***@' + domain;
  };

  const getRoleLabel = (role) => ({
    admin:   'Administrateur',
    manager: 'Gestionnaire',
    member:  'Membre',
    donor:   'Donateur',
  }[role] || role);

  const getRoleBadgeColor = (role) => ({
    admin:   '#1B5E20',
    manager: '#1565C0',
    member:  '#4A5568',
    donor:   '#F57F17',
  }[role] || '#4A5568');

  return {
    stepLogin,
    stepVerifyOTP,
    logout,
    requireAuth,
    requireAdmin,
    requireManager,
    requireMember,
    getRoleLabel,
    getRoleBadgeColor,
    maskEmail,
  };

})();

window.FODDEB_AUTH = FODDEB_AUTH;
