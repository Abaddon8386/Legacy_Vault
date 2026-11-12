/**
 * beneficiaryAccountService.js - Dịch vụ phía frontend cho bước "xác minh và liên kết/tạo tài khoản người thụ hưởng" tại quầy của Staff.
 *
 * Được dùng bởi BeneficiaryAccountPage.jsx và LegacyCounterBeneficiariesSection.jsx.
 * Có hai chế độ: mô phỏng (dev preview/test, dữ liệu tổng hợp, không gọi mạng) và thật (gọi API backend qua request() của api/http.js).
 * Backend liên quan: POST /api/v1/staff/beneficiaries/{beneficiaryId}/account-link và POST /api/v1/staff/beneficiaries/{beneficiaryId}/account (vai trò STAFF_EXECUTOR).
 */
import { validateLinkExistingAccountForm, validateCreateBeneficiaryAccountForm } from '../../utils/beneficiaryAccountValidation.js';
import { request, ApiError } from '../../api/http.js';
import { isUuid } from '../../api/contracts.js';
/**
 * Kiểm tra hồ sơ bàn giao tại quầy (dữ liệu mô phỏng) còn cho phép ghi hay không; nếu không thì ném Error có {code}.
 *
 * Thứ tự kiểm tra: vai trò STAFF_EXECUTOR (nếu truyền options.roles) -> có dữ liệu hồ sơ -> hồ sơ chưa đóng/lưu trữ (SESSION_ALREADY_ARCHIVED) -> kho đã mở khóa UNLOCKED (VAULT_NOT_UNLOCKED) -> phê duyệt pháp lý còn hiệu lực (STALE_APPROVAL) -> phiên bàn giao đang ACTIVE (SESSION_NOT_ACTIVE, bỏ qua khi requireSession = false).
 * @param {Object} data Dữ liệu hồ sơ bàn giao (xem SYNTHETIC_HANDOVER_CASES).
 * @param {Object} [options] { lang: 'vi' | 'en', roles: string[] } dùng để chọn ngôn ngữ thông báo và kiểm tra quyền.
 * @param {boolean} [requireSession=true] Có bắt buộc phải có phiên bàn giao ACTIVE hay không.
 * @throws {Error} Error với thuộc tính code: FORBIDDEN, CASE_REQUIRED, SESSION_ALREADY_ARCHIVED, VAULT_NOT_UNLOCKED, STALE_APPROVAL hoặc SESSION_NOT_ACTIVE.
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
 * Bộ hồ sơ bàn giao tổng hợp (không phải dữ liệu thật) cho chế độ dev preview và unit test.
 *
 * Mỗi khóa là một kịch bản: 'case-standard' (đã mở khóa, phiên ACTIVE), 'case-locked-vault' (kho chưa mở khóa, chưa có phê duyệt pháp lý),
 * 'case-out-of-scope' (có tài sản ngoài phạm vi phân bổ), 'case-partial-progress' (tài sản đã giao nhưng người thụ hưởng chưa xác nhận)
 * và 'case-archived' (đã đóng, chỉ đọc, có receiptSummary). Dùng bởi fetchHandoverCase().
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
 * Cho biết môi trường hiện tại có được phép chạy chế độ mô phỏng bàn giao tại quầy hay không.
 *
 * Trả về false nếu có accessToken thật hoặc đang ở bản build production (Vite PROD hoặc options.testEnv.PROD);
 * ngược lại chỉ trả về true khi options.isDevPreview hoặc options.isTest được bật.
 * @param {Object} [options] { accessToken, testEnv, isDevPreview, isTest }
 * @returns {boolean} true nếu được dùng dữ liệu mô phỏng.
 */
export function isCounterHandoverSimulationPermitted(options = {}) {
  if (options.accessToken) return false;
  const isViteProd = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.PROD);
  const isTestProd = Boolean(options.testEnv?.PROD);
  if (isViteProd || isTestProd) return false;
  return Boolean(options.isDevPreview) || Boolean(options.isTest);
}
/**
 * Tải hồ sơ bàn giao tại quầy.
 *
 * Chỉ hỗ trợ chế độ mô phỏng: trả về bản sao sâu của kịch bản trong SYNTHETIC_HANDOVER_CASES (kịch bản 'error' giả lập lỗi mạng MOCK_NETWORK_ERROR;
 * hồ sơ ARCHIVED được gắn caseStatus = CLOSED và archiveReceipt). Ngoài chế độ mô phỏng luôn ném lỗi BACKEND_NOT_READY (status 503) vì chưa có endpoint thật.
 * @param {string} [scenarioKey='case-standard'] Khóa kịch bản mô phỏng.
 * @param {Object} [options] { signal (AbortSignal), isDevPreview, isTest, accessToken }
 * @returns {Promise<{caseData: Object, isSimulation: boolean}>}
 * @throws {Error} AbortError khi bị hủy; BACKEND_NOT_READY (503); MOCK_NETWORK_ERROR (500).
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
 * Kiểm tra biên nhận backend trả về sau khi liên kết/tạo tài khoản người thụ hưởng có đúng hợp đồng API hay không.
 *
 * Yêu cầu: result là object; beneficiaryId là UUID và trùng expectedBeneficiaryId; accountId là UUID;
 * accountStatus = 'ACCOUNT_CREATED'; identityVerificationStatus = 'VERIFIED_AT_COUNTER'.
 * @param {Object} result Phản hồi của backend.
 * @param {string} expectedBeneficiaryId Mã người thụ hưởng đã gửi yêu cầu.
 * @returns {boolean} true nếu hợp lệ.
 * @throws {ApiError} ApiError('INVALID_RECEIPT', 500) khi phản hồi sai định dạng.
 */
export function validateBeneficiaryAccountReceipt(result, expectedBeneficiaryId) {
  if (!result || typeof result !== 'object') {
    const err = new ApiError('INVALID_RECEIPT', 500);
    throw err;
  }
  if (!isUuid(result.beneficiaryId) || result.beneficiaryId !== expectedBeneficiaryId) {
    const err = new ApiError('INVALID_RECEIPT', 500);
    throw err;
  }
  if (!isUuid(result.accountId)) {
    const err = new ApiError('INVALID_RECEIPT', 500);
    throw err;
  }
  if (result.accountStatus !== 'ACCOUNT_CREATED') {
    const err = new ApiError('INVALID_RECEIPT', 500);
    throw err;
  }
  if (result.identityVerificationStatus !== 'VERIFIED_AT_COUNTER') {
    const err = new ApiError('INVALID_RECEIPT', 500);
    throw err;
  }
  return true;
}

/**
 * Liên kết người thụ hưởng với một tài khoản LegacyVault đã tồn tại theo email.
 *
 * Các bước: (1) ở chế độ mô phỏng thì kiểm tra assertHandoverWritable; (2) validateLinkExistingAccountForm(email) - sai thì ném VALIDATION_FAILED kèm fieldErrors.email;
 * (3) mô phỏng thì trả kết quả giả; (4) không có accessToken thì ném BACKEND_NOT_READY; (5) gọi
 * POST /api/v1/staff/beneficiaries/{beneficiaryId}/account-link với body { accountEmail } (kỳ vọng HTTP 200), rồi validateBeneficiaryAccountReceipt().
 * Lỗi mạng hoặc 503 được chuyển thành BACKEND_NOT_READY; AbortError và các lỗi ApiError khác được ném lại nguyên vẹn.
 * Được dùng bởi BeneficiaryAccountPage.jsx và LegacyCounterBeneficiariesSection.jsx.
 * @param {string} beneficiaryId UUID người thụ hưởng.
 * @param {string} email Email tài khoản cần liên kết.
 * @param {Object} [options] { accessToken, lang, signal, fetchFn, caseData, roles, isDevPreview, isTest }
 * @returns {Promise<{beneficiaryId: string, linkedUserId: string, linkedEmail: string, status: 'LINKED', accountStatus: string, identityVerificationStatus: string}>}
 */
export async function linkExistingBeneficiaryAccount(beneficiaryId, email, options = {}) {
  const isSimulation = isCounterHandoverSimulationPermitted(options);
  if (isSimulation) assertHandoverWritable(options.caseData, options);
  const validation = validateLinkExistingAccountForm(email);
  if (!validation.isValid) {
    const err = new Error(options.lang === 'en' ? validation.messageEn : validation.messageVi);
    err.code = 'VALIDATION_FAILED';
    err.fieldErrors = { email: validation.errorKey };
    throw err;
  }

  if (isSimulation) {
    return {
      beneficiaryId,
      linkedUserId: `usr-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      linkedEmail: validation.email,
      status: 'LINKED',
      accountStatus: 'ACCOUNT_CREATED',
      identityVerificationStatus: 'VERIFIED_AT_COUNTER',
    };
  }

  if (!options.accessToken) {
    const notReadyError = new Error(options.lang === 'en' ? 'Account linking service is not available.' : 'Dịch vụ liên kết tài khoản chưa sẵn sàng từ máy chủ.');
    notReadyError.code = 'BACKEND_NOT_READY';
    notReadyError.status = 503;
    throw notReadyError;
  }

  try {
    const result = await request(`/staff/beneficiaries/${beneficiaryId}/account-link`, {
      method: 'POST',
      body: { accountEmail: validation.email },
      accessToken: options.accessToken,
      lang: options.lang || 'vi',
      signal: options.signal,
      fetchFn: options.fetchFn,
      expectedStatus: 200,
    });
    validateBeneficiaryAccountReceipt(result, beneficiaryId);
    return {
      beneficiaryId: result.beneficiaryId,
      linkedUserId: result.accountId,
      linkedEmail: validation.email,
      status: 'LINKED',
      accountStatus: result.accountStatus,
      identityVerificationStatus: result.identityVerificationStatus,
    };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    if (err.code === 'NETWORK_ERROR' || err.status === 503) {
      const notReady = new Error(options.lang === 'en' ? 'Counter account linking service is not ready.' : 'Dịch vụ liên kết tài khoản tại quầy chưa sẵn sàng trên máy chủ.');
      notReady.code = 'BACKEND_NOT_READY';
      notReady.status = 503;
      throw notReady;
    }
    throw err;
  }
}

/**
 * Tạo tài khoản mới cho người thụ hưởng ngay tại quầy rồi liên kết với hồ sơ.
 *
 * Các bước: kiểm tra ghi được (chỉ mô phỏng) -> validateCreateBeneficiaryAccountForm(formData) (sai thì ném VALIDATION_FAILED kèm fieldErrors) ->
 * mô phỏng thì trả kết quả giả -> thiếu accessToken thì ném BACKEND_NOT_READY -> gọi POST /api/v1/staff/beneficiaries/{beneficiaryId}/account
 * với body { email, password, phone? } (kỳ vọng HTTP 201) -> validateBeneficiaryAccountReceipt(). Lỗi mạng hoặc 503 được chuyển thành BACKEND_NOT_READY.
 * Được dùng bởi BeneficiaryAccountPage.jsx và LegacyCounterBeneficiariesSection.jsx.
 * @param {string} beneficiaryId UUID người thụ hưởng.
 * @param {{email: string, password: string, phone?: string}} formData Dữ liệu biểu mẫu tạo tài khoản.
 * @param {Object} [options] { accessToken, lang, signal, fetchFn, caseData, roles, isDevPreview, isTest }
 * @returns {Promise<{beneficiaryId: string, linkedUserId: string, linkedEmail: string, status: 'LINKED', activatedAtCounter: boolean, accountStatus: string, identityVerificationStatus: string}>}
 */
export async function createAndLinkBeneficiaryAccount(beneficiaryId, formData = {}, options = {}) {
  const isSimulation = isCounterHandoverSimulationPermitted(options);
  if (isSimulation) assertHandoverWritable(options.caseData, options);
  const validation = validateCreateBeneficiaryAccountForm(formData, { isLive: !isSimulation });
  if (!validation.isValid) {
    const err = new Error('Thông tin tạo tài khoản không hợp lệ.');
    err.code = 'VALIDATION_FAILED';
    err.fieldErrors = validation.errors;
    throw err;
  }

  if (isSimulation) {
    return {
      beneficiaryId,
      linkedUserId: `usr-new-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      linkedEmail: formData.email.trim(),
      status: 'LINKED',
      activatedAtCounter: true,
      accountStatus: 'ACCOUNT_CREATED',
      identityVerificationStatus: 'VERIFIED_AT_COUNTER',
    };
  }

  if (!options.accessToken) {
    const notReadyError = new Error(options.lang === 'en' ? 'Account creation service is not available.' : 'Dịch vụ tạo tài khoản thụ hưởng chưa sẵn sàng từ máy chủ.');
    notReadyError.code = 'BACKEND_NOT_READY';
    notReadyError.status = 503;
    throw notReadyError;
  }

  try {
    const payload = {
      email: validation.email || formData.email.trim(),
      password: formData.password,
    };
    if (typeof formData.phone === 'string' && formData.phone.trim().length > 0) {
      payload.phone = formData.phone.trim();
    }
    const result = await request(`/staff/beneficiaries/${beneficiaryId}/account`, {
      method: 'POST',
      body: payload,
      accessToken: options.accessToken,
      lang: options.lang || 'vi',
      signal: options.signal,
      fetchFn: options.fetchFn,
      expectedStatus: 201,
    });
    validateBeneficiaryAccountReceipt(result, beneficiaryId);
    return {
      beneficiaryId: result.beneficiaryId,
      linkedUserId: result.accountId,
      linkedEmail: payload.email,
      status: 'LINKED',
      activatedAtCounter: true,
      accountStatus: result.accountStatus,
      identityVerificationStatus: result.identityVerificationStatus,
    };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    if (err.code === 'NETWORK_ERROR' || err.status === 503) {
      const notReady = new Error(options.lang === 'en' ? 'Counter account creation service is not ready.' : 'Dịch vụ tạo tài khoản thụ hưởng tại quầy chưa sẵn sàng trên máy chủ.');
      notReady.code = 'BACKEND_NOT_READY';
      notReady.status = 503;
      throw notReady;
    }
    throw err;
  }
}
