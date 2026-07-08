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
  approvalWindows: [],
  lastUpdate: null
};
let currentView = 'dashboard';
let pollTimer = null;
let itemRowSeq = 0;

const REQUEST_TYPES = ['Regular Replenishment', 'New Store Setup', 'Damage Replacement', 'Special Request'];

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
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>'
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
  bindModal();

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

    const cacheKey = `${CONFIG.STORAGE_KEYS.BOOTSTRAP_CACHE}_${SESSION.userId}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      STATE = JSON.parse(cached);
    }
    renderView(currentView);

    refreshBootstrap(cacheKey);

    clearInterval(pollTimer);
    pollTimer = setInterval(() => checkForUpdates(cacheKey), CONFIG.DEFAULT_POLL_INTERVAL_MS);
  } catch (err) {
    console.error('enterApp failed:', err);
    document.getElementById('content').innerHTML =
      `<div class="page-header"><h1 class="page-title">Something went wrong</h1></div><p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
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
        if (n && n.relatedRequestId) openRequestDetail(n.relatedRequestId);
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

function bindModal() {
  document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeModal();
  });
}

function openModal(title, bodyHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalOverlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  document.getElementById('modalBody').innerHTML = '';
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
  return (STATE.materials || []).find(m => m.materialId === materialId);
}

// ===================================================================
// VIEW ROUTING
// ===================================================================

function renderView(view) {
  const content = document.getElementById('content');
  switch (view) {
    case 'dashboard': content.innerHTML = viewDashboard(); bindDashboard(); break;
    case 'materials': content.innerHTML = viewMaterials(); bindMaterials(); break;
    case 'requests': content.innerHTML = viewRequests(); bindRequestRowClicks(content); break;
    case 'newRequest': content.innerHTML = viewNewRequestForm(); bindNewRequestForm(); break;
    case 'approvalWindows': content.innerHTML = viewApprovalWindows(); bindApprovalWindows(); break;
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

  return `
    <div class="page-header">
      <div><h1 class="page-title">Dashboard</h1><p class="page-sub">Welcome back, ${escapeHtml(SESSION.fullName || SESSION.userId)}</p></div>
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

function bindDashboard() {
  bindRequestRowClicks(document.getElementById('content'));
}

function kpiCard(label, value) {
  return `<div class="card"><div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">${label}</div><div style="font-family:var(--font-display);font-size:26px;font-weight:700;">${value}</div></div>`;
}

// ===================================================================
// MATERIALS
// ===================================================================

function viewMaterials() {
  const rows = (STATE.materials || []).map(m => {
    const available = (m.availableStock !== undefined && m.availableStock !== '')
      ? m.availableStock
      : (Number(m.currentStock || 0) - Number(m.reservedStock || 0));
    return `
      <tr>
        <td class="mono">${escapeHtml(m.materialId)}</td>
        <td>${escapeHtml(m.materialName)}</td>
        <td>${escapeHtml(m.category)}</td>
        <td>${escapeHtml(m.currentStock)} ${escapeHtml(m.unit)}</td>
        <td>${escapeHtml(m.reservedStock)} ${escapeHtml(m.unit)}</td>
        <td>${escapeHtml(available)} ${escapeHtml(m.unit)}</td>
        <td>${escapeHtml(m.status || 'Active')}</td>
        ${isAdmin() ? `<td><button class="btn btn-ghost btn-sm mat-edit-btn" data-id="${escapeHtml(m.materialId)}">Edit</button></td>` : ''}
      </tr>
    `;
  }).join('');

  return `
    <div class="page-header">
      <h1 class="page-title">Materials & Inventory</h1>
      ${isAdmin() ? `<button class="btn btn-primary btn-sm" id="matAddBtn">+ Add Material</button>` : ''}
    </div>
    <div class="card table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>ID</th><th>Name</th><th>Category</th><th>Current</th><th>Reserved</th><th>Available</th><th>Status</th>${isAdmin() ? '<th></th>' : ''}
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="8" class="empty-state">No materials yet.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function bindMaterials() {
  if (!isAdmin()) return;
  const addBtn = document.getElementById('matAddBtn');
  if (addBtn) addBtn.addEventListener('click', () => openMaterialModal(null));
  document.querySelectorAll('.mat-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openMaterialModal(findMaterial(btn.dataset.id)));
  });
}

function openMaterialModal(material) {
  const isEdit = !!material;
  openModal(isEdit ? 'Edit Material' : 'Add Material', `
    <div class="form-grid">
      <div class="field"><span class="field-label">Category</span><input id="matCategory" value="${escapeHtml(material?.category || '')}"></div>
      <div class="field"><span class="field-label">Material Name</span><input id="matName" value="${escapeHtml(material?.materialName || '')}"></div>
      <div class="field"><span class="field-label">Unit</span><input id="matUnit" value="${escapeHtml(material?.unit || '')}" placeholder="pcs, box, roll..."></div>
      <div class="field"><span class="field-label">Current Stock</span><input id="matStock" type="number" value="${escapeHtml(material?.currentStock ?? 0)}"></div>
      <div class="field"><span class="field-label">Reorder Level</span><input id="matReorder" type="number" value="${escapeHtml(material?.reorderLevel ?? 0)}"></div>
      <div class="field">
        <span class="field-label">Status</span>
        <select id="matStatus">
          <option value="Active" ${material?.status === 'Active' || !material ? 'selected' : ''}>Active</option>
          <option value="Inactive" ${material?.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </div>
    </div>
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
      currentStock: Number(document.getElementById('matStock').value || 0),
      reorderLevel: Number(document.getElementById('matReorder').value || 0),
      status: document.getElementById('matStatus').value,
      actorUserId: SESSION.userId
    };
    if (!payload.materialName || !payload.unit) {
      errorEl.textContent = 'Material name and unit are required.';
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

function viewRequests() {
  return `
    <div class="page-header"><h1 class="page-title">Requests</h1></div>
    <div class="card table-wrap">${renderRequestRows(STATE.requests.slice().reverse())}</div>
  `;
}

function renderRequestRows(requests) {
  if (!requests.length) return `<p class="empty-state">No requests yet.</p>`;
  return `
    <table class="data-table">
      <thead><tr>
        <th>Request ID</th><th>Store</th><th>Type</th><th>Status</th><th>Submitted</th>
      </tr></thead>
      <tbody>
        ${requests.map(r => `
          <tr class="clickable" data-request-id="${escapeHtml(r.requestId)}">
            <td class="mono">${escapeHtml(r.requestId)}</td>
            <td>${escapeHtml(r.storeName)}</td>
            <td>${escapeHtml(r.requestType)}</td>
            <td>${stampFor(r.overallStatus)}</td>
            <td>${formatDate(r.timestamp)}</td>
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
        <td>${escapeHtml(name)}</td>
        <td>${escapeHtml(item.qtyRequested)}</td>
        <td>${item.qtyApproved !== '' && item.qtyApproved !== undefined ? escapeHtml(item.qtyApproved) : '—'}</td>
        <td>${stampFor(item.itemStatus)}</td>
        <td>${escapeHtml(item.btlRemarks || '—')}</td>
        <td>
          ${canAct ? `
            <div class="action-btns">
              <input type="number" class="item-qty-input" placeholder="Qty" value="${escapeHtml(item.qtyRequested)}" style="width:64px;padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--bg-elevated);color:var(--text-primary);">
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

  bindRequestDetailActions(request.requestId);
}

function bindRequestDetailActions(requestId) {
  document.querySelectorAll('.item-approve-btn, .item-reject-btn, .item-clarify-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const row = e.target.closest('tr');
      const itemId = row.dataset.itemId;
      const qtyInput = row.querySelector('.item-qty-input');
      const decision = btn.classList.contains('item-approve-btn') ? 'Approved'
        : btn.classList.contains('item-reject-btn') ? 'Rejected' : 'Need Clarification';
      const remarks = decision !== 'Approved' ? (prompt('Remarks (optional):') || '') : '';
      btn.disabled = true;
      try {
        await Api.reviewRequestItem({
          itemId, decision, qtyApproved: qtyInput ? qtyInput.value : '', remarks, actorUserId: SESSION.userId
        });
        toast('Item updated.', 'success');
        openRequestDetail(requestId);
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
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

// ===================================================================
// NEW REQUEST FORM
// ===================================================================

function viewNewRequestForm() {
  const openWindows = (STATE.approvalWindows || []).filter(w => w.status === 'Open');
  return `
    <div class="page-header"><h1 class="page-title">New Request</h1></div>
    <div class="card">
      <div class="section-title">Shop Details</div>
      <div class="form-grid">
        <div class="field">
          <span class="field-label">Shop ID</span>
          <div class="field-row">
            <input id="nrShopId" placeholder="e.g. 17004327">
            <button type="button" class="btn btn-secondary btn-sm" id="nrLookupBtn">Lookup</button>
          </div>
        </div>
        <div class="field"><span class="field-label">Store Name</span><input id="nrStoreName" disabled></div>
        <div class="field"><span class="field-label">Region</span><input id="nrRegion" disabled></div>
        <div class="field"><span class="field-label">Responsible RSS</span><input id="nrRssName" disabled></div>
        <div class="field"><span class="field-label">Contact Number</span><input id="nrContact" placeholder="09xxxxxxxxx"></div>
        <div class="field">
          <span class="field-label">Request Type</span>
          <select id="nrType">${REQUEST_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}</select>
        </div>
        ${openWindows.length ? `
        <div class="field">
          <span class="field-label">Approval Window (optional)</span>
          <select id="nrWindow">
            <option value="">— None —</option>
            ${openWindows.map(w => `<option value="${escapeHtml(w.windowId)}">${escapeHtml(w.windowName)}</option>`).join('')}
          </select>
        </div>` : ''}
        <div class="field span-2"><span class="field-label">Purpose</span><textarea id="nrPurpose" placeholder="What is this request for?"></textarea></div>
        <div class="field span-2"><span class="field-label">Reason</span><textarea id="nrReason" placeholder="Why is it needed?"></textarea></div>
        <div class="field span-2"><span class="field-label">Photo Links (optional, comma-separated URLs)</span><input id="nrPhotoLinks" placeholder="https://..."></div>
      </div>

      <div class="section-title">Materials Requested</div>
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

  document.getElementById('nrLookupBtn').addEventListener('click', async () => {
    const shopId = document.getElementById('nrShopId').value.trim();
    const errorEl = document.getElementById('nrError');
    errorEl.textContent = '';
    if (!shopId) { errorEl.textContent = 'Enter a Shop ID first.'; return; }
    try {
      const shop = await Api.lookupShop(shopId);
      document.getElementById('nrStoreName').value = shop.storeName || '';
      document.getElementById('nrRegion').value = shop.region || '';
      document.getElementById('nrRssName').value = shop.rssName || '';
      toast('Shop found.', 'success');
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  document.getElementById('nrSubmitBtn').addEventListener('click', submitNewRequest);
}

function addNewRequestItemRow(container) {
  const rowId = `nrItem${itemRowSeq++}`;
  const activeMaterials = (STATE.materials || []).filter(m => (m.status || 'Active') === 'Active');
  const row = document.createElement('div');
  row.className = 'item-row';
  row.id = rowId;
  row.innerHTML = `
    <select class="nr-item-material">
      <option value="">— Select material —</option>
      ${activeMaterials.map(m => `<option value="${escapeHtml(m.materialId)}">${escapeHtml(m.materialName)} (${escapeHtml(m.unit)})</option>`).join('')}
    </select>
    <input type="number" class="nr-item-qty" placeholder="Qty" min="1">
    <button type="button" class="item-row-remove" aria-label="Remove"><svg viewBox="0 0 24 24">TRASHICON</svg></button>
  `.replace('TRASHICON', ICONS.trash);
  row.querySelector('.item-row-remove').addEventListener('click', () => row.remove());
  container.appendChild(row);
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
  const windowEl = document.getElementById('nrWindow');
  const approvalWindowId = windowEl ? windowEl.value : '';

  if (!shopId || !storeName) { errorEl.textContent = 'Look up a valid Shop ID first.'; return; }
  if (!purpose || !reason) { errorEl.textContent = 'Purpose and reason are required.'; return; }

  const items = [];
  document.querySelectorAll('#nrItemsContainer .item-row').forEach(row => {
    const materialId = row.querySelector('.nr-item-material').value;
    const qty = Number(row.querySelector('.nr-item-qty').value || 0);
    if (materialId && qty > 0) items.push({ materialId, qty });
  });
  if (!items.length) { errorEl.textContent = 'Add at least one material with a valid quantity.'; return; }

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
// APPROVAL WINDOWS
// ===================================================================

function viewApprovalWindows() {
  const rows = (STATE.approvalWindows || []).slice().reverse().map(w => `
    <tr>
      <td class="mono">${escapeHtml(w.windowId)}</td>
      <td>${escapeHtml(w.windowName)}</td>
      <td>${formatDate(w.startDate)}</td>
      <td>${formatDate(w.endDate)}</td>
      <td>${escapeHtml(w.status)}</td>
      <td>${escapeHtml(w.createdBy)}</td>
    </tr>
  `).join('');

  return `
    <div class="page-header"><h1 class="page-title">Approval Windows</h1></div>
    ${isAdmin() ? `
    <div class="card" style="margin-bottom:20px;">
      <div class="section-title">Create New Window</div>
      <div class="form-grid">
        <div class="field"><span class="field-label">Window Name</span><input id="awName" placeholder="e.g. Q3 2026 Store Refresh"></div>
        <div class="field"><span class="field-label">Start Date</span><input id="awStart" type="date"></div>
        <div class="field"><span class="field-label">End Date</span><input id="awEnd" type="date"></div>
      </div>
      <p class="login-error" id="awError"></p>
      <div class="form-actions"><button class="btn btn-primary" id="awCreateBtn">Create Window</button></div>
    </div>` : ''}
    <div class="card table-wrap">
      <table class="data-table">
        <thead><tr><th>ID</th><th>Name</th><th>Start</th><th>End</th><th>Status</th><th>Created By</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="empty-state">No approval windows yet.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function bindApprovalWindows() {
  const btn = document.getElementById('awCreateBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const errorEl = document.getElementById('awError');
    const windowName = document.getElementById('awName').value.trim();
    const startDate = document.getElementById('awStart').value;
    const endDate = document.getElementById('awEnd').value;
    if (!windowName || !startDate || !endDate) {
      errorEl.textContent = 'All fields are required.';
      return;
    }
    btn.disabled = true;
    try {
      await Api.createApprovalWindow({ windowName, startDate, endDate, actorUserId: SESSION.userId });
      toast('Approval window created.', 'success');
      await refreshBootstrap(`${CONFIG.STORAGE_KEYS.BOOTSTRAP_CACHE}_${SESSION.userId}`);
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
}

// ===================================================================
// ACTIVITY LOG
// ===================================================================

function viewActivityLogShell() {
  return `
    <div class="page-header"><h1 class="page-title">Activity Logs</h1></div>
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
  try {
    const logs = await Api.getActivityLog(300);
    renderActivityLogTable(logs.slice().reverse());
    const search = document.getElementById('logSearch');
    if (search) {
      search.addEventListener('input', () => {
        const q = search.value.trim().toLowerCase();
        const filtered = logs.slice().reverse().filter(l =>
          [l.userId, l.role, l.action, l.targetType, l.targetId, l.details].join(' ').toLowerCase().includes(q)
        );
        renderActivityLogTable(filtered);
      });
    }
  } catch (err) {
    wrap.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

function renderActivityLogTable(logs) {
  const wrap = document.getElementById('logTableWrap');
  if (!wrap) return;
  const rows = logs.map(l => `
    <tr>
      <td>${formatDate(l.timestamp)}</td>
      <td class="mono">${escapeHtml(l.userId)}</td>
      <td>${escapeHtml(l.role)}</td>
      <td>${escapeHtml(l.action)}</td>
      <td>${escapeHtml(l.targetType)}</td>
      <td class="mono">${escapeHtml(l.targetId)}</td>
      <td>${escapeHtml(l.details)}</td>
    </tr>
  `).join('');
  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Time</th><th>User</th><th>Role</th><th>Action</th><th>Target Type</th><th>Target ID</th><th>Details</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7" class="empty-state">No activity found.</td></tr>`}</tbody>
    </table>
  `;
}

// ===================================================================
// USERS (Admin)
// ===================================================================

let USERS_CACHE = [];

function viewUsersShell() {
  return `
    <div class="page-header">
      <h1 class="page-title">User Management</h1>
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
    renderUsersTable();
  } catch (err) {
    wrap.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

function renderUsersTable() {
  const wrap = document.getElementById('usersTableWrap');
  const rows = USERS_CACHE.map(u => `
    <tr>
      <td class="mono">${escapeHtml(u.rssUserId)}</td>
      <td>${escapeHtml(u.fullName)}</td>
      <td>${escapeHtml(u.position)}</td>
      <td>${escapeHtml(u.region)}</td>
      <td>${escapeHtml(u.pinStatus || 'Active')}</td>
      <td>${formatDate(u.lastLogin)}</td>
      <td>
        <div class="action-btns">
          <button class="btn btn-ghost btn-sm user-edit-btn" data-id="${escapeHtml(u.rssUserId)}">Edit</button>
          <button class="btn btn-secondary btn-sm user-reset-btn" data-id="${escapeHtml(u.rssUserId)}">Reset PIN</button>
        </div>
      </td>
    </tr>
  `).join('');
  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr><th>User ID</th><th>Name</th><th>Role</th><th>Region</th><th>PIN Status</th><th>Last Login</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7" class="empty-state">No users found.</td></tr>`}</tbody>
    </table>
  `;
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
    const newPin = document.getElementById('rpNewPin').value.trim() || targetUserId;
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
    <div class="page-header"><h1 class="page-title">Settings</h1></div>
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

    const btn = document.getElementById('stSaveBtn');
    btn.disabled = true;
    try {
      await Api.login(SESSION.userId, currentPin);
      await Api.resetPin(SESSION.userId, newPin, SESSION.userId);
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
