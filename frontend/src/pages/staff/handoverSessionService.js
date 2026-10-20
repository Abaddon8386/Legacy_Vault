import { getLiveSession } from './liveHandoverService.js';
import { request, ApiError } from '../../api/http.js';
import { evaluateSessionOpenPrerequisites } from '../../utils/handoverSessionValidation.js';
export function assertHandoverWritable(data, options = {}, requireSession = true) {
  const fail = (code, vi, en) => { const error = new Error(options.lang === 'en' ? en : vi); error.code = code; throw error; };
  if (options.roles && !options.roles.includes('STAFF_EXECUTOR')) fail('FORBIDDEN', 'Bạn không có quyền bàn giao.', 'You cannot perform handover actions.');
  if (!data) fail('CASE_REQUIRED', 'Chưa tải được hồ sơ.', 'Case data is unavailable.');
  if (data.isReadOnly || data.caseStatus === 'CLOSED' || data.vaultStatus === 'ARCHIVED' || data.session?.status === 'COMPLETED') fail('SESSION_ALREADY_ARCHIVED', 'Hồ sơ đã lưu trữ, chỉ có thể xem.', 'This archived case is read-only.');
  if (data.vaultStatus !== 'UNLOCKED') fail('VAULT_NOT_UNLOCKED', 'Kho chưa được mở khóa.', 'The vault is not unlocked.');
  if (!data.legalApproval?.isFresh) fail('STALE_APPROVAL', 'Cần phê duyệt pháp lý còn hiệu lực.', 'A current legal approval is required.');
  if (requireSession && data.session?.status !== 'ACTIVE') fail('SESSION_NOT_ACTIVE', 'Cần mở phiên bàn giao.', 'An active handover session is required.');
}
export const SYNTHETIC_HANDOVER_CASES = {
  'case-standard': {
    caseId: '6f1a4c2d-0000-4000-8000-000000000001',
    caseNumber: 'CASE-2026-0049',
    vaultId: '9c1f0b6e-0000-4000-8000-000000000001',
    vaultName: 'Kho Di Sản Gia Đình Vance',
    vaultStatus: 'UNLOCKED',
    unlockConfirmation: {
      source: 'SYNTHETIC_PREVIEW_SIMULATION',
      unlockedAt: '2026-10-17T08:30:00Z',
      isSimulated: true,
    },
    ownerName: 'Trần Đình Trọng',
    ownerId: '2c5d1a3e-0000-4000-8000-000000000001',
    assignedStaffUserId: 'staff-8888-4888-8888-888888888888',
    assignedStaffName: 'Vũ Hoàng Long',
    legalApproval: {
      approvalId: 'LAPR-2026-8812',
      approvedVersion: 2,
      approvedHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      scopeFingerprint: 'scp-7f83b1657ff1',
      isFresh: true,
      approvedAt: '2026-10-17T08:00:00Z',
    },
    session: {
      sessionId: 'HDS-2026-001',
      status: 'ACTIVE',
      openedAt: '2026-10-17T09:00:00Z',
      closedAt: null,
    },
    beneficiaries: [
      {
        id: 'ben-001',
        fullName: 'Trần Minh Quang',
        relationship: 'Con trai',
        identityNumberMasked: '079*****4567',
        hasIdentityNumber: true,
        linkedUserId: 'usr-ben-001',
        linkedEmail: 'quang.tran@example.test',
        confirmationStatus: 'PENDING',
        confirmationReceipt: null,
        confirmedAt: null,
      },
      {
        id: 'ben-002',
        fullName: 'Trần Thảo Ly',
        relationship: 'Con gái',
        identityNumberMasked: '079*****8912',
        hasIdentityNumber: true,
        linkedUserId: null,
        linkedEmail: null,
        confirmationStatus: 'PENDING',
        confirmationReceipt: null,
        confirmedAt: null,
      },
    ],
    assets: [
      {
        id: 'ast-001',
        name: 'Căn hộ Penthouse Landmark 81',
        category: 'Bất động sản',
        beneficiaryId: 'ben-001',
        beneficiaryName: 'Trần Minh Quang',
        allocatedShare: '50%',
        handoverStatus: 'PENDING',
        deliveredAt: null,
        deliveringStaffId: null,
        isOutOfScope: false,
      },
      {
        id: 'ast-002',
        name: 'Căn hộ Masteri Thảo Điền',
        category: 'Bất động sản',
        beneficiaryId: 'ben-001',
        beneficiaryName: 'Trần Minh Quang',
        allocatedShare: '50%',
        handoverStatus: 'PENDING',
        deliveredAt: null,
        deliveringStaffId: null,
        isOutOfScope: false,
      },
      {
        id: 'ast-003',
        name: 'Tài khoản chứng khoán VPS',
        category: 'Tài chính số',
        beneficiaryId: 'ben-002',
        beneficiaryName: 'Trần Thảo Ly',
        allocatedShare: '100%',
        handoverStatus: 'PENDING',
        deliveredAt: null,
        deliveringStaffId: null,
        isOutOfScope: false,
      },
    ],
    isReadOnly: false,
  },

  'case-locked-vault': {
    caseId: '6f1a4c2d-0000-4000-8000-000000000002',
    caseNumber: 'CASE-2026-0050',
    vaultId: '9c1f0b6e-0000-4000-8000-000000000002',
    vaultName: 'Tài Sản Cá Nhân Nguyễn Mai',
    vaultStatus: 'AWAITING_VERIFICATION',
    unlockConfirmation: null,
    ownerName: 'Nguyễn Thị Mai',
    ownerId: '2c5d1a3e-0000-4000-8000-000000000002',
    assignedStaffUserId: 'staff-8888-4888-8888-888888888888',
    assignedStaffName: 'Vũ Hoàng Long',
    legalApproval: null,
    session: null,
    beneficiaries: [
      {
        id: 'ben-201',
        fullName: 'Nguyễn Văn An',
        relationship: 'Cháu ruột',
        identityNumberMasked: '001*****9988',
        hasIdentityNumber: true,
        linkedUserId: null,
        linkedEmail: null,
        confirmationStatus: 'PENDING',
        confirmationReceipt: null,
        confirmedAt: null,
      },
    ],
    assets: [
      {
        id: 'ast-201',
        name: 'Nhà phố Nguyễn Trãi, Quận 1',
        category: 'Bất động sản',
        beneficiaryId: 'ben-201',
        beneficiaryName: 'Nguyễn Văn An',
        allocatedShare: '100%',
        handoverStatus: 'PENDING',
        deliveredAt: null,
        deliveringStaffId: null,
        isOutOfScope: false,
      },
    ],
    isReadOnly: false,
  },

  'case-out-of-scope': {
    caseId: '6f1a4c2d-0000-4000-8000-000000000003',
    caseNumber: 'CASE-2026-0051',
    vaultId: '9c1f0b6e-0000-4000-8000-000000000003',
    vaultName: 'Kho Di Sản Hùng Cường',
    vaultStatus: 'UNLOCKED',
    ownerName: 'Phạm Quốc Hùng',
    ownerId: '2c5d1a3e-0000-4000-8000-000000000003',
    assignedStaffUserId: 'staff-8888-4888-8888-888888888888',
    assignedStaffName: 'Vũ Hoàng Long',
    legalApproval: {
      approvalId: 'LAPR-2026-8813',
      approvedVersion: 1,
      approvedHash: 'c2d4b1fa3d677284addd200126d90697f83b1657ff1fc53b92dc18148a1d65df',
      scopeFingerprint: 'scp-c2d4b1fa3d67',
      isFresh: true,
      approvedAt: '2026-10-17T08:30:00Z',
    },
    session: {
      sessionId: 'HDS-2026-003',
      status: 'ACTIVE',
      openedAt: '2026-10-17T09:30:00Z',
      closedAt: null,
    },
    beneficiaries: [
      {
        id: 'ben-301',
        fullName: 'Phạm Thu Hương',
        relationship: 'Vợ',
        identityNumberMasked: '025*****3344',
        hasIdentityNumber: true,
        linkedUserId: 'usr-ben-301',
        linkedEmail: 'huong.pham@example.test',
        confirmationStatus: 'PENDING',
        confirmationReceipt: null,
        confirmedAt: null,
      },
    ],
    assets: [
      {
        id: 'ast-301',
        name: 'Sổ tiết kiệm Agribank 2 Tỷ VNĐ',
        category: 'Tài chính',
        beneficiaryId: 'ben-301',
        beneficiaryName: 'Phạm Thu Hương',
        allocatedShare: '100%',
        handoverStatus: 'PENDING',
        deliveredAt: null,
        deliveringStaffId: null,
        isOutOfScope: false,
      },
      {
        id: 'ast-302-out',
        name: 'Xe Mercedes-Benz S450 (Chưa phê duyệt phân bổ)',
        category: 'Phương tiện',
        beneficiaryId: 'ben-301',
        beneficiaryName: 'Phạm Thu Hương',
        allocatedShare: '0%',
        handoverStatus: 'PENDING',
        deliveredAt: null,
        deliveringStaffId: null,
        isOutOfScope: true, // OUT OF SCOPE
      },
    ],
    isReadOnly: false,
  },

  'case-partial-progress': {
    caseId: '6f1a4c2d-0000-4000-8000-000000000004',
    caseNumber: 'CASE-2026-0052',
    vaultId: '9c1f0b6e-0000-4000-8000-000000000004',
    vaultName: 'Kho Di Sản Gia Đình Vance',
    vaultStatus: 'UNLOCKED',
    ownerName: 'Trần Đình Trọng',
    ownerId: '2c5d1a3e-0000-4000-8000-000000000001',
    assignedStaffUserId: 'staff-8888-4888-8888-888888888888',
    assignedStaffName: 'Vũ Hoàng Long',
    legalApproval: {
      approvalId: 'LAPR-2026-8812',
      approvedVersion: 2,
      approvedHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      scopeFingerprint: 'scp-7f83b1657ff1',
      isFresh: true,
      approvedAt: '2026-10-17T08:00:00Z',
    },
    session: {
      sessionId: 'HDS-2026-004',
      status: 'ACTIVE',
      openedAt: '2026-10-17T09:00:00Z',
      closedAt: null,
    },
    beneficiaries: [
      {
        id: 'ben-001',
        fullName: 'Trần Minh Quang',
        relationship: 'Con trai',
        identityNumberMasked: '079*****4567',
        hasIdentityNumber: true,
        linkedUserId: 'usr-ben-001',
        linkedEmail: 'quang.tran@example.test',
        confirmationStatus: 'PENDING', // 0% Confirmed
        confirmationReceipt: null,
        confirmedAt: null,
      },
      {
        id: 'ben-002',
        fullName: 'Trần Thảo Ly',
        relationship: 'Con gái',
        identityNumberMasked: '079*****8912',
        hasIdentityNumber: true,
        linkedUserId: 'usr-ben-002',
        linkedEmail: 'ly.tran@example.test',
        confirmationStatus: 'PENDING', // 0% Confirmed
        confirmationReceipt: null,
        confirmedAt: null,
      },
    ],
    assets: [
      {
        id: 'ast-001',
        name: 'Căn hộ Penthouse Landmark 81',
        category: 'Bất động sản',
        beneficiaryId: 'ben-001',
        beneficiaryName: 'Trần Minh Quang',
        allocatedShare: '50%',
        handoverStatus: 'DELIVERED', // 100% Assets Delivered
        deliveredAt: '2026-10-17T09:15:00Z',
        deliveringStaffId: 'staff-8888-4888-8888-888888888888',
        isOutOfScope: false,
      },
      {
        id: 'ast-002',
        name: 'Căn hộ Masteri Thảo Điền',
        category: 'Bất động sản',
        beneficiaryId: 'ben-001',
        beneficiaryName: 'Trần Minh Quang',
        allocatedShare: '50%',
        handoverStatus: 'DELIVERED',
        deliveredAt: '2026-10-17T09:20:00Z',
        deliveringStaffId: 'staff-8888-4888-8888-888888888888',
        isOutOfScope: false,
      },
      {
        id: 'ast-003',
        name: 'Tài khoản chứng khoán VPS',
        category: 'Tài chính số',
        beneficiaryId: 'ben-002',
        beneficiaryName: 'Trần Thảo Ly',
        allocatedShare: '100%',
        handoverStatus: 'DELIVERED',
        deliveredAt: '2026-10-17T09:25:00Z',
        deliveringStaffId: 'staff-8888-4888-8888-888888888888',
        isOutOfScope: false,
      },
    ],
    isReadOnly: false,
  },

  'case-archived': {
    caseId: '6f1a4c2d-0000-4000-8000-000000000005',
    caseNumber: 'CASE-2026-0048',
    vaultId: '9c1f0b6e-0000-4000-8000-000000000005',
    vaultName: 'Kho Di Sản Gia Tộc Lê Hoàng',
    vaultStatus: 'ARCHIVED',
    ownerName: 'Lê Hoàng Yến',
    ownerId: '2c5d1a3e-0000-4000-8000-000000000005',
    assignedStaffUserId: 'staff-8888-4888-8888-888888888888',
    assignedStaffName: 'Vũ Hoàng Long',
    legalApproval: {
      approvalId: 'LAPR-2026-8801',
      approvedVersion: 1,
      approvedHash: '1126d90697f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200',
      scopeFingerprint: 'scp-1126d90697f8',
      isFresh: true,
      approvedAt: '2026-10-16T10:00:00Z',
    },
    session: {
      sessionId: 'HDS-2026-005',
      status: 'COMPLETED',
      openedAt: '2026-10-16T11:00:00Z',
      closedAt: '2026-10-16T15:30:00Z',
    },
    beneficiaries: [
      {
        id: 'ben-501',
        fullName: 'Lê Gia Huy',
        relationship: 'Con trai',
        identityNumberMasked: '001*****1234',
        hasIdentityNumber: true,
        linkedUserId: 'usr-ben-501',
        linkedEmail: 'huy.le@example.test',
        confirmationStatus: 'CONFIRMED',
        confirmationReceipt: 'REC-2026-0091',
        confirmedAt: '2026-10-16T15:00:00Z',
      },
    ],
    assets: [
      {
        id: 'ast-501',
        name: 'Biệt thự Đảo Kim Cương, Quận 2',
        category: 'Bất động sản',
        beneficiaryId: 'ben-501',
        beneficiaryName: 'Lê Gia Huy',
        allocatedShare: '100%',
        handoverStatus: 'DELIVERED',
        deliveredAt: '2026-10-16T14:00:00Z',
        deliveringStaffId: 'staff-8888-4888-8888-888888888888',
        isOutOfScope: false,
      },
    ],
    receiptSummary: {
      summaryId: 'ARCH-REC-2026-0048',
      archivedAt: '2026-10-16T15:30:00Z',
      closedByStaff: 'Vũ Hoàng Long',
      deliveredAssetsCount: 1,
      totalAssetsCount: 1,
      confirmedBeneficiariesCount: 1,
      totalBeneficiariesCount: 1,
    },
    isReadOnly: true,
  },
};

SYNTHETIC_HANDOVER_CASES['case-ready-to-open'] = { ...SYNTHETIC_HANDOVER_CASES['case-standard'], session: null };

export function isCounterHandoverSimulationPermitted(options = {}) {
  if (options.accessToken) return false;
  const isViteProd = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.PROD);
  const isTestProd = Boolean(options.testEnv?.PROD);
  if (isViteProd || isTestProd) return false;
  return Boolean(options.isDevPreview) || Boolean(options.isTest);
}
export async function fetchHandoverCase(scenarioKey = 'case-standard', options = {}) {
  const { signal } = options;

  if (signal?.aborted) {
    const err = new Error('Request aborted');
    err.name = 'AbortError';
    throw err;
  }

  if (isCounterHandoverSimulationPermitted(options)) {
    const isTest = Boolean(options.isTest || (typeof globalThis !== 'undefined' && globalThis.IS_REACT_ACT_ENVIRONMENT));
    if (!isTest) {
      await new Promise((r) => setTimeout(r, 120));
    }

    if (signal?.aborted) {
      const err = new Error('Request aborted');
      err.name = 'AbortError';
      throw err;
    }

    if (scenarioKey === 'error') {
      const netErr = new Error('Không thể kết nối máy chủ bàn giao tại quầy.');
      netErr.code = 'MOCK_NETWORK_ERROR';
      netErr.status = 500;
      throw netErr;
    }

    const key = SYNTHETIC_HANDOVER_CASES[scenarioKey] ? scenarioKey : 'case-standard';
    const raw = SYNTHETIC_HANDOVER_CASES[key];
    const data = JSON.parse(JSON.stringify(raw));
    if (data.vaultStatus === 'ARCHIVED') { data.caseStatus = 'CLOSED'; data.archiveReceipt = data.receiptSummary; }


    return {
      caseData: data,
      isSimulation: true,
    };
  }

  const notReadyError = new Error(
    'Dịch vụ bàn giao tại quầy hiện chưa sẵn sàng từ máy chủ.'
  );
  notReadyError.code = 'BACKEND_NOT_READY';
  notReadyError.status = 503;
  throw notReadyError;
}
export async function openHandoverSession(currentCaseData, options = {}) {
  if (isCounterHandoverSimulationPermitted(options)) assertHandoverWritable(currentCaseData, options, false);
  const prereq = evaluateSessionOpenPrerequisites(currentCaseData.vaultStatus, currentCaseData.session);
  if (!prereq.canOpen) {
    const err = new Error(prereq.messageVi);
    err.code = prereq.reasonCode;
    throw err;
  }

  if (isCounterHandoverSimulationPermitted(options)) {
    const newSession = {
      sessionId: `HDS-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`,
      status: 'ACTIVE',
      openedAt: new Date().toISOString(),
      closedAt: null,
    };
    return newSession;
  }

  const notReadyError = new Error('Dịch vụ mở phiên bàn giao chưa sẵn sàng từ máy chủ.');
  notReadyError.code = 'BACKEND_NOT_READY';
  notReadyError.status = 503;
  throw notReadyError;
}

/**
 * PS-63 / PS-97: Lấy chi tiết phiên bàn giao (GET /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId})
 */
export async function fetchHandoverSession(caseId, sessionId, options = {}) {
  if (isCounterHandoverSimulationPermitted(options)) return {caseId, sessionId, status: 'OPEN'};
  return getLiveSession(caseId, sessionId, options);
}

// Delivery history is readable after completion/archive; eligible-assets requires OPEN.
export async function fetchHandoverDeliveries(caseId, sessionId, options = {}) {
  if (isCounterHandoverSimulationPermitted(options)) return [];
  const value = await request(`/staff/verification-cases/${caseId}/handover-sessions/${sessionId}/deliveries`, {...options, expectedStatus: 200});
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!Array.isArray(value) || value.some(item => item.sessionId !== sessionId || item.status !== 'DELIVERED'
    || !['itemId','recipientId','assetId'].every(key => uuid.test(item[key] || '')))) throw new ApiError('INVALID_RESPONSE');
  return value;
}

/**
 * PS-64 / PS-97: Lấy danh sách tài sản đủ điều kiện bàn giao trong phiên
 */
export async function fetchEligibleAssets(caseId, sessionId, options = {}) {
  const { accessToken, recipientId, signal, lang = 'vi' } = options;

  if (signal?.aborted) {
    const err = new Error('Request aborted');
    err.name = 'AbortError';
    throw err;
  }

  if (isCounterHandoverSimulationPermitted(options)) {
    const isTest = Boolean(options.isTest || (typeof globalThis !== 'undefined' && globalThis.IS_REACT_ACT_ENVIRONMENT));
    if (!isTest) await new Promise((r) => setTimeout(r, 80));
    const items = SYNTHETIC_HANDOVER_CASES['case-standard'].assets.map((a) => ({
      assetId: a.id,
      assetName: a.name,
      category: a.category,
      recipientId: a.beneficiaryId,
      recipientName: a.beneficiaryName,
      status: a.handoverStatus === 'DELIVERED' ? 'DELIVERED' : 'ELIGIBLE',
      allocatedShare: a.allocatedShare,
    }));
    return recipientId ? items.filter((i) => i.recipientId === recipientId) : items;
  }

  const query = recipientId ? `?recipientId=${encodeURIComponent(recipientId)}` : '';
  const res = await fetch(`/api/v1/staff/verification-cases/${caseId}/handover-sessions/${sessionId}/eligible-assets${query}`, {
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
    const err = new Error(errBody?.message || (lang === 'en' ? 'Failed to fetch eligible assets.' : 'Không thể tải danh sách tài sản đủ điều kiện bàn giao.'));
    err.status = res.status;
    err.code = errBody?.code || 'FETCH_ELIGIBLE_ASSETS_FAILED';
    throw err;
  }

  return res.json();
}

/**
 * PS-65 / PS-97: Ghi nhận bàn giao tài sản cho người nhận
 */
export async function deliverAssets(caseId, sessionId, { recipientId, assetIds }, options = {}) {
  const { accessToken, signal, lang = 'vi' } = options;

  if (signal?.aborted) {
    const err = new Error('Request aborted');
    err.name = 'AbortError';
    throw err;
  }

  if (!recipientId || !Array.isArray(assetIds) || assetIds.length === 0) {
    const valErr = new Error(lang === 'en' ? 'Recipient and at least one asset are required.' : 'Cần chọn người nhận và ít nhất một tài sản.');
    valErr.code = 'VALIDATION_FAILED';
    throw valErr;
  }

  if (isCounterHandoverSimulationPermitted(options)) {
    const isTest = Boolean(options.isTest || (typeof globalThis !== 'undefined' && globalThis.IS_REACT_ACT_ENVIRONMENT));
    if (!isTest) await new Promise((r) => setTimeout(r, 120));
    return assetIds.map((aid) => ({
      itemId: `item-${aid}`,
      sessionId,
      assetId: aid,
      recipientId,
      status: 'DELIVERED',
      deliveredAt: new Date().toISOString(),
      staffId: 'staff-8888-4888-8888-888888888888',
    }));
  }

  const res = await fetch(`/api/v1/staff/verification-cases/${caseId}/handover-sessions/${sessionId}/deliveries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      'Accept-Language': lang,
    },
    body: JSON.stringify({ recipientId, assetIds }),
    signal,
  });

  if (!res.ok) {
    let errBody;
    try { errBody = await res.json(); } catch { errBody = null; }
    const err = new Error(errBody?.message || (lang === 'en' ? 'Failed to record asset delivery.' : 'Ghi nhận bàn giao tài sản thất bại.'));
    err.status = res.status;
    err.code = errBody?.code || 'DELIVERY_FAILED';
    throw err;
  }

  return res.json();
}

/**
 * PS-67 / PS-97: Lấy danh sách xác nhận của người thụ hưởng
 */
export async function fetchBeneficiaryConfirmations(caseId, sessionId, options = {}) {
  const { accessToken, signal, lang = 'vi' } = options;

  if (signal?.aborted) {
    const err = new Error('Request aborted');
    err.name = 'AbortError';
    throw err;
  }

  if (isCounterHandoverSimulationPermitted(options)) {
    const isTest = Boolean(options.isTest || (typeof globalThis !== 'undefined' && globalThis.IS_REACT_ACT_ENVIRONMENT));
    if (!isTest) await new Promise((r) => setTimeout(r, 80));
    return SYNTHETIC_HANDOVER_CASES['case-standard'].beneficiaries.map((b) => ({
      beneficiaryId: b.id,
      beneficiaryName: b.fullName,
      identityNumberMasked: b.identityNumberMasked,
      confirmationStatus: b.confirmationStatus,
      receiptReference: b.confirmationReceipt,
      confirmedAt: b.confirmedAt,
    }));
  }

  const res = await fetch(`/api/v1/staff/verification-cases/${caseId}/handover-sessions/${sessionId}/beneficiary-confirmations`, {
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
    const err = new Error(errBody?.message || (lang === 'en' ? 'Failed to fetch beneficiary confirmations.' : 'Không thể tải danh sách xác nhận người thụ hưởng.'));
    err.status = res.status;
    err.code = errBody?.code || 'FETCH_CONFIRMATIONS_FAILED';
    throw err;
  }

  return res.json();
}

/**
 * PS-67 / PS-97: Xác nhận bàn giao của người thụ hưởng
 */
export async function confirmBeneficiary(caseId, sessionId, beneficiaryId, { receiptReference }, options = {}) {
  const { accessToken, signal, lang = 'vi' } = options;

  if (signal?.aborted) {
    const err = new Error('Request aborted');
    err.name = 'AbortError';
    throw err;
  }

  if (!receiptReference || !receiptReference.trim()) {
    const valErr = new Error(lang === 'en' ? 'Receipt reference is required.' : 'Mã biên nhận xác nhận là bắt buộc.');
    valErr.code = 'RECEIPT_REFERENCE_REQUIRED';
    throw valErr;
  }

  if (isCounterHandoverSimulationPermitted(options)) {
    const isTest = Boolean(options.isTest || (typeof globalThis !== 'undefined' && globalThis.IS_REACT_ACT_ENVIRONMENT));
    if (!isTest) await new Promise((r) => setTimeout(r, 120));
    return {
      beneficiaryId,
      confirmationStatus: 'CONFIRMED',
      receiptReference: receiptReference.trim(),
      confirmedAt: new Date().toISOString(),
    };
  }

  const res = await fetch(`/api/v1/staff/verification-cases/${caseId}/handover-sessions/${sessionId}/beneficiaries/${beneficiaryId}/confirmation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      'Accept-Language': lang,
    },
    body: JSON.stringify({ receiptReference: receiptReference.trim() }),
    signal,
  });

  if (!res.ok) {
    let errBody;
    try { errBody = await res.json(); } catch { errBody = null; }
    const err = new Error(errBody?.message || (lang === 'en' ? 'Failed to confirm beneficiary.' : 'Xác nhận người thụ hưởng thất bại.'));
    err.status = res.status;
    err.code = errBody?.code || 'CONFIRMATION_FAILED';
    throw err;
  }

  return res.json();
}

/**
 * PS-68-70 / PS-97: Lấy tiến độ cổng nghiệm thu kép (Dual Completion Gates)
 */
export async function fetchCompletionProgress(caseId, sessionId, options = {}) {
  const { accessToken, signal, lang = 'vi' } = options;

  if (signal?.aborted) {
    const err = new Error('Request aborted');
    err.name = 'AbortError';
    throw err;
  }

  if (isCounterHandoverSimulationPermitted(options)) {
    const isTest = Boolean(options.isTest || (typeof globalThis !== 'undefined' && globalThis.IS_REACT_ACT_ENVIRONMENT));
    if (!isTest) await new Promise((r) => setTimeout(r, 80));
    return {
      assetCompletion: { completed: 3, total: 3, pending: 0, ready: true },
      beneficiaryCompletion: { completed: 2, total: 2, pending: 0, ready: true },
      readyForClose: true,
      readyForArchive: true,
    };
  }

  const res = await fetch(`/api/v1/staff/verification-cases/${caseId}/handover-sessions/${sessionId}/completion-progress`, {
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
    const err = new Error(errBody?.message || (lang === 'en' ? 'Failed to fetch completion progress.' : 'Không thể tải tiến độ hoàn tất bàn giao.'));
    err.status = res.status;
    err.code = errBody?.code || 'FETCH_PROGRESS_FAILED';
    throw err;
  }

  return res.json();
}

/**
 * PS-61 / PS-97: Lấy danh sách biên bản bàn giao (Receipts)
 */
export async function fetchHandoverReceipts(caseId, sessionId, options = {}) {
  const { accessToken, signal, lang = 'vi' } = options;

  if (signal?.aborted) {
    const err = new Error('Request aborted');
    err.name = 'AbortError';
    throw err;
  }

  if (isCounterHandoverSimulationPermitted(options)) {
    const isTest = Boolean(options.isTest || (typeof globalThis !== 'undefined' && globalThis.IS_REACT_ACT_ENVIRONMENT));
    if (!isTest) await new Promise((r) => setTimeout(r, 80));
    return [
      {
        receiptId: 'rec-001',
        sessionId,
        recipientId: 'ben-001',
        assetIds: ['ast-001', 'ast-002'],
        attestationType: 'STAFF_ATTESTATION',
        createdAt: '2026-10-18T10:00:00Z',
        staffId: 'staff-8888-4888-8888-888888888888',
      },
    ];
  }

  const res = await fetch(`/api/v1/staff/verification-cases/${caseId}/handover-sessions/${sessionId}/receipts`, {
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
    const err = new Error(errBody?.message || (lang === 'en' ? 'Failed to fetch handover receipts.' : 'Không thể tải biên bản bàn giao.'));
    err.status = res.status;
    err.code = errBody?.code || 'FETCH_RECEIPTS_FAILED';
    throw err;
  }

  return res.json();
}

/**
 * PS-61 / PS-97: Tạo biên bản bàn giao có chữ ký xác nhận của Staff
 */
export async function createHandoverReceipt(caseId, sessionId, { recipientId, assetIds, supersedesReceiptId }, options = {}) {
  const { accessToken, signal, lang = 'vi' } = options;

  if (signal?.aborted) {
    const err = new Error('Request aborted');
    err.name = 'AbortError';
    throw err;
  }

  if (isCounterHandoverSimulationPermitted(options)) {
    const isTest = Boolean(options.isTest || (typeof globalThis !== 'undefined' && globalThis.IS_REACT_ACT_ENVIRONMENT));
    if (!isTest) await new Promise((r) => setTimeout(r, 120));
    return {
      receiptId: `rec-${Date.now().toString(16)}`,
      sessionId,
      recipientId,
      assetIds,
      attestationType: 'STAFF_ATTESTATION',
      createdAt: new Date().toISOString(),
      staffId: 'staff-8888-4888-8888-888888888888',
    };
  }

  const res = await fetch(`/api/v1/staff/verification-cases/${caseId}/handover-sessions/${sessionId}/receipts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      'Accept-Language': lang,
    },
    body: JSON.stringify({ recipientId, assetIds, supersedesReceiptId: supersedesReceiptId || null }),
    signal,
  });

  if (!res.ok) {
    let errBody;
    try { errBody = await res.json(); } catch { errBody = null; }
    const err = new Error(errBody?.message || (lang === 'en' ? 'Failed to create handover receipt.' : 'Lập biên bản bàn giao thất bại.'));
    err.status = res.status;
    err.code = errBody?.code || 'CREATE_RECEIPT_FAILED';
    throw err;
  }

  return res.json();
}

/**
 * PS-71 / PS-97: Đóng phiên bàn giao sau khi đạt cổng nghiệm thu kép và có biên bản
 */
export async function closeHandoverSession(caseId, sessionId, options = {}) {
  const { accessToken, signal, lang = 'vi' } = options;

  if (signal?.aborted) {
    const err = new Error('Request aborted');
    err.name = 'AbortError';
    throw err;
  }

  if (isCounterHandoverSimulationPermitted(options)) {
    const isTest = Boolean(options.isTest || (typeof globalThis !== 'undefined' && globalThis.IS_REACT_ACT_ENVIRONMENT));
    if (!isTest) await new Promise((r) => setTimeout(r, 150));
    return {
      sessionId,
      status: 'COMPLETED',
      closedAt: new Date().toISOString(),
      proofHash: 'simulated-proof-' + Math.random().toString(16).slice(2, 10),
    };
  }

  const res = await fetch(`/api/v1/staff/verification-cases/${caseId}/handover-sessions/${sessionId}/close`, {
    method: 'POST',
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      'Accept-Language': lang,
    },
    signal,
  });

  if (!res.ok) {
    let errBody;
    try { errBody = await res.json(); } catch { errBody = null; }
    const err = new Error(errBody?.message || (lang === 'en' ? 'Failed to close handover session.' : 'Đóng phiên bàn giao thất bại.'));
    err.status = res.status;
    err.code = errBody?.code || 'CLOSE_SESSION_FAILED';
    throw err;
  }

  return res.json();
}

/**
 * PS-72 / PS-97: Lưu trữ kho di sản và hoàn tất đóng ca (Atomic Archive & Case Close)
 */
export async function archiveHandoverCase(caseId, sessionId, options = {}) {
  const { accessToken, signal, lang = 'vi' } = options;

  if (signal?.aborted) {
    const err = new Error('Request aborted');
    err.name = 'AbortError';
    throw err;
  }

  if (isCounterHandoverSimulationPermitted(options)) {
    const isTest = Boolean(options.isTest || (typeof globalThis !== 'undefined' && globalThis.IS_REACT_ACT_ENVIRONMENT));
    if (!isTest) await new Promise((r) => setTimeout(r, 150));
    return {
      caseId,
      vaultId: '9c1f0b6e-0000-4000-8000-000000000001',
      caseStatus: 'CLOSED',
      vaultStatus: 'ARCHIVED',
      archivedAt: new Date().toISOString(),
    };
  }

  const res = await fetch(`/api/v1/staff/verification-cases/${caseId}/handover-sessions/${sessionId}/archive`, {
    method: 'POST',
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      'Accept-Language': lang,
    },
    signal,
  });

  if (!res.ok) {
    let errBody;
    try { errBody = await res.json(); } catch { errBody = null; }
    const err = new Error(errBody?.message || (lang === 'en' ? 'Failed to archive vault and close case.' : 'Lưu trữ kho di sản và đóng ca thất bại.'));
    err.status = res.status;
    err.code = errBody?.code || 'ARCHIVE_FAILED';
    throw err;
  }

  return res.json();
}

