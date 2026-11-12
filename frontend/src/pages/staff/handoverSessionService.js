/**
 * handoverSessionService.js - Dịch vụ phiên bàn giao di sản tại quầy cho Staff (mở phiên, giao tài sản, xác nhận người thụ hưởng, biên bản, đóng phiên, lưu trữ).
 *
 * Có hai chế độ: mô phỏng (isCounterHandoverSimulationPermitted, dữ liệu tổng hợp) và thật (gọi fetch tới /api/v1/staff/verification-cases/{caseId}/handover-sessions/...).
 * Mã PS-xx trong chú thích là mã ticket nghiệp vụ. Chế độ thật dùng Bearer accessToken và header Accept-Language; lỗi HTTP được chuyển thành Error có status và code lấy từ body lỗi của backend.
 * Được dùng bởi BeneficiaryAccountPage, BeneficiaryConfirmationPage, CloseAndArchivePage, CounterHandoverPage và ScopedAssetHandoverPage.
 */
import { getLiveSession } from './liveHandoverService.js';
import { request, ApiError } from '../../api/http.js';
import { evaluateSessionOpenPrerequisites } from '../../utils/handoverSessionValidation.js';
/**
 * Kiểm tra hồ sơ bàn giao tại quầy (dữ liệu mô phỏng) còn cho phép ghi hay không; nếu không thì ném Error có {code}.
 *
 * Thứ tự kiểm tra: vai trò STAFF_EXECUTOR (nếu truyền options.roles) -> có dữ liệu hồ sơ -> hồ sơ chưa đóng/lưu trữ (SESSION_ALREADY_ARCHIVED) -> kho đã mở khóa UNLOCKED (VAULT_NOT_UNLOCKED) -> phê duyệt pháp lý còn hiệu lực (STALE_APPROVAL) -> phiên bàn giao đang ACTIVE (SESSION_NOT_ACTIVE, bỏ qua khi requireSession = false).
 * @param {Object} data Dữ liệu hồ sơ bàn giao.
 * @param {Object} [options] { lang: 'vi' | 'en', roles: string[] }
 * @param {boolean} [requireSession=true] Có bắt buộc phiên ACTIVE hay không.
 * @throws {Error} code: FORBIDDEN, CASE_REQUIRED, SESSION_ALREADY_ARCHIVED, VAULT_NOT_UNLOCKED, STALE_APPROVAL hoặc SESSION_NOT_ACTIVE.
 */
export function assertHandoverWritable(data, options = {}, requireSession = true) {
  const fail = (code, vi, en) => { const error = new Error(options.lang === 'en' ? en : vi); error.code = code; throw error; };
  if (options.roles && !options.roles.includes('STAFF_EXECUTOR')) fail('FORBIDDEN', 'Bạn không có quyền bàn giao.', 'You cannot perform handover actions.');
  if (!data) fail('CASE_REQUIRED', 'Chưa tải được hồ sơ.', 'Case data is unavailable.');
  if (data.isReadOnly || data.caseStatus === 'CLOSED' || data.vaultStatus === 'ARCHIVED' || data.session?.status === 'COMPLETED') fail('SESSION_ALREADY_ARCHIVED', 'Hồ sơ đã lưu trữ, chỉ có thể xem.', 'This archived case is read-only.');
  if (data.vaultStatus !== 'UNLOCKED') fail('VAULT_NOT_UNLOCKED', 'Kho chưa được mở khóa.', 'The vault is not unlocked.');
  if (!data.legalApproval?.isFresh) fail('STALE_APPROVAL', 'Cần phê duyệt pháp lý còn hiệu lực.', 'A current legal approval is required.');
  if (requireSession && data.session?.status !== 'ACTIVE') fail('SESSION_NOT_ACTIVE', 'Cần mở phiên bàn giao.', 'An active handover session is required.');
}
/**
 * Bộ hồ sơ bàn giao tổng hợp (không phải dữ liệu thật) cho dev preview và unit test.
 * Các kịch bản: 'case-standard' (kho đã mở khóa, phiên ACTIVE), 'case-locked-vault' (kho chưa mở khóa, chưa có phê duyệt pháp lý), 'case-out-of-scope' (có tài sản ngoài phạm vi),
 * 'case-partial-progress' (tài sản đã giao, người thụ hưởng chưa xác nhận), 'case-archived' (đã đóng, chỉ đọc, có receiptSummary) và 'case-ready-to-open' (khai báo bên dưới, chưa có phiên).
 */
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

/**
 * Kịch bản 'case-ready-to-open': giống 'case-standard' nhưng chưa có phiên bàn giao (session = null) để thử thao tác mở phiên.
 */
SYNTHETIC_HANDOVER_CASES['case-ready-to-open'] = { ...SYNTHETIC_HANDOVER_CASES['case-standard'], session: null };

/**
 * Cho biết có được phép chạy chế độ mô phỏng bàn giao tại quầy hay không.
 * Trả về false nếu có accessToken thật hoặc đang ở bản build production (Vite PROD hoặc options.testEnv.PROD); ngược lại true khi options.isDevPreview hoặc options.isTest bật.
 * @param {Object} [options] { accessToken, testEnv, isDevPreview, isTest }
 * @returns {boolean}
 */
export function isCounterHandoverSimulationPermitted(options = {}) {
  if (options.accessToken) return false;
  const isViteProd = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.PROD);
  const isTestProd = Boolean(options.testEnv?.PROD);
  if (isViteProd || isTestProd) return false;
  return Boolean(options.isDevPreview) || Boolean(options.isTest);
}
/**
 * Tải hồ sơ bàn giao tại quầy. Chỉ có chế độ mô phỏng: trả về bản sao sâu của kịch bản trong SYNTHETIC_HANDOVER_CASES
 * (kịch bản 'error' giả lập lỗi mạng MOCK_NETWORK_ERROR; hồ sơ ARCHIVED gắn caseStatus = CLOSED và archiveReceipt). Ngoài mô phỏng ném BACKEND_NOT_READY (503).
 * @param {string} [scenarioKey='case-standard'] Khóa kịch bản.
 * @param {Object} [options] { signal, isDevPreview, isTest, accessToken }
 * @returns {Promise<{caseData: Object, isSimulation: boolean}>}
 * @throws {Error} AbortError; BACKEND_NOT_READY; MOCK_NETWORK_ERROR.
 */
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
/**
 * Mở phiên bàn giao tại quầy (đường mô phỏng).
 * Kiểm tra assertHandoverWritable (không yêu cầu phiên có sẵn) và evaluateSessionOpenPrerequisites(vaultStatus, session) từ utils/handoverSessionValidation.js;
 * không đủ điều kiện thì ném Error mang code của lý do. Chế độ mô phỏng trả về phiên ACTIVE mới (sessionId HDS-năm-xxx). Ngoài mô phỏng ném BACKEND_NOT_READY (503);
 * việc mở phiên thật nằm ở liveHandoverService.openLiveSession().
 * @param {Object} currentCaseData Dữ liệu hồ sơ hiện tại (vaultStatus, session...).
 * @param {Object} [options] Tùy chọn mô phỏng và ngôn ngữ.
 * @returns {Promise<{sessionId: string, status: 'ACTIVE', openedAt: string, closedAt: null}>}
 */
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
 * PS-63 / PS-97: Lấy chi tiết phiên bàn giao (GET /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}).
 * Mô phỏng trả về { caseId, sessionId, status: 'OPEN' }; chế độ thật ủy quyền cho liveHandoverService.getLiveSession().
 * @param {string} caseId UUID hồ sơ.
 * @param {string} sessionId UUID phiên.
 * @param {Object} [options] Tùy chọn của request().
 * @returns {Promise<Object>} Phiên bàn giao.
 */
export async function fetchHandoverSession(caseId, sessionId, options = {}) {
  if (isCounterHandoverSimulationPermitted(options)) return {caseId, sessionId, status: 'OPEN'};
  return getLiveSession(caseId, sessionId, options);
}

/**
 * Lấy lịch sử các lần giao tài sản của phiên: GET /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/deliveries (HTTP 200).
 * Đọc được cả sau khi phiên hoàn tất/lưu trữ (khác eligible-assets chỉ dùng khi phiên OPEN). Mỗi phần tử phải thuộc đúng sessionId, status DELIVERED và itemId, recipientId, assetId là UUID.
 * Mô phỏng trả về mảng rỗng.
 * @param {string} caseId UUID hồ sơ.
 * @param {string} sessionId UUID phiên.
 * @param {Object} [options] Tùy chọn của request().
 * @returns {Promise<Object[]>} Danh sách mục đã giao.
 * @throws {ApiError} INVALID_RESPONSE khi phản hồi sai định dạng, hoặc lỗi API.
 */
export async function fetchHandoverDeliveries(caseId, sessionId, options = {}) {
  if (isCounterHandoverSimulationPermitted(options)) return [];
  const value = await request(`/staff/verification-cases/${caseId}/handover-sessions/${sessionId}/deliveries`, {...options, expectedStatus: 200});
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!Array.isArray(value) || value.some(item => item.sessionId !== sessionId || item.status !== 'DELIVERED'
    || !['itemId','recipientId','assetId'].every(key => uuid.test(item[key] || '')))) throw new ApiError('INVALID_RESPONSE');
  return value;
}

/**
 * PS-64 / PS-97: Lấy danh sách tài sản đủ điều kiện bàn giao trong phiên.
 * Gọi GET /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/eligible-assets[?recipientId=...] (chỉ dùng khi phiên OPEN).
 * Mô phỏng lấy từ tài sản của 'case-standard' (có thể lọc theo recipientId). Lỗi HTTP chuyển thành Error có status và code (mặc định FETCH_ELIGIBLE_ASSETS_FAILED).
 * @param {string} caseId UUID hồ sơ.
 * @param {string} sessionId UUID phiên.
 * @param {Object} [options] { accessToken, recipientId, signal, lang }
 * @returns {Promise<Object[]>} Tài sản đủ điều kiện (assetId, assetName, category, recipientId, recipientName, status, allocatedShare).
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
 * PS-65 / PS-97: Ghi nhận bàn giao tài sản cho người nhận.
 * Yêu cầu có recipientId và ít nhất một assetId (nếu không ném VALIDATION_FAILED). Chế độ thật gọi
 * POST /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/deliveries với body JSON { recipientId, assetIds }; lỗi HTTP có code mặc định DELIVERY_FAILED.
 * Mô phỏng trả về danh sách mục DELIVERED giả.
 * @param {string} caseId UUID hồ sơ.
 * @param {string} sessionId UUID phiên.
 * @param {{recipientId: string, assetIds: string[]}} payload Người nhận và các tài sản được giao.
 * @param {Object} [options] { accessToken, signal, lang }
 * @returns {Promise<Object[]>} Các mục bàn giao đã ghi nhận.
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
 * PS-67 / PS-97: Lấy danh sách xác nhận của người thụ hưởng trong phiên:
 * GET /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/beneficiary-confirmations. Lỗi HTTP có code mặc định FETCH_CONFIRMATIONS_FAILED.
 * Mô phỏng trả về người thụ hưởng của 'case-standard'. Được BeneficiaryConfirmationPage dùng.
 * @param {string} caseId UUID hồ sơ.
 * @param {string} sessionId UUID phiên.
 * @param {Object} [options] { accessToken, signal, lang }
 * @returns {Promise<Object[]>} beneficiaryId, beneficiaryName, identityNumberMasked, confirmationStatus, receiptReference, confirmedAt.
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
 * PS-67 / PS-97: Xác nhận người thụ hưởng đã nhận tài sản bằng biên nhận giấy đã ký.
 * Bắt buộc có tệp biên nhận và attested = true (nếu không ném VALIDATION_FAILED). Chế độ thật gửi POST multipart (file, attested = 'true', paperReference tùy chọn) tới
 * /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/beneficiaries/{beneficiaryId}/confirmation; lỗi HTTP có code mặc định CONFIRMATION_FAILED.
 * @param {string} caseId UUID hồ sơ.
 * @param {string} sessionId UUID phiên.
 * @param {string} beneficiaryId UUID người thụ hưởng.
 * @param {{receiptReference?: string, file: File, attested: boolean}} payload Mã biên nhận giấy, tệp scan và cờ xác nhận đã đối chiếu.
 * @param {Object} [options] { accessToken, signal, lang }
 * @returns {Promise<Object>} Kết quả xác nhận (confirmationStatus, receiptReference, confirmedAt...).
 */
export async function confirmBeneficiary(caseId, sessionId, beneficiaryId, { receiptReference, file, attested }, options = {}) {
  const { accessToken, signal, lang = 'vi' } = options;

  if (signal?.aborted) {
    const err = new Error('Request aborted');
    err.name = 'AbortError';
    throw err;
  }

  if (!file || !attested) {
    const error = new Error(lang === 'en' ? 'Attach the signed receipt and confirm the check.' : 'Đính kèm biên nhận đã ký và xác nhận đối chiếu.');
    error.code = 'VALIDATION_FAILED'; throw error;
  }
  if (isCounterHandoverSimulationPermitted(options)) {
    const isTest = Boolean(options.isTest || (typeof globalThis !== 'undefined' && globalThis.IS_REACT_ACT_ENVIRONMENT));
    if (!isTest) await new Promise((r) => setTimeout(r, 120));
    return {
      beneficiaryId,
      confirmationStatus: 'CONFIRMED',
      receiptReference: receiptReference?.trim() || 'BN-DEMO',
      confirmedAt: new Date().toISOString(),
    };
  }

  const body = new FormData();
  body.append('file', file); body.append('attested', 'true');
  if (receiptReference?.trim()) body.append('paperReference', receiptReference.trim());
  const res = await fetch(`/api/v1/staff/verification-cases/${caseId}/handover-sessions/${sessionId}/beneficiaries/${beneficiaryId}/confirmation`, {
    method: 'POST',
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      'Accept-Language': lang,
    },
    body,
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
 * PS-68-70 / PS-97: Lấy tiến độ cổng nghiệm thu kép (Dual Completion Gates): hoàn tất giao tài sản và hoàn tất xác nhận người thụ hưởng.
 * Gọi GET /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/completion-progress; lỗi HTTP có code mặc định FETCH_PROGRESS_FAILED.
 * Kết quả có assetCompletion, beneficiaryCompletion (completed, total, pending, ready), readyForClose, readyForArchive.
 * @param {string} caseId UUID hồ sơ.
 * @param {string} sessionId UUID phiên.
 * @param {Object} [options] { accessToken, signal, lang }
 * @returns {Promise<Object>} Tiến độ hoàn tất.
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
 * PS-61 / PS-97: Lấy danh sách biên bản bàn giao (Receipts) của phiên:
 * GET /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/receipts; lỗi HTTP có code mặc định FETCH_RECEIPTS_FAILED.
 * @param {string} caseId UUID hồ sơ.
 * @param {string} sessionId UUID phiên.
 * @param {Object} [options] { accessToken, signal, lang }
 * @returns {Promise<Object[]>} Danh sách biên bản (receiptId, recipientId, assetIds, attestationType, createdAt, staffId).
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
        recipientName: options.lang === 'en' ? 'Jane Doe' : 'Nguyễn Thị B',
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
 * PS-61 / PS-97: Tạo biên bản bàn giao có chữ ký xác nhận của Staff:
 * POST /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/receipts với body JSON { recipientId, assetIds, supersedesReceiptId } (supersedesReceiptId để thay thế biên bản cũ, mặc định null).
 * Lỗi HTTP có code mặc định CREATE_RECEIPT_FAILED.
 * @param {string} caseId UUID hồ sơ.
 * @param {string} sessionId UUID phiên.
 * @param {{recipientId: string, assetIds: string[], supersedesReceiptId?: string}} payload Nội dung biên bản.
 * @param {Object} [options] { accessToken, signal, lang }
 * @returns {Promise<Object>} Biên bản vừa tạo.
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
 * PS-71 / PS-97: Đóng phiên bàn giao sau khi đạt cổng nghiệm thu kép và có biên bản:
 * POST /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/close. Lỗi HTTP có code mặc định CLOSE_SESSION_FAILED.
 * Phản hồi phải có đúng sessionId và status = COMPLETED, nếu không ném Error code INVALID_RESPONSE (yêu cầu tải lại trạng thái).
 * @param {string} caseId UUID hồ sơ.
 * @param {string} sessionId UUID phiên.
 * @param {Object} [options] { accessToken, signal, lang }
 * @returns {Promise<{sessionId: string, status: 'COMPLETED', closedAt: string, proofHash: string}>}
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

  const result = await res.json();
  if (result?.sessionId !== sessionId || result.status !== 'COMPLETED') {
    const error = new Error(lang === 'en' ? 'The server has not confirmed that the session is closed. Reload its status.' : 'Máy chủ chưa xác nhận phiên đã đóng. Hãy tải lại trạng thái.');
    error.code = 'INVALID_RESPONSE'; throw error;
  }
  return result;
}

/**
 * PS-72 / PS-97: Lưu trữ kho di sản và hoàn tất đóng ca (Atomic Archive and Case Close):
 * POST /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/archive. Lỗi HTTP có code mặc định ARCHIVE_FAILED.
 * Phản hồi phải có đúng caseId, caseStatus = CLOSED và vaultStatus = ARCHIVED, nếu không ném Error code INVALID_RESPONSE. Được CloseAndArchivePage dùng.
 * @param {string} caseId UUID hồ sơ.
 * @param {string} sessionId UUID phiên.
 * @param {Object} [options] { accessToken, signal, lang }
 * @returns {Promise<{caseId: string, vaultId: string, caseStatus: 'CLOSED', vaultStatus: 'ARCHIVED', archivedAt: string}>}
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

  const result = await res.json();
  if (result?.caseId !== caseId || result.caseStatus !== 'CLOSED' || result.vaultStatus !== 'ARCHIVED') {
    const error = new Error(lang === 'en' ? 'The server has not confirmed case closure and archival. Reload its status.' : 'Máy chủ chưa xác nhận đã đóng và lưu trữ hồ sơ. Hãy tải lại trạng thái.');
    error.code = 'INVALID_RESPONSE'; throw error;
  }
  return result;
}

