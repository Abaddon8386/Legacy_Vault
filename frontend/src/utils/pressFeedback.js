// Click feedback for the Staff and Legal workspaces. Two effects start at the exact point that was clicked:
//  - a ring on the page, centred on the pointer, that spreads freely (not cut to the control's shape);
//  - a soft fill inside the control (buttons, tabs, links, choice buttons), clipped to the control, that spreads from the same point.
// Cards and table rows, and tabs, also dip slightly. The look lives in workflowMotion.css.
// A CSS :active state would end the moment the mouse is released, so a quick click would show nothing.
/**
 * Các vùng giao diện (nhân viên và pháp lý) được áp dụng hiệu ứng phản hồi khi nhấn.
 */
const SURFACES = '.lv-staff-surfaces, .lv-legal-surfaces';
/**
 * Bộ chọn các điều khiển có hiệu ứng gợn (nút, tab, liên kết, lựa chọn).
 */
const RIPPLE = 'button:not(:disabled), [role="tab"], a[href], label.lv-choice';
/**
 * Bộ chọn các phần tử có hiệu ứng nhún nhẹ khi nhấn (thẻ, hàng bảng, tab).
 */
const DIP = '.lv-staff-card, .lv-staff-table-row, [role="tab"]';

/**
 * Tạo vòng tròn lan tỏa trên trang, tâm tại vị trí con trỏ (lớp lv-click-ring), tự xóa khi hết animation.
 */
function ring(event, doc) {
  const circle = doc.createElement('span');
  circle.className = 'lv-click-ring';
  circle.setAttribute('aria-hidden', 'true');
  circle.style.left = `${event.clientX}px`;
  circle.style.top = `${event.clientY}px`;
  doc.body.append(circle);
  circle.addEventListener('animationend', () => circle.remove(), { once: true });
}

/**
 * Tạo hiệu ứng gợn nền bên trong điều khiển được nhấn, bị cắt theo hình điều khiển và lan từ điểm nhấn (lớp lv-ripple); dọn dẹp lớp và style tạm khi xong.
 */
function fill(el, event, doc, win) {
  const box = el.getBoundingClientRect();
  const size = Math.max(box.width, box.height) * 2.2 || 80;
  const x = (event.clientX || box.left + box.width / 2) - box.left;
  const y = (event.clientY || box.top + box.height / 2) - box.top;
  const circle = doc.createElement('span');
  circle.className = 'lv-ripple';
  circle.setAttribute('aria-hidden', 'true');
  Object.assign(circle.style, { width: `${size}px`, height: `${size}px`, left: `${x - size / 2}px`, top: `${y - size / 2}px` });
  const placed = win.getComputedStyle(el).position === 'static';
  if (placed) el.style.position = 'relative';
  el.classList.add('lv-rippling');
  el.append(circle);
  circle.addEventListener('animationend', () => {
    circle.remove();
    if (!el.querySelector(':scope > .lv-ripple')) {
      el.classList.remove('lv-rippling');
      if (placed) el.style.removeProperty('position');
    }
  }, { once: true });
}

/**
 * Cài bộ lắng nghe pointerdown (giai đoạn capture) để thêm hiệu ứng nhấn cho các vùng nhân viên/pháp lý. Bỏ qua nếu người dùng chọn giảm chuyển động. Trả hàm gỡ bộ lắng nghe. Được gọi trong main.jsx.
 */
export function installPressFeedback(doc = document, win = window) {
  if (win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};
  const press = (event) => {
    if (event.button > 0) return;
    const hit = event.target.closest?.(`${RIPPLE}, ${DIP}`);
    if (!hit || !hit.closest(SURFACES)) return;
    if (hit.matches(RIPPLE)) { ring(event, doc); fill(hit, event, doc, win); }
    if (!hit.matches(DIP)) return;
    hit.classList.remove('lv-press');
    void hit.offsetWidth; // restart the animation when the same control is pressed again
    hit.classList.add('lv-press');
    hit.addEventListener('animationend', (e) => { if (e.target === hit) hit.classList.remove('lv-press'); }, { once: true });
  };
  doc.addEventListener('pointerdown', press, true);
  return () => doc.removeEventListener('pointerdown', press, true);
}
