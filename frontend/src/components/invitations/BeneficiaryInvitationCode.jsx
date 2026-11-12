import { useEffect, useRef, useState } from 'react';
import { invitationMessages } from './invitationMessages.js';
import './Invitations.css';

// Internal presentation model, not an HTTP response contract.
/**
 * Kiểm tra mô hình hiển thị lời mời (không phải hợp đồng HTTP): đúng hầm/người thụ hưởng, trạng thái available|empty|expired|used|revoked, và có mã khi available.
 * @throws {Error} {@code INVALID_INVITATION_VIEW}.
 */
function readInvitationView(value, vaultId, beneficiaryId) {
  if (!value || value.vaultId !== vaultId || value.beneficiaryId !== beneficiaryId ||
      !['available', 'empty', 'expired', 'used', 'revoked'].includes(value.state)) throw Error('INVALID_INVITATION_VIEW');
  if (value.state === 'available' && (typeof value.code !== 'string' || !value.code.trim())) throw Error('INVALID_INVITATION_VIEW');
  return { state: value.state, code: value.state === 'available' ? value.code : null };
}

/**
 * Hiển thị mã mời của một người thụ hưởng cho chủ hầm: gọi hàm {@code loadInvitation({vaultId, beneficiaryId}, {accessToken, signal})} do cha cung cấp (không gọi API trực tiếp), hiện mã, nút sao chép vào clipboard và nút tải lại khi lỗi hoặc chưa có mã.
 * State: {@code view}, {@code error}, {@code retry}, {@code copyState} (idle|success|error). Không render gì nếu cha không truyền {@code loadInvitation}.
 */
function InvitationCodeView({ vaultId, beneficiaryId, accessToken, lang = 'vi', loadInvitation }) {
  const t = invitationMessages[lang] || invitationMessages.vi;
  const [view, setView] = useState(null), [error, setError] = useState(false), [retry, setRetry] = useState(0);
  const [copyState, setCopyState] = useState('idle');
  const active = useRef(true), copying = useRef(false);
  const available = typeof loadInvitation === 'function';
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    if (available) {
      Promise.resolve().then(() => {
        if (controller.signal.aborted) return;
        return loadInvitation({ vaultId, beneficiaryId }, { accessToken, signal: controller.signal });
      }).then(result => {
        if (!controller.signal.aborted) setView(readInvitationView(result, vaultId, beneficiaryId));
      }).catch(() => { if (!controller.signal.aborted) setError(true); });
    }
    return () => { active.current = false; controller.abort(); };
  }, [vaultId, beneficiaryId, accessToken, loadInvitation, available, retry]);
  /**
   * Sao chép mã mời vào clipboard ({@code navigator.clipboard.writeText}); chống gọi đồng thời; cập nhật {@code copyState}.
   */
  async function copy() {
    if (copying.current || view?.state !== 'available') return;
    copying.current = true;
    try {
      if (!navigator.clipboard?.writeText) throw Error('CLIPBOARD_UNAVAILABLE');
      await navigator.clipboard.writeText(view.code);
      if (active.current) setCopyState('success');
    } catch { if (active.current) setCopyState('error'); }
    finally { copying.current = false; }
  }
  if (!available) return null;
  return <section className="lv-invitation-code" aria-label={t.ownerLabel}>
    <strong>{t.ownerLabel}</strong>
    {error ? <p role="alert">{t.ownerError}</p> :
      !view ? <p role="status">{t.ownerLoading}</p> : view.state === 'available' ? <>
        <code dir="ltr">{view.code}</code>
        <button type="button" onClick={copy}>{t.copy}</button>
      </> : <p role="status">{view.state === 'empty' ? t.ownerEmpty : t[view.state]}</p>}
    {(error || view?.state === 'empty') && <button type="button" onClick={() => {
      setView(null); setError(false); setCopyState('idle'); setRetry(value => value + 1);
    }}>{t.retry}</button>}
    {copyState !== 'idle' && <p role={copyState === 'error' ? 'alert' : 'status'}>{copyState === 'success' ? t.copied : t.copyError}</p>}
  </section>;
}

/**
 * Bọc {@code InvitationCodeView} với {@code key} theo hầm/người thụ hưởng/token để reset khi đổi đối tượng.
 * Props: {@code vaultId}, {@code beneficiaryId}, {@code accessToken}, {@code lang}, {@code loadInvitation}.
 */
export default function BeneficiaryInvitationCode(props) {
  return <InvitationCodeView key={`${props.vaultId}:${props.beneficiaryId}:${props.accessToken || ''}`} {...props} />;
}
