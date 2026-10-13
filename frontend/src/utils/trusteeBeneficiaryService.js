/**
 * LegacyVault — Trustee & Beneficiary Service Layer (PS-8 / ST-04-05)
 *
 * SPECIFICATION & BUSINESS RULES:
 * 1. Trustee is OPTIONAL (user may choose not to configure one).
 * 2. Trustee status is strictly: APPOINTED | REVOKED, never ACTIVE.
 * 3. Trustee does NOT need an account (no userId, no login credentials).
 * 4. Trustee has NO unlock/decrypt/view-secret permissions.
 * 5. Trustee is NOT automatically a Beneficiary.
 * 6. Max 1 current Trustee per Vault (duplicate returns 409 TRUSTEE_ALREADY_EXISTS).
 * 7. Beneficiary does NOT need an account (no userId, no account creation).
 * 8. Beneficiary has NO Claim Link, NO Guest Portal, NO Beneficiary OTP.
 * 9. NO allocation percentage or share ratio.
 * 10. At least 1 Beneficiary is required for configuration readiness.
 * 11. No runtime mock storage or persistence of skip state.
 */

export const DEFAULT_VAULT_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Get appointed Trustee for a given Vault
 *
 * @param {string} vaultId
 * @param {Object} [options]
 * @param {typeof fetch} [options.fetchFn]
 * @returns {Promise<Array<Object>>} List of appointed trustees (status: APPOINTED)
 */
export async function getTrustees(vaultId = DEFAULT_VAULT_ID, options = {}) {
  const fetcher = options.fetchFn || globalThis.fetch;
  const response = await fetcher(`/api/v1/trustees?vaultId=${encodeURIComponent(vaultId)}`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    if (response.status === 404) return [];
    const error = new Error(`Failed to fetch trustees (${response.status})`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  const list = Array.isArray(data) ? data : data.content || data.items || [];
  // Contract requirement: APPOINTED, never ACTIVE
  return list.filter((t) => t.status === 'APPOINTED');
}

/**
 * Add a new Trustee to the Vault
 *
 * Business rule: Max 1 current Trustee per Vault.
 * Status must be APPOINTED.
 * Duplicate returns 409 TRUSTEE_ALREADY_EXISTS.
 *
 * @param {string} vaultId
 * @param {Object} trusteeData
 * @param {string} trusteeData.fullName
 * @param {string} [trusteeData.phone]
 * @param {string} [trusteeData.email]
 * @param {string} [trusteeData.relationship]
 * @param {string} [trusteeData.note]
 * @param {Object} [options]
 * @param {typeof fetch} [options.fetchFn]
 * @returns {Promise<Object>} Created TrusteeResponse
 */
export async function createTrustee(vaultId = DEFAULT_VAULT_ID, trusteeData = {}, options = {}) {
  const payload = {
    vaultId,
    fullName: (trusteeData.fullName || '').trim(),
    phone: (trusteeData.phone || '').trim() || null,
    email: (trusteeData.email || '').trim() || null,
    relationship: (trusteeData.relationship || '').trim() || null,
    note: (trusteeData.note || '').trim() || null,
  };

  const fetcher = options.fetchFn || globalThis.fetch;
  const response = await fetcher('/api/v1/trustees', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 201 || response.ok) {
    return await response.json();
  }

  if (response.status === 409) {
    const errData = await response.json().catch(() => ({}));
    const backendCode = errData.code || 'CONFLICT';
    let defaultMsg = 'Yêu cầu xung đột với trạng thái hiện tại của két.';
    if (backendCode === 'TRUSTEE_ALREADY_EXISTS') {
      defaultMsg = 'Mỗi két chỉ có tối đa 1 Người giám hộ hiện tại.';
    } else if (backendCode === 'VAULT_NOT_EDITABLE') {
      defaultMsg = 'Két đang ở trạng thái không thể chỉnh sửa.';
    }
    const error = new Error(errData.message || defaultMsg);
    error.code = backendCode;
    error.status = 409;
    throw error;
  }

  const errData = await response.json().catch(() => ({}));
  const error = new Error(errData.message || `Lỗi khi thêm Người giám hộ (${response.status})`);
  error.status = response.status;
  error.code = errData.code || 'TRUSTEE_CREATE_FAILED';
  throw error;
}

/**
 * Get all Beneficiaries for a Vault
 *
 * @param {string} vaultId
 * @param {Object} [options]
 * @param {typeof fetch} [options.fetchFn]
 * @returns {Promise<Array<Object>>}
 */
export async function getBeneficiaries(vaultId = DEFAULT_VAULT_ID, options = {}) {
  const fetcher = options.fetchFn || globalThis.fetch;
  const response = await fetcher(`/api/v1/vaults/${encodeURIComponent(vaultId)}/beneficiaries`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    if (response.status === 404) return [];
    const error = new Error(`Failed to fetch beneficiaries (${response.status})`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  return Array.isArray(data) ? data : data.content || data.items || [];
}

/**
 * Add a new Beneficiary to a Vault.
 *
 * Business rules:
 * - Beneficiary does NOT need an account (no userId).
 * - No Claim Link, no Guest Portal, no Beneficiary OTP.
 * - No allocation percentage or share ratio.
 *
 * @param {string} vaultId
 * @param {Object} beneficiaryData
 * @param {string} beneficiaryData.fullName
 * @param {string} [beneficiaryData.relationship]
 * @param {string} [beneficiaryData.dateOfBirth] YYYY-MM-DD
 * @param {string} [beneficiaryData.phone]
 * @param {string} [beneficiaryData.email]
 * @param {Object} [options]
 * @param {typeof fetch} [options.fetchFn]
 * @returns {Promise<Object>} Created BeneficiaryResponse
 */
export async function createBeneficiary(vaultId = DEFAULT_VAULT_ID, beneficiaryData = {}, options = {}) {
  const payload = {
    fullName: (beneficiaryData.fullName || '').trim(),
    relationship: (beneficiaryData.relationship || '').trim() || null,
    dateOfBirth: beneficiaryData.dateOfBirth ? String(beneficiaryData.dateOfBirth).trim() : null,
    phone: (beneficiaryData.phone || '').trim() || null,
    email: (beneficiaryData.email || '').trim() || null,
  };

  const fetcher = options.fetchFn || globalThis.fetch;
  const response = await fetcher(`/api/v1/vaults/${encodeURIComponent(vaultId)}/beneficiaries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 201 || response.ok) {
    return await response.json();
  }

  const errData = await response.json().catch(() => ({}));
  const error = new Error(errData.message || `Lỗi khi thêm Người thụ hưởng (${response.status})`);
  error.status = response.status;
  error.code = errData.code || 'BENEFICIARY_CREATE_FAILED';
  throw error;
}

/**
 * Determine whether the Vault setup meets configuration readiness:
 * - At least 1 Beneficiary is required for readiness.
 * - Trustee is optional.
 *
 * @param {string} vaultId
 * @param {Object} [options]
 * @param {typeof fetch} [options.fetchFn]
 * @returns {Promise<{ isReady: boolean, beneficiaryCount: number, hasTrustee: boolean }>}
 */
export async function checkConfigurationReadiness(vaultId = DEFAULT_VAULT_ID, options = {}) {
  const fetcher = options.fetchFn || globalThis.fetch;
  let backendChecked = false;
  let backendReady = false;
  let count = 0;

  try {
    const response = await fetcher(`/api/v1/vaults/${encodeURIComponent(vaultId)}/configuration-check`, {
      headers: { Accept: 'application/json' },
    });
    if (response.ok) {
      const data = await response.json();
      backendChecked = true;
      backendReady = Boolean(data.ready);
      count = data.beneficiaryCount ?? 0;
    }
  } catch {
    // If endpoint is not implemented, fallback to checking beneficiaries list directly
  }

  const trustees = await getTrustees(vaultId, options).catch(() => []);

  if (backendChecked) {
    return {
      isReady: backendReady,
      beneficiaryCount: count,
      hasTrustee: trustees.length > 0,
    };
  }

  const beneficiaries = await getBeneficiaries(vaultId, options).catch(() => []);
  return {
    isReady: beneficiaries.length >= 1,
    beneficiaryCount: beneficiaries.length,
    hasTrustee: trustees.length > 0,
  };
}
