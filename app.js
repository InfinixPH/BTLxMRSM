/**
 * BTL x MRMS — BACKEND API (Code.gs)
 * -----------------------------------------------------------------
 * Deployed as a Web App (Deploy > New deployment > Web app).
 *   - Execute as: Me
 *   - Who has access: Anyone
 *
 * FRONTEND CALLING CONVENTION (important — read this):
 *   GET  requests -> doGet(e)  -> use for all READS. Pass ?action=xxx&...params
 *   POST requests -> doPost(e) -> use for all WRITES. Body must be sent as
 *                     Content-Type: text/plain (NOT application/json) with a
 *                     JSON string as the body, e.g.:
 *
 *     fetch(WEB_APP_URL, {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'text/plain;charset=utf-8' },
 *       body: JSON.stringify({ action: 'submitRequest', ...payload })
 *     });
 *
 *   Why: Apps Script Web Apps don't handle CORS preflight (OPTIONS).
 *   Sending as text/plain keeps it a "simple request" so the browser
 *   skips preflight entirely. If you send application/json, cross-origin
 *   calls from GitHub Pages will silently fail.
 * -----------------------------------------------------------------
 */

const SS = SpreadsheetApp.getActiveSpreadsheet();

const SHEETS = {
  STORE_LIST: 'STORE DETAILS',
  PERSONEL_LIST: 'PERSONEL LIST',
  MATERIALS: 'MATERIALS',
  REQUESTS: 'REQUESTS',
  REQUEST_ITEMS: 'REQUEST ITEMS',
  APPROVAL_WINDOWS: 'APPROVAL WINDOWS',
  ACTIVITY_LOG: 'ACTIVITY LOG',
  REQUEST_TIMELINE: 'REQUEST TIMELINE',
  NOTIFICATIONS: 'NOTIFICATIONS',
  CONFIG: 'CONFIG'
};

const ROLES = {
  ADMIN: 'ADMIN',
  BTL_MANAGER: 'BTL MANAGER',
  BTL_ETHAN: 'BTL ETHAN',
  BTL_JB: 'BTL JB',
  WAREHOUSE: 'WAREHOUSE',
  RSS: 'RSS',
  RSH: 'RSH',
  OTHERS: 'OTHERS'
};

const BTL_ROLES = [ROLES.BTL_MANAGER, ROLES.BTL_ETHAN, ROLES.BTL_JB];

// ===================================================================
// ROUTER
// ===================================================================

function doGet(e) {
  try {
    const action = e.parameter.action;
    let result;
    switch (action) {
      case 'ping': result = { ok: true, time: new Date().toISOString() }; break;
      case 'getLastUpdate': result = handleGetLastUpdate(); break;
      case 'getBootstrap': result = handleGetBootstrap(e.parameter); break;
      case 'lookupShop': result = handleLookupShop(e.parameter); break;
      case 'getRequests': result = handleGetRequests(e.parameter); break;
      case 'getRequestDetail': result = handleGetRequestDetail(e.parameter); break;
      case 'getNotifications': result = handleGetNotifications(e.parameter); break;
      case 'getMaterials': result = handleGetMaterials(); break;
      case 'getActivityLog': result = handleGetActivityLog(e.parameter); break;
      case 'getPersonnel': result = handleGetPersonnel(); break;
      default: throw new Error('Unknown GET action: ' + action);
    }
    return jsonOut_({ success: true, data: result });
  } catch (err) {
    return jsonOut_({ success: false, error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    let result;

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      switch (action) {
        case 'login': result = handleLogin(body); break;
        case 'submitRequest': result = handleSubmitRequest(body); break;
        case 'reviewRequestItem': result = handleReviewRequestItem(body); break;
        case 'finalizeRequestReview': result = handleFinalizeRequestReview(body); break;
        case 'releaseRequest': result = handleReleaseRequest(body); break;
        case 'markNotificationRead': result = handleMarkNotificationRead(body); break;
        case 'resetPin': result = handleResetPin(body); break;
        case 'createApprovalWindow': result = handleCreateApprovalWindow(body); break;
        case 'upsertMaterial': result = handleUpsertMaterial(body); break;
        case 'upsertPersonnel': result = handleUpsertPersonnel(body); break;
        default: throw new Error('Unknown POST action: ' + action);
      }
    } finally {
      lock.releaseLock();
    }

    return jsonOut_({ success: true, data: result });
  } catch (err) {
    return jsonOut_({ success: false, error: err.message });
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===================================================================
// SHEET HELPERS
// ===================================================================

function getSheet_(name) {
  const sheet = SS.getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name);
  return sheet;
}

function toCamel_(header) {
  return header.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase());
}

function getHeaders_(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

/** Reads all data rows into an array of {camelKey: value} objects. Includes _row (1-indexed sheet row) for updates. */
function sheetToObjects_(sheet) {
  const headers = getHeaders_(sheet);
  const camelHeaders = headers.map(toCamel_);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values
    .map((row, i) => {
      const obj = { _row: i + 2 };
      camelHeaders.forEach((key, idx) => obj[key] = row[idx]);
      return obj;
    })
    // Skip fully blank rows. IMPORTANT: _row is always a number, so it must be
    // excluded from this check — otherwise it always evaluates truthy and every
    // row (including empty/formatted-only trailing rows past your real data)
    // passes through, which is what was flooding Materials/Requests/etc. with
    // hundreds of blank entries.
    .filter(obj => Object.keys(obj).some(k => k !== '_row' && obj[k] !== '' && obj[k] !== null));
}

/** Appends a record. obj keys must be camelCase matching headers. Missing keys become ''. */
function appendRecord_(sheet, obj) {
  const headers = getHeaders_(sheet);
  const camelHeaders = headers.map(toCamel_);
  const row = camelHeaders.map(key => obj[key] !== undefined ? obj[key] : '');
  sheet.appendRow(row);
  return sheet.getLastRow();
}

/** Updates specific fields on a given row number. fields keyed by camelCase. */
function updateRecordFields_(sheet, rowNumber, fields) {
  const headers = getHeaders_(sheet);
  const camelHeaders = headers.map(toCamel_);
  Object.keys(fields).forEach(key => {
    const colIndex = camelHeaders.indexOf(key);
    if (colIndex !== -1) {
      sheet.getRange(rowNumber, colIndex + 1).setValue(fields[key]);
    }
  });
}

function findRowById_(sheet, idKey, idValue) {
  const records = sheetToObjects_(sheet);
  const target = String(idValue).trim().toLowerCase();
  return records.find(r => String(r[idKey]).trim().toLowerCase() === target) || null;
}

function genId_(prefix) {
  return prefix + '-' + Utilities.getUuid().split('-')[0].toUpperCase();
}

function bumpLastUpdate_() {
  const sheet = getSheet_(SHEETS.CONFIG);
  const records = sheetToObjects_(sheet);
  const row = records.find(r => r.key === 'LAST_DATA_UPDATE');
  if (row) {
    updateRecordFields_(sheet, row._row, { value: new Date().getTime().toString() });
  }
}

function getConfigValue_(key) {
  const records = sheetToObjects_(getSheet_(SHEETS.CONFIG));
  const row = records.find(r => r.key === key);
  return row ? row.value : null;
}

function logActivity_(userId, role, action, targetType, targetId, details) {
  appendRecord_(getSheet_(SHEETS.ACTIVITY_LOG), {
    logId: genId_('LOG'),
    timestamp: new Date(),
    userId, role, action, targetType, targetId,
    details: details || ''
  });
}

function addTimelineEntry_(requestId, stage, actorUserId, action, remarks) {
  appendRecord_(getSheet_(SHEETS.REQUEST_TIMELINE), {
    timelineId: genId_('TML'),
    requestId, stage, actorUserId, action,
    remarks: remarks || '',
    timestamp: new Date()
  });
}

function addNotification_(userId, type, message, relatedRequestId) {
  appendRecord_(getSheet_(SHEETS.NOTIFICATIONS), {
    notificationId: genId_('NOTIF'),
    userId, type, message,
    relatedRequestId: relatedRequestId || '',
    readStatus: 'Unread',
    createdAt: new Date()
  });
}

// ===================================================================
// AUTH
// ===================================================================

function handleLogin(body) {
  const { rssUserId, pin } = body;
  if (!rssUserId || !pin) throw new Error('Missing user ID or PIN.');

  const sheet = getSheet_(SHEETS.PERSONEL_LIST);
  const user = findRowById_(sheet, 'rssUserId', rssUserId);
  if (!user) throw new Error('User not found.');
  if (user.pinStatus && String(user.pinStatus).toLowerCase() === 'locked') {
    throw new Error('Account locked. Contact an admin.');
  }

  const pinIsBlank = user.pin === '' || user.pin === null || user.pin === undefined;
  const enteredMatchesUserId = String(pin).trim().toLowerCase() === String(rssUserId).trim().toLowerCase();

  if (pinIsBlank) {
    // First-time login: PIN defaults to the User ID until they set a real one.
    if (!enteredMatchesUserId) throw new Error('Incorrect PIN.');
  } else if (String(user.pin).trim() !== String(pin).trim()) {
    throw new Error('Incorrect PIN.');
  }

  updateRecordFields_(sheet, user._row, { lastLogin: new Date() });
  logActivity_(rssUserId, user.position, 'LOGIN', 'USER', rssUserId, '');

  return {
    userId: user.rssUserId,
    fullName: user.fullName,
    role: user.position,
    region: user.region
  };
}

function handleResetPin(body) {
  const { targetUserId, newPin, actorUserId } = body;
  const sheet = getSheet_(SHEETS.PERSONEL_LIST);
  const user = findRowById_(sheet, 'rssUserId', targetUserId);
  if (!user) throw new Error('User not found.');

  updateRecordFields_(sheet, user._row, {
    pin: newPin,
    pinStatus: 'Active',
    resetRequest: 'No',
    lastUpdated: new Date()
  });
  logActivity_(actorUserId, 'ADMIN', 'PIN_RESET', 'USER', targetUserId, '');
  return { success: true };
}

// ===================================================================
// BOOTSTRAP / READS
// ===================================================================

function handleGetLastUpdate() {
  return { lastUpdate: getConfigValue_('LAST_DATA_UPDATE') };
}

/** One call to get everything a dashboard needs on first paint. */
function handleGetBootstrap(params) {
  const role = params.role;
  const userId = params.userId;

  return {
    materials: sheetToObjects_(getSheet_(SHEETS.MATERIALS)),
    requests: getRequestsForUser_(role, userId),
    notifications: sheetToObjects_(getSheet_(SHEETS.NOTIFICATIONS)).filter(n => n.userId === userId),
    approvalWindows: sheetToObjects_(getSheet_(SHEETS.APPROVAL_WINDOWS)),
    lastUpdate: getConfigValue_('LAST_DATA_UPDATE')
  };
}

function getRequestsForUser_(role, userId) {
  const all = sheetToObjects_(getSheet_(SHEETS.REQUESTS));
  if (role === ROLES.ADMIN || BTL_ROLES.indexOf(role) !== -1 || role === ROLES.WAREHOUSE) {
    return all; // full visibility
  }
  return all.filter(r => r.requestorUserId === userId); // requestor sees only their own
}

function handleGetMaterials() {
  return sheetToObjects_(getSheet_(SHEETS.MATERIALS));
}

function handleGetRequests(params) {
  return getRequestsForUser_(params.role, params.userId);
}

function handleGetRequestDetail(params) {
  const requestId = params.requestId;
  const items = sheetToObjects_(getSheet_(SHEETS.REQUEST_ITEMS)).filter(i => i.requestId === requestId);
  const timeline = sheetToObjects_(getSheet_(SHEETS.REQUEST_TIMELINE)).filter(t => t.requestId === requestId);
  const request = findRowById_(getSheet_(SHEETS.REQUESTS), 'requestId', requestId);
  return { request, items, timeline };
}

function handleGetNotifications(params) {
  return sheetToObjects_(getSheet_(SHEETS.NOTIFICATIONS)).filter(n => n.userId === params.userId);
}

function handleGetActivityLog(params) {
  const all = sheetToObjects_(getSheet_(SHEETS.ACTIVITY_LOG));
  return params.limit ? all.slice(-Number(params.limit)) : all;
}

function handleLookupShop(params) {
  const shopId = String(params.shopId || '').trim();
  if (!shopId) throw new Error('Shop ID is required.');

  const sheet = getSheet_(SHEETS.STORE_LIST);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('Shop ID not found.');

  // Column order in STORE DETAILS: A Region, B City, C Responsible RSS,
  // D RSS User ID, E Mall Name/Location, F Dealer Name, G DCR Name/Store Name,
  // H Shop ID, I Store Type, J Status.
  // Searching only the SHOP ID column (instead of reading/converting the whole
  // sheet via sheetToObjects_) is what makes this fast.
  const SHOP_ID_COL = 8;
  const shopIdRange = sheet.getRange(2, SHOP_ID_COL, lastRow - 1, 1);
  const finder = shopIdRange.createTextFinder(shopId).matchEntireCell(true).matchCase(false);
  const cell = finder.findNext();
  if (!cell) throw new Error('Shop ID not found.');

  const rowValues = sheet.getRange(cell.getRow(), 1, 1, 8).getValues()[0];
  return {
    region: rowValues[0],
    rssName: rowValues[2],
    rssUserId: rowValues[3],
    storeName: rowValues[6]
  };
}

/** Personnel list for the Users admin screen. Never sends the pin field to the client. */
function handleGetPersonnel() {
  return sheetToObjects_(getSheet_(SHEETS.PERSONEL_LIST)).map(p => {
    const { pin, ...safe } = p;
    return safe;
  });
}

// ===================================================================
// REQUEST LIFECYCLE
// ===================================================================

/** Requestor submits a new request with N material line items. */
function handleSubmitRequest(body) {
  const { shopId, storeName, region, rssName, requestorUserId, contactNumber,
    requestType, purpose, reason, photoLinks, items } = body;

  if (!items || !items.length) throw new Error('At least one material item is required.');

  const requestId = genId_('REQ');
  const now = new Date();

  appendRecord_(getSheet_(SHEETS.REQUESTS), {
    requestId, timestamp: now, shopId, storeName, region, rssName,
    requestorUserId, contactNumber, requestType, purpose, reason,
    photoLinks: photoLinks || '',
    overallStatus: 'Pending',
    currentStage: 'BTL Review',
    approvalWindowId: body.approvalWindowId || '',
    createdAt: now, updatedAt: now
  });

  items.forEach(item => {
    appendRecord_(getSheet_(SHEETS.REQUEST_ITEMS), {
      itemId: genId_('ITM'),
      requestId,
      materialId: item.materialId,
      qtyRequested: item.qty,
      qtyApproved: '',
      itemStatus: 'Pending',
      btlRemarks: '',
      warehouseRemarks: ''
    });
  });

  addTimelineEntry_(requestId, 'Submitted', requestorUserId, 'SUBMITTED', 'Request submitted with ' + items.length + ' item(s).');
  logActivity_(requestorUserId, ROLES.RSS, 'SUBMIT_REQUEST', 'REQUEST', requestId, '');

  // Notify all BTL reviewers
  const personnel = sheetToObjects_(getSheet_(SHEETS.PERSONEL_LIST));
  personnel.filter(p => BTL_ROLES.indexOf(p.position) !== -1).forEach(btl => {
    addNotification_(btl.rssUserId, 'NEW_REQUEST', `New request ${requestId} from ${storeName} needs review.`, requestId);
  });

  bumpLastUpdate_();
  return { requestId };
}

/** BTL reviews a single line item: Approve / Reject / Need Clarification. Approving reserves stock. */
function handleReviewRequestItem(body) {
  const { itemId, decision, qtyApproved, remarks, actorUserId } = body;
  const itemsSheet = getSheet_(SHEETS.REQUEST_ITEMS);
  const item = findRowById_(itemsSheet, 'itemId', itemId);
  if (!item) throw new Error('Request item not found.');

  const fields = { itemStatus: decision, btlRemarks: remarks || '' };

  if (decision === 'Approved') {
    const qty = Number(qtyApproved || item.qtyRequested);
    fields.qtyApproved = qty;
    reserveStock_(item.materialId, qty);
  }

  updateRecordFields_(itemsSheet, item._row, fields);
  addTimelineEntry_(item.requestId, 'BTL Review', actorUserId, decision.toUpperCase(), remarks || '');
  logActivity_(actorUserId, 'BTL', 'REVIEW_ITEM', 'REQUEST_ITEM', itemId, decision);

  bumpLastUpdate_();
  return { success: true };
}

/** Reserves stock for an approved item: RESERVED STOCK += qty. */
function reserveStock_(materialId, qty) {
  const sheet = getSheet_(SHEETS.MATERIALS);
  const material = findRowById_(sheet, 'materialId', materialId);
  if (!material) throw new Error('Material not found: ' + materialId);
  const newReserved = Number(material.reservedStock || 0) + Number(qty);
  updateRecordFields_(sheet, material._row, { reservedStock: newReserved, lastUpdated: new Date() });
}

/** After all items on a request are reviewed, BTL finalizes overall request status. */
function handleFinalizeRequestReview(body) {
  const { requestId, overallStatus, remarks, actorUserId } = body;
  const requestsSheet = getSheet_(SHEETS.REQUESTS);
  const request = findRowById_(requestsSheet, 'requestId', requestId);
  if (!request) throw new Error('Request not found.');

  const nextStage = overallStatus === 'Approved' ? 'Warehouse Processing'
    : overallStatus === 'Need Clarification' ? 'Awaiting Requestor'
    : 'Closed';

  updateRecordFields_(requestsSheet, request._row, {
    overallStatus, currentStage: nextStage, updatedAt: new Date()
  });

  addTimelineEntry_(requestId, 'BTL Decision', actorUserId, overallStatus.toUpperCase(), remarks || '');
  logActivity_(actorUserId, 'BTL', 'FINALIZE_REVIEW', 'REQUEST', requestId, overallStatus);

  addNotification_(request.requestorUserId, 'STATUS_UPDATE',
    `Your request ${requestId} was marked ${overallStatus}.`, requestId);

  if (overallStatus === 'Approved') {
    const personnel = sheetToObjects_(getSheet_(SHEETS.PERSONEL_LIST));
    personnel.filter(p => p.position === ROLES.WAREHOUSE).forEach(w => {
      addNotification_(w.rssUserId, 'READY_FOR_RELEASE', `Request ${requestId} is approved and ready for prep/release.`, requestId);
    });
  }

  bumpLastUpdate_();
  return { success: true };
}

/** Warehouse releases a request: deducts approved qty from CURRENT STOCK and clears RESERVED STOCK for those items. */
function handleReleaseRequest(body) {
  const { requestId, actorUserId, trackingInfo } = body;
  const itemsSheet = getSheet_(SHEETS.REQUEST_ITEMS);
  const items = sheetToObjects_(itemsSheet).filter(i => i.requestId === requestId && i.itemStatus === 'Approved');

  items.forEach(item => {
    deductStock_(item.materialId, Number(item.qtyApproved));
    updateRecordFields_(itemsSheet, item._row, { itemStatus: 'Released' });
  });

  const requestsSheet = getSheet_(SHEETS.REQUESTS);
  const request = findRowById_(requestsSheet, 'requestId', requestId);
  updateRecordFields_(requestsSheet, request._row, {
    overallStatus: 'Completed', currentStage: 'Completed', updatedAt: new Date()
  });

  addTimelineEntry_(requestId, 'Warehouse Release', actorUserId, 'RELEASED', trackingInfo || '');
  logActivity_(actorUserId, ROLES.WAREHOUSE, 'RELEASE_REQUEST', 'REQUEST', requestId, trackingInfo || '');
  addNotification_(request.requestorUserId, 'RELEASED', `Request ${requestId} has been released.`, requestId);

  bumpLastUpdate_();
  return { success: true };
}

/** Deducts from CURRENT STOCK and removes the matching amount from RESERVED STOCK. */
function deductStock_(materialId, qty) {
  const sheet = getSheet_(SHEETS.MATERIALS);
  const material = findRowById_(sheet, 'materialId', materialId);
  if (!material) throw new Error('Material not found: ' + materialId);
  const newCurrent = Number(material.currentStock || 0) - Number(qty);
  const newReserved = Math.max(0, Number(material.reservedStock || 0) - Number(qty));
  updateRecordFields_(sheet, material._row, {
    currentStock: newCurrent, reservedStock: newReserved, lastUpdated: new Date()
  });
}

// ===================================================================
// MISC WRITES
// ===================================================================

function handleMarkNotificationRead(body) {
  const sheet = getSheet_(SHEETS.NOTIFICATIONS);
  const notif = findRowById_(sheet, 'notificationId', body.notificationId);
  if (!notif) throw new Error('Notification not found.');
  updateRecordFields_(sheet, notif._row, { readStatus: 'Read' });
  return { success: true };
}

function handleCreateApprovalWindow(body) {
  const { windowName, startDate, endDate, actorUserId } = body;
  const windowId = genId_('WIN');
  appendRecord_(getSheet_(SHEETS.APPROVAL_WINDOWS), {
    windowId, windowName, startDate, endDate, status: 'Open',
    createdBy: actorUserId, createdAt: new Date()
  });
  logActivity_(actorUserId, ROLES.ADMIN, 'CREATE_APPROVAL_WINDOW', 'APPROVAL_WINDOW', windowId, windowName);
  bumpLastUpdate_();
  return { windowId };
}

function handleUpsertMaterial(body) {
  const sheet = getSheet_(SHEETS.MATERIALS);
  const existing = body.materialId ? findRowById_(sheet, 'materialId', body.materialId) : null;

  if (existing) {
    updateRecordFields_(sheet, existing._row, {
      category: body.category, materialName: body.materialName, unit: body.unit,
      currentStock: body.currentStock, reorderLevel: body.reorderLevel,
      status: body.status, lastUpdated: new Date()
    });
    logActivity_(body.actorUserId, ROLES.ADMIN, 'UPDATE_MATERIAL', 'MATERIAL', body.materialId, '');
    bumpLastUpdate_();
    return { materialId: body.materialId };
  }

  const materialId = genId_('MAT');
  appendRecord_(sheet, {
    materialId, category: body.category, materialName: body.materialName, unit: body.unit,
    currentStock: body.currentStock || 0, reservedStock: 0, reorderLevel: body.reorderLevel || 0,
    status: 'Active', lastUpdated: new Date()
  });
  logActivity_(body.actorUserId, ROLES.ADMIN, 'CREATE_MATERIAL', 'MATERIAL', materialId, '');
  bumpLastUpdate_();
  return { materialId };
}

/** Creates or updates a PERSONEL LIST row. Never touches pin/pinStatus here — use resetPin for that. */
function handleUpsertPersonnel(body) {
  const sheet = getSheet_(SHEETS.PERSONEL_LIST);
  const existing = body.rssUserId ? findRowById_(sheet, 'rssUserId', body.rssUserId) : null;

  if (existing) {
    updateRecordFields_(sheet, existing._row, {
      fullName: body.fullName, position: body.position, region: body.region,
      contactNumber: body.contactNumber || '', lastUpdated: new Date()
    });
    logActivity_(body.actorUserId, ROLES.ADMIN, 'UPDATE_USER', 'USER', body.rssUserId, '');
    bumpLastUpdate_();
    return { rssUserId: body.rssUserId };
  }

  if (!body.rssUserId) throw new Error('User ID is required.');
  appendRecord_(sheet, {
    rssUserId: body.rssUserId, fullName: body.fullName, position: body.position, region: body.region,
    contactNumber: body.contactNumber || '', pin: '', pinStatus: 'Active', resetRequest: 'No',
    lastLogin: '', lastUpdated: new Date()
  });
  logActivity_(body.actorUserId, ROLES.ADMIN, 'CREATE_USER', 'USER', body.rssUserId, '');
  bumpLastUpdate_();
  return { rssUserId: body.rssUserId };
}
