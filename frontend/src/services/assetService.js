const API_BASE = '/api/v1'

function normalizeError(error, response, errorBody, defaultCode) {
  if (error?.name === 'AbortError') {
    throw error
  }

  const err = new Error(
    errorBody?.message || error?.message || `HTTP ${response?.status || 'Error'}`
  )

  if (errorBody?.code) {
    err.code = errorBody.code
  } else if (response?.status === 401) {
    err.code = 'UNAUTHENTICATED'
  } else if (response?.status === 403) {
    err.code = 'VAULT_ACCESS_DENIED'
  } else if (response?.status === 404) {
    err.code = 'VAULT_NOT_FOUND'
  } else if (response?.status === 400) {
    err.code = 'VALIDATION_FAILED'
  } else if (response?.status === 409) {
    err.code = 'CONFLICT'
  } else if (!response && error) {
    err.code = 'NETWORK_ERROR'
  } else {
    err.code = defaultCode
  }

  err.status = response?.status
  return err
}

/**
 * Validates and normalizes asset response object to ensure
 * write-only protection (no confidential payload reflected).
 */
function sanitizeAssetResponse(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid asset response structure')
  }

  return {
    id: raw.id,
    vaultId: raw.vaultId,
    name: raw.name,
    assetType: raw.assetType,
    description: raw.description ?? null,
    hasPayload: Boolean(raw.hasPayload),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }
}

/**
 * Validates pagination metadata fields expected by PS-5.
 */
function validatePageMetadata(data, requestedPage, requestedSize) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid page response structure')
  }

  const content = Array.isArray(data.content)
    ? data.content.map(sanitizeAssetResponse)
    : []

  const totalElements = typeof data.totalElements === 'number'
    ? data.totalElements
    : content.length

  const size = typeof data.size === 'number' ? data.size : requestedSize
  const page = typeof data.page === 'number' ? data.page : requestedPage
  const totalPages = typeof data.totalPages === 'number'
    ? data.totalPages
    : Math.max(1, Math.ceil(totalElements / (size || 10)))

  return {
    content,
    page,
    size,
    totalElements,
    totalPages,
  }
}

/**
 * PS-5 Asset Service (Contract Aligned, Real API Only)
 */
export const assetService = {
  /**
   * Fetches paged and sorted assets for a specific vault.
   *
   * @param {string} vaultId - Vault UUID
   * @param {Object} [options]
   * @param {number} [options.page=0] - 0-indexed page number
   * @param {number} [options.size=10] - Page size
   * @param {string} [options.sort='createdAt,desc'] - Sort field and direction
   * @param {string} [options.lang='vi'] - Preferred language
   * @param {string} [options.accessToken] - Bearer token
   * @param {AbortSignal} [options.signal] - AbortController signal
   * @returns {Promise<{content: Array, page: number, size: number, totalElements: number, totalPages: number}>}
   */
  async getAssets(vaultId, options = {}) {
    if (!vaultId) {
      const err = new Error('vaultId is required')
      err.code = 'VAULT_REQUIRED'
      throw err
    }

    const {
      page = 0,
      size = 10,
      sort = 'createdAt,desc',
      lang = 'vi',
      accessToken,
      signal,
    } = options

    const searchParams = new URLSearchParams({
      page: String(page),
      size: String(size),
      sort,
    })

    const headers = {
      Accept: 'application/json',
      'Accept-Language': lang,
    }

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    let response
    try {
      response = await fetch(`${API_BASE}/vaults/${encodeURIComponent(vaultId)}/assets?${searchParams.toString()}`, {
        method: 'GET',
        headers,
        signal,
      })
    } catch (networkError) {
      throw normalizeError(networkError, null, null, 'loadError')
    }

    let responseBody = null
    try {
      responseBody = await response.json()
    } catch {
      // Empty or non-JSON body
    }

    if (!response.ok) {
      throw normalizeError(null, response, responseBody, 'loadError')
    }

    return validatePageMetadata(responseBody, page, size)
  },

  /**
   * Creates a new asset inside a vault with write-only confidential payload.
   *
   * @param {string} vaultId - Vault UUID
   * @param {Object} formData
   * @param {string} formData.name - Asset name (1-150 chars)
   * @param {'TEXT'|'CREDENTIAL'} formData.assetType - Asset type enum
   * @param {string} [formData.description] - Optional description (max 1000 chars)
   * @param {string} formData.payload - Confidential payload (write-only)
   * @param {Object} [options]
   * @param {string} [options.lang='vi'] - Preferred language
   * @param {string} [options.accessToken] - Bearer token
   * @returns {Promise<Object>} Created asset metadata (without plaintext payload)
   */
  async createAsset(vaultId, formData, options = {}) {
    if (!vaultId) {
      const err = new Error('vaultId is required')
      err.code = 'VAULT_REQUIRED'
      throw err
    }

    if (!formData || typeof formData !== 'object') {
      const err = new Error('Form data is required')
      err.code = 'VALIDATION_FAILED'
      throw err
    }

    const trimmedName = formData.name ? String(formData.name).trim() : ''
    if (!trimmedName || trimmedName.length > 150) {
      const err = new Error('Asset name is invalid or exceeds 150 characters')
      err.code = 'VALIDATION_FAILED'
      throw err
    }

    if (!['TEXT', 'CREDENTIAL'].includes(formData.assetType)) {
      const err = new Error('Asset type must be TEXT or CREDENTIAL')
      err.code = 'VALIDATION_FAILED'
      throw err
    }

    if (!formData.payload || !String(formData.payload).trim()) {
      const err = new Error('Confidential payload is required')
      err.code = 'VALIDATION_FAILED'
      throw err
    }

    if (formData.description && formData.description.length > 1000) {
      const err = new Error('Description exceeds 1000 characters')
      err.code = 'VALIDATION_FAILED'
      throw err
    }

    const { lang = 'vi', accessToken } = options

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Language': lang,
    }

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    const requestPayload = {
      name: trimmedName,
      assetType: formData.assetType,
      description: formData.description ? String(formData.description).trim() : null,
      payload: formData.payload,
    }

    let response
    try {
      response = await fetch(`${API_BASE}/vaults/${encodeURIComponent(vaultId)}/assets`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestPayload),
      })
    } catch (networkError) {
      throw normalizeError(networkError, null, null, 'saveError')
    }

    let responseBody = null
    try {
      responseBody = await response.json()
    } catch {
      // Empty or non-JSON body
    }

    if (!response.ok) {
      throw normalizeError(null, response, responseBody, 'saveError')
    }

    return sanitizeAssetResponse(responseBody)
  },

  /**
   * Fetches single asset details by ID.
   *
   * @param {string} vaultId - Vault UUID
   * @param {string} assetId - Asset UUID
   * @param {Object} [options]
   * @param {string} [options.lang='vi'] - Preferred language
   * @param {string} [options.accessToken] - Bearer token
   * @param {AbortSignal} [options.signal] - AbortController signal
   * @returns {Promise<Object>} Sanitized asset metadata
   */
  async getAssetById(vaultId, assetId, options = {}) {
    if (!vaultId) {
      const err = new Error('vaultId is required')
      err.code = 'VAULT_REQUIRED'
      throw err
    }

    if (!assetId) {
      const err = new Error('assetId is required')
      err.code = 'ASSET_REQUIRED'
      throw err
    }

    const { lang = 'vi', accessToken, signal } = options

    const headers = {
      Accept: 'application/json',
      'Accept-Language': lang,
    }

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    let response
    try {
      response = await fetch(`${API_BASE}/vaults/${encodeURIComponent(vaultId)}/assets/${encodeURIComponent(assetId)}`, {
        method: 'GET',
        headers,
        signal,
      })
    } catch (networkError) {
      throw normalizeError(networkError, null, null, 'loadError')
    }

    let responseBody = null
    try {
      responseBody = await response.json()
    } catch {
      // Empty or non-JSON body
    }

    if (!response.ok) {
      throw normalizeError(null, response, responseBody, 'loadError')
    }

    return sanitizeAssetResponse(responseBody)
  },

  /**
   * Updates an existing asset via PATCH (name, description, payload only).
   *
   * @param {string} vaultId - Vault UUID
   * @param {string} assetId - Asset UUID
   * @param {Object} patchData
   * @param {string} [patchData.name] - Optional updated name (1-150 chars)
   * @param {string} [patchData.description] - Optional updated description (max 1000 chars)
   * @param {string} [patchData.payload] - Optional new confidential payload (write-only)
   * @param {Object} [options]
   * @param {string} [options.lang='vi'] - Preferred language
   * @param {string} [options.accessToken] - Bearer token
   * @returns {Promise<Object>} Updated asset metadata (without plaintext payload)
   */
  async updateAsset(vaultId, assetId, patchData, options = {}) {
    if (!vaultId) {
      const err = new Error('vaultId is required')
      err.code = 'VAULT_REQUIRED'
      throw err
    }

    if (!assetId) {
      const err = new Error('assetId is required')
      err.code = 'ASSET_REQUIRED'
      throw err
    }

    if (!patchData || typeof patchData !== 'object') {
      const err = new Error('Patch data is required')
      err.code = 'VALIDATION_FAILED'
      throw err
    }

    const requestPayload = {}

    if (patchData.name !== undefined) {
      const trimmedName = String(patchData.name).trim()
      if (!trimmedName || trimmedName.length > 150) {
        const err = new Error('Asset name is invalid or exceeds 150 characters')
        err.code = 'VALIDATION_FAILED'
        throw err
      }
      requestPayload.name = trimmedName
    }

    if (patchData.description !== undefined) {
      const trimmedDesc = patchData.description ? String(patchData.description).trim() : null
      if (trimmedDesc && trimmedDesc.length > 1000) {
        const err = new Error('Description exceeds 1000 characters')
        err.code = 'VALIDATION_FAILED'
        throw err
      }
      requestPayload.description = trimmedDesc
    }

    if (patchData.payload !== undefined) {
      const trimmedPayload = String(patchData.payload).trim()
      if (!trimmedPayload) {
        const err = new Error('Confidential payload cannot be blank')
        err.code = 'VALIDATION_FAILED'
        throw err
      }
      requestPayload.payload = patchData.payload
    }

    if (Object.keys(requestPayload).length === 0) {
      const err = new Error('No valid fields provided for update')
      err.code = 'VALIDATION_FAILED'
      throw err
    }

    const { lang = 'vi', accessToken } = options

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Language': lang,
    }

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    let response
    try {
      response = await fetch(`${API_BASE}/vaults/${encodeURIComponent(vaultId)}/assets/${encodeURIComponent(assetId)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(requestPayload),
      })
    } catch (networkError) {
      throw normalizeError(networkError, null, null, 'editError')
    }

    let responseBody = null
    try {
      responseBody = await response.json()
    } catch {
      // Empty or non-JSON body
    }

    if (!response.ok) {
      throw normalizeError(null, response, responseBody, 'editError')
    }

    return sanitizeAssetResponse(responseBody)
  },
}
