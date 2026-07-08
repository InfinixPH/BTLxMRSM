/**
 * BTL x MRMS — CONFIG
 * Paste your deployed Apps Script Web App URL below (the one ending in /exec).
 */
const CONFIG = {
  WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbwiATjZ37tZ6rHgySVIo_v1DIvA2wEfcOoBeEp4ULOqAVF1DATN-xVp00NH7HpOYsOAdA/exec',

  // Direct Google Sheets API access (read-only). Used for high-frequency reads
  // (materials, requests, notifications, activity log, bootstrap, shop lookup)
  // to avoid Apps Script Web App cold-start latency. Writes and anything
  // touching PERSONEL LIST (which holds PINs) still go through WEB_APP_URL.
  SHEETS_API_KEY: 'AIzaSyCbcpSYWw8bIeyZxq-f3XKdMzo8VVVJu8w',
  SPREADSHEET_ID: '1R2MPf0TWJPJ89VC13qxfStyel3dSrcB1x-0pY1Gkpm0',

  // Fallback poll interval in ms if CONFIG sheet value can't be read yet.
  DEFAULT_POLL_INTERVAL_MS: 8000,

  STORAGE_KEYS: {
    SESSION: 'mrms_session',
    THEME: 'mrms_theme',
    BOOTSTRAP_CACHE: 'mrms_bootstrap_cache'
  }
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

/** Sidebar nav items per role. Each view id maps to a render function in app.js */
const NAV_BY_ROLE = {
  [ROLES.ADMIN]: [
    { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
    { id: 'materials', label: 'Materials & Inventory', icon: 'box' },
    { id: 'requests', label: 'Requests', icon: 'list' },
    { id: 'approvalWindows', label: 'Approval Windows', icon: 'calendar' },
    { id: 'activityLog', label: 'Activity Logs', icon: 'clock' },
    { id: 'users', label: 'User Management', icon: 'users' },
    { id: 'settings', label: 'Settings', icon: 'settings' }
  ],
  BTL: [
    { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
    { id: 'requests', label: 'Requests to Review', icon: 'list' },
    { id: 'materials', label: 'Materials & Inventory', icon: 'box' },
    { id: 'approvalWindows', label: 'Approval Windows', icon: 'calendar' },
    { id: 'activityLog', label: 'Activity Logs', icon: 'clock' },
    { id: 'settings', label: 'Settings', icon: 'settings' }
  ],
  [ROLES.WAREHOUSE]: [
    { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
    { id: 'requests', label: 'Approved Requests', icon: 'list' },
    { id: 'materials', label: 'Materials & Inventory', icon: 'box' },
    { id: 'settings', label: 'Settings', icon: 'settings' }
  ],
  REQUESTOR: [
    { id: 'dashboard', label: 'My Requests', icon: 'grid' },
    { id: 'materials', label: 'Materials Catalog', icon: 'box' },
    { id: 'newRequest', label: 'New Request', icon: 'plus' },
    { id: 'settings', label: 'Settings', icon: 'settings' }
  ]
};

function getNavGroupForRole(role) {
  if (role === ROLES.ADMIN) return NAV_BY_ROLE[ROLES.ADMIN];
  if (BTL_ROLES.indexOf(role) !== -1) return NAV_BY_ROLE.BTL;
  if (role === ROLES.WAREHOUSE) return NAV_BY_ROLE[ROLES.WAREHOUSE];
  return NAV_BY_ROLE.REQUESTOR; // RSS, RSH, OTHERS
}
