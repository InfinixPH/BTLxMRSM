/**
 * BTL x MRMS — APP
 * Handles: login/session, instant load from cache + background refresh,
 * polling-based sync, theme toggle, sidebar nav, notification panel,
 * and view routing. Individual page views (materials table, request form,
 * etc.) get filled in as separate render functions — stubs are marked below.
 */

let SESSION = null;       // { userId, fullName, role, region }
let STATE = {              // in-memory app data, hydrated from cache then network
  materials: [],
  requests: [],
  notifications: [],
  approvalWindows: [],
  lastUpdate: null
};
let currentView = 'dashboard';
let pollTimer = null;

// ===================================================================
// ICONS (inline, keeps this dependency-free)
// ===================================================================
const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  users: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.33 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.33 1.7 1.7 0 00-1 1.55V21a2 2 0 01-4 0v-.09A1.7 1.7 0 009 19.4a1.7 1.7 0 00-1.87.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.7 1.7 0 004.6 15a1.7 1.7 0 00-1.55-1H3a2 2 0 010-4h.09A1.7 1.7 0 004.6 9a1.7 1.7 0 00-.33-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06A1.7 1.7 0 009 4.6a1.7 1.7 0 001-1.55V3a2 2 0 014 0v.09a1.7 1.7 0 001 1.55 1.7 1.7 0 001.87-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.7 1.7 0 0019.4 9a1.7 1.7 0 001.55 1H21a2 2 0 010 4h-.09a1.7 1.7 0 00-1.55 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>'
};

// ===================================================================
// INIT
// ===================================================================

document.addEventListener('DOMContentLoaded', () => {
  applyStoredTheme();
  bindThemeToggles();
  bindLoginForm();
  bindSidebarToggle();
  bindNotifPanel();

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

  renderUserBadge();
  renderSidebarNav();

  // 1. INSTANT LOAD: paint whatever we cached last session immediately.
  const cacheKey = `${CONFIG.STORAGE_KEYS.BOOTSTRAP_CACHE}_${SESSION.userId}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    STATE = JSON.parse(cached);
    renderView(currentView);
  } else {
    renderView(currentView); // renders skeleton/empty states
  }

  // 2. BACKGROUND REFRESH: fetch real data without blocking the UI.
  refreshBootstrap(cacheKey);

  // 3. POLLING: cheap timestamp check to know when to pull fresh data.
  clearInterval(pollTimer);
  pollTimer = setInterval(() => checkForUpdates(cacheKey), CONFIG.DEFAULT_POLL_INTERVAL_MS);
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
// SIDEBAR
// ===================================================================

function renderUserBadge() {
  document.getElementById('userAvatar').textContent = initials(SESSION.fullName || SESSION.userId);
  document.getElementById('userName').textContent = SESSION.fullName || SESSION.userId;
  document.getElementById('userRole').textContent = SESSION.role;
}

function initials(name) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

function renderSidebarNav() {
  const nav = document.getElementById('sidebarNav');
  const items = getNavGroupForRole(SESSION.role);
  nav.innerHTML = items.map(item => `
    <button class="nav-item ${item.id === currentView ? 'active' : ''}" data-view="${item.id}">
      <svg>${ICONS[item.icon] || ICONS.grid}</svg>
      <span class="nav-label">${item.label}</span>
    </button>
  `).join('');

  nav.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      currentView = btn.dataset.view;
      nav.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderView(currentView);
    });
  });

  document.getElementById('logoutBtn').addEventListener('click', logout);
}

function bindSidebarToggle() {
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
  });
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
}

function renderNotifications() {
  const list = STATE.notifications || [];
  const unread = list.filter(n => n.readStatus === 'Unread');
  const badge = document.getElementById('notifBadge');
  badge.textContent = unread.length;
  badge.classList.toggle('hidden', unread.length === 0);

  const container = document.getElementById('notifList');
  if (!list.length) {
    container.innerHTML = '<p class="empty-state">No notifications yet.</p>';
    return;
  }
  container.innerHTML = list.slice().reverse().map(n => `
    <div class="notif-item ${n.readStatus === 'Unread' ? 'unread' : ''}" data-id="${n.notificationId}">
      <div>${n.message}</div>
      <div class="notif-item-time">${formatDate(n.createdAt)}</div>
    </div>
  `).join('');

  container.querySelectorAll('.notif-item').forEach(el => {
    el.addEventListener('click', async () => {
      await Api.markNotificationRead(el.dataset.id);
      el.classList.remove('unread');
      const n = list.find(x => x.notificationId === el.dataset.id);
      if (n) n.readStatus = 'Read';
      renderNotifications();
    });
  });
}

// ===================================================================
// VIEW ROUTING (stubs — filled in as we build each page)
// ===================================================================

function renderView(view) {
  const content = document.getElementById('content');
  switch (view) {
    case 'dashboard': content.innerHTML = viewDashboardStub(); break;
    case 'materials': content.innerHTML = viewMaterialsStub(); break;
    case 'requests': content.innerHTML = viewRequestsStub(); break;
    case 'newRequest': content.innerHTML = `<div class="page-header"><h1 class="page-title">New Request</h1></div><p class="empty-state">Request form coming next.</p>`; break;
    case 'approvalWindows': content.innerHTML = `<div class="page-header"><h1 class="page-title">Approval Windows</h1></div><p class="empty-state">Coming next.</p>`; break;
    case 'activityLog': content.innerHTML = `<div class="page-header"><h1 class="page-title">Activity Logs</h1></div><p class="empty-state">Coming next.</p>`; break;
    case 'users': content.innerHTML = `<div class="page-header"><h1 class="page-title">User Management</h1></div><p class="empty-state">Coming next.</p>`; break;
    case 'settings': content.innerHTML = `<div class="page-header"><h1 class="page-title">Settings</h1></div><p class="empty-state">Coming next.</p>`; break;
    default: content.innerHTML = '';
  }
}

function viewDashboardStub() {
  const total = STATE.requests.length;
  const pending = STATE.requests.filter(r => r.overallStatus === 'Pending').length;
  const approved = STATE.requests.filter(r => r.overallStatus === 'Approved').length;
  const completed = STATE.requests.filter(r => r.overallStatus === 'Completed').length;

  return `
    <div class="page-header">
      <div><h1 class="page-title">Dashboard</h1><p class="page-sub">Welcome back, ${SESSION.fullName || SESSION.userId}</p></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;">
      ${kpiCard('Total Requests', total)}
      ${kpiCard('Pending', pending)}
      ${kpiCard('Approved', approved)}
      ${kpiCard('Completed', completed)}
    </div>
    <div class="card" style="margin-top:20px;">
      <h3 style="font-size:14px;margin-bottom:12px;">Recent Requests</h3>
      ${renderRequestRows(STATE.requests.slice(-8).reverse())}
    </div>
  `;
}

function kpiCard(label, value) {
  return `<div class="card"><div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">${label}</div><div style="font-family:var(--font-display);font-size:26px;font-weight:700;">${value}</div></div>`;
}

function viewMaterialsStub() {
  const rows = STATE.materials.map(m => `
    <tr>
      <td class="mono">${m.materialId}</td>
      <td>${m.materialName}</td>
      <td>${m.category}</td>
      <td>${m.currentStock} ${m.unit}</td>
      <td>${m.reservedStock} ${m.unit}</td>
      <td>${m.availableStock} ${m.unit}</td>
    </tr>
  `).join('');
  return `
    <div class="page-header"><h1 class="page-title">Materials & Inventory</h1></div>
    <div class="card">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="text-align:left;color:var(--text-secondary);font-size:11px;text-transform:uppercase;">
          <th style="padding:8px;">ID</th><th style="padding:8px;">Name</th><th style="padding:8px;">Category</th>
          <th style="padding:8px;">Current</th><th style="padding:8px;">Reserved</th><th style="padding:8px;">Available</th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="empty-state">No materials yet — add some in the sheet or via Settings.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function viewRequestsStub() {
  return `
    <div class="page-header"><h1 class="page-title">Requests</h1></div>
    <div class="card">${renderRequestRows(STATE.requests.slice().reverse())}</div>
  `;
}

function renderRequestRows(requests) {
  if (!requests.length) return `<p class="empty-state">No requests yet.</p>`;
  return `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="text-align:left;color:var(--text-secondary);font-size:11px;text-transform:uppercase;">
        <th style="padding:8px;">Request ID</th><th style="padding:8px;">Store</th><th style="padding:8px;">Type</th><th style="padding:8px;">Status</th><th style="padding:8px;">Submitted</th>
      </tr></thead>
      <tbody>
        ${requests.map(r => `
          <tr>
            <td class="mono" style="padding:8px;">${r.requestId}</td>
            <td style="padding:8px;">${r.storeName}</td>
            <td style="padding:8px;">${r.requestType}</td>
            <td style="padding:8px;">${stampFor(r.overallStatus)}</td>
            <td style="padding:8px;">${formatDate(r.timestamp)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function stampFor(status) {
  const map = {
    'Pending': 'stamp-pending', 'Approved': 'stamp-approved', 'Rejected': 'stamp-rejected',
    'Need Clarification': 'stamp-clarify', 'Completed': 'stamp-completed'
  };
  return `<span class="stamp ${map[status] || 'stamp-pending'}">${status || 'Pending'}</span>`;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d)) return String(value);
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
}
