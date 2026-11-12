import { useEffect, useMemo, useState } from 'react';
import { loadStaffCase } from '../pages/staff/staffLiveService.js';

// Optional display metadata; permissions and mutations remain server-controlled.
/**
 * Hook React lấy thông tin hiển thị (số hồ sơ, v.v.) của một hồ sơ nhân viên khi chưa được truyền sẵn.
 * Tham số: caseId, provided (metadata đã có), accessToken, lang, preview. State: loaded (kết quả tải). Effect: nếu không phải preview, có token, chưa có caseNumber và caseId là UUID thì gọi loadStaffCase (staffLiveService.js, endpoint hồ sơ của nhân viên) và hủy bằng AbortController khi đổi/thoát; lỗi bị bỏ qua vì đây chỉ là dữ liệu hiển thị.
 * Trả metadata hợp nhất (dữ liệu provided ưu tiên). Dùng bởi BeneficiaryConfirmationPage, ScopedAssetHandoverPage và StaffLegalDocumentsPage.
 */
export function useStaffCaseMetadata(caseId, provided, accessToken, lang, preview) {
  const [loaded, setLoaded] = useState(null);
  const known = provided && (!provided.caseId || provided.caseId === caseId) ? provided : null;
  useEffect(() => {
    if (preview || !accessToken || known?.caseNumber || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(caseId || '')) return;
    const controller = new AbortController();
    loadStaffCase(caseId, {accessToken, lang, signal: controller.signal})
      .then(item => { if (!controller.signal.aborted) setLoaded({caseId, accessToken, item}); })
      .catch(() => { /* Display metadata never substitutes for an authorized workflow response. */ });
    return () => controller.abort();
  }, [caseId, accessToken, lang, preview, known?.caseNumber]);
  const current = loaded?.caseId === caseId && loaded.accessToken === accessToken ? loaded.item : null;
  return useMemo(() => {
    if (!current) return known;
    if (!known) return current;
    return { ...current, ...known };
  }, [current, known]);
}
