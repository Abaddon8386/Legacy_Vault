/**
 * LegacyVault — Service & Ranh giới tích hợp Staff Verification Cases (PS-25)
 *
 * QUY TẮC AN TOÀN & KIẾN TRÚC:
 * 1. Hiện tại chưa có Controller và Contract chính thức cho PS-35 từ Backend (Long phụ trách).
 * 2. Tuyệt đối KHÔNG tự phỏng đoán endpoint, enum, query schema để gọi API thật.
 * 3. Ở chế độ Live (người dùng đã đăng nhập hoặc Production):
 *    -> Báo lỗi `BACKEND_NOT_READY` để UI hiển thị trạng thái "Dịch vụ chưa sẵn sàng".
 * 4. Ở chế độ DEV Preview (?preview=true trong DEV môi trường, KHÔNG có accessToken):
 *    -> Cung cấp dữ liệu tổng hợp (synthetic fixture data) để phục vụ review thiết kế giao diện.
 * 5. Khi build Production (PROD = true), khóa 100% chế độ mô phỏng.
 */


// Dữ liệu tổng hợp phong phú phục vụ kiểm thử và xem trước DEV (nhiều trang & trạng thái)
export const SYNTHETIC_STAFF_CASES = [
  {
    id: 'case-001',
    caseNumber: 'CASE-2026-0001',
    vaultId: 'vlt-11111111-4111-8111-111111111111',
    vaultName: 'Kho Di Sản Gia Đình Vance',
    ownerName: 'Trần Đình Trọng',
    gracePeriodEndedAt: '2026-10-12T08:00:00Z',
    status: 'AWAITING_VERIFICATION',
  },
  {
    id: 'case-002',
    caseNumber: 'CASE-2026-0002',
    vaultId: 'vlt-22222222-4222-8222-222222222222',
    vaultName: 'Tài Sản Cá Nhân Nguyễn Mai',
    ownerName: 'Nguyễn Thị Mai',
    gracePeriodEndedAt: '2026-10-13T14:30:00Z',
    status: 'IN_PROGRESS',
  },
  {
    id: 'case-003',
    caseNumber: 'CASE-2026-0003',
    vaultId: 'vlt-33333333-4333-8333-333333333333',
    vaultName: 'Kho Di Sản Hùng Cường',
    ownerName: 'Phạm Quốc Hùng',
    gracePeriodEndedAt: '2026-10-14T09:15:00Z',
    status: 'AWAITING_VERIFICATION',
  },
  {
    id: 'case-004',
    caseNumber: 'CASE-2026-0004',
    vaultId: 'vlt-44444444-4444-8444-444444444444',
    vaultName: 'Di Sản Gia Tộc Lê Hoàng',
    ownerName: 'Lê Hoàng Yến',
    gracePeriodEndedAt: '2026-10-14T16:45:00Z',
    status: 'VERIFIED',
  },
  {
    id: 'case-005',
    caseNumber: 'CASE-2026-0005',
    vaultId: 'vlt-55555555-4555-8555-555555555555',
    vaultName: 'Lưu Trữ Di Sản Kỹ Thuật Số Vũ Đức',
    ownerName: 'Vũ Đức Đam',
    gracePeriodEndedAt: '2026-10-15T07:20:00Z',
    status: 'AWAITING_VERIFICATION',
  },
  {
    id: 'case-006',
    caseNumber: 'CASE-2026-0006',
    vaultId: 'vlt-66666666-4666-8666-666666666666',
    vaultName: 'Kho Di Sản Đỗ Gia',
    ownerName: 'Đỗ Mỹ Linh',
    gracePeriodEndedAt: '2026-10-15T11:00:00Z',
    status: 'IN_PROGRESS',
  },
  {
    id: 'case-007',
    caseNumber: 'CASE-2026-0007',
    vaultId: 'vlt-77777777-4777-8777-777777777777',
    vaultName: 'Di Sản Nghệ Thuật Hoàng Bách',
    ownerName: 'Hoàng Bách',
    gracePeriodEndedAt: '2026-10-15T18:10:00Z',
    status: 'AWAITING_VERIFICATION',
  },
  {
    id: 'case-008',
    caseNumber: 'CASE-2026-0008',
    vaultId: 'vlt-88888888-4888-8888-888888888888',
    vaultName: 'Kho Tư Liệu Số Nguyễn Bảo',
    ownerName: 'Nguyễn Quốc Bảo',
    gracePeriodEndedAt: '2026-10-15T20:00:00Z',
    status: 'VERIFIED',
  },
];

/**
 * Kiểm tra xem môi trường hiện tại có cho phép chạy dữ liệu tổng hợp (synthetic fixture) hay không.
 */
export function isStaffSimulationPermitted(options = {}) {
  // 1. Nếu có token đăng nhập thật -> Tuyệt đối không dùng mô phỏng
  if (options.accessToken) return false;

  // 2. Nếu ở Production build -> Khóa hoàn toàn mô phỏng
  const isViteProd = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.PROD);
  const isTestProd = Boolean(options.testEnv?.PROD);
  if (isViteProd || isTestProd) return false;

  // 3. Cho phép khi ở DEV mode có bật isDevPreview hoặc trong môi trường test (isTest)
  return Boolean(options.isDevPreview) || Boolean(options.isTest);
}

/**
 * Lấy danh sách hồ sơ cần xác minh cho Staff.
 * @param {Object} options - { page, size, status, accessToken, isDevPreview, isTest, lang, signal }
 */
export async function fetchStaffCases(options = {}) {
  const { page = 0, size = 5, status = 'ALL', signal } = options;

  if (signal?.aborted) {
    const abortErr = new Error('Request aborted');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  // Nếu được phép mô phỏng (DEV preview hoặc unit test):
  if (isStaffSimulationPermitted(options)) {
    // Độ trễ nhẹ mô phỏng mạng trong DEV preview khi không ở môi trường test
    const isTestEnvironment = Boolean(
      options.isTest ||
      (typeof globalThis !== 'undefined' && globalThis.IS_REACT_ACT_ENVIRONMENT)
    );
    if (!isTestEnvironment) {
      await new Promise((r) => setTimeout(r, 150));
    }

    if (signal?.aborted) {
      const abortErr = new Error('Request aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    // Lọc theo trạng thái
    let filtered = [...SYNTHETIC_STAFF_CASES];
    if (status && status !== 'ALL') {
      filtered = filtered.filter((c) => c.status === status);
    }

    const totalElements = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalElements / size));
    const safePage = Math.min(page, totalPages - 1);
    const start = safePage * size;
    const paginated = filtered.slice(start, start + size);

    return {
      content: paginated,
      page: safePage,
      size,
      totalElements,
      totalPages,
      isSimulation: true,
    };
  }

  // Chế độ thật (Live Mode):
  // Vì Long (BE) chưa cung cấp controller và contract chính thức cho PS-35,
  // chúng ta không được phép gọi endpoint phỏng đoán.
  // Trả về lỗi BACKEND_NOT_READY rõ ràng để UI hiển thị trạng thái phù hợp.
  const notReadyError = new Error(
    'Dịch vụ tiếp nhận hồ sơ xác minh (PS-35) hiện chưa được kết nối máy chủ.'
  );
  notReadyError.code = 'BACKEND_NOT_READY';
  notReadyError.status = 503;
  throw notReadyError;
}

/**
 * Kiểm tra tính hợp lệ của dữ liệu biểu mẫu tiếp nhận hồ sơ (PS-26 / PS-38)
 */
