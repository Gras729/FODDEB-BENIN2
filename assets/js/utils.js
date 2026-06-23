/* ============================================================
   FODDEB — utils.js  (assets/js/utils.js)
   Fonctions utilitaires partagées sur toutes les pages
   ============================================================ */

'use strict';

/* ── Guard double-inclusion ────────────────────────────────────────────────
   'var' tolère la re-déclaration contrairement à 'const'.
   Ce guard empêche la réinitialisation si le script est chargé 2×.
   ────────────────────────────────────────────────────────────────────────── */
if (window.__FODDEB_UTILS_LOADED__) { /* déjà initialisé — sortie précoce */ }
else { window.__FODDEB_UTILS_LOADED__ = true; }

// eslint-disable-next-line no-var
var FODDEB = window.FODDEB || {};

/* -------- Formatage -------- */
FODDEB.formatCFA = (amount) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(amount);

FODDEB.formatDate = (dateStr, opts = {}) =>
  new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', ...opts }).format(new Date(dateStr));

FODDEB.formatRelative = (dateStr) => {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60)   return 'À l\'instant';
  if (diff < 3600) return `Il y a ${Math.floor(diff/60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff/3600)} h`;
  return FODDEB.formatDate(dateStr);
};

FODDEB.truncate = (str, max = 120) =>
  str.length <= max ? str : str.slice(0, max).trimEnd() + '…';

/* -------- Validation -------- */
FODDEB.isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
FODDEB.isPhone = (v) => /^(\+229|00229)?[0-9]{8,10}$/.test(v.replace(/\s/g, ''));
FODDEB.isEmpty = (v) => !v || !v.toString().trim();

FODDEB.validateForm = (fields) => {
  const errors = {};
  fields.forEach(({ id, label, rules }) => {
    const el = document.getElementById(id);
    if (!el) return;
    const val = el.value.trim();
    if (rules.required && FODDEB.isEmpty(val))   errors[id] = `${label} est requis`;
    if (rules.email && !FODDEB.isEmail(val))      errors[id] = `${label} invalide`;
    if (rules.min && val.length < rules.min)      errors[id] = `${label} trop court (min ${rules.min})`;
    if (rules.phone && !FODDEB.isPhone(val))      errors[id] = `${label} invalide`;
  });
  return errors;
};

FODDEB.showFieldErrors = (errors) => {
  document.querySelectorAll('.field-error').forEach(e => e.remove());
  document.querySelectorAll('.input-error').forEach(e => e.classList.remove('input-error'));
  Object.entries(errors).forEach(([id, msg]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('input-error');
    const err = document.createElement('span');
    err.className = 'field-error';
    err.textContent = msg;
    el.parentNode.insertBefore(err, el.nextSibling);
  });
};

/* -------- Hachage -------- */
FODDEB.hashPassword = async (password) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
};

/* -------- OTP -------- */
FODDEB.generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

/* -------- Session -------- */
FODDEB.session = {
  set(user)    { sessionStorage.setItem('foddeb_user', JSON.stringify(user)); },
  get()        { try { return JSON.parse(sessionStorage.getItem('foddeb_user')); } catch { return null; } },
  // Gestion du token de session — requis pour les actions sécurisées (ex : upload photo)
  setToken(t)  { if (t) sessionStorage.setItem('foddeb_token', t); },
  getToken()   { return sessionStorage.getItem('foddeb_token') || null; },
  clearToken() { sessionStorage.removeItem('foddeb_token'); },
  clear() {
    sessionStorage.removeItem('foddeb_user');
    sessionStorage.removeItem('foddeb_token');
  },
  isLogged(){ return !!this.get(); },
  hasRole(role) {
    const u = this.get();
    return u && (u.role === role || u.role === 'admin');
  }
};

/* -------- Toast notifications -------- */
FODDEB.toast = (() => {
  let container;
  const init = () => {
    if (container) return;
    container = document.createElement('div');
    container.id = 'toast-container';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;max-width:340px;';
    document.body.appendChild(container);
  };
  return {
    show(message, type = 'info', duration = 4000) {
      init();
      const colors = { success: '#1B5E20', error: '#C62828', info: '#1565C0', warning: '#F57F17' };
      const icons  = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
      const toast = document.createElement('div');
      toast.style.cssText = `
        background:${colors[type]};color:#fff;padding:14px 18px;border-radius:10px;
        font-family:'DM Sans',sans-serif;font-size:14px;display:flex;align-items:flex-start;
        gap:10px;box-shadow:0 8px 24px rgba(0,0,0,.2);animation:toastIn .3s ease;
      `;
      toast.innerHTML = `<span style="font-size:16px;line-height:1">${icons[type]}</span><span>${message}</span>`;
      container.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        toast.style.transition = 'all .3s ease';
        setTimeout(() => toast.remove(), 300);
      }, duration);
    },
    success: (m, d) => FODDEB.toast.show(m, 'success', d),
    error:   (m, d) => FODDEB.toast.show(m, 'error',   d),
    warning: (m, d) => FODDEB.toast.show(m, 'warning', d),
    info:    (m, d) => FODDEB.toast.show(m, 'info',    d),
  };
})();

/* -------- Modal -------- */
FODDEB.modal = {
  open(id)  { const m = document.getElementById(id); if (m) { m.classList.add('open'); document.body.style.overflow = 'hidden'; } },
  close(id) { const m = document.getElementById(id); if (m) { m.classList.remove('open'); document.body.style.overflow = ''; } },
  closeAll(){ document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open')); document.body.style.overflow = ''; }
};

/* -------- Loader -------- */
FODDEB.loader = {
  show(id) { const el = document.getElementById(id); if (el) el.classList.add('loading'); },
  hide(id) { const el = document.getElementById(id); if (el) el.classList.remove('loading'); },
  btn(btn, state) {
    if (state) {
      btn.disabled = true;
      btn._orig = btn.innerHTML;
      btn.innerHTML = '<span class="spinner"></span> Chargement…';
    } else {
      btn.disabled = false;
      btn.innerHTML = btn._orig || btn.innerHTML;
    }
  }
};

/* -------- Pagination -------- */
FODDEB.paginate = (items, page, perPage = 10) => ({
  data:       items.slice((page - 1) * perPage, page * perPage),
  total:      items.length,
  page,
  perPage,
  totalPages: Math.ceil(items.length / perPage),
  hasPrev:    page > 1,
  hasNext:    page < Math.ceil(items.length / perPage),
});

/* -------- Debounce -------- */
FODDEB.debounce = (fn, delay = 300) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
};

/* -------- Export CSV -------- */
FODDEB.exportCSV = (data, filename = 'export.csv') => {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => `"${(row[h] ?? '').toString().replace(/"/g, '""')}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
};

/* -------- Inject global CSS for utils -------- */
const utilStyle = document.createElement('style');
utilStyle.textContent = `
  @keyframes toastIn { from { opacity:0; transform:translateX(20px); } }
  .field-error { display:block; font-size:12px; color:#C62828; margin-top:4px; }
  .input-error { border-color:#C62828 !important; box-shadow:0 0 0 3px rgba(198,40,40,.15) !important; }
  .spinner { display:inline-block; width:14px; height:14px; border:2px solid rgba(255,255,255,.3); border-top-color:#fff; border-radius:50%; animation:spin .7s linear infinite; vertical-align:middle; }
  @keyframes spin { to { transform:rotate(360deg); } }
  .loading { opacity:.6; pointer-events:none; }
`;
document.head.appendChild(utilStyle);

window.FODDEB = FODDEB;
