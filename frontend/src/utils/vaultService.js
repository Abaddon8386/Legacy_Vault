/**
 * LegacyVault — Vault Management Service & Validation Adapter (PS-3)
 *
 * ARCHITECTURAL BOUNDARY & SAFETY COMPLIANCE:
 * - Aligned with Jira PS-3 and proposed PS-74 Contract (docs/api-contracts/vaults.md).
 * - NOTE: GET /api/v1/vaults reflects proposed D-API-23 in PS-74 (subject to final alignment).
 * - Business Rules:
 *   1. Newly created vaults always have status = 'ACTIVE' (PS-12 / D-API-12).
 *   2. Vault Owners only have access to their own vault (1:1 relationship).
 *   3. Ownership validation is enforced by Backend security context.
 *   4. Client validation: Name is required, 2–150 chars. Description is optional, <= 1000 chars.
 *   5. In live mode, communicates with /api/v1/vaults via liveVaultAdapter.
 *   6. In DEV mode with ?preview=true, provides simulation scenarios via mockVaultAdapter.
 *   7. Production builds (import.meta.env.PROD === true) strictly lock out all simulation adapters.
 */

export const VAULT_SCENARIOS = [
  { id: 'exists', labelVi: 'Kho đang hoạt động (ACTIVE)', labelEn: 'Active Vault Exists (ACTIVE)' },
  { id: 'empty', labelVi: 'Chưa có kho (Empty State)', labelEn: 'No Vault (Empty State)' },
  { id: 'create_modal', labelVi: 'Khởi tạo kho (Create Vault)', labelEn: 'Create Vault Modal' },
  { id: 'validation_error', labelVi: 'Lỗi xác thực dữ liệu (Validation Error)', labelEn: 'Form Validation Error' },
  { id: 'loading', labelVi: 'Đang tải dữ liệu (Loading State)', labelEn: 'Loading Records (Loading State)' },
  { id: 'unauthorized', labelVi: 'Lỗi 401: Hết phiên làm việc (Unauthorized)', labelEn: 'HTTP 401: Session Expired' },
  { id: 'forbidden', labelVi: 'Lỗi 403: Không có quyền truy cập (Forbidden)', labelEn: 'HTTP 403: Access Denied' },
  { id: 'not_found', labelVi: 'Lỗi 404: Không tìm thấy kho (Not Found)', labelEn: 'HTTP 404: Vault Not Found' },
  { id: 'network_error', labelVi: 'Lỗi mạng / Mất kết nối (Network Error)', labelEn: 'Network Error / Offline' },
];

export const vaultStatusMessages = {
  vi: {
    nameRequired: 'Vui lòng nhập tên kho di sản.',
    nameMin: 'Tên kho di sản phải có ít nhất 2 ký tự.',
    nameMax: 'Tên kho di sản không được vượt quá 150 ký tự.',
    descMax: 'Mô tả không được vượt quá 1000 ký tự.',
    unauthorized: 'Phiên làm việc đã hết hạn hoặc chưa được xác thực. Vui lòng đăng nhập lại.',
    forbidden: 'Bạn không có quyền truy cập vào kho di sản này. Quyền truy cập thuộc về chủ sở hữu.',
    notFound: 'Không tìm thấy kho di sản trên hệ thống.',
    networkError: 'Không thể kết nối đến máy chủ LegacyVault. Vui lòng kiểm tra kết nối mạng.',
    serverError: 'Máy chủ gặp sự cố nội bộ (HTTP 500). Vui lòng thử lại sau.',
    limitExceeded: 'Tài khoản đã sở hữu một kho di sản. Mỗi chủ tài khoản chỉ được khởi tạo một kho duy nhất.',
    backendNotReady: 'Dịch vụ lưu trữ Vault hiện đang trong quá trình tích hợp máy chủ. Vui lòng thử lại sau.',
    createdSuccess: 'Kho di sản số đã được khởi tạo thành công (Trạng thái ACTIVE).',
  },
  en: {
    nameRequired: 'Please enter a vault name.',
    nameMin: 'Vault name must be at least 2 characters.',
    nameMax: 'Vault name must not exceed 150 characters.',
    descMax: 'Description must not exceed 1000 characters.',
    unauthorized: 'Session has expired or authentication is required. Please sign in again.',
    forbidden: 'You do not have permission to access this vault. Access is restricted to the owner.',
    notFound: 'Heritage vault not found on the system.',
    networkError: 'Unable to connect to LegacyVault server. Please check your network connection.',
    serverError: 'Internal server error occurred (HTTP 500). Please try again later.',
    limitExceeded: 'Account already owns a vault. Each owner is permitted only one personal vault.',
    backendNotReady: 'Vault service is currently under server integration. Please try again later.',
    createdSuccess: 'Heritage vault initialized successfully (Status ACTIVE).',
  },
};

/**
 * Client-side validation for Vault creation input
 * @param {Object} input - { vault_name, description } or { name, description }
 * @param {'vi'|'en'} lang
 * @returns {Object} validation errors keyed by field
 */
export function validateVaultInput(input = {}, lang = 'vi') {
  const msgs = vaultStatusMessages[lang] || vaultStatusMessages.vi;
  const errors = {};
  const rawName = input.vault_name !== undefined ? input.vault_name : input.name;
  const name = (rawName || '').trim();
  const desc = (input.description || '').trim();

  if (!name) {
    errors.vault_name = msgs.nameRequired;
  } else if (name.length < 2) {
    errors.vault_name = msgs.nameMin;
  } else if (name.length > 150) {
    errors.vault_name = msgs.nameMax;
  }

  if (desc && desc.length > 1000) {
    errors.description = msgs.descMax;
  }

  return errors;
}

/**
 * Strict Environment & Simulation Gate
 * Rules:
 * 1. If runtime is Production (import.meta.env?.PROD === true or testEnv?.PROD === true),
 *    simulation is 100% UNCONDITIONALLY FORBIDDEN.
 *    No options.isDev, options.isDevPreview, options.isSimulation, or scenario can bypass this!
 * 2. In non-production runtime (DEV mode or Node test runner):
 *    Simulation is ONLY permitted if:
 *      a) options.isDevPreview === true (explicit DEV Preview toolbar mode with ?preview=true)
 *      OR
 *      b) options.isTest === true (isolated unit test runner)
 * 3. Having options.scenario alone NEVER triggers simulation.
 * 4. Passing options.isDev: true when in production has ZERO EFFECT.
 *
 * @param {Object} options
 * @returns {boolean} true if simulation is permitted
 */
export function isSimulationPermitted(options = {}) {
  // A. Check for Production environment
  // In Vite production bundle, import.meta.env.PROD is statically compiled to true.
  const isViteProd =
    typeof import.meta !== 'undefined' &&
    Boolean(import.meta.env?.PROD);

  const isTestProd = Boolean(options.testEnv?.PROD);

  // If production in either runtime bundle or test runner -> HARD SHUTDOWN on simulation
  if (isViteProd || isTestProd) {
    return false;
  }

  // B. In non-production (DEV browser or test runner):
  // Check if explicitly running in DEV Preview (?preview=true)
  const isDevPreview = Boolean(options.isDevPreview);

  // Check if running in isolated unit test runner (options.isTest === true)
  const isTestRunner = Boolean(options.isTest);

  // Only allow simulation if DEV Preview is active OR test runner is active
  return isDevPreview || isTestRunner;
}

// ============================================================================
// MOCK ADAPTER (Strictly for DEV Preview & isolated test scenarios)
// ============================================================================
export const mockVaultAdapter = {
  fetch(scenario, lang = 'vi') {
    const msgs = vaultStatusMessages[lang] || vaultStatusMessages.vi;
    switch (scenario) {
      case 'empty':
        return null;

      case 'unauthorized': {
        const err = new Error(msgs.unauthorized);
        err.status = 401;
        err.code = 'UNAUTHORIZED';
        throw err;
      }

      case 'forbidden': {
        const err = new Error(msgs.forbidden);
        err.status = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }

      case 'not_found': {
        const err = new Error(msgs.notFound);
        err.status = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      case 'network_error': {
        const err = new Error(msgs.networkError);
        err.status = 0;
        err.code = 'NETWORK_ERROR';
        throw err;
      }

      case 'server_error': {
        const err = new Error(msgs.serverError);
        err.status = 500;
        err.code = 'INTERNAL_SERVER_ERROR';
        throw err;
      }

      case 'create_modal':
      case 'validation_error':
      case 'exists':
      default:
        return {
          id: 'vlt-9c1f0b6e-4a2b',
          vault_name:
            lang === 'en'
              ? 'Vance Family Heritage Sanctuary'
              : 'Kho Di Sản Gia Đình Vance',
          name:
            lang === 'en'
              ? 'Vance Family Heritage Sanctuary'
              : 'Kho Di Sản Gia Đình Vance',
          description:
            lang === 'en'
              ? 'A secure sanctuary safeguarding digital assets, family wishes, and heritage directives for future generations.'
              : 'Không gian số an toàn lưu giữ tài sản, ý nguyện gia đình và chỉ dẫn bàn giao cho thế hệ mai sau.',
          status: 'ACTIVE',
          created_at: '2026-10-10T08:00:00Z',
          updated_at: '2026-10-10T08:00:00Z',
          isSimulation: true,
        };
    }
  },

  create(rawName, rawDesc, scenario = 'success', lang = 'vi') {
    const msgs = vaultStatusMessages[lang] || vaultStatusMessages.vi;
    if (scenario === 'network_error') {
      const err = new Error(msgs.networkError);
      err.status = 0;
      err.code = 'NETWORK_ERROR';
      throw err;
    }

    if (scenario === 'forbidden') {
      const err = new Error(msgs.limitExceeded);
      err.status = 403;
      err.code = 'VAULT_LIMIT_EXCEEDED';
      throw err;
    }

    return {
      id: 'vlt-new-' + Date.now().toString(36),
      vault_name: rawName,
      name: rawName,
      description: rawDesc,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      isSimulation: true,
      message: msgs.createdSuccess,
    };
  },
};

// ============================================================================
// LIVE ADAPTER (Connects to Spring Boot Backend API)
// ============================================================================
export const liveVaultAdapter = {
  async fetch(options = {}) {
    const lang = options.lang || 'vi';
    const msgs = vaultStatusMessages[lang] || vaultStatusMessages.vi;
    const activeFetch = options.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);

    if (!activeFetch) {
      const err = new Error(msgs.networkError);
      err.status = 0;
      err.code = 'NETWORK_ERROR';
      throw err;
    }

    try {
      const response = await activeFetch('/api/v1/vaults', {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      const contentType = response.headers?.get?.('content-type') || '';
      const isJson = contentType.includes('application/json');

      if (!isJson) {
        const err = new Error(msgs.backendNotReady);
        err.status = response.status;
        err.code = 'BACKEND_NOT_READY';
        throw err;
      }

      if (!response.ok) {
        if (response.status === 401) {
          const err = new Error(msgs.unauthorized);
          err.status = 401;
          err.code = 'UNAUTHORIZED';
          throw err;
        }
        if (response.status === 403) {
          const err = new Error(msgs.forbidden);
          err.status = 403;
          err.code = 'FORBIDDEN';
          throw err;
        }
        if (response.status === 404) {
          // Vault not created yet for this owner -> returns null (Empty State)
          return null;
        }
        const err = new Error(msgs.serverError);
        err.status = response.status;
        err.code = 'SERVER_ERROR';
        throw err;
      }

      const data = await response.json();
      const vaultItem = Array.isArray(data?.content) ? data.content[0] : (Array.isArray(data) ? data[0] : data);
      if (!vaultItem) return null;

      return {
        id: vaultItem.id || null,
        vault_name: vaultItem.name || vaultItem.vault_name,
        name: vaultItem.name || vaultItem.vault_name,
        description: vaultItem.description || '',
        status: vaultItem.status || 'ACTIVE',
        created_at: vaultItem.createdAt || vaultItem.created_at || null,
        updated_at: vaultItem.updatedAt || vaultItem.updated_at || null,
        isSimulation: false,
      };
    } catch (error) {
      if (error.status !== undefined) throw error;
      const err = new Error(msgs.networkError);
      err.status = 0;
      err.code = 'NETWORK_ERROR';
      throw err;
    }
  },

  async create(rawName, rawDesc, options = {}) {
    const lang = options.lang || 'vi';
    const msgs = vaultStatusMessages[lang] || vaultStatusMessages.vi;
    const activeFetch = options.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);

    if (!activeFetch) {
      const err = new Error(msgs.networkError);
      err.status = 0;
      err.code = 'NETWORK_ERROR';
      throw err;
    }

    try {
      const response = await activeFetch('/api/v1/vaults', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          name: rawName,
          description: rawDesc,
        }),
      });

      const contentType = response.headers?.get?.('content-type') || '';
      const isJson = contentType.includes('application/json');

      if (!isJson) {
        const err = new Error(msgs.backendNotReady);
        err.status = response.status;
        err.code = 'BACKEND_NOT_READY';
        throw err;
      }

      if (!response.ok) {
        if (response.status === 401) {
          const err = new Error(msgs.unauthorized);
          err.status = 401;
          err.code = 'UNAUTHORIZED';
          throw err;
        }
        if (response.status === 403 || response.status === 409) {
          const err = new Error(msgs.limitExceeded);
          err.status = response.status;
          err.code = 'VAULT_LIMIT_EXCEEDED';
          throw err;
        }
        const data = await response.json().catch(() => ({}));
        const err = new Error(data.message || msgs.serverError);
        err.status = response.status;
        err.code = data.code || 'SERVER_ERROR';
        throw err;
      }

      const created = await response.json();
      return {
        id: created.id || null,
        vault_name: created.name || created.vault_name || rawName,
        name: created.name || created.vault_name || rawName,
        description: created.description || rawDesc,
        status: created.status || 'ACTIVE',
        created_at: created.createdAt || created.created_at || null,
        updated_at: created.updatedAt || created.updated_at || null,
        isSimulation: false,
        message: msgs.createdSuccess,
      };
    } catch (error) {
      if (error.status !== undefined) throw error;
      const err = new Error(msgs.networkError);
      err.status = 0;
      err.code = 'NETWORK_ERROR';
      throw err;
    }
  },
};

/**
 * Fetch Vault details for the authenticated Vault Owner
 * @param {Object} options - { scenario, isDevPreview, isTest, testEnv, lang, fetchFn }
 * @returns {Promise<Object|null>}
 */
export async function fetchVault(options = {}) {
  const lang = options.lang || 'vi';

  if (isSimulationPermitted(options)) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return mockVaultAdapter.fetch(options.scenario, lang);
  }

  return liveVaultAdapter.fetch(options);
}

/**
 * Create a new Vault for the authenticated Vault Owner
 * @param {Object} input - { vault_name, description } or { name, description }
 * @param {Object} options - { lang, scenario, isDevPreview, isTest, testEnv, fetchFn }
 * @returns {Promise<Object>}
 */
export async function createVault(input = {}, options = {}) {
  const lang = options.lang || 'vi';

  const errors = validateVaultInput(input, lang);
  if (Object.keys(errors).length > 0) {
    const err = new Error(
      lang === 'vi'
        ? 'Dữ liệu khởi tạo kho không hợp lệ. Vui lòng kiểm tra lại.'
        : 'Invalid vault creation data. Please verify your inputs.'
    );
    err.status = 400;
    err.code = 'VALIDATION_FAILED';
    err.fieldErrors = errors;
    throw err;
  }

  const rawName = (input.vault_name !== undefined ? input.vault_name : input.name || '').trim();
  const rawDesc = (input.description || '').trim();

  if (isSimulationPermitted(options)) {
    await new Promise((resolve) => setTimeout(resolve, 450));
    return mockVaultAdapter.create(rawName, rawDesc, options.scenario || 'success', lang);
  }

  return liveVaultAdapter.create(rawName, rawDesc, options);
}
