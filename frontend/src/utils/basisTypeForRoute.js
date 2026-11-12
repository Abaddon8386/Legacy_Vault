// Document type that goes with a dossier route. A type the staff member already picked is kept
// when it is valid for the route, so reloading the dossier never changes it behind their back.
/**
 * Các loại văn bản căn cứ pháp lý hợp lệ theo từng tuyến hồ sơ (NOTARIAL: công chứng phân chia; COURT: bản án/quyết định tòa).
 */
const allowedByRoute = {
  NOTARIAL: ['NOTARIAL_PARTITION'],
  COURT: ['COURT_JUDGMENT', 'COURT_DECISION'],
};

/**
 * Trả về loại văn bản phù hợp với tuyến hồ sơ: giữ nguyên loại hiện tại nếu hợp lệ, ngược lại lấy loại đầu tiên cho tuyến đó.
 * @param {string} current Loại đang chọn.
 * @param {string} route NOTARIAL hoặc COURT (tuyến khác trả nguyên current).
 * Dùng bởi pages/staff/StaffLegalDocumentsPage.jsx.
 */
export function basisTypeForRoute(current, route) {
  const allowed = allowedByRoute[route];
  if (!allowed) return current;
  return allowed.includes(current) ? current : allowed[0];
}
