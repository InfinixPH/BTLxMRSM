/**
 * BTL x MRMS — APP
 * Handles: login/session, instant load from cache + background refresh,
 * polling-based sync, theme toggle, sidebar nav, notification panel,
 * view routing, and every page (dashboard, materials, requests + detail,
 * new request form, approval windows, activity log, users, settings).
 */

let SESSION = null;       // { userId, fullName, role, region }
let STATE = {              // in-memory app data, hydrated from cache then network
  materials: [],
  requests: [],
  notifications: [],
  timeline: [],
  lastUpdate: null
};
let currentView = 'dashboard';
let pollTimer = null;
let itemRowSeq = 0;
let GLOBAL_SEARCH = '';

const REQUEST_TYPES = ['Regular Replenishment', 'New Store Setup', 'Damage Replacement', 'Special Request'];

// ===================================================================
// ICONS (inline, keeps this dependency-free)
// ===================================================================
// Icon set sourced from svgrepo.com (Feather Icons collection — CC0/MIT,
// 24x24 viewBox, stroke-based), kept in one place so every icon in the
// app shares the same visual family and weight.
const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  box: '<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  users: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  edit: '<path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
  chevronLeft: '<polyline points="15 18 9 12 15 6"/>',
  chevronRight: '<polyline points="9 18 15 12 9 6"/>',
  alertTriangle: '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/>',
  close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  trendingUp: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'
};

// Small helper so freshly-added icons always carry the viewBox their 24x24
// paths were drawn against — used for anything new below.
function svgIcon(name, cls) {
  return `<svg viewBox="0 0 24 24"${cls ? ` class="${cls}"` : ''}>${ICONS[name] || ICONS.grid}</svg>`;
}

// ===================================================================
// INIT
// ===================================================================

document.addEventListener('DOMContentLoaded', () => {
  applyStoredTheme();
  bindThemeToggles();
  bindLoginForm();
  bindSidebarToggle();
  bindMobileMenu();
  bindMobileSearch();
  bindTopbarSearch();
  bindNotifPanel();
  bindModal();

  window.addEventListener('resize', () => {
    if (window.innerWidth > 860) closeMobileMenu();
  });

  const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.SESSION);
  if (stored) {
    SESSION = JSON.parse(stored);
    enterApp();
  }
});

// ===================================================================
// THEME
// ===================================================================

function applyStoredTheme() {
  const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.THEME) || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(CONFIG.STORAGE_KEYS.THEME, next);
}

function bindThemeToggles() {
  document.getElementById('themeToggleLogin').addEventListener('click', toggleTheme);
  document.getElementById('themeToggleApp').addEventListener('click', toggleTheme);
}

// ===================================================================
// LOGIN / SESSION
// ===================================================================

function bindLoginForm() {
  const form = document.getElementById('loginForm');

  document.getElementById('forgotPinBtn').addEventListener('click', () => {
    document.getElementById('loginError').textContent = 'Contact your Admin to reset your PIN.';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('loginUserId').value.trim();
    const pin = document.getElementById('loginPin').value.trim();
    const errorEl = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');

    errorEl.textContent = '';
    btn.textContent = 'Logging in...';
    btn.disabled = true;

    try {
      const user = await Api.login(userId, pin);
      SESSION = user;
      localStorage.setItem(CONFIG.STORAGE_KEYS.SESSION, JSON.stringify(user));
      enterApp();
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      btn.textContent = 'Log In';
      btn.disabled = false;
    }
  });
}

function logout() {
  clearInterval(pollTimer);
  currentCacheKey = null;
  localStorage.removeItem(CONFIG.STORAGE_KEYS.SESSION);
  SESSION = null;
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('loginForm').reset();
}

// ===================================================================
// APP ENTRY — instant load from cache, then background refresh + polling
// ===================================================================

function enterApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');

  try {
    renderUserBadge();
    renderSidebarNav();

    // First-time / admin-reset PIN still equals the User ID until changed — block usage until it isn't.
    if (SESSION.pinStatus && SESSION.pinStatus !== 'Active') {
      promptForcedPinChange();
      return;
    }

    const cacheKey = `${CONFIG.STORAGE_KEYS.BOOTSTRAP_CACHE}_${SESSION.userId}`;
    currentCacheKey = cacheKey;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      STATE = JSON.parse(cached);
    }
    renderView(currentView);
    // Seed the root history entry so the very first popstate (native back gesture)
    // has something sane to land on, instead of falling through to no state at all.
    history.replaceState({ view: currentView, statusFilter: PENDING_REQUESTS_FILTER || null }, '', `#${currentView}`);
    updateBackButtonVisibility();

    refreshBootstrap(cacheKey);
    startPolling(cacheKey);
    bindVisibilityPolling();
  } catch (err) {
    console.error('enterApp failed:', err);
    document.getElementById('content').innerHTML =
      `<div class="page-header"><h1 class="page-title">Something went wrong</h1></div><p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

let currentCacheKey = null;

function startPolling(cacheKey) {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => checkForUpdates(cacheKey), CONFIG.DEFAULT_POLL_INTERVAL_MS);
}

let visibilityBound = false;
/** Backgrounded/minimized tabs shouldn't keep polling every 8s — with several
 *  people leaving tabs open all day this was pure wasted Sheets API quota.
 *  Pause while hidden, and catch up immediately the moment the tab is refocused. */
function bindVisibilityPolling() {
  if (visibilityBound) return; // listener persists across enterApp() re-runs, only bind once
  visibilityBound = true;
  document.addEventListener('visibilitychange', () => {
    if (!SESSION || !currentCacheKey) return;
    if (document.hidden) {
      clearInterval(pollTimer);
    } else {
      checkForUpdates(currentCacheKey);
      startPolling(currentCacheKey);
    }
  });
}

async function refreshBootstrap(cacheKey) {
  setSyncStatus('syncing');
  try {
    const data = await Api.getBootstrap(SESSION.role, SESSION.userId);
    STATE = data;
    localStorage.setItem(cacheKey, JSON.stringify(data));
    renderView(currentView);
    renderNotifications();
    setSyncStatus('synced');
  } catch (err) {
    console.error('Bootstrap refresh failed:', err);
    setSyncStatus('offline');
  }
}

/** Mandatory PIN change shown right after login when pinStatus isn't 'Active' yet
 *  (fresh account, or an Admin reset the PIN back to the User ID). Can't be dismissed
 *  until a valid new PIN is set — see FORCE_PIN_CHANGE in the modal helpers above. */
function promptForcedPinChange() {
  FORCE_PIN_CHANGE = true;
  openModal('Set a new PIN', `
    <p class="form-note">Your PIN is still your User ID. For security, set a new PIN before continuing.</p>
    <div class="field"><span class="field-label">New PIN</span><input id="fpNewPin" type="password" inputmode="numeric"></div>
    <div class="field"><span class="field-label">Confirm New PIN</span><input id="fpConfirmPin" type="password" inputmode="numeric"></div>
    <p class="login-error" id="fpError"></p>
    <div class="form-actions"><button class="btn btn-primary" id="fpSaveBtn">Set PIN & Continue</button></div>
  `);

  document.getElementById('fpSaveBtn').addEventListener('click', async () => {
    const errorEl = document.getElementById('fpError');
    const newPin = document.getElementById('fpNewPin').value.trim();
    const confirmPin = document.getElementById('fpConfirmPin').value.trim();
    errorEl.textContent = '';

    const validationError = isValidNewPin(newPin, SESSION.userId);
    if (validationError) { errorEl.textContent = validationError; return; }
    if (newPin !== confirmPin) { errorEl.textContent = 'New PIN and confirmation do not match.'; return; }

    const btn = document.getElementById('fpSaveBtn');
    btn.disabled = true;
    try {
      await Api.resetPin(SESSION.userId, newPin, SESSION.userId);
      SESSION.pinStatus = 'Active';
      localStorage.setItem(CONFIG.STORAGE_KEYS.SESSION, JSON.stringify(SESSION));
      FORCE_PIN_CHANGE = false;
      closeModal();
      toast('PIN set. Welcome!', 'success');
      enterApp(); // re-run now that pinStatus is Active — proceeds into the normal flow
    } catch (err) {
      errorEl.textContent = err.message;
      btn.disabled = false;
    }
  });
}

async function checkForUpdates(cacheKey) {
  try {
    const { lastUpdate } = await Api.getLastUpdate();
    if (lastUpdate && lastUpdate !== STATE.lastUpdate) {
      await refreshBootstrap(cacheKey);
    } else {
      setSyncStatus('synced');
    }
  } catch (err) {
    setSyncStatus('offline');
  }
}

function setSyncStatus(status) {
  const dot = document.querySelector('.sync-dot');
  const text = document.getElementById('syncText');
  dot.classList.remove('syncing', 'offline');
  if (status === 'syncing') { dot.classList.add('syncing'); text.textContent = 'Syncing...'; }
  else if (status === 'offline') { dot.classList.add('offline'); text.textContent = 'Offline'; }
  else { text.textContent = 'Synced'; }
}

// ===================================================================
// ROLE HELPERS
// ===================================================================

function isAdmin() { return SESSION.role === ROLES.ADMIN; }
function isBTL() { return BTL_ROLES.indexOf(SESSION.role) !== -1; }
function isWarehouse() { return SESSION.role === ROLES.WAREHOUSE; }
function canReviewRequests() { return isAdmin() || isBTL(); }
function canReleaseRequests() { return isAdmin() || isWarehouse(); }

// ===================================================================
// SIDEBAR
// ===================================================================

function renderUserBadge() {
  document.getElementById('userAvatar').textContent = initials(SESSION.fullName || SESSION.userId);
  document.getElementById('userName').textContent = SESSION.fullName || SESSION.userId;
  document.getElementById('userRole').textContent = SESSION.role;
}

function initials(name) {
  return String(name || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

function renderSidebarNav() {
  const nav = document.getElementById('sidebarNav');
  const items = getNavGroupForRole(SESSION.role);
  nav.innerHTML = items.map(item => `
    <button class="nav-item ${item.id === currentView ? 'active' : ''}" data-view="${item.id}">
      <svg viewBox="0 0 24 24">${ICONS[item.icon] || ICONS.grid}</svg>
      <span class="nav-label">${item.label}</span>
    </button>
  `).join('');

  nav.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => goToView(btn.dataset.view));
  });

  document.getElementById('logoutBtn').addEventListener('click', logout);
}

// Central place to switch views: keeps the sidebar's active state and the
// mobile drawer in sync, so any "jump to another page" link (like the
// Dashboard's "View all requests") behaves the same as clicking a nav item.
// `navOpts.pushHistory` (default true) controls whether this switch adds a
// browser history entry — set to false when replaying a state from popstate
// (back/forward) so we don't create a duplicate/looping entry.
function goToView(viewId, opts = {}, navOpts = {}) {
  currentView = viewId;
  document.querySelectorAll('#sidebarNav .nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.view === viewId);
  });
  clearGlobalSearch();
  PENDING_REQUESTS_FILTER = (viewId === 'requests' && opts.statusFilter) ? opts.statusFilter : null;
  renderView(viewId);
  if (window.innerWidth <= 860) closeMobileMenu();

  if (navOpts.pushHistory !== false) {
    history.pushState({ view: viewId, statusFilter: opts.statusFilter || null }, '', `#${viewId}`);
  }
  updateBackButtonVisibility();
}

function updateBackButtonVisibility() {
  const btn = document.getElementById('mobileMenuBtn');
  if (btn) btn.classList.toggle('back-mode', currentView !== 'dashboard');
}

// Makes the phone's native back gesture/button step through in-app views
// instead of leaving the site — previously every view switch just swapped
// DOM content with no history entry at all, so there was nothing to "go back" to.
window.addEventListener('popstate', (e) => {
  if (!SESSION) return; // not logged in yet — nothing to navigate
  closeModal(); // a request-detail or other modal shouldn't linger over a different underlying view
  const state = e.state;
  if (state && state.view) {
    goToView(state.view, { statusFilter: state.statusFilter }, { pushHistory: false });
  } else {
    goToView('dashboard', {}, { pushHistory: false });
  }
});

function clearGlobalSearch() {
  GLOBAL_SEARCH = '';
  const input = document.getElementById('globalSearch');
  if (!input) return;
  input.value = '';
  const placeholders = {
    requests: 'Search request ID, store, type, status...',
    materials: 'Search material ID, name, category...'
  };
  input.placeholder = placeholders[currentView] || 'Search requests, shop ID, materials...';
}

function bindTopbarSearch() {
  const input = document.getElementById('globalSearch');
  let debounceTimer = null;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      GLOBAL_SEARCH = input.value.trim().toLowerCase();
      if (currentView === 'requests') { REQUESTS_PAGE = 1; renderRequestsPage(); }
      else if (currentView === 'materials') { MATERIALS_PAGE = 1; renderMaterialsTable(); }
    }, 180);
  });
  document.getElementById('searchCloseBtn').addEventListener('click', () => {
    clearTimeout(debounceTimer);
    if (GLOBAL_SEARCH) { clearGlobalSearch(); renderView(currentView); }
  });
}

function matchesSearch(...fields) {
  if (!GLOBAL_SEARCH) return true;
  return fields.some(f => String(f || '').toLowerCase().includes(GLOBAL_SEARCH));
}

function bindSidebarToggle() {
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    // On mobile the sidebar is an off-canvas drawer, so this button closes it.
    // On desktop it collapses the sidebar down to an icon rail instead.
    if (window.innerWidth <= 860) {
      closeMobileMenu();
    } else {
      document.getElementById('sidebar').classList.toggle('collapsed');
    }
  });
}

function bindMobileMenu() {
  const btn = document.getElementById('mobileMenuBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (btn.classList.contains('back-mode')) {
      // Real browser history.back() — popstate replays the previous view.
      // Falls back to Dashboard if there's nowhere meaningful to go back to
      // (e.g. the app was opened directly on a non-dashboard deep link).
      if (history.state && history.state.view) history.back();
      else goToView('dashboard');
      return;
    }
    document.getElementById('sidebar').classList.add('mobile-open');
    document.getElementById('sidebarBackdrop').classList.add('visible');
  });
  document.getElementById('sidebarBackdrop').addEventListener('click', closeMobileMenu);
}

function closeMobileMenu() {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebarBackdrop').classList.remove('visible');
}

function bindMobileSearch() {
  const openBtn = document.getElementById('mobileSearchBtn');
  const closeBtn = document.getElementById('searchCloseBtn');
  const searchBar = document.getElementById('topbarSearch');
  if (!openBtn) return;
  openBtn.addEventListener('click', () => {
    searchBar.classList.add('search-open');
    document.getElementById('globalSearch').focus();
  });
  closeBtn.addEventListener('click', () => searchBar.classList.remove('search-open'));
}

// ===================================================================
// NOTIFICATIONS
// ===================================================================

function bindNotifPanel() {
  const btn = document.getElementById('notifBtn');
  const panel = document.getElementById('notifPanel');
  btn.addEventListener('click', () => panel.classList.toggle('hidden'));
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && !btn.contains(e.target)) panel.classList.add('hidden');
  });

  document.getElementById('notifMarkAllBtn').addEventListener('click', async (e) => {
    e.stopPropagation();
    const unreadIds = (STATE.notifications || []).filter(n => n.readStatus === 'Unread').map(n => n.notificationId);
    if (!unreadIds.length) return;
    const markAllBtn = document.getElementById('notifMarkAllBtn');
    markAllBtn.disabled = true;
    try {
      // Sequential, not Promise.all — avoids hammering the Apps Script Web App
      // with a burst of simultaneous writes for someone with many unread items.
      for (const id of unreadIds) {
        await Api.markNotificationRead(id);
        const n = STATE.notifications.find(x => x.notificationId === id);
        if (n) n.readStatus = 'Read';
      }
      renderNotifications();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      markAllBtn.disabled = false;
    }
  });
}

function renderNotifications() {
  const list = STATE.notifications || [];
  const unread = list.filter(n => n.readStatus === 'Unread');
  const badge = document.getElementById('notifBadge');
  badge.textContent = unread.length;
  badge.classList.toggle('hidden', unread.length === 0);
  document.getElementById('notifMarkAllBtn').classList.toggle('hidden', unread.length === 0);

  const container = document.getElementById('notifList');
  if (!list.length) {
    container.innerHTML = '<p class="empty-state">No notifications yet.</p>';
    return;
  }
  container.innerHTML = list.slice().reverse().map(n => `
    <div class="notif-item ${n.readStatus === 'Unread' ? 'unread' : ''}" data-id="${n.notificationId}">
      <div>${escapeHtml(n.message)}</div>
      <div class="notif-item-time">${formatDate(n.createdAt)}</div>
    </div>
  `).join('');

  container.querySelectorAll('.notif-item').forEach(el => {
    el.addEventListener('click', async () => {
      try {
        await Api.markNotificationRead(el.dataset.id);
        el.classList.remove('unread');
        const n = list.find(x => x.notificationId === el.dataset.id);
        if (n) n.readStatus = 'Read';
        renderNotifications();
        if (n && n.relatedRequestId) {
          document.getElementById('notifPanel').classList.add('hidden');
          openRequestDetail(n.relatedRequestId);
        }
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

// ===================================================================
// TOASTS
// ===================================================================

function toast(message, type) {
  const stack = document.getElementById('toastStack');
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'toast-error' : type === 'success' ? 'toast-success' : ''}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ===================================================================
// MODAL
// ===================================================================

let FORCE_PIN_CHANGE = false; // true while the mandatory first-login PIN change is open — blocks dismissal

function bindModal() {
  document.getElementById('modalCloseBtn').addEventListener('click', () => { if (!FORCE_PIN_CHANGE) closeModal(); });
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay' && !FORCE_PIN_CHANGE) closeModal();
  });
}

function openModal(title, bodyHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalOverlay').classList.remove('hidden');
  document.getElementById('modalCloseBtn').classList.toggle('hidden', FORCE_PIN_CHANGE);
}

function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  document.getElementById('modalBody').innerHTML = '';
}

/** Shared PIN validity rule used by both the forced first-login change and Settings. */
function isValidNewPin(pin, userId) {
  if (!/^\d{4,}$/.test(pin)) return 'PIN must be at least 4 digits.';
  if (pin === String(userId).trim()) return 'New PIN can\'t be the same as your User ID.';
  return null;
}

// ===================================================================
// SMALL UTILS
// ===================================================================

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d)) return String(value);
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
}

function stampFor(status) {
  const map = {
    'Pending': 'stamp-pending', 'Approved': 'stamp-approved', 'Rejected': 'stamp-rejected',
    'Need Clarification': 'stamp-clarify', 'Completed': 'stamp-completed', 'Released': 'stamp-completed'
  };
  return `<span class="stamp ${map[status] || 'stamp-pending'}">${escapeHtml(status || 'Pending')}</span>`;
}

function findMaterial(materialId) {
  return getValidMaterials().find(m => m.materialId === materialId);
}

// ===================================================================
// VIEW ROUTING
// ===================================================================

function renderView(view) {
  const content = document.getElementById('content');
  switch (view) {
    case 'dashboard': content.innerHTML = viewDashboard(); bindDashboard(); break;
    case 'materials': content.innerHTML = viewMaterials(); bindMaterials(); break;
    case 'requests': content.innerHTML = viewRequests(); bindRequests(); break;
    case 'performance': content.innerHTML = viewPerformanceShell(); loadPerformance(); break;
    case 'newRequest': content.innerHTML = viewNewRequestForm(); bindNewRequestForm(); break;
    case 'activityLog': content.innerHTML = viewActivityLogShell(); loadActivityLog(); break;
    case 'users': content.innerHTML = viewUsersShell(); loadUsers(); break;
    case 'settings': content.innerHTML = viewSettings(); bindSettings(); break;
    default: content.innerHTML = '';
  }
}

// ===================================================================
// DASHBOARD
// ===================================================================

function viewDashboard() {
  const total = STATE.requests.length;
  const pending = STATE.requests.filter(r => r.overallStatus === 'Pending').length;
  const approved = STATE.requests.filter(r => r.overallStatus === 'Approved').length;
  const completed = STATE.requests.filter(r => r.overallStatus === 'Completed').length;

  const lowStock = getValidMaterials().filter(m => {
    const available = (m.availableStock !== undefined && m.availableStock !== '')
      ? Number(m.availableStock)
      : (Number(m.currentStock || 0) - Number(m.reservedStock || 0));
    return (m.status || 'Active') === 'Active' && available <= Number(m.reorderLevel || 0);
  });

  return `
    <div class="page-header">
      <div>
        <span class="page-kicker">Overview</span>
        <h1 class="page-title">Dashboard</h1>
        <p class="page-sub">Welcome back, ${escapeHtml(SESSION.fullName || SESSION.userId)}</p>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;">
      ${kpiCard('Total Requests', total, 'total', 'list', 'All')}
      ${kpiCard('Pending', pending, 'pending', 'clock', 'Pending')}
      ${kpiCard('Approved', approved, 'approved', 'grid', 'Approved')}
      ${kpiCard('Completed', completed, 'completed', 'box', 'Completed')}
    </div>
    <div class="card" style="margin-top:20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <h3 style="font-size:14px;">Recent Requests</h3>
        ${total > 5 ? `<button class="btn btn-ghost btn-sm" id="dashViewAllBtn">View all</button>` : ''}
      </div>
      ${renderRequestRows(
        STATE.requests.slice().sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)).slice(0, 5)
      )}
    </div>
    ${lowStock.length ? `
      <div class="card low-stock-card" style="margin-top:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <h3 style="font-size:14px;display:flex;align-items:center;gap:8px;">
            <span class="low-stock-icon">${svgIcon('alertTriangle')}</span> Low Stock${lowStock.length > 5 ? ` (${lowStock.length})` : ''}
          </h3>
          <button class="btn btn-ghost btn-sm" id="dashLowStockBtn">View materials</button>
        </div>
        <table class="data-table">
          <thead><tr><th>ID</th><th>Name</th><th>Available</th><th>Reorder Level</th></tr></thead>
          <tbody>
            ${lowStock.slice(0, 5).map(m => `
              <tr>
                <td class="mono" data-label="ID">${escapeHtml(m.materialId)}</td>
                <td data-label="Name">${escapeHtml(m.materialName)}</td>
                <td data-label="Available"><span class="low-stock-value">${escapeHtml(m.availableStock ?? (Number(m.currentStock || 0) - Number(m.reservedStock || 0)))} ${escapeHtml(m.unit || '')}</span></td>
                <td data-label="Reorder Level">${escapeHtml(m.reorderLevel ?? 0)} ${escapeHtml(m.unit || '')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}
  `;
}

function bindDashboard() {
  bindRequestRowClicks(document.getElementById('content'));
  const viewAllBtn = document.getElementById('dashViewAllBtn');
  if (viewAllBtn) viewAllBtn.addEventListener('click', () => goToView('requests'));
  const lowStockBtn = document.getElementById('dashLowStockBtn');
  if (lowStockBtn) lowStockBtn.addEventListener('click', () => goToView('materials'));
  document.querySelectorAll('.kpi-clickable').forEach(card => {
    const go = () => {
      const status = card.dataset.filterStatus;
      goToView('requests', { statusFilter: status && status !== 'All' ? status : null });
    };
    card.addEventListener('click', go);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
}

function kpiCard(label, value, type, icon, filterStatus) {
  return `
    <div class="card kpi-card kpi-${type}${filterStatus ? ' kpi-clickable' : ''}" ${filterStatus ? `data-filter-status="${escapeHtml(filterStatus)}" role="button" tabindex="0"` : ''}>
      <div class="kpi-icon">${svgIcon(icon)}</div>
      <div class="kpi-body">
        <div class="kpi-label">${escapeHtml(label)}</div>
        <div class="kpi-value">${escapeHtml(value)}</div>
      </div>
    </div>
  `;
}

// ===================================================================
// TEAM PERFORMANCE (BTL reviewer KPIs)
// -----------------------------------------------------------------
// Only BTL JB and BTL ETHAN actually approve/reject requests, so only they
// get scored. BTL MANAGER just views this page. For each request:
//   - "response time"  = last BTL-review timeline entry from the reviewer
//                        minus the request's submitted timestamp. This is
//                        how long it took the reviewer to reach a decision
//                        (Approved / Rejected / Need Clarification).
//   - "total turnaround" = only for requests that reached Completed/Released:
//                        final timeline entry minus submitted timestamp.
// If a request has entries from both reviewers, credit goes to whichever of
// them has the LAST timeline entry (i.e. whoever gave the final decision).
// Times include weekends/off-hours (raw elapsed time, not business days).
// ===================================================================

function groupTimelineByRequest() {
  const map = {};
  (STATE.timeline || []).forEach(t => {
    const id = String(t.requestId).trim();
    if (!map[id]) map[id] = [];
    map[id].push(t);
  });
  Object.keys(map).forEach(id => map[id].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)));
  return map;
}

function msBetween(startVal, endVal) {
  const start = new Date(startVal);
  const end = new Date(endVal);
  if (isNaN(start) || isNaN(end)) return null;
  return end - start;
}

function formatDuration(ms) {
  if (ms === null || ms === undefined || isNaN(ms) || ms < 0) return '—';
  const hours = ms / 3600000;
  if (hours < 24) return `${hours.toFixed(1)} hrs`;
  return `${(hours / 24).toFixed(1)} days`;
}

function average(nums) {
  const clean = nums.filter(n => n !== null && n !== undefined && !isNaN(n));
  if (!clean.length) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

const COMPLETED_STATUSES = ['Completed', 'Released'];

/** Builds per-reviewer stats: { userId -> { fullName, requests: [...], handled, completed, rejected, avgResponseMs, avgTotalMs } } */
function computeReviewerPerformance(reviewers) {
  const timelineByRequest = groupTimelineByRequest();
  const reviewerIds = reviewers.map(r => String(r.rssUserId).trim());
  const stats = {};
  reviewers.forEach(r => {
    stats[String(r.rssUserId).trim()] = {
      userId: r.rssUserId, fullName: r.fullName || r.rssUserId,
      requests: [], handled: 0, completed: 0, rejected: 0,
      responseMsList: [], totalMsList: []
    };
  });

  STATE.requests.forEach(request => {
    const requestId = String(request.requestId).trim();
    const entries = timelineByRequest[requestId] || [];
    const btlEntries = entries.filter(e => reviewerIds.indexOf(String(e.actorUserId).trim()) !== -1);
    if (!btlEntries.length) return; // not yet touched by a BTL reviewer

    const decisionEntry = btlEntries[btlEntries.length - 1]; // last BTL action = final decision
    const reviewerId = String(decisionEntry.actorUserId).trim();
    const bucket = stats[reviewerId];
    if (!bucket) return;

    const responseMs = msBetween(request.timestamp, decisionEntry.timestamp);
    const isCompleted = COMPLETED_STATUSES.indexOf(request.overallStatus) !== -1;
    const isRejected = request.overallStatus === 'Rejected';
    let totalMs = null;
    if (isCompleted) {
      const lastEntry = entries[entries.length - 1];
      totalMs = msBetween(request.timestamp, lastEntry ? lastEntry.timestamp : decisionEntry.timestamp);
    }

    bucket.handled += 1;
    if (isCompleted) bucket.completed += 1;
    if (isRejected) bucket.rejected += 1;
    bucket.responseMsList.push(responseMs);
    if (totalMs !== null) bucket.totalMsList.push(totalMs);

    bucket.requests.push({
      requestId: request.requestId,
      storeName: request.storeName,
      requestType: request.requestType,
      overallStatus: request.overallStatus,
      submittedAt: request.timestamp,
      decisionAt: decisionEntry.timestamp,
      responseMs,
      completedAt: isCompleted && entries.length ? entries[entries.length - 1].timestamp : null,
      totalMs
    });
  });

  Object.values(stats).forEach(bucket => {
    bucket.avgResponseMs = average(bucket.responseMsList);
    bucket.avgTotalMs = average(bucket.totalMsList);
    bucket.requests.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  });

  return stats;
}

function viewPerformanceShell() {
  return `
    <div class="page-header">
      <div>
        <span class="page-kicker">Team</span>
        <h1 class="page-title">Team Performance</h1>
        <p class="page-sub">Approval turnaround and workload per BTL reviewer</p>
      </div>
    </div>
    <div id="performanceContent"><p class="empty-state">Loading...</p></div>
  `;
}

async function loadPerformance() {
  const wrap = document.getElementById('performanceContent');
  try {
    const personnel = await Api.getPersonnel();
    const reviewers = personnel.filter(p => BTL_REVIEWER_ROLES.indexOf(p.position) !== -1);
    if (!reviewers.length) {
      wrap.innerHTML = `<p class="empty-state">No BTL reviewers found.</p>`;
      return;
    }
    const stats = computeReviewerPerformance(reviewers);
    wrap.innerHTML = renderPerformanceBody(reviewers, stats);
    bindPerformanceBody();
  } catch (err) {
    wrap.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

function renderPerformanceBody(reviewers, stats) {
  const teamHandled = Object.values(stats).reduce((sum, s) => sum + s.handled, 0);
  const teamCompleted = Object.values(stats).reduce((sum, s) => sum + s.completed, 0);
  const teamAvgResponse = average(Object.values(stats).flatMap(s => s.responseMsList));
  const teamAvgTotal = average(Object.values(stats).flatMap(s => s.totalMsList));

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:20px;">
      ${kpiCard('Requests Handled', teamHandled, 'total', 'list')}
      ${kpiCard('Completed', teamCompleted, 'completed', 'box')}
      ${kpiCard('Avg. Response Time', formatDuration(teamAvgResponse), 'pending', 'clock')}
      ${kpiCard('Avg. Total Turnaround', formatDuration(teamAvgTotal), 'approved', 'trendingUp')}
    </div>
    ${reviewers.map(r => renderReviewerSection(stats[String(r.rssUserId).trim()])).join('')}
  `;
}

function renderReviewerSection(bucket) {
  if (!bucket) return '';
  const completionRate = bucket.handled ? Math.round((bucket.completed / bucket.handled) * 100) : 0;
  const rows = bucket.requests.map(r => `
    <tr class="clickable" data-request-id="${escapeHtml(r.requestId)}">
      <td class="mono" data-label="Request ID">${escapeHtml(r.requestId)}</td>
      <td data-label="Store">${escapeHtml(r.storeName)}</td>
      <td data-label="Submitted">${formatDate(r.submittedAt)}</td>
      <td data-label="Decision">${formatDate(r.decisionAt)}</td>
      <td data-label="Response Time">${formatDuration(r.responseMs)}</td>
      <td data-label="Status">${stampFor(r.overallStatus)}</td>
      <td data-label="Completed">${r.completedAt ? formatDate(r.completedAt) : '—'}</td>
      <td data-label="Total Turnaround">${r.totalMs !== null ? formatDuration(r.totalMs) : '—'}</td>
    </tr>
  `).join('');

  return `
    <div class="card" style="margin-bottom:20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="kpi-icon" style="width:38px;height:38px;">${svgIcon('users')}</div>
          <div>
            <h3 style="font-size:15px;">${escapeHtml(bucket.fullName)}</h3>
            <p class="page-sub" style="margin:0;">${escapeHtml(bucket.userId)}</p>
          </div>
        </div>
        <div style="display:flex;gap:20px;flex-wrap:wrap;">
          <div><div class="kpi-label">Handled</div><div class="kpi-value" style="font-size:20px;">${bucket.handled}</div></div>
          <div><div class="kpi-label">Completed</div><div class="kpi-value" style="font-size:20px;">${bucket.completed} <span style="font-size:12px;color:var(--text-secondary);">(${completionRate}%)</span></div></div>
          <div><div class="kpi-label">Avg. Response</div><div class="kpi-value" style="font-size:20px;">${formatDuration(bucket.avgResponseMs)}</div></div>
          <div><div class="kpi-label">Avg. Turnaround</div><div class="kpi-value" style="font-size:20px;">${formatDuration(bucket.avgTotalMs)}</div></div>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>Request ID</th><th>Store</th><th>Submitted</th><th>Decision</th>
            <th>Response Time</th><th>Status</th><th>Completed</th><th>Total Turnaround</th>
          </tr></thead>
          <tbody>${rows || `<tr><td colspan="8" class="empty-state">No requests handled yet.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;
}

function bindPerformanceBody() {
  bindRequestRowClicks(document.getElementById('performanceContent'));
}

// ===================================================================
// MATERIALS
// ===================================================================

function getValidMaterials() {
  // Defensive filter: the materials source can include blank/empty rows
  // (e.g. formatted-but-empty rows in the backing sheet). Only keep rows
  // that actually have a material ID and name.
  return (STATE.materials || []).filter(m =>
    m && String(m.materialId || '').trim() !== '' && String(m.materialName || '').trim() !== ''
  );
}

let MATERIALS_PAGE = 1;
let MATERIALS_PAGE_SIZE = 10;

function viewMaterials() {
  return `
    <div class="page-header">
      <div><span class="page-kicker">Inventory</span><h1 class="page-title">Materials &amp; Inventory</h1></div>
      ${isAdmin() ? `<button class="btn btn-primary btn-sm" id="matAddBtn">+ Add Material</button>` : ''}
    </div>
    <div class="card table-wrap" id="materialsTableWrap"></div>
  `;
}

function bindMaterials() {
  const addBtn = document.getElementById('matAddBtn');
  if (addBtn) addBtn.addEventListener('click', () => openMaterialModal(null));
  MATERIALS_PAGE = 1;
  renderMaterialsTable();
}

function renderMaterialsTable() {
  const wrap = document.getElementById('materialsTableWrap');
  if (!wrap) return;
  const all = getValidMaterials().filter(m =>
    matchesSearch(m.materialId, m.materialName, m.category, m.status)
  );

  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / MATERIALS_PAGE_SIZE));
  MATERIALS_PAGE = Math.min(MATERIALS_PAGE, totalPages);
  const start = (MATERIALS_PAGE - 1) * MATERIALS_PAGE_SIZE;
  const pageItems = all.slice(start, start + MATERIALS_PAGE_SIZE);
  const rangeLabel = total === 0 ? '0 of 0' : `${start + 1}–${Math.min(start + MATERIALS_PAGE_SIZE, total)} of ${total}`;

  const rows = pageItems.map(m => {
    const available = (m.availableStock !== undefined && m.availableStock !== '')
      ? m.availableStock
      : (Number(m.currentStock || 0) - Number(m.reservedStock || 0));
    return `
      <tr>
        <td class="mono" data-label="ID">${escapeHtml(m.materialId)}</td>
        <td data-label="Name">${escapeHtml(m.materialName)}</td>
        <td data-label="Category">${escapeHtml(m.category)}</td>
        <td data-label="Current">${escapeHtml(m.currentStock)} ${escapeHtml(m.unit)}</td>
        <td data-label="Reserved">${escapeHtml(m.reservedStock)} ${escapeHtml(m.unit)}</td>
        <td data-label="Available">${escapeHtml(available)} ${escapeHtml(m.unit)}</td>
        <td data-label="Status"><span class="stamp ${(m.status || 'Active') === 'Active' ? 'stamp-active' : 'stamp-inactive'}">${escapeHtml(m.status || 'Active')}</span></td>
        ${isAdmin() ? `<td><button class="btn btn-ghost btn-sm mat-edit-btn" data-id="${escapeHtml(m.materialId)}">${svgIcon('edit')} Edit</button></td>` : ''}
      </tr>
    `;
  }).join('');

  wrap.innerHTML = `
    ${total ? `
      <div class="table-toolbar">
        <div class="table-toolbar-left">
          <span class="field-label">Show</span>
          <select id="materialsPageSize" class="page-size-select">
            ${[10, 25, 50, 100].map(n => `<option value="${n}" ${n === MATERIALS_PAGE_SIZE ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
        </div>
        <div class="table-toolbar-right">
          <span class="page-range">${rangeLabel}</span>
          <button class="btn btn-ghost btn-sm icon-btn" id="materialsPrevBtn" aria-label="Previous page" ${MATERIALS_PAGE <= 1 ? 'disabled' : ''}>${svgIcon('chevronLeft')}</button>
          <span class="page-indicator">Page ${MATERIALS_PAGE} of ${totalPages}</span>
          <button class="btn btn-ghost btn-sm icon-btn" id="materialsNextBtn" aria-label="Next page" ${MATERIALS_PAGE >= totalPages ? 'disabled' : ''}>${svgIcon('chevronRight')}</button>
        </div>
      </div>
    ` : ''}
    <table class="data-table">
      <thead><tr>
        <th>ID</th><th>Name</th><th>Category</th><th>Current</th><th>Reserved</th><th>Available</th><th>Status</th>${isAdmin() ? '<th></th>' : ''}
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="8" class="empty-state"><div class="empty-state-icon">${svgIcon('inbox')}</div>${GLOBAL_SEARCH ? 'No materials match your search.' : 'No materials yet.'}</td></tr>`}</tbody>
    </table>
  `;

  document.querySelectorAll('.mat-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openMaterialModal(findMaterial(btn.dataset.id)));
  });
  if (!total) return;
  document.getElementById('materialsPageSize').addEventListener('change', (e) => {
    MATERIALS_PAGE_SIZE = Number(e.target.value);
    MATERIALS_PAGE = 1;
    renderMaterialsTable();
  });
  document.getElementById('materialsPrevBtn').addEventListener('click', () => {
    if (MATERIALS_PAGE > 1) { MATERIALS_PAGE -= 1; renderMaterialsTable(); }
  });
  document.getElementById('materialsNextBtn').addEventListener('click', () => {
    if (MATERIALS_PAGE < totalPages) { MATERIALS_PAGE += 1; renderMaterialsTable(); }
  });
}

function openMaterialModal(material) {
  const isEdit = !!material;
  openModal(isEdit ? 'Edit Material' : 'Add Material', `
    <div class="form-grid">
      <div class="field"><span class="field-label">Category</span><input id="matCategory" value="${escapeHtml(material?.category || '')}"></div>
      <div class="field"><span class="field-label">Material Name</span><input id="matName" value="${escapeHtml(material?.materialName || '')}"></div>
      <div class="field"><span class="field-label">Unit</span><input id="matUnit" value="${escapeHtml(material?.unit || '')}" placeholder="pcs, box, roll..."></div>
      <div class="field"><span class="field-label">Current Stock</span><input id="matStock" type="number" min="0" value="${escapeHtml(material?.currentStock ?? 0)}"></div>
      <div class="field"><span class="field-label">Reorder Level</span><input id="matReorder" type="number" min="0" value="${escapeHtml(material?.reorderLevel ?? 0)}"></div>
      <div class="field">
        <span class="field-label">Status</span>
        <select id="matStatus">
          <option value="Active" ${material?.status === 'Active' || !material ? 'selected' : ''}>Active</option>
          <option value="Inactive" ${material?.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </div>
    </div>
    ${isEdit && Number(material.reservedStock || 0) > 0 ? `<p class="form-note">${escapeHtml(material.reservedStock)} ${escapeHtml(material.unit || '')} currently reserved on pending requests — Current Stock can't be set below that.</p>` : ''}
    <p class="login-error" id="matModalError"></p>
    <div class="form-actions">
      <button class="btn btn-primary" id="matSaveBtn">${isEdit ? 'Save Changes' : 'Add Material'}</button>
      <button class="btn btn-ghost" id="matCancelBtn">Cancel</button>
    </div>
  `);

  document.getElementById('matCancelBtn').addEventListener('click', closeModal);
  document.getElementById('matSaveBtn').addEventListener('click', async () => {
    const errorEl = document.getElementById('matModalError');
    const payload = {
      materialId: material ? material.materialId : '',
      category: document.getElementById('matCategory').value.trim(),
      materialName: document.getElementById('matName').value.trim(),
      unit: document.getElementById('matUnit').value.trim(),
      currentStock: Math.max(0, Number(document.getElementById('matStock').value || 0)),
      reorderLevel: Math.max(0, Number(document.getElementById('matReorder').value || 0)),
      status: document.getElementById('matStatus').value,
      actorUserId: SESSION.userId
    };
    if (!payload.materialName || !payload.unit) {
      errorEl.textContent = 'Material name and unit are required.';
      return;
    }
    const reserved = isEdit ? Number(material.reservedStock || 0) : 0;
    if (payload.currentStock < reserved) {
      errorEl.textContent = `Current Stock can't be less than the ${reserved} ${material.unit || ''} already reserved on pending requests.`;
      return;
    }
    try {
      await Api.upsertMaterial(payload);
      closeModal();
      toast('Material saved.', 'success');
      refreshBootstrap(`${CONFIG.STORAGE_KEYS.BOOTSTRAP_CACHE}_${SESSION.userId}`);
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

// ===================================================================
// REQUESTS LIST + DETAIL
// ===================================================================

let REQUESTS_PAGE = 1;
let REQUESTS_PAGE_SIZE = 10;
let PENDING_REQUESTS_FILTER = null;

function viewRequests() {
  return `
    <div class="page-header">
      <div><span class="page-kicker">Track &amp; Review</span><h1 class="page-title">Requests</h1></div>
    </div>
    <div class="card table-wrap" id="requestsTableWrap"></div>
  `;
}

function bindRequests() {
  REQUESTS_PAGE = 1;
  renderRequestsPage();
}

function renderRequestsPage() {
  const wrap = document.getElementById('requestsTableWrap');
  if (!wrap) return;
  const all = STATE.requests.slice().reverse()
    .filter(r => !PENDING_REQUESTS_FILTER || r.overallStatus === PENDING_REQUESTS_FILTER)
    .filter(r => matchesSearch(r.requestId, r.storeName, r.requestType, r.overallStatus));

  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / REQUESTS_PAGE_SIZE));
  REQUESTS_PAGE = Math.min(REQUESTS_PAGE, totalPages);
  const start = (REQUESTS_PAGE - 1) * REQUESTS_PAGE_SIZE;
  const pageItems = all.slice(start, start + REQUESTS_PAGE_SIZE);
  const rangeLabel = total === 0 ? '0 of 0' : `${start + 1}–${Math.min(start + REQUESTS_PAGE_SIZE, total)} of ${total}`;

  wrap.innerHTML = `
    ${PENDING_REQUESTS_FILTER ? `
      <div class="filter-chip-row">
        <span class="filter-chip">
          Status: ${escapeHtml(PENDING_REQUESTS_FILTER)}
          <button type="button" id="clearStatusFilterBtn" aria-label="Clear filter">${svgIcon('close')}</button>
        </span>
      </div>
    ` : ''}
    ${total ? `
      <div class="table-toolbar">
        <div class="table-toolbar-left">
          <span class="field-label">Show</span>
          <select id="requestsPageSize" class="page-size-select">
            ${[10, 25, 50, 100].map(n => `<option value="${n}" ${n === REQUESTS_PAGE_SIZE ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
        </div>
        <div class="table-toolbar-right">
          <span class="page-range">${rangeLabel}</span>
          <button class="btn btn-ghost btn-sm icon-btn" id="requestsPrevBtn" aria-label="Previous page" ${REQUESTS_PAGE <= 1 ? 'disabled' : ''}>${svgIcon('chevronLeft')}</button>
          <span class="page-indicator">Page ${REQUESTS_PAGE} of ${totalPages}</span>
          <button class="btn btn-ghost btn-sm icon-btn" id="requestsNextBtn" aria-label="Next page" ${REQUESTS_PAGE >= totalPages ? 'disabled' : ''}>${svgIcon('chevronRight')}</button>
        </div>
      </div>
    ` : ''}
    ${renderRequestRows(pageItems)}
  `;

  bindRequestRowClicks(wrap);
  const clearBtn = document.getElementById('clearStatusFilterBtn');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    PENDING_REQUESTS_FILTER = null;
    REQUESTS_PAGE = 1;
    renderRequestsPage();
  });
  if (!total) return;
  document.getElementById('requestsPageSize').addEventListener('change', (e) => {
    REQUESTS_PAGE_SIZE = Number(e.target.value);
    REQUESTS_PAGE = 1;
    renderRequestsPage();
  });
  document.getElementById('requestsPrevBtn').addEventListener('click', () => {
    if (REQUESTS_PAGE > 1) { REQUESTS_PAGE -= 1; renderRequestsPage(); }
  });
  document.getElementById('requestsNextBtn').addEventListener('click', () => {
    if (REQUESTS_PAGE < totalPages) { REQUESTS_PAGE += 1; renderRequestsPage(); }
  });
}

function renderRequestRows(requests) {
  if (!requests.length) {
    const msg = GLOBAL_SEARCH || PENDING_REQUESTS_FILTER ? 'No requests match your filters.' : 'No requests yet.';
    return `<div class="empty-state"><div class="empty-state-icon">${svgIcon('inbox')}</div>${msg}</div>`;
  }
  return `
    <table class="data-table">
      <thead><tr>
        <th>Request ID</th><th>Store</th><th>Type</th><th>Status</th><th>Submitted</th>
      </tr></thead>
      <tbody>
        ${requests.map(r => `
          <tr class="clickable" data-request-id="${escapeHtml(r.requestId)}">
            <td class="mono" data-label="Request ID">${escapeHtml(r.requestId)}</td>
            <td data-label="Store">${escapeHtml(r.storeName)}</td>
            <td data-label="Type">${escapeHtml(r.requestType)}</td>
            <td data-label="Status">${stampFor(r.overallStatus)}</td>
            <td data-label="Submitted">${formatDate(r.timestamp)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function bindRequestRowClicks(scope) {
  scope.querySelectorAll('tr[data-request-id]').forEach(row => {
    row.addEventListener('click', () => openRequestDetail(row.dataset.requestId));
  });
}

async function openRequestDetail(requestId) {
  openModal(requestId, `<p class="empty-state">Loading...</p>`);
  try {
    const detail = await Api.getRequestDetail(requestId);
    renderRequestDetailModal(detail);
  } catch (err) {
    document.getElementById('modalBody').innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

function renderRequestDetailModal(detail) {
  const { request, items, timeline } = detail;
  if (!request) {
    document.getElementById('modalBody').innerHTML = `<p class="empty-state">Request not found.</p>`;
    return;
  }
  document.getElementById('modalTitle').textContent = request.requestId;

  const itemRows = items.map(item => {
    const material = findMaterial(item.materialId);
    const name = material ? material.materialName : item.materialId;
    const canAct = canReviewRequests() && item.itemStatus === 'Pending' && request.currentStage === 'BTL Review';
    return `
      <tr data-item-id="${escapeHtml(item.itemId)}">
        <td data-label="Material">${escapeHtml(name)}</td>
        <td data-label="Qty Req.">${escapeHtml(item.qtyRequested)}</td>
        <td data-label="Qty Appr.">${item.qtyApproved !== '' && item.qtyApproved !== undefined ? escapeHtml(item.qtyApproved) : '—'}</td>
        <td data-label="Status">${stampFor(item.itemStatus)}</td>
        <td data-label="Remarks">${escapeHtml(item.btlRemarks || '—')}</td>
        <td data-label="Action">
          ${canAct ? `
            <div class="action-btns">
              <input type="number" class="item-qty-input" placeholder="Approved qty" value="${escapeHtml(item.qtyRequested)}" title="Only used when approving">
              <input type="text" class="item-remarks-input" placeholder="Remarks (required for reject/clarify)">
              <button class="btn btn-primary btn-sm item-approve-btn">Approve</button>
              <button class="btn btn-danger btn-sm item-reject-btn">Reject</button>
              <button class="btn btn-secondary btn-sm item-clarify-btn">Clarify</button>
            </div>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');

  const timelineHtml = timeline.slice().reverse().map(t => `
    <div class="timeline-item">
      <div class="timeline-dot"></div>
      <div>
        <div class="timeline-content"><strong>${escapeHtml(t.action)}</strong> — ${escapeHtml(t.remarks || '')}</div>
        <div class="timeline-meta">${escapeHtml(t.actorUserId)} · ${escapeHtml(t.stage)} · ${formatDate(t.timestamp)}</div>
      </div>
    </div>
  `).join('');

  const allReviewed = items.every(i => i.itemStatus !== 'Pending');
  const showFinalize = canReviewRequests() && request.currentStage === 'BTL Review' && allReviewed && items.length > 0;
  const showRelease = canReleaseRequests() && request.overallStatus === 'Approved';
  const showTransmittal = (canReviewRequests() || canReleaseRequests()) && request.overallStatus === 'Approved';

  document.getElementById('modalBody').innerHTML = `
    <div class="form-grid">
      <div class="field"><span class="field-label">Store</span><input disabled value="${escapeHtml(request.storeName)}"></div>
      <div class="field"><span class="field-label">Region</span><input disabled value="${escapeHtml(request.region)}"></div>
      <div class="field"><span class="field-label">Requested By</span><input disabled value="${escapeHtml(request.requestorUserId)}"></div>
      <div class="field"><span class="field-label">Type</span><input disabled value="${escapeHtml(request.requestType)}"></div>
      <div class="field span-2"><span class="field-label">Purpose</span><input disabled value="${escapeHtml(request.purpose)}"></div>
      <div class="field span-2"><span class="field-label">Reason</span><input disabled value="${escapeHtml(request.reason)}"></div>
      <div class="field"><span class="field-label">Status</span><div style="padding-top:6px;">${stampFor(request.overallStatus)}</div></div>
      <div class="field"><span class="field-label">Stage</span><input disabled value="${escapeHtml(request.currentStage)}"></div>
    </div>

    <div class="section-title">Line Items</div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Material</th><th>Qty Req.</th><th>Qty Appr.</th><th>Status</th><th>Remarks</th><th></th></tr></thead>
        <tbody>${itemRows || `<tr><td colspan="6" class="empty-state">No items.</td></tr>`}</tbody>
      </table>
    </div>

    ${showTransmittal ? `
      <div class="form-actions" style="margin-top:14px;">
        <button type="button" class="btn btn-secondary" id="printTransmittalBtn">${svgIcon('printer')} Print Transmittal</button>
      </div>
    ` : ''}

    ${showFinalize ? `
      <div class="section-title">Finalize Review</div>
      <div class="field-row">
        <div class="field">
          <span class="field-label">Overall Decision</span>
          <select id="finalizeStatus">
            <option value="Approved">Approved</option>
            <option value="Need Clarification">Need Clarification</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
        <button class="btn btn-primary" id="finalizeBtn">Finalize</button>
      </div>
    ` : ''}

    ${showRelease ? `
      <div class="section-title">Release to Requestor</div>
      <div class="field-row">
        <div class="field"><span class="field-label">Tracking Info (courier, plate no, etc.)</span><input id="trackingInfo" placeholder="Optional"></div>
        <button class="btn btn-primary" id="releaseBtn">Mark Released</button>
      </div>
    ` : ''}

    <div class="section-title">Timeline</div>
    <div class="timeline">${timelineHtml || '<p class="empty-state">No activity yet.</p>'}</div>
  `;

  bindRequestDetailActions(request.requestId, request, items);
}

function bindRequestDetailActions(requestId, request, items) {
  const printBtn = document.getElementById('printTransmittalBtn');
  if (printBtn) printBtn.addEventListener('click', () => printTransmittal(request, items));

  document.querySelectorAll('.item-approve-btn, .item-reject-btn, .item-clarify-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const row = e.target.closest('tr');
      const itemId = row.dataset.itemId;
      const qtyInput = row.querySelector('.item-qty-input');
      const remarksInput = row.querySelector('.item-remarks-input');
      const decision = btn.classList.contains('item-approve-btn') ? 'Approved'
        : btn.classList.contains('item-reject-btn') ? 'Rejected' : 'Need Clarification';
      const remarks = remarksInput ? remarksInput.value.trim() : '';

      if (decision !== 'Approved' && !remarks) {
        toast('Add a remark before rejecting or requesting clarification.', 'error');
        if (remarksInput) remarksInput.focus();
        return;
      }

      row.querySelectorAll('.action-btns button').forEach(b => b.disabled = true);
      try {
        await Api.reviewRequestItem({
          itemId,
          decision,
          // qty only matters on approval — sending it on reject/clarify risked the
          // leftover approved-qty box value being recorded against a rejected item.
          qtyApproved: decision === 'Approved' && qtyInput ? qtyInput.value : '',
          remarks,
          actorUserId: SESSION.userId
        });
        toast('Item updated.', 'success');
        openRequestDetail(requestId);
      } catch (err) {
        toast(err.message, 'error');
        row.querySelectorAll('.action-btns button').forEach(b => b.disabled = false);
      }
    });
  });

  const finalizeBtn = document.getElementById('finalizeBtn');
  if (finalizeBtn) {
    finalizeBtn.addEventListener('click', async () => {
      const overallStatus = document.getElementById('finalizeStatus').value;
      finalizeBtn.disabled = true;
      try {
        await Api.finalizeRequestReview({ requestId, overallStatus, remarks: '', actorUserId: SESSION.userId });
        toast('Request finalized.', 'success');
        closeModal();
        refreshBootstrap(`${CONFIG.STORAGE_KEYS.BOOTSTRAP_CACHE}_${SESSION.userId}`);
      } catch (err) {
        toast(err.message, 'error');
        finalizeBtn.disabled = false;
      }
    });
  }

  const releaseBtn = document.getElementById('releaseBtn');
  if (releaseBtn) {
    releaseBtn.addEventListener('click', async () => {
      const trackingInfo = document.getElementById('trackingInfo').value.trim();
      releaseBtn.disabled = true;
      try {
        await Api.releaseRequest({ requestId, trackingInfo, actorUserId: SESSION.userId });
        toast('Request released.', 'success');
        closeModal();
        refreshBootstrap(`${CONFIG.STORAGE_KEYS.BOOTSTRAP_CACHE}_${SESSION.userId}`);
      } catch (err) {
        toast(err.message, 'error');
        releaseBtn.disabled = false;
      }
    });
  }
}

/** Builds and opens a print-ready Transmittal Form for a request. Address and
 *  contact number are intentionally left blank (filled in by hand on print) —
 *  we don't have a reliable per-shop address, and pre-filling a contact number
 *  was showing the same value on every printout. Layout is an original,
 *  cleaner design (Poppins, soft cards, teal accent) rather than a copy of the
 *  spreadsheet template — same information, presented better. */
function printTransmittal(request, items) {
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  const total = items.reduce((sum, i) => {
    const qty = i.qtyApproved !== '' && i.qtyApproved !== undefined ? Number(i.qtyApproved) : Number(i.qtyRequested);
    return sum + (isNaN(qty) ? 0 : qty);
  }, 0);

  const rows = items.map(item => {
    const material = findMaterial(item.materialId);
    const name = material ? material.materialName : item.materialId;
    const unit = material ? material.unit : '';
    const qty = item.qtyApproved !== '' && item.qtyApproved !== undefined ? item.qtyApproved : item.qtyRequested;
    return `<tr><td class="tf-material">${escapeHtml(name)}${unit ? `<span class="tf-unit">${escapeHtml(unit)}</span>` : ''}</td><td class="tf-qty">${escapeHtml(qty)}</td><td class="tf-remarks"></td></tr>`;
  }).join('');
  // Pad with a few blank ruled rows so items added by hand at delivery have room.
  const blankRows = Array.from({ length: 4 }, () => `<tr class="tf-blank"><td>&nbsp;</td><td></td><td></td></tr>`).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Transmittal Form — ${escapeHtml(request.requestId)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  body {
    font-family: 'Poppins', Arial, sans-serif;
    color: #1C2528;
    padding: 40px 48px;
    max-width: 820px;
    margin: 0 auto;
  }
  .tf-top {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 28px;
  }
  .tf-mark { font-size: 13px; font-weight: 600; letter-spacing: 0.06em; color: #17847A; text-transform: uppercase; }
  .tf-title { font-size: 24px; font-weight: 700; margin-top: 2px; letter-spacing: 0.01em; }
  .tf-dispatch {
    text-align: right; font-size: 12px; color: #6B7A7C;
  }
  .tf-dispatch .tf-dispatch-id {
    font-size: 15px; font-weight: 700; color: #1C2528; font-family: 'Poppins', monospace;
  }
  .tf-divider { border: none; border-top: 2px solid #17847A; margin-bottom: 26px; }

  .tf-info {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 18px 28px;
    margin-bottom: 28px;
    padding: 18px 20px;
    background: #F4F6F5;
    border-radius: 12px;
  }
  .tf-info-item { min-width: 0; }
  .tf-info-label {
    font-size: 10.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
    color: #8B9695; margin-bottom: 3px;
  }
  .tf-info-value { font-size: 14px; font-weight: 500; color: #1C2528; }
  .tf-info-value.tf-blank-line { border-bottom: 1px solid #C3CDCA; min-height: 18px; }
  .tf-info-value.tf-accent { color: #17847A; font-weight: 600; }

  .tf-section-label {
    font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
    color: #6B7A7C; margin-bottom: 10px;
  }

  table.tf-table {
    width: 100%; border-collapse: collapse; margin-bottom: 26px;
    border: 1px solid #DCE3E1; border-radius: 12px; overflow: hidden;
  }
  table.tf-table thead th {
    background: #17847A; color: #fff;
    font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
    padding: 11px 14px; text-align: left;
  }
  table.tf-table thead th.tf-qty-head { text-align: center; width: 110px; }
  table.tf-table thead th.tf-remarks-head { width: 160px; }
  table.tf-table td { padding: 10px 14px; font-size: 13.5px; border-top: 1px solid #EDF1F0; }
  table.tf-table tbody tr:nth-child(even):not(.tf-blank) { background: #FAFBFB; }
  .tf-material { font-weight: 500; }
  .tf-unit { color: #8B9695; font-size: 11.5px; margin-left: 6px; }
  .tf-qty { text-align: center; font-weight: 700; color: #17847A; }
  .tf-remarks { color: #8B9695; }
  .tf-blank td { height: 26px; }
  .tf-total-row td { border-top: 2px solid #17847A; font-weight: 700; }
  .tf-total-row .tf-qty { font-size: 15px; }

  .tf-notes {
    font-size: 12px; color: #556063; margin-bottom: 30px;
    padding: 14px 18px; background: #F4F6F5; border-radius: 10px;
  }
  .tf-notes-title { font-weight: 600; color: #1C2528; margin-bottom: 6px; font-size: 12.5px; }
  .tf-notes ul { margin: 0; padding-left: 18px; }
  .tf-notes li { margin-bottom: 3px; }

  .tf-sign-row { display: flex; gap: 40px; margin-top: 10px; }
  .tf-sign-col { flex: 1; }
  .tf-sign-line { border-bottom: 1px solid #1C2528; height: 40px; }
  .tf-sign-caption { font-size: 11px; color: #8B9695; margin-top: 6px; letter-spacing: 0.02em; }

  .tf-print-btn {
    display: inline-block; margin-bottom: 20px; padding: 10px 18px;
    background: #17847A; color: #fff; border: none; border-radius: 8px;
    font-family: 'Poppins', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer;
  }
  @media print {
    body { padding: 16px 28px; }
    .tf-print-btn { display: none; }
  }
</style>
</head><body>
  <button class="tf-print-btn" onclick="window.print()">Print</button>
  <div class="tf-top">
    <div>
      <div class="tf-mark">Material Request Transmittal</div>
      <div class="tf-title">Transmittal Form</div>
    </div>
    <div class="tf-dispatch">
      Dispatch No.
      <div class="tf-dispatch-id">${escapeHtml(request.requestId)}</div>
    </div>
  </div>
  <hr class="tf-divider">

  <div class="tf-info">
    <div class="tf-info-item">
      <div class="tf-info-label">To</div>
      <div class="tf-info-value">${escapeHtml(request.storeName)}</div>
    </div>
    <div class="tf-info-item">
      <div class="tf-info-label">Address</div>
      <div class="tf-info-value tf-blank-line">&nbsp;</div>
    </div>
    <div class="tf-info-item">
      <div class="tf-info-label">Dated</div>
      <div class="tf-info-value tf-accent">${dateStr}</div>
    </div>
    <div class="tf-info-item">
      <div class="tf-info-label">Contact Person</div>
      <div class="tf-info-value">${escapeHtml(request.rssName || '')}</div>
    </div>
    <div class="tf-info-item">
      <div class="tf-info-label">Contact No.</div>
      <div class="tf-info-value tf-blank-line">&nbsp;</div>
    </div>
    <div class="tf-info-item">
      <div class="tf-info-label">Category</div>
      <div class="tf-info-value tf-accent">${escapeHtml(request.requestType || '')}</div>
    </div>
  </div>

  <div class="tf-section-label">Materials for Delivery</div>
  <table class="tf-table">
    <thead>
      <tr><th>Material</th><th class="tf-qty-head">Quantity</th><th class="tf-remarks-head">Remarks</th></tr>
    </thead>
    <tbody>
      ${rows}
      ${blankRows}
      <tr class="tf-total-row"><td>Total</td><td class="tf-qty">${total}</td><td></td></tr>
    </tbody>
  </table>

  <div class="tf-notes">
    <div class="tf-notes-title">Notes</div>
    <ul>
      <li>All items inspected at time of receipt.</li>
      <li>Sign the Waybill and Transmittal Form.</li>
      <li>If there are missing or damaged items, report to the BTL Team within 24 hours (late reports will not be accepted).</li>
      <li>Upload this Transmittal to DCR for Receiving Records.</li>
    </ul>
  </div>

  <div class="tf-sign-row">
    <div class="tf-sign-col">
      <div class="tf-sign-line"></div>
      <div class="tf-sign-caption">PREPARED BY — NAME &amp; SIGNATURE</div>
    </div>
    <div class="tf-sign-col">
      <div class="tf-sign-line"></div>
      <div class="tf-sign-caption">RECEIVED BY — NAME &amp; SIGNATURE</div>
    </div>
    <div class="tf-sign-col">
      <div class="tf-sign-line"></div>
      <div class="tf-sign-caption">DATE</div>
    </div>
  </div>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) { toast('Please allow pop-ups to print the transmittal.', 'error'); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// ===================================================================
// NEW REQUEST FORM
// ===================================================================

function viewNewRequestForm() {
  return `
    <div class="page-header"><div><span class="page-kicker">Submit</span><h1 class="page-title">New Request</h1></div></div>
    <div class="card">
      <div class="section-title">Shop Details</div>
      <div class="form-grid">
        <div class="field">
          <span class="field-label">Shop ID</span>
          <input id="nrShopId" placeholder="e.g. PH003980" autocomplete="off">
          <span class="field-hint" id="nrShopIdStatus"></span>
        </div>
        <div class="field"><span class="field-label">Store Name</span><input id="nrStoreName" disabled></div>
        <div class="field"><span class="field-label">Region</span><input id="nrRegion" disabled></div>
        <div class="field"><span class="field-label">Responsible RSS</span><input id="nrRssName" disabled></div>
        <div class="field"><span class="field-label">Contact Number</span><input id="nrContact" placeholder="09xxxxxxxxx"></div>
        <div class="field">
          <span class="field-label">Request Type</span>
          <select id="nrType">${REQUEST_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}</select>
        </div>
        <div class="field span-2"><span class="field-label">Purpose</span><textarea id="nrPurpose" placeholder="What is this request for?"></textarea></div>
        <div class="field span-2"><span class="field-label">Reason</span><textarea id="nrReason" placeholder="Why is it needed?"></textarea></div>
        <div class="field span-2"><span class="field-label">Photo Links (optional, comma-separated URLs)</span><input id="nrPhotoLinks" placeholder="https://..."></div>
      </div>

      <div class="section-title">Materials Requested</div>
      <div class="item-row-header"><span>Material</span><span>Qty</span><span></span></div>
      <div id="nrItemsContainer"></div>
      <button type="button" class="btn btn-secondary btn-sm" id="nrAddItemBtn">+ Add material</button>

      <p class="login-error" id="nrError"></p>
      <div class="form-actions">
        <button type="button" class="btn btn-primary" id="nrSubmitBtn">Submit Request</button>
      </div>
    </div>
  `;
}

function bindNewRequestForm() {
  itemRowSeq = 0;
  const container = document.getElementById('nrItemsContainer');
  addNewRequestItemRow(container);

  document.getElementById('nrAddItemBtn').addEventListener('click', () => addNewRequestItemRow(container));

  const shopIdInput = document.getElementById('nrShopId');
  const statusEl = document.getElementById('nrShopIdStatus');

  async function runShopLookup() {
    const shopId = shopIdInput.value.trim();
    const errorEl = document.getElementById('nrError');
    errorEl.textContent = '';
    if (!shopId) { statusEl.textContent = ''; return; }
    statusEl.textContent = 'Looking up…';
    statusEl.className = 'field-hint';
    try {
      const shop = await Api.lookupShop(shopId);
      document.getElementById('nrStoreName').value = shop.storeName || '';
      document.getElementById('nrRegion').value = shop.region || '';
      document.getElementById('nrRssName').value = shop.rssName || '';
      statusEl.textContent = 'Shop found ✓';
      statusEl.className = 'field-hint field-hint-success';
    } catch (err) {
      document.getElementById('nrStoreName').value = '';
      document.getElementById('nrRegion').value = '';
      document.getElementById('nrRssName').value = '';
      statusEl.textContent = err.message;
      statusEl.className = 'field-hint field-hint-error';
    }
  }

  shopIdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runShopLookup();
    }
  });
  shopIdInput.addEventListener('blur', runShopLookup);

  document.getElementById('nrSubmitBtn').addEventListener('click', submitNewRequest);
}

function addNewRequestItemRow(container) {
  const rowId = `nrItem${itemRowSeq++}`;
  const row = document.createElement('div');
  row.className = 'item-row';
  row.id = rowId;
  const categories = Array.from(new Set(
    getValidMaterials()
      .filter(m => (m.status || 'Active') === 'Active')
      .map(m => (m.category && String(m.category).trim()) || 'Uncategorized')
  )).sort();
  row.innerHTML = `
    <div class="material-combo">
      <div class="material-combo-fields">
        <select class="nr-item-category-filter" title="Filter by category">
          <option value="">All categories</option>
          ${categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
        </select>
        <input type="text" class="nr-item-material-search" placeholder="Search material…" autocomplete="off">
      </div>
      <input type="hidden" class="nr-item-material-value">
      <div class="material-combo-panel hidden"></div>
    </div>
    <input type="number" class="nr-item-qty" placeholder="Qty" min="1">
    <button type="button" class="item-row-remove" aria-label="Remove"><svg viewBox="0 0 24 24">TRASHICON</svg></button>
  `.replace('TRASHICON', ICONS.trash);
  row.querySelector('.item-row-remove').addEventListener('click', () => row.remove());
  bindMaterialCombo(row);
  container.appendChild(row);
}

/** Renders the filtered material list inside a combo panel, grouped by category.
 *  Materials sharing an identical name within the same category get their ID
 *  appended so requestors can tell duplicate-named catalog entries apart. */
function renderMaterialComboOptions(panel, materials, activeIndex) {
  const groups = {};
  materials.forEach(m => {
    const cat = (m.category && String(m.category).trim()) || 'Uncategorized';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(m);
  });
  const catNames = Object.keys(groups).sort();
  let flatIndex = 0;
  panel.innerHTML = catNames.map(cat => {
    const nameCounts = {};
    groups[cat].forEach(m => { nameCounts[m.materialName] = (nameCounts[m.materialName] || 0) + 1; });
    return `
    <div class="material-combo-group-label">${escapeHtml(cat)}</div>
    ${groups[cat].map(m => {
      const idx = flatIndex++;
      const isDuplicateName = nameCounts[m.materialName] > 1;
      return `<div class="material-combo-option${idx === activeIndex ? ' active' : ''}" data-id="${escapeHtml(m.materialId)}" data-index="${idx}">
        ${escapeHtml(m.materialName)} <span class="material-combo-unit">(${escapeHtml(m.unit)})</span>${isDuplicateName ? ` <span class="material-combo-id">#${escapeHtml(m.materialId)}</span>` : ''}
      </div>`;
    }).join('')}
  `;
  }).join('') || `<div class="material-combo-empty">No materials found.</div>`;
}

/** Wires up one item row's category filter + search input + dropdown panel: typeahead
 *  filtering across name/category/ID, category grouping, keyboard nav, and click-to-select. */
function bindMaterialCombo(row) {
  const categoryFilter = row.querySelector('.nr-item-category-filter');
  const searchInput = row.querySelector('.nr-item-material-search');
  const hiddenInput = row.querySelector('.nr-item-material-value');
  const panel = row.querySelector('.material-combo-panel');
  let activeIndex = -1;

  function getFilteredMaterials(query) {
    const activeMaterials = getValidMaterials().filter(m => (m.status || 'Active') === 'Active');
    const category = categoryFilter.value;
    const byCategory = category
      ? activeMaterials.filter(m => ((m.category && String(m.category).trim()) || 'Uncategorized') === category)
      : activeMaterials;
    const q = query.trim().toLowerCase();
    if (!q) return byCategory;
    return byCategory.filter(m =>
      String(m.materialName).toLowerCase().includes(q) ||
      String(m.category || '').toLowerCase().includes(q) ||
      String(m.materialId).toLowerCase().includes(q)
    );
  }

  function openPanel() {
    activeIndex = -1;
    renderMaterialComboOptions(panel, getFilteredMaterials(searchInput.value), activeIndex);
    panel.classList.remove('hidden');
  }
  function closePanel() { panel.classList.add('hidden'); }

  function updateActive(options) {
    options.forEach((opt, i) => opt.classList.toggle('active', i === activeIndex));
    if (options[activeIndex]) options[activeIndex].scrollIntoView({ block: 'nearest' });
  }

  function selectOption(optionEl) {
    const materialId = optionEl.dataset.id;
    const material = getValidMaterials().find(m => m.materialId === materialId);
    hiddenInput.value = materialId;
    searchInput.value = material ? `${material.materialName} (${material.unit})` : materialId;
    closePanel();
  }

  categoryFilter.addEventListener('change', () => {
    hiddenInput.value = ''; // switching category invalidates whatever was previously selected
    searchInput.value = '';
    searchInput.focus();
    openPanel();
  });
  searchInput.addEventListener('focus', openPanel);
  searchInput.addEventListener('input', () => {
    hiddenInput.value = ''; // typing invalidates whatever was previously selected
    openPanel();
  });
  searchInput.addEventListener('keydown', (e) => {
    const options = Array.from(panel.querySelectorAll('.material-combo-option'));
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!options.length) return;
      activeIndex = Math.min(activeIndex + 1, options.length - 1);
      updateActive(options);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!options.length) return;
      activeIndex = Math.max(activeIndex - 1, 0);
      updateActive(options);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && options[activeIndex]) selectOption(options[activeIndex]);
      else if (options.length === 1) selectOption(options[0]);
    } else if (e.key === 'Escape') {
      closePanel();
    }
  });
  panel.addEventListener('mousedown', (e) => {
    const opt = e.target.closest('.material-combo-option');
    if (opt) { e.preventDefault(); selectOption(opt); } // preventDefault stops input blur from beating the click
  });
  searchInput.addEventListener('blur', () => {
    setTimeout(() => {
      closePanel();
      if (!hiddenInput.value) searchInput.value = ''; // no valid pick — don't leave stray text behind
    }, 120);
  });
}

async function submitNewRequest() {
  const errorEl = document.getElementById('nrError');
  errorEl.textContent = '';

  const shopId = document.getElementById('nrShopId').value.trim();
  const storeName = document.getElementById('nrStoreName').value.trim();
  const region = document.getElementById('nrRegion').value.trim();
  const rssName = document.getElementById('nrRssName').value.trim();
  const contactNumber = document.getElementById('nrContact').value.trim();
  const requestType = document.getElementById('nrType').value;
  const purpose = document.getElementById('nrPurpose').value.trim();
  const reason = document.getElementById('nrReason').value.trim();
  const photoLinks = document.getElementById('nrPhotoLinks').value.trim();
  const approvalWindowId = '';

  if (!shopId || !storeName) { errorEl.textContent = 'Look up a valid Shop ID first.'; return; }
  if (!purpose || !reason) { errorEl.textContent = 'Purpose and reason are required.'; return; }

  // Merge by materialId instead of pushing every row as-is — picking the same
  // material in two rows should sum into one line item, not create a duplicate.
  const itemsByMaterial = new Map();
  let validRowCount = 0;
  document.querySelectorAll('#nrItemsContainer .item-row').forEach(row => {
    const materialId = row.querySelector('.nr-item-material-value').value;
    const qty = Number(row.querySelector('.nr-item-qty').value || 0);
    if (!materialId || qty <= 0) return;
    validRowCount++;
    itemsByMaterial.set(materialId, (itemsByMaterial.get(materialId) || 0) + qty);
  });
  const items = Array.from(itemsByMaterial, ([materialId, qty]) => ({ materialId, qty }));
  if (!items.length) { errorEl.textContent = 'Add at least one material with a valid quantity.'; return; }
  if (items.length < validRowCount) toast('Duplicate materials were combined into one line item.', 'success');

  const btn = document.getElementById('nrSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting...';
  try {
    const result = await Api.submitRequest({
      shopId, storeName, region, rssName, requestorUserId: SESSION.userId, contactNumber,
      requestType, purpose, reason, photoLinks, approvalWindowId, items
    });
    toast(`Request ${result.requestId} submitted.`, 'success');
    currentView = 'dashboard';
    renderSidebarNav();
    await refreshBootstrap(`${CONFIG.STORAGE_KEYS.BOOTSTRAP_CACHE}_${SESSION.userId}`);
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit Request';
  }
}

// ===================================================================
// ACTIVITY LOG
// ===================================================================

let ACTIVITY_LOG_CACHE = [];
let ACTIVITY_LOG_QUERY = '';
let ACTIVITY_PAGE = 1;
let ACTIVITY_PAGE_SIZE = 25;

function viewActivityLogShell() {
  return `
    <div class="page-header"><div><span class="page-kicker">Audit Trail</span><h1 class="page-title">Activity Logs</h1></div></div>
    <div class="toolbar">
      <div class="toolbar-search">
        <input id="logSearch" placeholder="Filter by user, action, or target...">
      </div>
    </div>
    <div class="card table-wrap" id="logTableWrap"><p class="empty-state">Loading...</p></div>
  `;
}

async function loadActivityLog() {
  const wrap = document.getElementById('logTableWrap');
  ACTIVITY_LOG_QUERY = '';
  ACTIVITY_PAGE = 1;
  try {
    const logs = await Api.getActivityLog(300);
    ACTIVITY_LOG_CACHE = logs.slice().reverse();
    renderActivityLogPage();
    const search = document.getElementById('logSearch');
    if (search) {
      search.addEventListener('input', () => {
        ACTIVITY_LOG_QUERY = search.value.trim().toLowerCase();
        ACTIVITY_PAGE = 1;
        renderActivityLogPage();
      });
    }
  } catch (err) {
    wrap.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

function renderActivityLogPage() {
  const wrap = document.getElementById('logTableWrap');
  if (!wrap) return;

  const all = ACTIVITY_LOG_QUERY
    ? ACTIVITY_LOG_CACHE.filter(l =>
        [l.userId, l.role, l.action, l.targetType, l.targetId, l.details].join(' ').toLowerCase().includes(ACTIVITY_LOG_QUERY)
      )
    : ACTIVITY_LOG_CACHE;

  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE));
  ACTIVITY_PAGE = Math.min(ACTIVITY_PAGE, totalPages);
  const start = (ACTIVITY_PAGE - 1) * ACTIVITY_PAGE_SIZE;
  const pageItems = all.slice(start, start + ACTIVITY_PAGE_SIZE);
  const rangeLabel = total === 0 ? '0 of 0' : `${start + 1}–${Math.min(start + ACTIVITY_PAGE_SIZE, total)} of ${total}`;

  const rows = pageItems.map(l => `
    <tr>
      <td data-label="Time">${formatDate(l.timestamp)}</td>
      <td class="mono" data-label="User">${escapeHtml(l.userId)}</td>
      <td data-label="Role">${escapeHtml(l.role)}</td>
      <td data-label="Action">${escapeHtml(l.action)}</td>
      <td data-label="Target Type">${escapeHtml(l.targetType)}</td>
      <td class="mono" data-label="Target ID">${escapeHtml(l.targetId)}</td>
      <td data-label="Details">${escapeHtml(l.details)}</td>
    </tr>
  `).join('');

  wrap.innerHTML = `
    ${total ? `
      <div class="table-toolbar">
        <div class="table-toolbar-left">
          <span class="field-label">Show</span>
          <select id="logPageSize" class="page-size-select">
            ${[25, 50, 100, 300].map(n => `<option value="${n}" ${n === ACTIVITY_PAGE_SIZE ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
        </div>
        <div class="table-toolbar-right">
          <span class="page-range">${rangeLabel}</span>
          <button class="btn btn-ghost btn-sm icon-btn" id="logPrevBtn" aria-label="Previous page" ${ACTIVITY_PAGE <= 1 ? 'disabled' : ''}>${svgIcon('chevronLeft')}</button>
          <span class="page-indicator">Page ${ACTIVITY_PAGE} of ${totalPages}</span>
          <button class="btn btn-ghost btn-sm icon-btn" id="logNextBtn" aria-label="Next page" ${ACTIVITY_PAGE >= totalPages ? 'disabled' : ''}>${svgIcon('chevronRight')}</button>
        </div>
      </div>
    ` : ''}
    <table class="data-table">
      <thead><tr><th>Time</th><th>User</th><th>Role</th><th>Action</th><th>Target Type</th><th>Target ID</th><th>Details</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7" class="empty-state"><div class="empty-state-icon">${svgIcon('inbox')}</div>No activity found.</td></tr>`}</tbody>
    </table>
  `;

  if (!total) return;
  document.getElementById('logPageSize').addEventListener('change', (e) => {
    ACTIVITY_PAGE_SIZE = Number(e.target.value);
    ACTIVITY_PAGE = 1;
    renderActivityLogPage();
  });
  document.getElementById('logPrevBtn').addEventListener('click', () => {
    if (ACTIVITY_PAGE > 1) { ACTIVITY_PAGE -= 1; renderActivityLogPage(); }
  });
  document.getElementById('logNextBtn').addEventListener('click', () => {
    if (ACTIVITY_PAGE < totalPages) { ACTIVITY_PAGE += 1; renderActivityLogPage(); }
  });
}

// ===================================================================
// USERS (Admin)
// ===================================================================

let USERS_CACHE = [];
let USERS_PAGE = 1;
let USERS_PAGE_SIZE = 10;

function viewUsersShell() {
  return `
    <div class="page-header">
      <div><span class="page-kicker">Team</span><h1 class="page-title">User Management</h1></div>
      <button class="btn btn-primary btn-sm" id="userAddBtn">+ Add User</button>
    </div>
    <div class="card table-wrap" id="usersTableWrap"><p class="empty-state">Loading...</p></div>
  `;
}

async function loadUsers() {
  const wrap = document.getElementById('usersTableWrap');
  document.getElementById('userAddBtn').addEventListener('click', () => openUserModal(null));
  try {
    USERS_CACHE = await Api.getPersonnel();
    USERS_PAGE = 1;
    renderUsersTable();
  } catch (err) {
    wrap.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

function renderUsersTable() {
  const wrap = document.getElementById('usersTableWrap');

  const totalUsers = USERS_CACHE.length;
  const totalPages = Math.max(1, Math.ceil(totalUsers / USERS_PAGE_SIZE));
  USERS_PAGE = Math.min(USERS_PAGE, totalPages);

  const start = (USERS_PAGE - 1) * USERS_PAGE_SIZE;
  const pageItems = USERS_CACHE.slice(start, start + USERS_PAGE_SIZE);

  const rows = pageItems.map(u => `
    <tr>
      <td class="mono" data-label="User ID">${escapeHtml(u.rssUserId)}</td>
      <td data-label="Name">${escapeHtml(u.fullName) || '<span class="empty-state">—</span>'}</td>
      <td data-label="Role">${escapeHtml(u.position)}</td>
      <td data-label="Region">${escapeHtml(u.region)}</td>
      <td data-label="PIN Status"><span class="stamp ${(u.pinStatus || 'Active') === 'Active' ? 'stamp-active' : 'stamp-pending'}">${escapeHtml(u.pinStatus || 'Active')}</span></td>
      <td data-label="Last Login">${formatDate(u.lastLogin)}</td>
      <td>
        <div class="action-btns">
          <button class="btn btn-ghost btn-sm user-edit-btn" data-id="${escapeHtml(u.rssUserId)}">${svgIcon('edit')} Edit</button>
          <button class="btn btn-secondary btn-sm user-reset-btn" data-id="${escapeHtml(u.rssUserId)}">Reset PIN</button>
        </div>
      </td>
    </tr>
  `).join('');

  const rangeLabel = totalUsers === 0 ? '0 of 0'
    : `${start + 1}–${Math.min(start + USERS_PAGE_SIZE, totalUsers)} of ${totalUsers}`;

  wrap.innerHTML = `
    <div class="table-toolbar">
      <div class="table-toolbar-left">
        <span class="field-label">Show</span>
        <select id="usersPageSize" class="page-size-select">
          ${[10, 25, 50, 100].map(n => `<option value="${n}" ${n === USERS_PAGE_SIZE ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </div>
      <div class="table-toolbar-right">
        <span class="page-range">${rangeLabel}</span>
        <button class="btn btn-ghost btn-sm icon-btn" id="usersPrevBtn" aria-label="Previous page" ${USERS_PAGE <= 1 ? 'disabled' : ''}>${svgIcon('chevronLeft')}</button>
        <span class="page-indicator">Page ${USERS_PAGE} of ${totalPages}</span>
        <button class="btn btn-ghost btn-sm icon-btn" id="usersNextBtn" aria-label="Next page" ${USERS_PAGE >= totalPages ? 'disabled' : ''}>${svgIcon('chevronRight')}</button>
      </div>
    </div>
    <table class="data-table">
      <thead><tr><th>User ID</th><th>Name</th><th>Role</th><th>Region</th><th>PIN Status</th><th>Last Login</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7" class="empty-state"><div class="empty-state-icon">${svgIcon('inbox')}</div>No users found.</td></tr>`}</tbody>
    </table>
  `;

  document.getElementById('usersPageSize').addEventListener('change', (e) => {
    USERS_PAGE_SIZE = Number(e.target.value);
    USERS_PAGE = 1;
    renderUsersTable();
  });
  document.getElementById('usersPrevBtn').addEventListener('click', () => {
    if (USERS_PAGE > 1) { USERS_PAGE -= 1; renderUsersTable(); }
  });
  document.getElementById('usersNextBtn').addEventListener('click', () => {
    if (USERS_PAGE < totalPages) { USERS_PAGE += 1; renderUsersTable(); }
  });
  document.querySelectorAll('.user-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openUserModal(USERS_CACHE.find(u => u.rssUserId === btn.dataset.id)));
  });
  document.querySelectorAll('.user-reset-btn').forEach(btn => {
    btn.addEventListener('click', () => openResetPinModal(btn.dataset.id));
  });
}

function openUserModal(user) {
  const isEdit = !!user;
  const roleOptions = Object.values(ROLES);
  openModal(isEdit ? 'Edit User' : 'Add User', `
    <div class="form-grid">
      <div class="field"><span class="field-label">User ID</span><input id="uUserId" value="${escapeHtml(user ? user.rssUserId : '')}" ${isEdit ? 'disabled' : ''}></div>
      <div class="field"><span class="field-label">Full Name</span><input id="uFullName" value="${escapeHtml(user ? user.fullName : '')}"></div>
      <div class="field">
        <span class="field-label">Role</span>
        <select id="uRole">${roleOptions.map(r => `<option value="${r}" ${user && user.position === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
      </div>
      <div class="field"><span class="field-label">Region</span><input id="uRegion" value="${escapeHtml(user ? user.region : '')}"></div>
      <div class="field span-2"><span class="field-label">Contact Number</span><input id="uContact" value="${escapeHtml(user ? user.contactNumber : '')}"></div>
    </div>
    ${!isEdit ? `<p class="form-note">New users log in for the first time using their User ID as the PIN.</p>` : ''}
    <p class="login-error" id="uModalError"></p>
    <div class="form-actions">
      <button class="btn btn-primary" id="uSaveBtn">${isEdit ? 'Save Changes' : 'Add User'}</button>
      <button class="btn btn-ghost" id="uCancelBtn">Cancel</button>
    </div>
  `);

  document.getElementById('uCancelBtn').addEventListener('click', closeModal);
  document.getElementById('uSaveBtn').addEventListener('click', async () => {
    const errorEl = document.getElementById('uModalError');
    const payload = {
      rssUserId: document.getElementById('uUserId').value.trim(),
      fullName: document.getElementById('uFullName').value.trim(),
      position: document.getElementById('uRole').value,
      region: document.getElementById('uRegion').value.trim(),
      contactNumber: document.getElementById('uContact').value.trim(),
      actorUserId: SESSION.userId
    };
    if (!payload.rssUserId || !payload.fullName) {
      errorEl.textContent = 'User ID and full name are required.';
      return;
    }
    if (!isEdit && (USERS_CACHE || []).some(u => String(u.rssUserId).trim().toLowerCase() === payload.rssUserId.toLowerCase())) {
      errorEl.textContent = `User ID "${payload.rssUserId}" is already in use.`;
      return;
    }
    try {
      await Api.upsertPersonnel(payload);
      closeModal();
      toast('User saved.', 'success');
      loadUsers();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

function openResetPinModal(targetUserId) {
  openModal('Reset PIN', `
    <p class="form-note">This resets ${escapeHtml(targetUserId)}'s PIN. They'll use the new PIN on their next login.</p>
    <div class="field"><span class="field-label">New PIN</span><input id="rpNewPin" type="text" placeholder="Leave blank to reset to User ID"></div>
    <p class="login-error" id="rpError"></p>
    <div class="form-actions">
      <button class="btn btn-primary" id="rpSaveBtn">Reset PIN</button>
      <button class="btn btn-ghost" id="rpCancelBtn">Cancel</button>
    </div>
  `);
  document.getElementById('rpCancelBtn').addEventListener('click', closeModal);
  document.getElementById('rpSaveBtn').addEventListener('click', async () => {
    const errorEl = document.getElementById('rpError');
    const typed = document.getElementById('rpNewPin').value.trim();
    const newPin = typed || targetUserId;
    // Only enforce the strength rule when Admin actually typed something — the
    // blank/"reset to User ID" fallback is an intentionally weak, temporary PIN
    // that the person is expected to change (same as a brand-new account).
    if (typed) {
      const validationError = isValidNewPin(typed, targetUserId);
      if (validationError) { errorEl.textContent = validationError; return; }
    }
    try {
      await Api.resetPin(targetUserId, newPin, SESSION.userId);
      closeModal();
      toast('PIN reset.', 'success');
      loadUsers();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

// ===================================================================
// SETTINGS
// ===================================================================

function viewSettings() {
  return `
    <div class="page-header"><div><span class="page-kicker">Preferences</span><h1 class="page-title">Settings</h1></div></div>
    <div class="card" style="margin-bottom:20px;">
      <div class="section-title">Profile</div>
      <div class="form-grid">
        <div class="field"><span class="field-label">User ID</span><input disabled value="${escapeHtml(SESSION.userId)}"></div>
        <div class="field"><span class="field-label">Full Name</span><input disabled value="${escapeHtml(SESSION.fullName || '—')}"></div>
        <div class="field"><span class="field-label">Role</span><input disabled value="${escapeHtml(SESSION.role)}"></div>
        <div class="field"><span class="field-label">Region</span><input disabled value="${escapeHtml(SESSION.region || '—')}"></div>
      </div>
    </div>
    <div class="card">
      <div class="section-title">Change PIN</div>
      <div class="form-grid">
        <div class="field"><span class="field-label">Current PIN</span><input id="stCurrentPin" type="password"></div>
        <div class="field"><span class="field-label">New PIN</span><input id="stNewPin" type="password"></div>
        <div class="field"><span class="field-label">Confirm New PIN</span><input id="stConfirmPin" type="password"></div>
      </div>
      <p class="login-error" id="stError"></p>
      <div class="form-actions"><button class="btn btn-primary" id="stSaveBtn">Update PIN</button></div>
    </div>
  `;
}

function bindSettings() {
  document.getElementById('stSaveBtn').addEventListener('click', async () => {
    const errorEl = document.getElementById('stError');
    errorEl.textContent = '';
    const currentPin = document.getElementById('stCurrentPin').value.trim();
    const newPin = document.getElementById('stNewPin').value.trim();
    const confirmPin = document.getElementById('stConfirmPin').value.trim();

    if (!currentPin || !newPin) { errorEl.textContent = 'Fill in all fields.'; return; }
    if (newPin !== confirmPin) { errorEl.textContent = 'New PIN and confirmation do not match.'; return; }
    const validationError = isValidNewPin(newPin, SESSION.userId);
    if (validationError) { errorEl.textContent = validationError; return; }

    const btn = document.getElementById('stSaveBtn');
    btn.disabled = true;
    try {
      await Api.login(SESSION.userId, currentPin);
      await Api.resetPin(SESSION.userId, newPin, SESSION.userId);
      SESSION.pinStatus = 'Active';
      localStorage.setItem(CONFIG.STORAGE_KEYS.SESSION, JSON.stringify(SESSION));
      toast('PIN updated.', 'success');
      document.getElementById('stCurrentPin').value = '';
      document.getElementById('stNewPin').value = '';
      document.getElementById('stConfirmPin').value = '';
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
}
