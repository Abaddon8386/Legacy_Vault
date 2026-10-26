export function ownerWorkflow({ vault, summary, wills, loading, error, lang = 'vi' }) {
  const en = lang === 'en';
  const definitions = [
    ['vault', 'Khởi tạo kho', 'Create vault'], ['assets', 'Thêm tài sản', 'Add assets'],
    ['wills', 'Hồ sơ di chúc', 'Will documents'], ['beneficiaries', 'Người nhận & giám hộ', 'Recipients & guardians'],
    ['dms', 'Giám sát hoạt động', 'Activity monitoring'],
  ];
  const closed = vault && ['AWAITING_VERIFICATION', 'ON_HOLD', 'UNLOCKED', 'HANDOVER_IN_PROGRESS', 'ARCHIVED'].includes(vault.status);
  const complete = {
    vault: Boolean(vault), assets: summary?.assets?.available ? summary.assets.value > 0 : null,
    wills: wills === undefined ? null : wills > 0,
    beneficiaries: summary?.configuration?.available ? summary.configuration.value.ready : null,
    dms: summary?.dms?.available ? ['MONITORING', 'TRIGGERED', 'GRACE_PERIOD_EXCEEDED'].includes(summary.dms.value.status) : null,
  };
  const steps = definitions.map(([id, vi, english]) => ({
    id, label: en ? english : vi, href: `/${id}?lang=${lang}`,
    state: loading || error ? 'waiting' : complete[id] === true ? 'done' : !vault && id !== 'vault' ? 'blocked' : closed || complete[id] === null ? 'waiting' : 'action',
    ...(!loading && !error && vault && complete[id] === null ? { statusLabel: en ? 'Status unavailable' : 'Chưa tải được trạng thái' } : {}),
  }));
  const next = loading || error || closed ? undefined : steps.find(s => s.state === 'action');
  const message = loading ? (en ? 'Checking vault setup…' : 'Đang kiểm tra cấu hình kho…')
    : error ? (en ? 'Status unavailable. Reload to check your setup.' : 'Chưa tải được trạng thái. Tải lại để kiểm tra cấu hình.')
    : !vault ? (en ? 'Create a vault before adding assets and configuring monitoring.' : 'Khởi tạo kho trước khi thêm tài sản và cấu hình giám sát.')
    : closed ? (en ? 'The vault is in verification or handover, or archived. Check its current status before making changes.' : 'Kho đang xác minh, bàn giao hoặc đã lưu trữ. Xem trạng thái hiện tại trước khi thay đổi.')
    : next ? (en ? `Next suggested step: ${next.label.toLowerCase()}.` : `Bước gợi ý tiếp theo: ${next.label.toLowerCase()}.`)
    : steps.some(s => s.state === 'waiting') ? (en ? 'Some statuses are unavailable. Reload or open the corresponding page.' : 'Một số trạng thái chưa tải được. Tải lại hoặc mở trang tương ứng để kiểm tra.')
    : (en ? 'Setup is complete. Keep your information updated and check in on time.' : 'Đã hoàn tất cấu hình. Cập nhật thông tin khi cần và xác nhận hoạt động đúng hạn.');
  return { steps, current: next?.id, message, next: next && { ...next, label: en ? 'Continue' : 'Tiếp tục' } };
}
