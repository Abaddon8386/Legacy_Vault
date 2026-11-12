// Event delegation keeps async cards working without observers or a render per pointer move.
/**
 * Theo dõi con trỏ chuột trên các vùng "surface" (owner/staff/legal/admin) để đặt biến CSS {@code --surface-x} và {@code --surface-y} cho thẻ đang hover, tạo hiệu ứng ánh sáng.
 * Dùng ủy quyền sự kiện (gắn ở phần tử gốc của shell), bỏ qua cảm ứng và khi người dùng chọn giảm chuyển động.
 * @param {PointerEvent} event Sự kiện pointermove với {@code currentTarget} là phần tử gốc.
 */
export function trackOwnerSurface(event) {
  const root = event.currentTarget;
  if (!root.matches('.lv-owner-surfaces, .lv-staff-surfaces, .lv-legal-surfaces, .lv-admin-surfaces') || event.pointerType === 'touch') return;
  const view = root.ownerDocument.defaultView;
  if (view.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const card = event.target.closest?.('.lv-owner-card, .lv-staff-glow, .lv-surface-card');
  if (!card || !root.contains(card)) return;
  const bounds = card.getBoundingClientRect();
  card.style.setProperty('--surface-x', `${event.clientX - bounds.left}px`);
  card.style.setProperty('--surface-y', `${event.clientY - bounds.top}px`);
}
