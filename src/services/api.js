import { API_BASE_URL, getAuthToken, clearSession } from './apiConfig';

// Requests get 30s to complete before we give up - without this, a hung
// network or unresponsive server left the app looking frozen forever with
// no error surfaced to the user. Login specifically needs real headroom
// here: it's the very first request the app makes, so there's no warm
// connection yet - a cold DNS lookup + TLS handshake right after a fresh
// install can genuinely take longer than a shorter timeout would allow,
// which was showing as a false "network error" even with a good connection.
const REQUEST_TIMEOUT_MS = 30000;

function timeoutSignal(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A single fetch() attempt. Throws a clean, user-facing Error - never the
// raw fetch error (which can leak the API hostname) - on timeout or a real
// connectivity failure.
async function attemptFetch(url, options) {
  const { signal, clear } = timeoutSignal(REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Please check your connection and try again.');
    }
    throw new Error('No internet connection. Please check your Wi-Fi or mobile data and try again.');
  } finally {
    clear();
  }
}

// Retries a couple of times on a genuine connectivity failure only (never on
// a timeout, and never on a normal HTTP error response, both of which
// resolve/throw differently). This exists because login() chains three
// requests back to back right after a fresh connection is established
// (POST /login, then GET /me, then GET /warehouses) - a single transient
// blip on any one of those was enough to fail the whole login even though
// the token from the first request had already been saved, leaving the
// user stuck on an error while a background retry (or just reopening the
// app, which re-reads that saved token) would have worked fine.
async function fetchWithRetry(url, options, retries = 2) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await attemptFetch(url, options);
    } catch (err) {
      const isConnectivityFailure = err.message.startsWith('No internet connection');
      if (!isConnectivityFailure || attempt >= retries) throw err;
      await sleep(500 * (attempt + 1));
    }
  }
}

async function request(path, options = {}) {
  const token = await getAuthToken();
  const headers = { ...(options.headers || {}) };

  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetchWithRetry(`${API_BASE_URL}${path}`, { ...options, headers });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      (data && (data.detail?.[0]?.msg || data.detail)) || `Request failed (${res.status})`;
    const messageText = typeof message === 'string' ? message : 'Request failed';

    if (res.status === 401) {
      await clearSession();
    }

    throw new Error(messageText);
  }

  return data;
}

const get = (path) => request(path);
const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });
const patch = (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) });
const del = (path) => request(path, { method: 'DELETE' });

export async function login(username, password) {
  const body = new URLSearchParams();
  body.set('username', username);
  body.set('password', password);

  const res = await fetchWithRetry(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      typeof data.detail === 'string'
        ? data.detail
        : Array.isArray(data.detail) && data.detail[0]?.msg
          ? data.detail[0].msg
          : 'Invalid username or password.';
    throw new Error(message);
  }

  return data;
}

export const authApi = {
  me: () => get('/api/auth/me'),
  verifyAdminPassword: (password) => post('/api/auth/verify-admin-password', { password }),
};

export const categoriesApi = {
  list: () => get('/api/categories'),
  create: (data) => post('/api/categories', data),
  update: (id, data) => patch(`/api/categories/${id}`, data),
  remove: (id) => del(`/api/categories/${id}`),
};

export const warehousesApi = {
  list: () => get('/api/warehouses'),
};

export const vendorsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get(`/api/vendors${qs ? `?${qs}` : ''}`);
  },
  create: (data) => post('/api/vendors', data),
  update: (id, data) => patch(`/api/vendors/${id}`, data),
  remove: (id) => del(`/api/vendors/${id}`),
};

export const departmentsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get(`/api/departments${qs ? `?${qs}` : ''}`);
  },
  create: (data) => post('/api/departments', data),
  update: (id, data) => patch(`/api/departments/${id}`, data),
  remove: (id) => del(`/api/departments/${id}`),
};

const normalizePackSize = (p) => ({ ...p, pack_quantity: Number(p.pack_quantity) });
const normalizeUnit = (u) => ({
  ...u,
  conversion_factor: u.conversion_factor === null ? null : Number(u.conversion_factor),
  pack_sizes: (u.pack_sizes || []).map(normalizePackSize),
});

export const unitsApi = {
  list: async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const data = await get(`/api/units${qs ? `?${qs}` : ''}`);
    return data.map(normalizeUnit);
  },
  create: async (data) => normalizeUnit(await post('/api/units', data)),
  update: async (id, data) => normalizeUnit(await patch(`/api/units/${id}`, data)),
  remove: (id) => del(`/api/units/${id}`),
  createPackSize: async (unitId, data) => normalizePackSize(await post(`/api/units/${unitId}/pack-sizes`, data)),
  removePackSize: (packId) => del(`/api/pack-sizes/${packId}`),
};

const normalizeProduct = (p) => ({
  ...p,
  purchase_price: Number(p.purchase_price),
  min_stock: Number(p.min_stock),
});
const normalizeStockLevel = (l) => ({ ...l, quantity: Number(l.quantity) });
const normalizeMovement = (m) => ({ ...m, quantity: Number(m.quantity) });
const normalizeProcurementRequest = (r) => ({ ...r, quantity: Number(r.quantity) });

export const productsApi = {
  list: async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const data = await get(`/api/products${qs ? `?${qs}` : ''}`);
    return data.map(normalizeProduct);
  },
  create: async (data) => normalizeProduct(await post('/api/products', data)),
  update: async (id, data) => normalizeProduct(await patch(`/api/products/${id}`, data)),
  remove: (id) => del(`/api/products/${id}`),
};

export const stockApi = {
  levels: async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const data = await get(`/api/stock/levels${qs ? `?${qs}` : ''}`);
    return data.map(normalizeStockLevel);
  },
  movements: async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const data = await get(`/api/stock/movements${qs ? `?${qs}` : ''}`);
    return data.map(normalizeMovement);
  },
  adjust: async (data) => normalizeStockLevel(await post('/api/stock/adjust', data)),
};

export const procurementApi = {
  list: async () => (await get('/api/procurement-requests')).map(normalizeProcurementRequest),
  create: async (data) => normalizeProcurementRequest(await post('/api/procurement-requests', data)),
  createBatch: async (items) =>
    (await post('/api/procurement-requests/batch', { items })).map(normalizeProcurementRequest),
  getByNumber: async (requestNumber) =>
    (await get(`/api/procurement-requests/by-number/${encodeURIComponent(requestNumber)}`)).map(
      normalizeProcurementRequest,
    ),
  fulfillByNumber: async (requestNumber) =>
    (await post(`/api/procurement-requests/by-number/${encodeURIComponent(requestNumber)}/fulfill`, {})).map(
      normalizeProcurementRequest,
    ),
  update: async (id, data) => normalizeProcurementRequest(await patch(`/api/procurement-requests/${id}`, data)),
  remove: (id) => del(`/api/procurement-requests/${id}`),
};

const normalizeBill = (b) => ({ ...b, bill_amount: Number(b.bill_amount) });
const normalizePayment = (p) => ({
  ...p,
  amount_paid: Number(p.amount_paid),
  adjustment_amount: Number(p.adjustment_amount),
});
const normalizeSummary = (s) => ({
  ...s,
  total_bill_amount: Number(s.total_bill_amount),
  total_amount_paid: Number(s.total_amount_paid),
  amount_adjusted: Number(s.amount_adjusted),
  balance_amount: Number(s.balance_amount),
});

export const paymentsApi = {
  summary: async () => (await get('/api/payments/summary')).map(normalizeSummary),
  listBills: async (vendorId) => (await get(`/api/payments/bills?vendor_id=${vendorId}`)).map(normalizeBill),
  createBill: async (data) => normalizeBill(await post('/api/payments/bills', data)),
  removeBill: (id) => del(`/api/payments/bills/${id}`),
  listPayments: async (vendorId) =>
    (await get(`/api/payments/payments?vendor_id=${vendorId}`)).map(normalizePayment),
  createPayment: async (data) => normalizePayment(await post('/api/payments/payments', data)),
  updatePayment: async (id, data) => normalizePayment(await patch(`/api/payments/payments/${id}`, data)),
  removePayment: (id) => del(`/api/payments/payments/${id}`),
};

const normalizeEmployee = (e) => ({ ...e, monthly_salary: Number(e.monthly_salary) });

export const employeesApi = {
  list: async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return (await get(`/api/employees${qs ? `?${qs}` : ''}`)).map(normalizeEmployee);
  },
  create: async (data) => normalizeEmployee(await post('/api/employees', data)),
  update: async (id, data) => normalizeEmployee(await patch(`/api/employees/${id}`, data)),
  remove: (id) => del(`/api/employees/${id}`),
};

export const attendanceApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get(`/api/attendance${qs ? `?${qs}` : ''}`);
  },
  bulkMark: (date, entries) => post('/api/attendance/bulk-mark', { date, entries }),
};

const normalizeAdvance = (a) => ({ ...a, amount: Number(a.amount) });

export const salaryAdvancesApi = {
  list: async (employeeId) => {
    const qs = employeeId ? `?employee_id=${employeeId}` : '';
    return (await get(`/api/salary-advances${qs}`)).map(normalizeAdvance);
  },
  create: async (data) => normalizeAdvance(await post('/api/salary-advances', data)),
  update: async (id, data) => normalizeAdvance(await patch(`/api/salary-advances/${id}`, data)),
  remove: (id) => del(`/api/salary-advances/${id}`),
};

const normalizePayroll = (p) => ({
  ...p,
  present_days: Number(p.present_days),
  absent_days: Number(p.absent_days),
  half_days: Number(p.half_days),
  leave_days: Number(p.leave_days),
  gross_salary: Number(p.gross_salary),
  advance_deduction: Number(p.advance_deduction),
  attendance_deduction: Number(p.attendance_deduction),
  other_deduction: Number(p.other_deduction),
  net_salary: Number(p.net_salary),
  amount_paid: Number(p.amount_paid),
});
const normalizePayrollSummary = (s) => ({
  ...s,
  total_net_salary: Number(s.total_net_salary),
  total_amount_paid: Number(s.total_amount_paid),
  balance_amount: Number(s.balance_amount),
});

export const payrollApi = {
  list: async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return (await get(`/api/payroll${qs ? `?${qs}` : ''}`)).map(normalizePayroll);
  },
  summary: async () => (await get('/api/payroll/summary')).map(normalizePayrollSummary),
  defaultForMonth: async (period) => (await post('/api/payroll/default-for-month', { period })).map(normalizePayroll),
  regenerateForMonth: async (period) =>
    (await post('/api/payroll/regenerate-for-month', { period })).map(normalizePayroll),
  markPaid: async (id, data) => normalizePayroll(await patch(`/api/payroll/${id}/mark-paid`, data)),
};
