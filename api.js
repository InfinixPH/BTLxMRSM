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

  /** Mirrors getRequestsForUser_ in Code.gs: full visibility for Admin/BTL/Warehouse, own-only otherwise.
   *  Uses String() coercion because Sheets auto-types numeric-looking IDs (e.g. "17004042") as
   *  Number, not String — a plain === would silently drop every row for that user. */
  _filterRequestsForUser(all, role, userId) {
    if (role === ROLES.ADMIN || BTL_ROLES.indexOf(role) !== -1 || role === ROLES.WAREHOUSE) return all;
    const target = String(userId).trim();
    return all.filter(r => String(r.requestorUserId).trim() === target);
  },

  /** True for roles allowed to see every request (Admin/BTL/Warehouse). Everyone else
   *  (RSS/RSH/Others) only ever gets their own requests — and for those roles, requests
   *  must be filtered server-side (Code.gs), not fetched in full and filtered in the
   *  browser. Fetching-then-filtering means the complete REQUESTS sheet — every store's
   *  purpose, reason, contact number, photo links — sits in that person's browser before
   *  the filter ever runs, visible to anyone with dev tools open. */
  _isPrivilegedRole(role) {
    return role === ROLES.ADMIN || BTL_ROLES.indexOf(role) !== -1 || role === ROLES.WAREHOUSE;
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
    // Non-privileged roles: filter server-side (Code.gs) so unfiltered rows never
    // reach the browser. Privileged roles see everything anyway, so they keep the
    // fast direct-Sheets path — no benefit to slowing them down.
    if (!Api._isPrivilegedRole(role)) {
      return Api.get('getRequests', { role, userId });
    }
    return SheetsClient.getObjects(SHEET_TABS.REQUESTS);
  },

  async getRequestDetail(requestId) {
    const role = SESSION.role;
    const userId = SESSION.userId;

    // Non-privileged roles: let Code.gs enforce ownership server-side (it checks
    // requestorUserId against the caller before returning anything). Otherwise a
    // user who knows/guesses a requestId could pull another store's full detail
    // directly, bypassing the list-level filter entirely.
    if (!Api._isPrivilegedRole(role)) {
      return Api.get('getRequestDetail', { requestId, role, userId });
    }

    const data = await SheetsClient.batchGetObjects([
      SHEET_TABS.REQUESTS, SHEET_TABS.REQUEST_ITEMS, SHEET_TABS.REQUEST_TIMELINE
    ]);
    const target = String(requestId).trim();
    const request = data[SHEET_TABS.REQUESTS].find(r => String(r.requestId).trim() === target) || null;
    const items = data[SHEET_TABS.REQUEST_ITEMS].filter(i => String(i.requestId).trim() === target);
    const timeline = data[SHEET_TABS.REQUEST_TIMELINE].filter(t => String(t.requestId).trim() === target);
    return { request, items, timeline };
  },

  async getNotifications(userId) {
    const all = await SheetsClient.getObjects(SHEET_TABS.NOTIFICATIONS);
    const target = String(userId).trim();
    return all.filter(n => String(n.userId).trim() === target);
  },

  async getActivityLog(limit) {
    if (limit) return SheetsClient.getObjectsTail(SHEET_TABS.ACTIVITY_LOG, Number(limit));
    return SheetsClient.getObjects(SHEET_TABS.ACTIVITY_LOG);
  },

  lookupShop: (shopId) => SheetsClient.lookupShop(shopId),

  /** One batched call for everything a dashboard needs on first paint — same shape as handleGetBootstrap.
   *  REQUEST_TIMELINE is included full (not per-request) so BTL Team Performance stats can be computed
   *  client-side without an extra round trip per request. */
  async getBootstrap(role, userId) {
    // Non-privileged roles: MATERIALS/CONFIG carry no per-user data, so those stay on
    // the fast direct-Sheets path. REQUESTS (and the notifications/timeline derived from
    // it) go through Code.gs instead, so the full unfiltered table never reaches the
    // browser — same reasoning as getRequests above.
    if (!Api._isPrivilegedRole(role)) {
      const [sheetsData, serverData] = await Promise.all([
        SheetsClient.batchGetObjects([SHEET_TABS.MATERIALS, SHEET_TABS.CONFIG]),
        Api.get('getBootstrap', { role, userId })
      ]);
      const lastUpdateRow = sheetsData[SHEET_TABS.CONFIG].find(r => r.key === 'LAST_DATA_UPDATE');
      return {
        materials: sheetsData[SHEET_TABS.MATERIALS],
        requests: serverData.requests,
        notifications: serverData.notifications,
        timeline: serverData.timeline || [],
        lastUpdate: lastUpdateRow ? lastUpdateRow.value : null
      };
    }

    const data = await SheetsClient.batchGetObjects([
      SHEET_TABS.MATERIALS, SHEET_TABS.REQUESTS, SHEET_TABS.NOTIFICATIONS,
      SHEET_TABS.CONFIG, SHEET_TABS.REQUEST_TIMELINE
    ]);
    const lastUpdateRow = data[SHEET_TABS.CONFIG].find(r => r.key === 'LAST_DATA_UPDATE');
    const targetUserId = String(userId).trim();
    const requests = Api._filterRequestsForUser(data[SHEET_TABS.REQUESTS], role, userId);
    const visibleRequestIds = new Set(requests.map(r => String(r.requestId).trim()));
    return {
      materials: data[SHEET_TABS.MATERIALS],
      requests,
      notifications: data[SHEET_TABS.NOTIFICATIONS].filter(n => String(n.userId).trim() === targetUserId),
      // Same visibility rule as requests: a requestor never sees other people's timeline entries.
      timeline: data[SHEET_TABS.REQUEST_TIMELINE].filter(t => visibleRequestIds.has(String(t.requestId).trim())),
      lastUpdate: lastUpdateRow ? lastUpdateRow.value : null
    };
  },

  // ---- Writes (stay on Apps Script — LockService-guarded stock math) ----
  submitRequest: (payload) => Api.post('submitRequest', payload),
  reviewRequestItem: (payload) => Api.post('reviewRequestItem', payload),
  finalizeRequestReview: (payload) => Api.post('finalizeRequestReview', payload),
  releaseRequest: (payload) => Api.post('releaseRequest', payload),
  markNotificationRead: (notificationId) => Api.post('markNotificationRead', { notificationId }),
  upsertMaterial: (payload) => Api.post('upsertMaterial', payload),
  upsertPersonnel: (payload) => Api.post('upsertPersonnel', payload)
};
