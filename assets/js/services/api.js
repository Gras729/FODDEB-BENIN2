/* ============================================================
   FODDEB — assets/js/services/api.js
   Client API universel — pointe vers les routes Vercel /api/...
   Remplace l'ancien client GAS (doGet/doPost Apps Script).
   ============================================================ */

'use strict';

const FODDEB_API = (() => {

  const BASE = window.location.origin; // même domaine Vercel

  /* ── Appel générique ──────────────────────────────────────── */
  async function call(endpoint, payload = {}) {
    const headers = { 'Content-Type': 'application/json' };

    // Injecter le token de session si disponible
    const token = sessionStorage.getItem('foddeb_session_token')
               || localStorage.getItem('foddeb_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${BASE}/api/${endpoint}`, {
      method:  'POST',
      headers,
      body:    JSON.stringify(payload),
    });

    let data;
    try { data = await res.json(); } catch (e) {
      throw new Error('Réponse serveur invalide.');
    }

    if (!data.success) throw new Error(data.error || 'Erreur inconnue.');
    return data;
  }

  /* ══════════════════════════════════════════════════════════
     AUTH
  ══════════════════════════════════════════════════════════ */
  const auth = {
    login:    (email, password)        => call('auth', { action: 'login', email, password }),
    verifyOtp:(email, code)            => call('auth', { action: 'verify_otp', email, code }),
    logout:   (token)                  => call('auth', { action: 'logout', token }),
    resetRequest: (email)              => call('auth', { action: 'reset_password', email }),
    resetConfirm: (email, code, pwd)   => call('auth', { action: 'reset_password', email, code, newPassword: pwd }),
  };

  /* ══════════════════════════════════════════════════════════
     MEMBRES
  ══════════════════════════════════════════════════════════ */
  const membres = {
    create:        (data)              => call('membres', { action: 'create', ...data }),
    list:          (filters = {})      => call('membres', { action: 'list', ...filters }),
    get:           (id)                => call('membres', { action: 'get', id }),
    update:        (id, data)          => call('membres', { action: 'update', id, ...data }),
    updateRole:    (id, role)          => call('membres', { action: 'update_role', id, role }),
    updateStatut:  (id, statut)        => call('membres', { action: 'update_statut', id, statut }),
    delete:        (id)                => call('membres', { action: 'delete', id }),
    checkEmail:    (value)             => call('membres', { action: 'check_email', value }),
    checkPhone:    (value)             => call('membres', { action: 'check_phone', value }),
    checkCni:      (value)             => call('membres', { action: 'check_cni', value }),
  };

  /* ══════════════════════════════════════════════════════════
     DONS
  ══════════════════════════════════════════════════════════ */
  const dons = {
    create:  (data)                    => call('dons', { action: 'create', ...data }),
    list:    (filters = {})            => call('dons', { action: 'list', ...filters }),
    get:     (id)                      => call('dons', { action: 'get', id }),
    update:  (id, data)                => call('dons', { action: 'update', id, ...data }),
    delete:  (id)                      => call('dons', { action: 'delete', id }),
  };

  /* ══════════════════════════════════════════════════════════
     PROJETS
  ══════════════════════════════════════════════════════════ */
  const projets = {
    listPublic: (filters = {})         => call('projets', { action: 'list_public', ...filters }),
    list:       (filters = {})         => call('projets', { action: 'list', ...filters }),
    get:        (id)                   => call('projets', { action: 'get', id }),
    create:     (data)                 => call('projets', { action: 'create', ...data }),
    update:     (id, data)             => call('projets', { action: 'update', id, ...data }),
    delete:     (id)                   => call('projets', { action: 'delete', id }),
  };

  /* ══════════════════════════════════════════════════════════
     ACTUALITÉS
  ══════════════════════════════════════════════════════════ */
  const actualites = {
    listPublic: (filters = {})         => call('actualites', { action: 'list_public', ...filters }),
    list:       (filters = {})         => call('actualites', { action: 'list', ...filters }),
    get:        (id)                   => call('actualites', { action: 'get', id }),
    create:     (data)                 => call('actualites', { action: 'create', ...data }),
    update:     (id, data)             => call('actualites', { action: 'update', id, ...data }),
    delete:     (id)                   => call('actualites', { action: 'delete', id }),
  };

  /* ══════════════════════════════════════════════════════════
     NEWSLETTER
  ══════════════════════════════════════════════════════════ */
  const newsletter = {
    subscribe:   (email, nom, source)  => call('newsletter', { action: 'subscribe', email, nom, source }),
    unsubscribe: (email)               => call('newsletter', { action: 'unsubscribe', email }),
    list:        (filters = {})        => call('newsletter', { action: 'list', ...filters }),
    delete:      (id)                  => call('newsletter', { action: 'delete', id }),
  };

  /* ══════════════════════════════════════════════════════════
     CONTACTS
  ══════════════════════════════════════════════════════════ */
  const contact = {
    send:          (data)              => call('contacts', { action: 'send', ...data }),
    list:          (filters = {})      => call('contacts', { action: 'list', ...filters }),
    updateStatut:  (id, statut)        => call('contacts', { action: 'update_statut', id, statut }),
    delete:        (id)                => call('contacts', { action: 'delete', id }),
  };

  /* ══════════════════════════════════════════════════════════
     BAILLEURS
  ══════════════════════════════════════════════════════════ */
  const bailleurs = {
    list:    (filters = {})            => call('bailleurs', { action: 'list', ...filters }),
    get:     (id)                      => call('bailleurs', { action: 'get', id }),
    create:  (data)                    => call('bailleurs', { action: 'create', ...data }),
    update:  (id, data)                => call('bailleurs', { action: 'update', id, ...data }),
    delete:  (id)                      => call('bailleurs', { action: 'delete', id }),
  };

  /* ══════════════════════════════════════════════════════════
     RAPPORTS
  ══════════════════════════════════════════════════════════ */
  const rapports = {
    list:    (filters = {})            => call('rapports', { action: 'list', ...filters }),
    get:     (id)                      => call('rapports', { action: 'get', id }),
    create:  (data)                    => call('rapports', { action: 'create', ...data }),
    update:  (id, data)                => call('rapports', { action: 'update', id, ...data }),
    delete:  (id)                      => call('rapports', { action: 'delete', id }),
  };

  /* ══════════════════════════════════════════════════════════
     PARAMÈTRES
  ══════════════════════════════════════════════════════════ */
  const parametres = {
    get:     ()                        => call('parametres', { action: 'get' }),
    update:  (data)                    => call('parametres', { action: 'update', ...data }),
  };

  /* ══════════════════════════════════════════════════════════
     UPLOAD (Supabase Storage)
  ══════════════════════════════════════════════════════════ */
  const upload = {
    /**
     * @param {File}   file    - objet File du input
     * @param {string} bucket  - ex. 'membres-photos'
     * @param {string} path    - ex. 'uuid-membre/photo'
     */
    async send(file, bucket, path) {
      const token = sessionStorage.getItem('foddeb_session_token')
                 || localStorage.getItem('foddeb_token');
      const form = new FormData();
      form.append('file',   file);
      form.append('bucket', bucket);
      form.append('path',   path);

      const res = await fetch(`${BASE}/api/upload`, {
        method:  'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body:    form,
      });

      let data;
      try { data = await res.json(); } catch (e) {
        throw new Error('Réponse serveur invalide.');
      }
      if (!data.success) throw new Error(data.error || 'Erreur upload.');
      return data; // { url, path, bucket, size }
    }
  };

  /* ══════════════════════════════════════════════════════════
     COMPATIBILITÉ ANCIENNE API GAS
     Alias pour ne pas casser les appels existants dans index.html
  ══════════════════════════════════════════════════════════ */
  const news = {
    list: (page = 1, limit = 10) => actualites.listPublic({ limit, offset: (page - 1) * limit }),
  };

  const fedapay = {
    // FedaPay est maintenant géré côté serveur dans api/dons/index.js
    // Cette méthode retourne l'URL de paiement depuis la réponse du don créé
    initTransaction: async (montant, customer, description) => {
      const parts  = (customer.name || '').split(' ');
      const prenom = parts[0] || '';
      const nom    = parts.slice(1).join(' ') || prenom;
      const res    = await dons.create({
        prenom,
        nom,
        email:   customer.email,
        montant,
        type_don: 'don_libre',
      });
      return { payment_url: res.payment_url || null };
    },
  };

  return {
    call,
    auth,
    membres,
    dons,
    projets,
    actualites,
    newsletter,
    contact,
    bailleurs,
    rapports,
    parametres,
    upload,
    // Alias compatibilité
    news,
    fedapay,
  };

})();

window.FODDEB_API = FODDEB_API;
