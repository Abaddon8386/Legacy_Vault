import { ApiError } from '../../api/http.js';
/**
 * staffLegalDocumentsService.js
 * Kết nối API quản lý hồ sơ và văn bản căn cứ pháp lý của Staff (PS-96).
 * Sử dụng transport uploader từ PS-98.
 */

import { uploadEvidenceMultipart } from '../../utils/staffEvidenceUpload.js';
import { isStaffSimulationPermitted } from './staffCasePreview.js';
import { readStaffBasisVersionContent } from './staffLiveService.js';

export const SYNTHETIC_DOSSIERS = {
  'case-notarial': {
    id: 'dossier-001',
    caseId: '6f1a4c2d-0000-4000-8000-000000000001',
    route: 'NOTARIAL',
    status: 'LEGAL_BASIS_PROVIDED',
    disputeStatus: 'NONE',
    routeReason: null, // Staff không thấy lý do phân loại
    classifiedBy: '00000000-0000-0000-0000-000000000002',
    createdAt: '2026-10-18T08:00:00Z',
    updatedAt: '2026-10-18T09:30:00Z',
    requiredVersion: 1,
    versions: [
      {
        version: 1,
        legalBasisType: 'NOTARIAL_PARTITION',
        issuingAuthority: 'Văn phòng Công chứng Thăng Long',
        documentNumber: '118/2026/VB-CC',
        issueDate: '2026-10-15',
        notaryAuthority: 'Văn phòng Công chứng Thăng Long',
        notarialDocumentNumber: '118/2026/VB-CC',
        notarizedAt: '2026-10-15',
        evidenceReference: 'HS-2026-TL-09',
        notes: 'Văn bản thỏa thuận phân chia di sản giữa các đồng thừa kế',
        contentType: 'application/pdf',
        sizeBytes: 2450000,
        sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
        forwardStatus: 'NOT_FORWARDED',
        createdBy: '00000000-0000-0000-0000-000000000003',
        createdAt: '2026-10-18T09:30:00Z',
        forwardedAt: null,
        current: true,
        allocations: [],
      },
    ],
  },
  'case-court': {
    id: 'dossier-002',
    caseId: '6f1a4c2d-0000-4000-8000-000000000002',
    route: 'COURT',
    status: 'DRAFT',
    disputeStatus: 'DISPUTED',
    routeReason: null,
    classifiedBy: '00000000-0000-0000-0000-000000000002',
    createdAt: '2026-10-19T10:00:00Z',
    updatedAt: '2026-10-19T10:00:00Z',
    requiredVersion: 1,
    versions: [],
  },
  'case-hold': {
    id: 'dossier-003',
    caseId: '6f1a4c2d-0000-4000-8000-000000000003',
    route: 'ON_HOLD',
    status: 'DRAFT',
    disputeStatus: 'UNDETERMINED',
    routeReason: null,
    classifiedBy: '00000000-0000-0000-0000-000000000002',
    createdAt: '2026-10-17T07:00:00Z',
    updatedAt: '2026-10-17T07:00:00Z',
    requiredVersion: 1,
    versions: [],
  },
};

/**
 * Tải thông tin hồ sơ căn cứ pháp lý của ca (GET /api/v1/staff/verification-cases/{caseId}/basis-dossier)
 */
export async function fetchBasisDossier(caseId, options = {}) {
  const { accessToken, signal, lang = 'vi' } = options;

  if (signal?.aborted) {
    const abortErr = new Error('Request aborted');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  if (!caseId) {
    const err = new Error(lang === 'en' ? 'Case ID is required.' : 'Thiếu mã hồ sơ xác minh.');
    err.code = 'CASE_ID_REQUIRED';
    throw err;
  }

  // Chế độ DEV preview khi không có token
  if (isStaffSimulationPermitted(options)) {
    const isTest = Boolean(options.isTest || (typeof globalThis !== 'undefined' && globalThis.IS_REACT_ACT_ENVIRONMENT));
    if (!isTest) {
      await new Promise((r) => setTimeout(r, 150));
    }
    if (signal?.aborted) {
      const abortErr = new Error('Request aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    if (caseId === 'case-not-found' || caseId === '00000000-0000-0000-0000-000000000404') {
      return { dossier: null, notFound: true, isSimulation: true };
    }
    if (caseId === 'case-court' || caseId === SYNTHETIC_DOSSIERS['case-court'].caseId) {
      return {
        dossier: JSON.parse(JSON.stringify(SYNTHETIC_DOSSIERS['case-court'])),
        notFound: false,
        isSimulation: true,
      };
    }
    if (caseId === 'case-hold' || caseId === SYNTHETIC_DOSSIERS['case-hold'].caseId) {
      return {
        dossier: JSON.parse(JSON.stringify(SYNTHETIC_DOSSIERS['case-hold'])),
        notFound: false,
        isSimulation: true,
      };
    }

    if (caseId === 'case-notarial' || caseId === SYNTHETIC_DOSSIERS['case-notarial'].caseId) {
      return {
        dossier: JSON.parse(JSON.stringify(SYNTHETIC_DOSSIERS['case-notarial'])),
        notFound: false,
        isSimulation: true,
      };
    }

    return {
      dossier: JSON.parse(JSON.stringify(SYNTHETIC_DOSSIERS['case-court'])),
      notFound: false,
      isSimulation: true,
    };
  }

  // Chế độ gọi API thật
  const res = await fetch(`/api/v1/staff/verification-cases/${caseId}/basis-dossier`, {
    method: 'GET',
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      'Accept-Language': lang,
    },
    signal,
  });

  if (res.status === 404) {
    // Chưa có dossier do Legal tạo
    return { dossier: null, notFound: true, isSimulation: false };
  }

  if (!res.ok) {
    let errBody;
    try {
      errBody = await res.json();
    } catch {
      errBody = null;
    }
    const error = new Error(errBody?.message || (lang === 'en' ? 'Failed to fetch legal basis dossier.' : 'Không thể tải hồ sơ căn cứ pháp lý.'));
    error.status = res.status;
    error.code = errBody?.code || (res.status === 403 ? 'ACCESS_DENIED' : 'LOAD_DOSSIER_FAILED');
    throw error;
  }

  const dossier = await res.json();
  return { dossier, notFound: false, isSimulation: false };
}

/**
 * Tiếp nhận một phiên bản văn bản căn cứ pháp lý (POST multipart/form-data)
 */
export async function uploadBasisVersion(caseId, { metadata, file }, options = {}) {
  const { accessToken, signal, lang = 'vi', onProgress, onStatusChange } = options;

  if (signal?.aborted) {
    const abortErr = new Error('Request aborted');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  if (!caseId) {
    const err = new Error(lang === 'en' ? 'Case ID is required.' : 'Thiếu mã hồ sơ xác minh.');
    err.code = 'CASE_ID_REQUIRED';
    throw err;
  }

  // Chế độ DEV preview
  if (isStaffSimulationPermitted(options)) {
    const isTest = Boolean(options.isTest || (typeof globalThis !== 'undefined' && globalThis.IS_REACT_ACT_ENVIRONMENT));
    if (onProgress) {
      onProgress({ phase: 'uploading', loaded: 0, total: file?.size || 1000, percent: 0, indeterminate: false });
    }
    if (!isTest) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (onProgress) {
      onProgress({ phase: 'uploading', loaded: file?.size || 1000, total: file?.size || 1000, percent: 100, indeterminate: false });
      onProgress({ phase: 'processing', loaded: file?.size || 1000, total: file?.size || 1000, percent: 100, indeterminate: true });
    }
    if (!isTest) {
      await new Promise((r) => setTimeout(r, 200));
    }

    if (signal?.aborted) {
      const abortErr = new Error('Request aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    const newVersion = {
      version: 1,
      legalBasisType: metadata.legalBasisType || 'NOTARIAL_PARTITION',
      issuingAuthority: metadata.issuingAuthority,
      documentNumber: metadata.documentNumber,
      issueDate: metadata.issueDate,
      notaryAuthority: metadata.notaryAuthority || null,
      notarialDocumentNumber: metadata.notarialDocumentNumber || null,
      notarizedAt: metadata.notarizedAt || null,
      evidenceReference: metadata.evidenceReference || null,
      notes: metadata.notes || null,
      contentType: file?.type || 'application/pdf',
      sizeBytes: file?.size || 1500000,
      sha256: 'simulated-hash-' + Math.random().toString(16).slice(2, 10),
      forwardStatus: 'NOT_FORWARDED',
      createdBy: '00000000-0000-0000-0000-000000000003',
      createdAt: new Date().toISOString(),
      forwardedAt: null,
      current: true,
      allocations: metadata.allocations || [],
    };

    const simulatedDossier = {
      id: 'dossier-simulated',
      caseId,
      route: metadata.legalBasisType === 'NOTARIAL_PARTITION' ? 'NOTARIAL' : 'COURT',
      status: 'LEGAL_BASIS_PROVIDED',
      disputeStatus: metadata.legalBasisType === 'NOTARIAL_PARTITION' ? 'NONE' : 'DISPUTED',
      routeReason: null,
      classifiedBy: '00000000-0000-0000-0000-000000000002',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      requiredVersion: 1,
      versions: [newVersion],
    };

    if (onProgress) {
      onProgress({ phase: 'success', loaded: file?.size || 1000, total: file?.size || 1000, percent: 100, indeterminate: false });
    }
    return simulatedDossier;
  }

  // Gọi endpoint multipart backend thực tế qua PS-98 transport
  const url = `/api/v1/staff/verification-cases/${caseId}/basis-dossier/versions`;
  return uploadEvidenceMultipart({
    url,
    metadata,
    file,
    token: accessToken,
    lang,
    signal,
    onProgress,
    onStatusChange,
  });
}

/**
 * Chuyển phiên bản mới nhất cho Legal thẩm định (POST .../versions/{version}/forward)
 */
export async function forwardBasisVersion(caseId, version, options = {}) {
  const { accessToken, signal, lang = 'vi' } = options;

  if (signal?.aborted) {
    const abortErr = new Error('Request aborted');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  if (!caseId || typeof version !== 'number') {
    const err = new Error(lang === 'en' ? 'Case ID and version are required.' : 'Thiếu mã hồ sơ hoặc số phiên bản.');
    err.code = 'INVALID_FORWARD_PARAMS';
    throw err;
  }

  // Chế độ DEV preview
  if (isStaffSimulationPermitted(options)) {
    const isTest = Boolean(options.isTest || (typeof globalThis !== 'undefined' && globalThis.IS_REACT_ACT_ENVIRONMENT));
    if (!isTest) {
      await new Promise((r) => setTimeout(r, 150));
    }
    if (signal?.aborted) {
      const abortErr = new Error('Request aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    return {
      id: 'dossier-simulated',
      caseId,
      route: 'COURT',
      status: 'LEGAL_BASIS_FORWARDED',
      disputeStatus: 'DISPUTED',
      routeReason: null,
      updatedAt: new Date().toISOString(),
      versions: [
        {
          version,
          forwardStatus: 'FORWARDED',
          forwardedAt: new Date().toISOString(),
          current: true,
        },
      ],
      isSimulation: true,
    };
  }

  const res = await fetch(`/api/v1/staff/verification-cases/${caseId}/basis-dossier/versions/${version}/forward`, {
    method: 'POST',
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      'Accept-Language': lang,
    },
    signal,
  });

  if (!res.ok) {
    let errBody;
    try {
      errBody = await res.json();
    } catch {
      errBody = null;
    }
    const error = new Error(errBody?.message || (lang === 'en' ? 'Failed to forward legal basis to Legal.' : 'Chuyển hồ sơ căn cứ cho ban pháp lý thất bại.'));
    error.status = res.status;
    error.code = errBody?.code || (res.status === 409 ? 'BASIS_VERSION_STALE' : 'FORWARD_FAILED');
    throw error;
  }

  return res.json();
}

/**
 * Đọc nội dung file số hóa của phiên bản căn cứ pháp lý (GET .../versions/{versionNo}/content - PS-103)
 */
export async function readBasisVersionContent(caseId, versionNo, options = {}) {
  const { signal, lang = 'vi' } = options;

  if (signal?.aborted) {
    const abortErr = new Error('Request aborted');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  if (!caseId || typeof versionNo !== 'number' || versionNo < 1) {
    const err = new Error(lang === 'en' ? 'Case ID and valid version number are required.' : 'Thiếu mã hồ sơ hoặc số phiên bản hợp lệ.');
    err.code = 'INVALID_CONTENT_PARAMS';
    throw err;
  }

  if (isStaffSimulationPermitted(options)) {
    const isTest = Boolean(options.isTest || (typeof globalThis !== 'undefined' && globalThis.IS_REACT_ACT_ENVIRONMENT));
    if (!isTest) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (signal?.aborted) {
      const abortErr = new Error('Request aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    return new Blob([`Simulated COURT Basis Document Content for Version ${versionNo}`], {
      type: 'application/pdf',
    });
  }

  const token = options.accessToken || options.session?.accessToken;
  return readStaffBasisVersionContent(caseId, versionNo, { ...options, accessToken: token });
}

/**
 * Tải danh mục tài sản trước thời điểm mở khóa (PS-118, PR #190)
 * GET /api/v1/staff/verification-cases/{caseId}/assets?page=0&size=100
 */
export async function fetchStaffAssetCatalog(caseId, options = {}) {
  const { accessToken, signal, lang = 'vi', page = 0, size = 100, fetchAll = true } = options;

  if (signal?.aborted) {
    const abortErr = new Error('Request aborted');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  if (!caseId) {
    const err = new Error(lang === 'en' ? 'Case ID is required.' : 'Thiếu mã hồ sơ xác minh.');
    err.code = 'CASE_ID_REQUIRED';
    throw err;
  }

  if (isStaffSimulationPermitted(options)) {
    return [
      { assetId: '11111111-1111-4111-8111-111111111111', assetType: 'REAL_ESTATE', name: lang === 'en' ? 'Penthouse Apartment Landmark 81' : 'Căn hộ Penthouse Landmark 81' },
      { assetId: '33333333-3333-4333-8333-333333333333', assetType: 'BANK_ACCOUNT', name: lang === 'en' ? 'Vietcombank Savings Account' : 'Tài khoản tiết kiệm Vietcombank' },
      { assetId: '55555555-5555-4555-8555-555555555555', assetType: 'CRYPTOCURRENCY', name: lang === 'en' ? 'Bitcoin Vault Storage' : 'Kho lưu trữ Bitcoin' },
    ];
  }

  const fetchPage = async (p, s) => {
    const res = await fetch(`/api/v1/staff/verification-cases/${caseId}/assets?page=${p}&size=${s}`, {
      method: 'GET',
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        'Accept-Language': lang,
      },
      signal,
    });

    if (!res.ok) {
      let errBody;
      try { errBody = await res.json(); } catch { errBody = null; }
      const error = new Error(errBody?.message || (lang === 'en' ? 'Failed to fetch asset catalog.' : 'Không thể tải danh mục tài sản.'));
      error.status = res.status;
      error.code = errBody?.code || (res.status === 404 ? 'RESOURCE_NOT_FOUND' : 'ASSET_CATALOG_FAILED');
      throw error;
    }

    const pageData = await res.json();
    if (!pageData || !Array.isArray(pageData.content)
      || pageData.page !== p || pageData.size !== s
      || !Number.isSafeInteger(pageData.totalPages) || pageData.totalPages < 0
      || !Number.isSafeInteger(pageData.totalElements) || pageData.totalElements < 0) {
      const error = new Error(lang === 'en' ? 'Invalid asset catalog response.' : 'Dữ liệu danh mục tài sản không hợp lệ.');
      error.code = 'INVALID_RESPONSE';
      throw error;
    }
    return pageData;
  };

  if (!fetchAll) {
    const firstPage = await fetchPage(page, size);
    return firstPage.content;
  }

  let currentPage = 0;
  const pageSize = Math.min(size, 100);
  let allAssets = [];
  while (true) {
    const pageData = await fetchPage(currentPage, pageSize);
    allAssets = allAssets.concat(pageData.content);
    currentPage++;
    if (currentPage >= pageData.totalPages || pageData.content.length === 0) {
      break;
    }
  }
  return allAssets;
}

/**
 * Tải danh sách người thụ hưởng của ca tại quầy (PS-88, PR #193)
 * GET /api/v1/staff/verification-cases/{caseId}/beneficiaries
 */
export async function fetchStaffCaseBeneficiaries(caseId, options = {}) {
  const { accessToken, signal, lang = 'vi' } = options;

  if (signal?.aborted) {
    const abortErr = new Error('Request aborted');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  if (!caseId) {
    const err = new Error(lang === 'en' ? 'Case ID is required.' : 'Thiếu mã hồ sơ xác minh.');
    err.code = 'CASE_ID_REQUIRED';
    throw err;
  }

  if (isStaffSimulationPermitted(options)) {
    return [
      { beneficiaryId: '22222222-2222-4222-8222-222222222222', fullName: 'Trần Minh Quang', relationship: lang === 'en' ? 'Son' : 'Con trai' },
      { beneficiaryId: '44444444-4444-4444-8444-444444444444', fullName: 'Trần Thảo Ly', relationship: lang === 'en' ? 'Daughter' : 'Con gái' },
    ];
  }

  const res = await fetch(`/api/v1/staff/verification-cases/${caseId}/beneficiaries`, {
    method: 'GET',
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      'Accept-Language': lang,
    },
    signal,
  });

  if (!res.ok) {
    let errBody;
    try { errBody = await res.json(); } catch { errBody = null; }
    const error = new Error(errBody?.message || (lang === 'en' ? 'Failed to fetch beneficiaries.' : 'Không thể tải danh sách người thụ hưởng.'));
    error.status = res.status;
    error.code = errBody?.code || (res.status === 404 ? 'RESOURCE_NOT_FOUND' : 'BENEFICIARIES_FAILED');
    throw error;
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    const error = new Error(lang === 'en' ? 'Invalid beneficiaries response.' : 'Dữ liệu người thụ hưởng không hợp lệ.');
    error.code = 'INVALID_RESPONSE';
    throw error;
  }
  return data;
}

// Keep the saved receipt when forwarding fails; a second upload would create a duplicate version.
export async function receiveAndForwardBasisVersion(caseId, payload, options = {}, transports = {}) {
  const upload = transports.upload || uploadBasisVersion, forward = transports.forward || forwardBasisVersion;
  const received = await upload(caseId, payload, options);
  if(options.signal?.aborted)throw new DOMException('Request cancelled','AbortError');
  if(received?.caseId!==caseId || !Array.isArray(received.versions) || !received.versions.length
      || !received.versions.every(v=>Number.isSafeInteger(v.version)&&v.version>0))throw new ApiError('INVALID_RESPONSE');
  const version=Math.max(...received.versions.map(v=>v.version));
  try {
    const dossier=await forward(caseId,version,options);
    if(options.signal?.aborted)throw new DOMException('Request cancelled','AbortError');
    if(dossier?.caseId!==caseId || dossier.status!=='LEGAL_BASIS_FORWARDED'
        || !dossier.versions?.some(v=>v.version===version&&v.forwardStatus==='FORWARDED'))throw new ApiError('INVALID_RESPONSE');
    return {dossier,error:null};
  } catch(error) {
    if(options.signal?.aborted || error.name==='AbortError')throw error;
    return {dossier:received,error};
  }
}
