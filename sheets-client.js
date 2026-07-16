/**
 * BTL x MRMS — DIRECT SHEETS READ CLIENT
 * -----------------------------------------------------------------
 * Talks straight to the Google Sheets API (read-only, via API key) for the
 * high-frequency reads, instead of round-tripping through the Apps Script
 * Web App. This is what fixes the "loading too long" problem — Apps Script
 * Web Apps have real cold-start latency on every call; this doesn't.
 *
 * NOT used for: login, resetPin, getPersonnel, or any write action. Those
 * stay on WEB_APP_URL in api.js because:
 *   - PERSONEL LIST holds PINs, which must never be reachable via a public
 *     API key. Only Code.gs (server-side) is allowed to read that sheet.
 *   - Writes need LockService (in Code.gs) to prevent race conditions on
 *     stock reservation/deduction when two people act at once. A read-only
 *     API key can't write anyway.
 *
 * Mirrors sheetToObjects_() in Code.gs exactly: same header -> camelCase
 * conversion, same _row numbering, same blank-row filtering. This means
 * app.js needs zero changes — the shape of the data coming back is identical
 * to what the Apps Script endpoints returned.
 * -----------------------------------------------------------------
 */

const SHEET_TABS = {
  STORE_LIST: 'STORE DETAILS',
  MATERIALS: 'MATERIALS',
  REQUESTS: 'REQUESTS',
  REQUEST_ITEMS: 'REQUEST ITEMS',
  APPROVAL_WINDOWS: 'APPROVAL WINDOWS',
  ACTIVITY_LOG: 'ACTIVITY LOG',
  REQUEST_TIMELINE: 'REQUEST TIMELINE',
  NOTIFICATIONS: 'NOTIFICATIONS',
  CONFIG: 'CONFIG'
  // PERSONEL LIST intentionally excluded — never read directly, see header note above.
};

const SheetsClient = {
  _rangeCache: {},

  /** Same regex as toCamel_ in Code.gs. */
  _toCamel(header) {
    return String(header).toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase());
  },

  /** Converts a raw 2D values array (row 1 = headers) into {camelKey: value, _row} objects. */
  _valuesToObjects(values) {
    if (!values || values.length < 2) return [];
    const headers = values[0];
    const camelHeaders = headers.map(this._toCamel);
    return values.slice(1)
      .map((row, i) => {
        const obj = { _row: i + 2 };
        camelHeaders.forEach((key, idx) => obj[key] = row[idx] !== undefined ? row[idx] : '');
        return obj;
      })
      .filter(obj => Object.keys(obj).some(k => k !== '_row' && obj[k] !== '' && obj[k] !== null));
  },

  /**
   * Fetches multiple full-sheet ranges in a single HTTP call via batchGet.
   * tabNames: array of sheet tab names (values from SHEET_TABS).
   * Returns: { [tabName]: object[] }
   */
  async batchGetObjects(tabNames) {
    const ranges = tabNames.map(t => `${t}!A:Z`);
    const query = ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values:batchGet?${query}&key=${CONFIG.SHEETS_API_KEY}`;

    const res = await fetch(url, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error((json.error && json.error.message) || 'Sheets API request failed.');

    const out = {};
    (json.valueRanges || []).forEach((vr, i) => {
      out[tabNames[i]] = this._valuesToObjects(vr.values);
    });
    return out;
  },

  /** Fetches a single tab as objects. */
  async getObjects(tabName) {
    const result = await this.batchGetObjects([tabName]);
    return result[tabName];
  },

  /**
   * Fetches only the last `limit` data rows of a tab instead of the whole sheet —
   * used for ACTIVITY LOG, which only grows and would otherwise re-download its
   * entire history (every row, every column) on every page open. Costs one extra
   * lightweight metadata call to find the sheet's current row count, then a single
   * range-limited values.get for just the rows we actually need.
   */
  async getObjectsTail(tabName, limit) {
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}` +
      `?fields=sheets.properties(title,gridProperties.rowCount)&key=${CONFIG.SHEETS_API_KEY}`;
    const metaRes = await fetch(metaUrl, { cache: 'no-store' });
    const metaJson = await metaRes.json();
    if (!metaRes.ok) throw new Error((metaJson.error && metaJson.error.message) || 'Sheets API request failed.');

    const sheetMeta = (metaJson.sheets || []).find(s => s.properties.title === tabName);
    const totalRows = sheetMeta ? sheetMeta.properties.gridProperties.rowCount : null;
    // Fall back to a full fetch if metadata lookup fails for any reason — better slow than broken.
    if (!totalRows) return this.getObjects(tabName);

    const startRow = Math.max(2, totalRows - limit + 1); // row 1 is the header
    const range = `${tabName}!A${startRow}:Z${totalRows}`;
    const headerRange = `${tabName}!A1:Z1`;
    const query = [headerRange, range].map(r => `ranges=${encodeURIComponent(r)}`).join('&');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values:batchGet?${query}&key=${CONFIG.SHEETS_API_KEY}`;
    const res = await fetch(url, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error((json.error && json.error.message) || 'Sheets API request failed.');

    const [headerRows, dataRows] = json.valueRanges || [];
    const values = [...(headerRows?.values || []), ...(dataRows?.values || [])];
    const objects = this._valuesToObjects(values);
    // _valuesToObjects assumes data rows are contiguous right after the header (row 2, 3, 4...),
    // which isn't true here since we skipped straight to `startRow` — patch _row to the real
    // sheet row so anything downstream that relies on it (e.g. future edit-by-row features) is correct.
    objects.forEach((obj, i) => { obj._row = startRow + i; });
    return objects;
  },

  /**
   * Fast path for lookupShop: fetches STORE DETAILS by raw position (not header
   * name), matching Code.gs's handleLookupShop_ exactly. Columns: A Region,
   * B City, C Responsible RSS, D RSS User ID, E Mall Name/Location,
   * F Dealer Name, G DCR Name/Store Name, H Shop ID.
   */
  async lookupShop(shopId) {
    const target = String(shopId || '').trim().toLowerCase();
    if (!target) throw new Error('Shop ID is required.');

    const range = `${SHEET_TABS.STORE_LIST}!A2:H`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}?key=${CONFIG.SHEETS_API_KEY}`;
    const res = await fetch(url, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error((json.error && json.error.message) || 'Sheets API request failed.');

    const rows = json.values || [];
    const match = rows.find(row => String(row[7] || '').trim().toLowerCase() === target);
    if (!match) throw new Error('Shop ID not found.');

    return {
      region: match[0],
      rssName: match[2],
      rssUserId: match[3],
      storeName: match[6]
    };
  }
};
