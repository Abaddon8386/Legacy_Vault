/**
 * LegacyVault — Service & Ranh giới tích hợp PS-49: Legal Approval Review
 *
 * RANH GIỚI NGHIỆP VỤ & PHÁP LÝ (LV-DEATH-002 & PS-49):
 * 1. Phê duyệt pháp lý (Legal Approval) phải gắn chặt với:
 *    - Dossier ID (Mã hồ sơ)
 *    - Document Version (Phiên bản chính xác của tài liệu di chúc)
 *    - SHA-256 Hash (Mã băm toàn vẹn của tệp số hóa)
 *    - Allocation Scope (Phạm vi phân bổ tài sản cho người thụ hưởng)
 * 2. Khi version, hash hoặc allocation scope thay đổi, hoặc xuất hiện tranh chấp mới từ BE,
 *    phê duyệt cũ KHÔNG được coi là còn hiệu lực (STALE).
 * 3. Phê duyệt KHÔNG đồng nghĩa Vault đã UNLOCKED, không tự giải mã hoặc bàn giao tài sản.
 * 4. Thiếu dữ liệu phải hiển thị chưa xác định / chưa tải được; tuyệt đối không tự điền
 *    version 1, hash giả hoặc trạng thái hợp lệ.
 * 5. PS-57/58 (Backend) đang To Do. Ở chế độ Live (có token hoặc không có preview),
 *    adapter ném lỗi BACKEND_NOT_READY (status 503) và không tạo thành công giả.
 */

import { getLegalApprovalTranslations } from './legalApprovalI18n.js';

export const LEGAL_APPROVAL_DECISIONS = {
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
};

// Fixture kịch bản phong phú phục vụ kiểm thử và xem trước DEV
export const SYNTHETIC_APPROVAL_DOSSIERS = {
  'dossier-001': {
    id: 'dossier-001',
    dossierId: 'DOS-2026-0049',
    vaultId: '9c1f0b6e-0000-4000-8000-000000000001',
    vaultName: 'Kho Di Sản Gia Đình Vance',
    ownerName: 'Trần Đình Trọng',
    createdAt: '2026-10-15T09:00:00Z',
    status: 'PENDING_REVIEW',
    documentVersion: 2,
    documentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    fileName: 'Di_chuc_gia_dinh_Vance_v2.pdf',
    fileSizeFormatted: '3.4 MB',
    uploadedAt: '2026-10-14T14:30:00Z',
    hasActiveDispute: false,
    disputeDetails: null,
    allocationScope: [
      {
        id: 'alloc-1',
        assetName: 'Căn hộ Penthouse Landmark 81',
        category: 'Bất động sản',
        beneficiaryName: 'Trần Minh Quang',
        relationship: 'Con trai',
        share: '50%',
        conditions: 'Đã hoàn tất thủ tục khai nhận thừa kế',
      },
      {
        id: 'alloc-2',
        assetName: 'Tài khoản chứng khoán VPS',
        category: 'Tài chính số',
        beneficiaryName: 'Trần Thảo Ly',
        relationship: 'Con gái',
        share: '100%',
        conditions: null,
      },
      {
        id: 'alloc-3',
        assetName: 'Căn hộ Masteri Thảo Điền',
        category: 'Bất động sản',
        beneficiaryName: 'Trần Minh Quang',
        relationship: 'Con trai',
        share: '50%',
        conditions: null,
      },
    ],
    scopeFingerprint: 'scp-7f83b1657ff1',
    previousApproval: null,
  },

  'dossier-002': {
    id: 'dossier-002',
    dossierId: 'DOS-2026-0050',
    vaultId: 'vlt-22222222-4222-8222-222222222222',
    vaultName: 'Tài Sản Cá Nhân Nguyễn Mai',
    ownerName: 'Nguyễn Thị Mai',
    createdAt: '2026-10-15T11:20:00Z',
    status: 'STALE_APPROVAL_REQUIRED',
    // Version hiện tại là 3 với hash mới
    documentVersion: 3,
    documentHash: '8a4c1e792b0c3f09118a1d65dfc2d4b1fa3d677284addd200126d90697f83b16',
    fileName: 'Di_chuc_Nguyen_Mai_v3_amended.pdf',
    fileSizeFormatted: '4.1 MB',
    uploadedAt: '2026-10-16T08:15:00Z',
    hasActiveDispute: false,
    disputeDetails: null,
    allocationScope: [
      {
        id: 'alloc-201',
        assetName: 'Nhà phố Nguyễn Trãi, Quận 1',
        category: 'Bất động sản',
        beneficiaryName: 'Nguyễn Văn An',
        relationship: 'Cháu ruột',
        share: '100%',
        conditions: 'Theo phụ lục di chúc bổ sung v3',
      },
    ],
    scopeFingerprint: 'scp-8a4c1e792b0c',
    // Phê duyệt cũ chỉ duyệt Version 2 với hash cũ -> STALE
    previousApproval: {
      approvedVersion: 2,
      approvedHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      scopeFingerprint: 'scp-old-version-2',
      approvedAt: '2026-10-10T14:00:00Z',
      approvedBy: 'Lê Thị D',
      decision: 'APPROVE',
    },
  },

  'dossier-003': {
    id: 'dossier-003',
    dossierId: 'DOS-2026-0051',
    vaultId: 'vlt-33333333-4333-8333-333333333333',
    vaultName: 'Kho Di Sản Hùng Cường',
    ownerName: 'Phạm Quốc Hùng',
    createdAt: '2026-10-15T14:40:00Z',
    status: 'DISPUTED',
    documentVersion: 1,
    documentHash: 'c2d4b1fa3d677284addd200126d90697f83b1657ff1fc53b92dc18148a1d65df',
    fileName: 'Di_chuc_Pham_Quoc_Hung_v1.pdf',
    fileSizeFormatted: '2.8 MB',
    uploadedAt: '2026-10-11T10:00:00Z',
    hasActiveDispute: true,
    disputeDetails:
      'Đơn khiếu nại #KN-2026-0089 từ đồng thừa kế yêu cầu giám định lại chữ ký và điều kiện lập di chúc tại Tòa án nhân dân.',
    allocationScope: [
      {
        id: 'alloc-301',
        assetName: 'Sổ tiết kiệm Agribank',
        category: 'Tài chính',
        beneficiaryName: 'Phạm Thu Hương',
        relationship: 'Vợ',
        share: '100%',
        conditions: null,
      },
    ],
    scopeFingerprint: 'scp-c2d4b1fa3d67',
    previousApproval: null,
  },

  'dossier-004': {
    id: 'dossier-004',
    dossierId: 'DOS-2026-0052',
    vaultId: 'vlt-44444444-4444-8444-444444444444',
    vaultName: 'Di Sản Gia Tộc Lê Hoàng',
    ownerName: 'Lê Hoàng Yến',
    createdAt: '2026-10-15T16:10:00Z',
    status: 'MISSING_SCOPE',
    documentVersion: 1,
    documentHash: '1126d90697f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200',
    fileName: 'Di_chuc_Le_Hoang_Yen_v1.pdf',
    fileSizeFormatted: '1.9 MB',
    uploadedAt: '2026-10-12T16:00:00Z',
    hasActiveDispute: false,
    disputeDetails: null,
    // Chưa có phạm vi phân bổ tài sản
    allocationScope: null,
    scopeFingerprint: null,
    previousApproval: null,
  },
};

/**
 * Đánh giá tính tươi mới (Freshness) và điều kiện hợp lệ của phê duyệt pháp lý
 */
export function assessApprovalFreshness(dossier) {
  const validVersion = value => Number.isSafeInteger(value) && value > 0;
  const nonBlank = value => typeof value === 'string' && value.trim().length > 0;
  if (!dossier) {
    return {
      status: 'UNAVAILABLE',
      isFresh: false,
      canApprove: false,
      reasonCode: 'DOSSIER_NOT_FOUND',
    };
  }

  // 1. Kiểm tra thiếu metadata cốt lõi
  if (!validVersion(dossier.documentVersion) || !nonBlank(dossier.documentHash)) {
    return {
      status: 'INCOMPLETE_METADATA',
      isFresh: false,
      canApprove: false,
      reasonCode: 'MISSING_VERSION_OR_HASH',
    };
  }

  // 2. Kiểm tra tranh chấp pháp lý đang hoạt động
  if (dossier.hasActiveDispute) {
    return {
      status: 'DISPUTED',
      isFresh: false,
      canApprove: false,
      reasonCode: 'ACTIVE_LEGAL_DISPUTE',
      disputeDetails: dossier.disputeDetails,
    };
  }

  // 3. Kiểm tra phạm vi phân bổ tài sản
  if (!dossier.allocationScope || !Array.isArray(dossier.allocationScope) || dossier.allocationScope.length === 0) {
    return {
      status: 'MISSING_SCOPE',
      isFresh: false,
      canApprove: false,
      reasonCode: 'MISSING_ALLOCATION_SCOPE',
    };
  }

  // 4. Kiểm tra lịch sử phê duyệt trước đó
  const prev = dossier.previousApproval;
  // Missing bindings cannot establish scope identity, even when both sides are undefined.
  if (!nonBlank(dossier.scopeFingerprint) || (prev && (
    !validVersion(prev.approvedVersion) || !nonBlank(prev.approvedHash) || !nonBlank(prev.scopeFingerprint)
  ))) {
    return {
      status: 'INCOMPLETE_METADATA',
      isFresh: false,
      canApprove: false,
      reasonCode: 'INCOMPLETE_APPROVAL_BINDING',
    };
  }
  if (!prev) {
    return {
      status: 'PENDING_INITIAL_APPROVAL',
      isFresh: false,
      canApprove: true,
      reasonCode: 'NO_PRIOR_APPROVAL',
    };
  }

  // 5. Đối chiếu version, hash và allocation scope
  const versionMatches = prev.approvedVersion === dossier.documentVersion;
  const hashMatches = prev.approvedHash === dossier.documentHash;
  const scopeMatches = prev.scopeFingerprint === dossier.scopeFingerprint;

  if (versionMatches && hashMatches && scopeMatches && prev.decision === 'APPROVE') {
    return {
      status: 'FRESH',
      isFresh: true,
      canApprove: true,
      reasonCode: 'MATCHED_ACTIVE_APPROVAL',
      previousApproval: prev,
    };
  }

  // Nếu có sự thay đổi -> STALE
  return {
    status: 'STALE',
    isFresh: false,
    canApprove: false,
    reasonCode: 'ATTRIBUTES_MODIFIED',
    previousApproval: prev,
    mismatches: {
      version: !versionMatches,
      hash: !hashMatches,
      scope: !scopeMatches,
    },
  };
}

/**
 * Kiểm tra xem môi trường hiện tại có cho phép chạy dữ liệu tổng hợp (synthetic fixture) hay không.
 */
export function isLegalApprovalSimulationPermitted(options = {}) {
  // Có token thật -> Không dùng mock
  if (options.accessToken) return false;

  // Production build -> Khóa hoàn toàn mô phỏng
  const isViteProd = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.PROD);
  const isTestProd = Boolean(options.testEnv?.PROD);
  if (isViteProd || isTestProd) return false;

  return Boolean(options.isDevPreview) || Boolean(options.isTest);
}

/**
 * Lấy thông tin hồ sơ di sản cần phê duyệt pháp lý
 */
export async function fetchDossierForApproval(dossierId = 'dossier-001', options = {}) {
  const { signal } = options;

  if (signal?.aborted) {
    const err = new Error('Request aborted');
    err.name = 'AbortError';
    throw err;
  }

  // Chế độ mô phỏng DEV Preview / Test
  if (isLegalApprovalSimulationPermitted(options)) {
    const isTest = Boolean(options.isTest || (typeof globalThis !== 'undefined' && globalThis.IS_REACT_ACT_ENVIRONMENT));
    if (!isTest) {
      await new Promise((r) => setTimeout(r, 120));
    }

    if (signal?.aborted) {
      const err = new Error('Request aborted');
      err.name = 'AbortError';
      throw err;
    }

    // Mô phỏng kịch bản lỗi mạng
    if (dossierId === 'error') {
      const netErr = new Error('Không thể tải dữ liệu hồ sơ từ máy chủ mô phỏng.');
      netErr.code = 'MOCK_NETWORK_ERROR';
      netErr.status = 500;
      throw netErr;
    }

    // Mô phỏng hồ sơ không tìm thấy
    if (dossierId === 'not_found') {
      const notFoundErr = new Error('Hồ sơ không tồn tại.');
      notFoundErr.code = 'DOSSIER_NOT_FOUND';
      notFoundErr.status = 404;
      throw notFoundErr;
    }

    const targetKey = SYNTHETIC_APPROVAL_DOSSIERS[dossierId] ? dossierId : 'dossier-001';
    const found = SYNTHETIC_APPROVAL_DOSSIERS[targetKey];

    return {
      dossier: structuredClone(found),
      freshness: assessApprovalFreshness(found),
      isSimulation: true,
    };
  }

  // Chế độ thật (Live Mode):
  // Vì Long (BE) chưa cung cấp controller và contract chính thức cho PS-57/58,
  // chúng ta không được phép gọi endpoint phỏng đoán.
  const notReadyError = new Error(
    'Dịch vụ phê duyệt pháp lý hồ sơ hiện chưa sẵn sàng từ máy chủ.'
  );
  notReadyError.code = 'BACKEND_NOT_READY';
  notReadyError.status = 503;
  throw notReadyError;
}

/**
 * Kiểm tra tính hợp lệ của biểu mẫu quyết định phê duyệt (PS-49)
 */
export function validateApprovalForm(data = {}, lang = 'vi') {
  const t = getLegalApprovalTranslations(lang).decisionSection;
  const errors = {};

  // 1. Quyết định (Bắt buộc chọn APPROVE hoặc REJECT)
  const decision = String(data.decision || '').trim();
  if (!decision) {
    errors.decision = t.validationDecisionRequired;
  } else if (decision !== LEGAL_APPROVAL_DECISIONS.APPROVE && decision !== LEGAL_APPROVAL_DECISIONS.REJECT) {
    errors.decision = t.validationDecisionRequired;
  }

  // 2. Lý do (Bắt buộc cho cả 2 lựa chọn)
  const reason = String(data.reason || '').trim();
  if (!reason) {
    errors.reason = t.validationReasonRequired;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Gửi quyết định phê duyệt pháp lý (PS-49 / PS-57)
 */
export async function submitLegalApproval(dossierId, decisionData = {}, options = {}) {
  const { signal, lang = 'vi', currentVersion, currentHash, scopeFingerprint } = options;

  if (signal?.aborted) {
    const err = new Error('Request aborted');
    err.name = 'AbortError';
    throw err;
  }

  if (!dossierId) {
    const err = new Error('Thiếu mã hồ sơ cần phê duyệt');
    err.code = 'MISSING_DOSSIER_ID';
    throw err;
  }

  // Kiểm tra biểu mẫu
  const validation = validateApprovalForm(decisionData, lang);
  if (!validation.isValid) {
    const valErr = new Error('Dữ liệu phê duyệt pháp lý không hợp lệ');
    valErr.code = 'VALIDATION_FAILED';
    valErr.fieldErrors = validation.errors;
    throw valErr;
  }

  // Chế độ mô phỏng DEV Preview / Test
  if (isLegalApprovalSimulationPermitted(options)) {
    const isTest = Boolean(options.isTest || (typeof globalThis !== 'undefined' && globalThis.IS_REACT_ACT_ENVIRONMENT));
    if (!isTest) {
      await new Promise((r) => setTimeout(r, 180));
    }

    if (signal?.aborted) {
      const err = new Error('Request aborted');
      err.name = 'AbortError';
      throw err;
    }

    const source = SYNTHETIC_APPROVAL_DOSSIERS[dossierId];
    if (decisionData.decision === LEGAL_APPROVAL_DECISIONS.APPROVE && source && !assessApprovalFreshness(source).canApprove) {
      const error = new Error(lang === 'en' ? 'This dossier cannot be approved.' : 'Hồ sơ chưa đủ điều kiện phê duyệt.'); error.code = 'APPROVAL_BLOCKED'; throw error;
    }
    const receiptNumber = `LAPR-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

    const receipt = {
      id: receiptNumber,
      dossierId,
      decision: decisionData.decision,
      reason: decisionData.reason.trim(),
      approvedVersion: currentVersion ?? null,
      approvedHash: currentHash ?? null,
      scopeFingerprint: scopeFingerprint ?? null,
      verifierRole: 'LEGAL_VERIFIER',
      recordedAt: new Date().toISOString(),
      isSimulation: true,
    };

    return receipt;
  }

  // Chế độ thật: ném BACKEND_NOT_READY
  const notReadyError = new Error(
    'Dịch vụ phê duyệt pháp lý hồ sơ hiện chưa sẵn sàng từ máy chủ.'
  );
  notReadyError.code = 'BACKEND_NOT_READY';
  notReadyError.status = 503;
  throw notReadyError;
}

/**
 * Kiểm tra tính hợp lệ của biên nhận phê duyệt pháp lý (Receipt Verification)
 */
export function validateApprovalReceipt(receipt, expectedDossierId, options = {}) {
  const stamp = receipt?.recordedAt;
  const validStamp =
    typeof stamp === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(stamp) &&
    Number.isFinite(Date.parse(stamp)) &&
    new Date(stamp).toISOString().replace('.000Z', 'Z') === stamp.replace('.000Z', 'Z');

  const validDecisions = [LEGAL_APPROVAL_DECISIONS.APPROVE, LEGAL_APPROVAL_DECISIONS.REJECT];

  if (
    !isLegalApprovalSimulationPermitted(options) ||
    receipt?.isSimulation !== true ||
    receipt?.dossierId !== expectedDossierId ||
    typeof receipt?.id !== 'string' ||
    !receipt.id.trim() ||
    !validDecisions.includes(receipt?.decision) ||
    (options.expectedDecision && receipt.decision !== options.expectedDecision) ||
    (options.expectedVersion !== undefined && receipt.approvedVersion !== options.expectedVersion) ||
    (options.expectedHash !== undefined && receipt.approvedHash !== options.expectedHash) ||
    (options.expectedScope !== undefined && receipt.scopeFingerprint !== options.expectedScope) ||
    typeof receipt?.reason !== 'string' ||
    !receipt.reason.trim() ||
    !validStamp
  ) {
    const error = new Error('Invalid legal approval receipt');
    error.code = 'INVALID_RECEIPT';
    throw error;
  }

  return {
    id: receipt.id.trim(),
    dossierId: receipt.dossierId,
    decision: receipt.decision,
    reason: receipt.reason.trim(),
    approvedVersion: receipt.approvedVersion,
    approvedHash: receipt.approvedHash,
    scopeFingerprint: receipt.scopeFingerprint,
    recordedAt: stamp,
    isSimulation: true,
  };
}
