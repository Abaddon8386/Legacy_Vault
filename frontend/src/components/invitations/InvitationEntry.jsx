import { invitationMessages } from './invitationMessages.js';
import './Invitations.css';

/**
 * Lối vào luồng nhận lời mời (đường dẫn {@code /invitations}) trên màn đăng nhập/đăng ký. Mặc định hiển thị liên kết "Bạn có mã mời?"; ở {@code invitationMode} hiển thị ghi chú luồng lời mời,
 * liên kết quay lại lời mời và nút thoát luồng. Liên kết điều hướng bằng {@code onNavigate} (không tải lại trang) trừ khi giữ phím bổ trợ.
 *
 * @param {object} props
 * @param {string} [props.lang='vi']
 * @param {(path:string)=>void} [props.onNavigate] Điều hướng nội bộ.
 * @param {boolean} [props.invitationMode=false] Đang trong luồng lời mời.
 * @param {()=>void} [props.onCancel] Thoát luồng lời mời.
 * @param {boolean} [props.registration=false] Đang ở màn đăng ký.
 * @param {boolean} [props.disabled=false] Khóa nút thoát.
 */
export default function InvitationEntry({ lang = 'vi', onNavigate, invitationMode = false, onCancel, registration = false, disabled = false }) {
  const t = invitationMessages[lang] || invitationMessages.vi;
  const link = label => <a href={`/invitations?lang=${lang}`} onClick={event => {
    if (!onNavigate || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); onNavigate(`/invitations?lang=${lang}`);
  }}>{label}</a>;
  return <div className="lv-invitation-entry">
    {invitationMode ? <>
      <p role="note">{registration ? t.registrationUnavailable : t.authNotice}</p>
      <p>{t.googleNotice}</p>
      {link(t.backToInvitation)}{' '}
      <button type="button" disabled={disabled} onClick={onCancel}>{t.cancelIntent}</button>
    </> : link(t.entry)}
  </div>;
}
