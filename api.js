/**
 * BTL x MRMS — API LAYER
 * -----------------------------------------------------------------
 * Two backends now:
 *   1. WEB_APP_URL (Apps Script) — login, resetPin, getPersonnel, and every
 *      write. Kept here because Code.gs owns PIN verification/stripping and
 *      LockService-guarded stock math. See sheets-client.js header for why.
 *   2. Direct Google Sheets API (via SheetsClient, read-only API key) — every
 *      other read. This is what used to be slow; a direct API call skips
 *      Apps Script's cold-start entirely.
 *
 * Every Api.* method below keeps its original name/signature, so app.js
 * needs zero changes — only where the data comes from changed.
 * -----------------------------------------------------------------
 */

const Api = {
  async get(action, params = {}) {
    const query = new URLSearchParams({ action, ...params }).toString();
    const res = await fetch(`${CONFIG.WEB_APP_URL}?${query}`, { method: 'GET' });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Request failed.');
    return json.data;
  },

  async post(action, payload = {}) {
    const res = await fetch(CONFIG.WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...payload })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Request failed.');
    return json.data;
  },

  /** Mirrors getRequestsForUser_ in Code.gs: full visibility for Admin/BTL/Warehouse, own-only otherwise. */
  _filterRequestsForUser(all, role, userId) {
    if (role === ROLES.ADMIN || BTL_ROLES.indexOf(role) !== -1 || role === ROLES.WAREHOUSE) return all;
    return all.filter(r => r.requestorUserId === userId);
  },

  // ---- Auth (stays on Apps Script — PIN handling lives server-side only) ----
  login: (rssUserId, pin) => Api.post('login', { rssUserId, pin }),
  resetPin: (targetUserId, newPin, actorUserId) => Api.post('resetPin', { targetUserId, newPin, actorUserId }),
  getPersonnel: () => Api.get('getPersonnel'),

  // ---- Reads (direct Sheets API) ----
  ping: () => Promise.resolve({ ok: true, time: new Date().toISOString() }),

  async getLastUpdate() {
    const config = await SheetsClient.getObjects(SHEET_TABS.CONFIG);
    const row = config.find(r => r.key === 'LAST_DATA_UPDATE');
    return { lastUpdate: row ? row.value : null };
  },

  getMaterials: () => SheetsClient.getObjects(SHEET_TABS.MATERIALS),

  async getRequests(role, userId) {
    const all = await SheetsClient.getObjects(SHEET_TABS.REQUESTS);
    return Api._filterRequestsForUser(all, role, userId);
  },

  async getRequestDetail(requestId) {
    const data = await SheetsClient.batchGetObjects([
      SHEET_TABS.REQUESTS, SHEET_TABS.REQUEST_ITEMS, SHEET_TABS.REQUEST_TIMELINE
    ]);
    const request = data[SHEET_TABS.REQUESTS].find(r => r.requestId === requestId) || null;
    const items = data[SHEET_TABS.REQUEST_ITEMS].filter(i => i.requestId === requestId);
    const timeline = data[SHEET_TABS.REQUEST_TIMELINE].filter(t => t.requestId === requestId);
    return { request, items, timeline };
  },

  async getNotifications(userId) {
    const all = await SheetsClient.getObjects(SHEET_TABS.NOTIFICATIONS);
    return all.filter(n => n.userId === userId);
  },

  async getActivityLog(limit) {
    const all = await SheetsClient.getObjects(SHEET_TABS.ACTIVITY_LOG);
    return limit ? all.slice(-Number(limit)) : all;
  },

  lookupShop: (shopId) => SheetsClient.lookupShop(shopId),

  /** One batched call for everything a dashboard needs on first paint — same shape as handleGetBootstrap. */
  async getBootstrap(role, userId) {
    const data = await SheetsClient.batchGetObjects([
      SHEET_TABS.MATERIALS, SHEET_TABS.REQUESTS, SHEET_TABS.NOTIFICATIONS,
      SHEET_TABS.APPROVAL_WINDOWS, SHEET_TABS.CONFIG
    ]);
    const lastUpdateRow = data[SHEET_TABS.CONFIG].find(r => r.key === 'LAST_DATA_UPDATE');
    return {
      materials: data[SHEET_TABS.MATERIALS],
      requests: Api._filterRequestsForUser(data[SHEET_TABS.REQUESTS], role, userId),
      notifications: data[SHEET_TABS.NOTIFICATIONS].filter(n => n.userId === userId),
      approvalWindows: data[SHEET_TABS.APPROVAL_WINDOWS],
      lastUpdate: lastUpdateRow ? lastUpdateRow.value : null
    };
  },

  // ---- Writes (stay on Apps Script — LockService-guarded stock math) ----
  submitRequest: (payload) => Api.post('submitRequest', payload),
  reviewRequestItem: (payload) => Api.post('reviewRequestItem', payload),
  finalizeRequestReview: (payload) => Api.post('finalizeRequestReview', payload),
  releaseRequest: (payload) => Api.post('releaseRequest', payload),
  markNotificationRead: (notificationId) => Api.post('markNotificationRead', { notificationId }),
  createApprovalWindow: (payload) => Api.post('createApprovalWindow', payload),
  upsertMaterial: (payload) => Api.post('upsertMaterial', payload),
  upsertPersonnel: (payload) => Api.post('upsertPersonnel', payload)
};
