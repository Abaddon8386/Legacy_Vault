import { useState, useRef, useEffect } from 'react';
import { ArrowRight, KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';
import ReceivedAssets from './ReceivedAssets.jsx';
import './SharedWithMePage.css';

/**
 * Màn hình "Tài sản thụ hưởng" theo quy trình cũ (liên kết bằng mã mời), được SharedWithMePage chọn khi không có caseLinkActions.
 * Cho nhập mã mời và gọi invitationActions.accept (hoặc redeem) kèm accessToken; nếu chưa có action thì báo dịch vụ chưa khả dụng, hướng dẫn đến quầy. Thành công thì tăng linkRevision để ReceivedAssets tải lại.
 * Có chặn đổi ngữ cảnh (đổi người dùng/token sẽ hủy request và xóa mã đã nhập) và AbortController dọn dẹp khi unmount. Danh sách tài sản đã nhận (ReceivedAssets) chỉ hiển thị với vai trò BENEFICIARY hoặc preview.
 *
 * @param {object} props
 * @param {object} [props.user] Người dùng hiện tại.
 * @param {object} [props.session] Phiên đăng nhập.
 * @param {'vi'|'en'} [props.lang='vi'] Ngôn ngữ.
 * @param {boolean} [props.isDevPreview=false] Chế độ xem trước DEV.
 * @param {string} [props.previewScenario='unlinked'] Kịch bản xem trước.
 * @param {() => void} [props.onUnauthorized] 401.
 * @param {number} [props.refreshKey=0] Ép tải lại tài sản.
 * @param {{accept?: Function, redeem?: Function}} [props.invitationActions] Bộ action mã mời.
 * @param {object} [props.receivedAssetActions] Bộ action tài sản đã nhận.
 * @returns {JSX.Element}
 */
export default function SharedWithMePage({
  user,
  session,
  lang = 'vi',
  isDevPreview = false,
  previewScenario = 'unlinked',
  onUnauthorized,
  refreshKey = 0,
  invitationActions,
  receivedAssetActions,
}) {
  const en = lang === 'en';
  const roles = session?.user?.roles || user?.roles || [];
  const canReadReceivedAssets = isDevPreview || roles.some(value => value === 'BENEFICIARY' || value === 'ROLE_BENEFICIARY');
  const activeToken = session?.accessToken;
  const contextKey = `${user?.id || 'anon'}:${activeToken || 'no-token'}`;

  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [linkStatus, setLinkStatus] = useState(null); // 'SUCCESS' | 'ERROR' | null
  const [statusMessage, setStatusMessage] = useState('');
  const [linkRevision, setLinkRevision] = useState(0);

  const abortControllerRef = useRef(null);
  const contextKeyRef = useRef(contextKey);

  // Unmount cleanup: abort ongoing redemption request
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  // Context switch guard: clear draft code & stale status when principal/token changes
  useEffect(() => {
    if (contextKeyRef.current !== contextKey) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      setCode('');
      setLinkStatus(null);
      setStatusMessage('');
      setIsSubmitting(false);
      contextKeyRef.current = contextKey;
    }
  }, [contextKey]);

  /** Gửi mã mời để liên kết hồ sơ: chống gửi lặp bằng ref AbortController, gọi invitationActions.accept/redeem({code}), hiển thị thông báo thành công/lỗi; 401 -> onUnauthorized. */
  const handleLinkSubmit = async (e) => {
    e.preventDefault();
    const cleanCode = code.trim();
    // The ref is assigned synchronously, before React can commit a disabled button.
    if (!cleanCode || abortControllerRef.current) return;

    setIsSubmitting(true);
    setLinkStatus(null);
    setStatusMessage('');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const options = { signal: controller.signal };
    if (activeToken) {
      options.accessToken = activeToken;
    }

    try {
      if (typeof invitationActions?.accept === 'function') {
        await invitationActions.accept({ code: cleanCode }, options);
      } else if (typeof invitationActions?.redeem === 'function') {
        await invitationActions.redeem({ code: cleanCode }, options);
      } else {
        // Honest notification when invitation redemption API is not wired yet
        throw new Error(
          en
            ? 'Invitation redemption service is currently unavailable. Please visit the service counter.'
            : 'Dịch vụ liên kết mã mời hiện chưa khả dụng. Vui lòng đến quầy giao dịch.'
        );
      }

      if (controller.signal.aborted || contextKeyRef.current !== contextKey) return;
      setLinkStatus('SUCCESS');
      setStatusMessage(
        en
          ? 'Inheritance record linked successfully.'
          : 'Liên kết hồ sơ thành công.'
      );
      setCode('');
      // Invalidate received assets cache so newly linked records are reloaded immediately
      setLinkRevision((rev) => rev + 1);
    } catch (err) {
      if (controller.signal.aborted || contextKeyRef.current !== contextKey) return;
      if (err?.status === 401 || err?.statusCode === 401 || err?.message === 'UNAUTHORIZED') {
        onUnauthorized?.();
      }
      setLinkStatus('ERROR');
      setStatusMessage(
        err.message ||
          (en
            ? 'Unable to link invitation code. Please check the code or contact staff at the counter.'
            : 'Không thể liên kết mã mời. Vui lòng kiểm tra lại mã hoặc liên hệ nhân viên tại quầy.')
      );
    } finally {
      // An old request must never release the next context's mutation lock.
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        if (!controller.signal.aborted && contextKeyRef.current === contextKey) {
          setIsSubmitting(false);
        }
      }
    }
  };

  return (
    <div className="lv-shared-view" aria-labelledby="shared-heading">
      {/* Page Header */}
      <div className="lv-shared-header">
        <h1 id="shared-heading" className="lv-shared-title">
          {en ? 'Shared with me' : 'Tài sản thụ hưởng'}
        </h1>
      </div>

      {/* Block 1: Link inheritance record via invitation code */}
      <section className="lv-shared-card lv-shared-link-card" aria-labelledby="link-section-title">
        <div className="lv-shared-card__header">
          <div className="lv-shared-card__icon-wrap">
            <KeyRound size={18} aria-hidden="true" />
          </div>
          <h2 id="link-section-title" className="lv-shared-card__title">
            {en ? 'Link an invitation code' : 'Liên kết mã mời'}
          </h2>
        </div>

        <form className="lv-shared-link-form" onSubmit={handleLinkSubmit} noValidate>
          <div className="lv-shared-input-row">
            <input
              type="text"
              className="lv-shared-input"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (linkStatus) setLinkStatus(null);
              }}
              placeholder={en ? 'Enter invitation code' : 'Nhập mã mời'}
              disabled={isSubmitting}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck="false"
              aria-label={en ? 'Invitation code' : 'Mã mời'}
            />
            <button
              type="submit"
              className="lv-shared-btn lv-shared-btn-primary"
              disabled={!code.trim() || isSubmitting}
            >
              <span>{isSubmitting ? (en ? 'Linking…' : 'Đang liên kết…') : (en ? 'Link' : 'Liên kết')}</span>
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>

          {linkStatus === 'SUCCESS' && (
            <div className="lv-shared-feedback lv-shared-feedback--success" role="status">
              <CheckCircle2 size={16} aria-hidden="true" />
              <span>{statusMessage}</span>
            </div>
          )}

          {linkStatus === 'ERROR' && (
            <div className="lv-shared-feedback lv-shared-feedback--error" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{statusMessage}</span>
            </div>
          )}

          <div className="lv-shared-counter-notice">
            <p className="lv-shared-counter-text">
              {en
                ? 'No code yet? Visit the counter for assistance.'
                : 'Chưa có mã? Đến quầy để được hỗ trợ.'}
            </p>
          </div>
        </form>
      </section>

      {/* Block 2: Handed-over Digital Assets list & details */}
      {canReadReceivedAssets ? <ReceivedAssets
        actions={receivedAssetActions}
        userId={user?.id || session?.user?.id}
        accessToken={session?.accessToken}
        lang={lang}
        isDevPreview={isDevPreview}
        scenario={previewScenario}
        onUnauthorized={onUnauthorized}
        refreshKey={`${refreshKey}:${linkRevision}`}
        hideTitle
      /> : <section className="lv-shared-card" role="note"><p>{en
        ? 'Shared assets are available to Beneficiary accounts. If you have just linked an invitation, sign in again to update your access.'
        : 'Tài sản được chia sẻ dành cho tài khoản Người thụ hưởng. Nếu vừa liên kết mã mời, hãy đăng nhập lại để cập nhật quyền.'}</p></section>}
    </div>
  );
}
