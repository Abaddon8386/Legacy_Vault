/**
 * staffLegalDocumentsService.js
 * Kết nối API quản lý hồ sơ và văn bản căn cứ pháp lý của Staff (PS-96).
 * Sử dụng transport uploader từ PS-98.
 */

import { uploadEvidenceMultipart } from '../../utils/staffEvidenceUpload.js';
import { isStaffSimulationPermitted } from './staffCasePreview.js';

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
      return { dossier: JSON.parse(JSON.stringify(SYNTHETIC_DOSSIERS['case-court'])), isSimulation: true };
    }
    if (caseId === 'case-hold' || caseId === SYNTHETIC_DOSSIERS['case-hold'].caseId) {
      return { dossier: JSON.parse(JSON.stringify(SYNTHETIC_DOSSIERS['case-hold'])), isSimulation: true };
    }

    return {
      dossier: JSON.parse(JSON.stringify(SYNTHETIC_DOSSIERS['case-notarial'])),
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
      route: 'NOTARIAL',
      status: 'LEGAL_BASIS_FORWARDED',
      disputeStatus: 'NONE',
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
