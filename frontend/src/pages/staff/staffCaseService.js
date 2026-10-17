import { SYNTHETIC_STAFF_CASES, isStaffSimulationPermitted } from './staffCasePreview.js';
export { SYNTHETIC_STAFF_CASES, isStaffSimulationPermitted } from './staffCasePreview.js';
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
  // BE PS-35 đã có controller/contract trên develop; adapter FE chưa nối trong PR tách giao diện này.
  // Không dùng dữ liệu tổng hợp để thay phản hồi live.
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
