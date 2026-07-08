/**
 * BTL x MRMS — API LAYER
 * Wraps calls to the Apps Script Web App following the calling convention
 * documented in Code.gs: GET for reads, POST with text/plain body for writes
 * (avoids CORS preflight, which Apps Script Web Apps don't support).
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

  // ---- Auth ----
  login: (rssUserId, pin) => Api.post('login', { rssUserId, pin }),
  resetPin: (targetUserId, newPin, actorUserId) => Api.post('resetPin', { targetUserId, newPin, actorUserId }),

  // ---- Reads ----
  ping: () => Api.get('ping'),
  getLastUpdate: () => Api.get('getLastUpdate'),
  getBootstrap: (role, userId) => Api.get('getBootstrap', { role, userId }),
  lookupShop: (shopId) => Api.get('lookupShop', { shopId }),
  getRequests: (role, userId) => Api.get('getRequests', { role, userId }),
  getRequestDetail: (requestId) => Api.get('getRequestDetail', { requestId }),
  getNotifications: (userId) => Api.get('getNotifications', { userId }),
  getMaterials: () => Api.get('getMaterials'),
  getActivityLog: (limit) => Api.get('getActivityLog', { limit: limit || '' }),

  // ---- Writes ----
  submitRequest: (payload) => Api.post('submitRequest', payload),
  reviewRequestItem: (payload) => Api.post('reviewRequestItem', payload),
  finalizeRequestReview: (payload) => Api.post('finalizeRequestReview', payload),
  releaseRequest: (payload) => Api.post('releaseRequest', payload),
  markNotificationRead: (notificationId) => Api.post('markNotificationRead', { notificationId }),
  createApprovalWindow: (payload) => Api.post('createApprovalWindow', payload),
  upsertMaterial: (payload) => Api.post('upsertMaterial', payload)
};
