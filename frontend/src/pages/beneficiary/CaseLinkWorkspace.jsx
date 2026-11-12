import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '../../components/common/Button.jsx';
import FeedbackNotice from '../../components/common/FeedbackNotice.jsx';
import { isPersonalRecipient, readLinkRequest, readLinkRequests, requestStatusLabel, caseLinkError } from '../../utils/caseLinkModel.js';
import ReceivedAssets from './ReceivedAssets.jsx';
import BeneficiaryHandoverStatus from './BeneficiaryHandoverStatus.jsx';
import './SharedWithMePage.css';

/**
 * Màn hình "Tài sản thụ hưởng" theo quy trình liên kết hồ sơ mới của người thụ hưởng (chọn bởi SharedWithMePage khi có caseLinkActions). Vỏ bọc dùng key theo (userId, accessToken, roles)
 * để reset trạng thái khi đổi tài khoản/quyền.
 *
 * @param {object} props Truyền xuống SharedContent (user, session, lang, isDevPreview, previewScenario, onUnauthorized, refreshKey, caseLinkActions, receivedAssetActions, onRefreshAccount).
 * @returns {JSX.Element}
 */
export default function CaseLinkWorkspace(props) {
  return <SharedContent key={`${props.session?.user?.id || props.user?.id || ''}:${props.session?.accessToken || ''}:${(props.session?.user?.roles || props.user?.roles || []).join(',')}`} {...props} />;
}
/**
 * Nội dung chính: gửi yêu cầu liên kết hồ sơ bằng mã hồ sơ (ví dụ HS-2026-000123), theo dõi/hủy yêu cầu, và xem tài sản đã được bàn giao.
 * Các thao tác qua caseLinkActions (liveCaseLinkActions trong utils/caseLinkService.js):
 * - listOwn: GET /api/v1/beneficiary-link-requests (danh sách yêu cầu của chính mình);
 * - submit: POST /api/v1/beneficiary-link-requests {caseCode};
 * - cancel: POST /api/v1/beneficiary-link-requests/{requestId}/cancel;
 * - loadHandoverStatus: GET /api/v1/beneficiary-handover-status (truyền cho BeneficiaryHandoverStatus).
 * Khi có yêu cầu PENDING, component tự thăm dò (poll) mỗi 4 giây và khi cửa sổ lấy lại focus để người dùng thấy quyết định của Staff. Mọi đọc/ghi dùng AbortController; mutation chạy độc quyền (mutation ref),
 * lỗi ghi khiến trạng thái "không chắc chắn" (uncertain) buộc người dùng tải lại trước khi thao tác tiếp. Yêu cầu APPROVED mà tài khoản chưa có vai trò BENEFICIARY thì hiện nút "Cập nhật quyền tài khoản" (onRefreshAccount).
 * Tài sản đã giao hiển thị qua ReceivedAssets (chỉ khi có vai trò BENEFICIARY hoặc preview).
 *
 * @param {object} props
 * @param {object} [props.user] Người dùng hiện tại.
 * @param {object} [props.session] Phiên đăng nhập {accessToken, user}.
 * @param {'vi'|'en'} [props.lang='vi'] Ngôn ngữ.
 * @param {boolean} [props.isDevPreview=false] Chế độ xem trước DEV (không token).
 * @param {string} [props.previewScenario='unlinked'] Kịch bản xem trước.
 * @param {() => void} [props.onUnauthorized] Gọi khi API trả 401.
 * @param {number} [props.refreshKey=0] Đổi giá trị để ép tải lại.
 * @param {object} [props.caseLinkActions] Bộ action liên kết hồ sơ.
 * @param {object} [props.receivedAssetActions] Bộ action tài sản đã nhận.
 * @param {Function} [props.onRefreshAccount] Làm mới thông tin tài khoản (lấy lại vai trò).
 * @returns {JSX.Element}
 */
function SharedContent({ user, session, lang = 'vi', isDevPreview = false, previewScenario = 'unlinked',
  onUnauthorized, refreshKey = 0, caseLinkActions, receivedAssetActions, onRefreshAccount }) {
  const en = lang === 'en';
  const roles = session?.user?.roles || user?.roles || [];
  const preview = Boolean(import.meta.env.DEV && isDevPreview && !session?.accessToken);
  const eligible = preview || isPersonalRecipient(roles);
  const canRead = preview || roles.some(role => ['BENEFICIARY', 'ROLE_BENEFICIARY'].includes(role));
  const [code, setCode] = useState('');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [uncertain, setUncertain] = useState(false);
  const [revision, setRevision] = useState(0);
  const [readRevision, setReadRevision] = useState(0);
  const [receivedStage, setReceivedStage] = useState(() => (['partial', 'received'].includes(previewScenario) ? previewScenario.toUpperCase() : null));
  /** Ghi nhận giai đoạn nhận tài sản (PARTIAL/RECEIVED...) do ReceivedAssets báo lên, dùng để sắp xếp thứ tự các thẻ. */
  const recordStage = useCallback(stage => setReceivedStage(stage), []);
  const mutation = useRef(null);
  const read = useRef(null);
  const pollTimerRef = useRef(null);
  const runPollRef = useRef(null);
  const uncertainRef = useRef(false);
  const onUnauthorizedRef = useRef(onUnauthorized);
  useEffect(() => { onUnauthorizedRef.current = onUnauthorized; }, [onUnauthorized]);
  const ready = eligible && typeof caseLinkActions?.submit === 'function' && typeof caseLinkActions?.listOwn === 'function';
  useEffect(() => () => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    mutation.current?.abort();
    read.current?.abort();
  }, []);

  /**
   * Thăm dò nền danh sách yêu cầu liên kết (caseLinkActions.listOwn): không hủy lần đọc đang chạy, không bật trạng thái loading;
   * bỏ qua nếu đang có mutation, trạng thái không chắc chắn hoặc tab đang ẩn. Còn PENDING thì hẹn lần thăm dò sau 4 giây; 401 -> onUnauthorized.
   */
  // Perform a background poll without aborting an already in-flight read or flashing loading state
  const runPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (!ready || mutation.current || read.current || uncertainRef.current) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    const c = new AbortController();
    read.current = c;
    Promise.resolve()
      .then(() => caseLinkActions.listOwn({ accessToken: session?.accessToken, signal: c.signal, lang }))
      .then(raw => {
        if (c.signal.aborted || read.current !== c || mutation.current || uncertainRef.current) return;
        const nextList = readLinkRequests(raw);
        setRequests(nextList);
        setError(null);
        uncertainRef.current = false;
        setUncertain(false);
        if (nextList.some(r => r.status === 'PENDING')) {
          pollTimerRef.current = setTimeout(() => runPollRef.current?.(), 4000);
        }
      })
      .catch(err => {
        if (c.signal.aborted || read.current !== c || mutation.current || uncertainRef.current) return;
        setError(err);
        if (err.status === 401) {
          onUnauthorizedRef.current?.();
          return;
        }
        pollTimerRef.current = setTimeout(() => runPollRef.current?.(), 4000);
      })
      .finally(() => {
        if (read.current === c) read.current = null;
      });
  }, [ready, caseLinkActions, session?.accessToken, lang]);

  useEffect(() => {
    runPollRef.current = runPoll;
  }, [runPoll]);

  useEffect(() => {
    if (!ready || mutation.current) return undefined;
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    read.current?.abort();
    const c = new AbortController();
    read.current = c;
    // Async reads and their completion are scoped to the current account.
    Promise.resolve().then(() => { if (!c.signal.aborted) setLoading(true); });
    Promise.resolve()
      .then(() => caseLinkActions.listOwn({ accessToken: session?.accessToken, signal: c.signal, lang }))
      .then(raw => {
        if (c.signal.aborted || read.current !== c || mutation.current) return;
        const nextList = readLinkRequests(raw);
        setRequests(nextList);
        setError(null);
        uncertainRef.current = false;
        setUncertain(false);
        if (nextList.some(r => r.status === 'PENDING')) {
          pollTimerRef.current = setTimeout(runPoll, 4000);
        }
      })
      .catch(err => {
        if (!c.signal.aborted && read.current === c && !mutation.current) {
          setError(err);
          if (err.status === 401) onUnauthorizedRef.current?.();
        }
      })
      .finally(() => {
        if (read.current === c) read.current = null;
        if (!c.signal.aborted) setLoading(false);
      });
    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      if (read.current === c) read.current = null;
      c.abort();
    };
  }, [ready, caseLinkActions, session?.accessToken, lang, refreshKey, revision, runPoll]);

  // Auto-refresh when any request is PENDING so Beneficiary sees staff decision without manual reload.
  // Wait for in-flight request and mutations to settle before scheduling the next poll; never abort an active poll on timer/focus.
  const hasPendingRequests = requests.some(r => r.status === 'PENDING');
  useEffect(() => {
    if (!ready || !hasPendingRequests || uncertain) {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return undefined;
    }
    if (!loading && !pending && !read.current && !mutation.current && !pollTimerRef.current) {
      pollTimerRef.current = setTimeout(runPoll, 4000);
    }
    const onVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible' && !uncertainRef.current && !mutation.current && !read.current) {
        runPoll();
      }
    };
    window.addEventListener('focus', onVisibilityOrFocus);
    document.addEventListener('visibilitychange', onVisibilityOrFocus);
    return () => {
      window.removeEventListener('focus', onVisibilityOrFocus);
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
    };
  }, [ready, hasPendingRequests, loading, pending, uncertain, runPoll]);

  /**
   * Gửi hoặc hủy một yêu cầu liên kết.
   * Với kind 'submit' gọi caseLinkActions.submit({caseNumber}) (mã viết hoa), với 'cancel' gọi caseLinkActions.cancel({requestId}); kiểm tra phản hồi qua readLinkRequest (đúng trạng thái PENDING/CANCELLED, khớp id và mã hồ sơ)
   * rồi cập nhật danh sách. Lỗi đặt cờ uncertain để buộc tải lại trạng thái; 401 -> onUnauthorized.
   *
   * @param {'submit'|'cancel'} kind Loại thao tác.
   * @param {object} [item] Yêu cầu cần hủy (khi kind là 'cancel').
   */
  async function mutate(kind, item) {
    if (mutation.current || !ready || loading || uncertain) return;
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    const c = new AbortController(); mutation.current = c; read.current?.abort(); read.current = null;
    setPending(true); setError(null); setNotice(null);
    try {
      const raw = kind === 'submit'
        ? await caseLinkActions.submit({ caseNumber: code.trim().toUpperCase() }, { accessToken: session?.accessToken, lang, signal: c.signal })
        : await caseLinkActions.cancel({ requestId: item.id }, { accessToken: session?.accessToken, lang, signal: c.signal });
      if (c.signal.aborted) return;
      const result = readLinkRequest(raw);
      if (result.status !== (kind === 'submit' ? 'PENDING' : 'CANCELLED') || (item && (result.id !== item.id || result.caseNumber !== item.caseNumber)) || (kind === 'submit' && result.caseNumber !== null && result.caseNumber !== code.trim().toUpperCase())) throw Object.assign(new Error(), { code: 'INVALID_RESPONSE' });
      setRequests(prev => [result, ...prev.filter(row => row.id !== result.id)]);
      setNotice(kind); if (kind === 'submit') setCode('');
    } catch (err) {
      if (c.signal.aborted) return;
      uncertainRef.current = true;
      setError(err); setUncertain(true);
      if (err.status === 401) onUnauthorizedRef.current?.();
    } finally {
      if (mutation.current === c) { mutation.current = null; if (!c.signal.aborted) setPending(false); }
    }
  }
  /** Làm mới thông tin tài khoản qua onRefreshAccount (để lấy vai trò BENEFICIARY sau khi yêu cầu được duyệt), thành công thì tăng readRevision để tải lại tài sản đã nhận. */
  async function refreshAccount() {
    if (!onRefreshAccount || mutation.current) return;
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    const c = new AbortController(); mutation.current = c; read.current?.abort(); read.current = null;
    setPending(true); setError(null);
    try { await onRefreshAccount({ signal: c.signal }); if (!c.signal.aborted) setReadRevision(v => v + 1); }
    catch (err) { if (!c.signal.aborted) { setError(err); if (err.status === 401) onUnauthorizedRef.current?.(); } }
    finally { if (mutation.current === c) { mutation.current = null; if (!c.signal.aborted) setPending(false); } }
  }
  const hasDeliveredAssets = ['PARTIAL', 'RECEIVED'].includes(receivedStage);

  /** Thẻ "Tài sản được giao" rỗng, hiển thị khi tài khoản chưa có quyền đọc (chưa là BENEFICIARY). */
  const emptyAssets = !canRead ? (
    <section className="lv-shared-card lv-owner-card lv-shared-empty" aria-labelledby="delivered-empty-title">
      <span className="lv-shared-card__icon-wrap" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" /></svg></span>
      <div>
        <h2 id="delivered-empty-title">{en ? 'Delivered assets' : 'Tài sản được giao'}</h2>
        <p>{en ? 'No assets yet. Once staff confirm, delivered assets appear here.' : 'Chưa có tài sản nào. Nhân viên xác nhận xong, tài sản được giao sẽ hiện ở đây.'}</p>
      </div>
    </section>
  ) : null;

  /** Khối tài sản: tình hình bàn giao (BeneficiaryHandoverStatus) và danh sách tài sản đã nhận (ReceivedAssets) khi có quyền đọc; ngược lại hiển thị thẻ rỗng. */
  const assetsSection = canRead ? (
    <><BeneficiaryHandoverStatus userId={session?.user?.id || user?.id || 'preview'} accessToken={session?.accessToken} lang={lang} loadStatus={caseLinkActions?.loadHandoverStatus} preview={preview} />
    <ReceivedAssets actions={receivedAssetActions} userId={session?.user?.id || user?.id} accessToken={session?.accessToken} lang={lang}
      isDevPreview={preview} scenario={previewScenario} onUnauthorized={onUnauthorized} refreshKey={`${refreshKey}:${readRevision}`} onStageChange={recordStage} /></>
  ) : emptyAssets;

  /** Thẻ nhập mã hồ sơ và nút "Gửi yêu cầu" (gọi mutate('submit')); hiển thị cảnh báo khi tài khoản không đủ điều kiện hoặc tính năng chưa sẵn sàng, cùng thông báo thành công/lỗi. */
  const linkCard = (
    <section className="lv-shared-card lv-owner-card" aria-labelledby="link-section-title">
      <h2 id="link-section-title">{hasDeliveredAssets ? (en ? 'Link another case' : 'Liên kết hồ sơ khác') : (en ? 'Link a case' : 'Liên kết hồ sơ')}</h2>
      <form onSubmit={e => { e.preventDefault(); if (code.trim()) mutate('submit'); }} noValidate>
        <label htmlFor="case-link-number">{en ? 'Case number' : 'Mã hồ sơ'}</label>
        <div className="lv-shared-input-row"><input id="case-link-number" className="lv-shared-input" value={code} onChange={e => setCode(e.target.value)}
          placeholder="HS-2026-000123" autoComplete="off" autoCapitalize="characters" spellCheck="false" disabled={!ready || pending} aria-describedby={!ready ? 'case-link-availability' : undefined} />
          <Button className="lv-shared-btn lv-shared-btn-primary" type="submit" disabled={!ready || pending || loading || uncertain || !code.trim()} isLoading={pending}>{en ? 'Send request' : 'Gửi yêu cầu'}</Button></div>
      </form>
      {!eligible ? <FeedbackNotice tone="warning">{en ? 'Use a personal recipient account to request a link.' : 'Hãy dùng tài khoản cá nhân của người nhận để gửi yêu cầu.'}</FeedbackNotice>
        : !ready && <FeedbackNotice id="case-link-availability">{en ? 'Requests are not available yet.' : 'Chưa hỗ trợ gửi yêu cầu.'}</FeedbackNotice>}
      {notice && <FeedbackNotice tone="success">{notice === 'submit'
        ? (en ? 'Request sent, waiting for staff at the counter' : 'Đã gửi yêu cầu, chờ nhân viên xác nhận tại quầy')
        : (en ? 'Request cancelled' : 'Đã hủy yêu cầu')}</FeedbackNotice>}
      {error && <FeedbackNotice tone="error">{caseLinkError(error, lang)}</FeedbackNotice>}
    </section>
  );

  /** Danh sách yêu cầu của tôi (bỏ các yêu cầu APPROVED khi đã đọc được tài sản): hiển thị trạng thái, lý do từ chối, nút "Hủy yêu cầu" cho PENDING và "Cập nhật quyền tài khoản" cho APPROVED chưa có quyền. */
  // A linked request needs nothing more once the account can read: the delivered assets above are the outcome.
  const visibleRequests = requests.filter(item => !(item.status === 'APPROVED' && canRead));
  const requestsCard = ready && (visibleRequests.length > 0 || error) && (
    <section className="lv-shared-card lv-owner-card" aria-labelledby="my-requests-title" aria-busy={loading}>
      <div className="lv-link-heading"><h2 id="my-requests-title">{en ? 'My requests' : 'Yêu cầu của tôi'}</h2>
        {(error || uncertain) && <Button variant="secondary" disabled={pending || loading} onClick={() => setRevision(v => v + 1)}>{en ? 'Refresh status' : 'Tải lại trạng thái'}</Button>}</div>
      {loading && <p role="status">{en ? 'Loading requests…' : 'Đang tải yêu cầu…'}</p>}
      <ul className="lv-link-requests">{visibleRequests.map(item => <li key={item.id} className={`lv-link-item ${item.status === 'REJECTED' ? 'is-rejected' : ''}`}>
        <div>
          <strong>{item.caseNumber || (en ? 'Link request' : 'Yêu cầu liên kết')}</strong>
          <p>{requestStatusLabel(item.status, lang)}</p>
          {item.status === 'REJECTED' && (
            <div className="lv-link-rejected-guidance" style={{ fontSize: '14px', color: '#b91c1c', marginTop: '6px', lineHeight: 1.4 }}>
              {typeof item.reason === 'string' && item.reason.trim() ? (
                <p style={{ margin: 0 }}><strong>{en ? 'Reason:' : 'Lý do từ chối:'}</strong> {item.reason.trim()}</p>
              ) : (
                <p style={{ margin: 0 }}>
                  {en
                    ? 'Your request was declined. Please verify your case information or contact staff at the counter for assistance.'
                    : 'Yêu cầu liên kết đã bị từ chối. Vui lòng kiểm tra lại thông tin hồ sơ hoặc liên hệ nhân viên tại quầy để được hỗ trợ giải quyết.'}
                </p>
              )}
            </div>
          )}
        </div>
        {item.status === 'PENDING' && typeof caseLinkActions.cancel === 'function' && <Button variant="secondary" disabled={pending || loading || uncertain} onClick={() => mutate('cancel', item)}>{en ? 'Cancel request' : 'Hủy yêu cầu'}</Button>}
        {item.status === 'APPROVED' && !canRead && <Button disabled={pending || !onRefreshAccount} onClick={refreshAccount}>{en ? 'Update account access' : 'Cập nhật quyền tài khoản'}</Button>}
      </li>)}</ul>
    </section>
  );

  return <div className="lv-shared-view" aria-labelledby="shared-heading">
    <div className="lv-shared-header"><h1 id="shared-heading" className="lv-shared-title">{en ? 'Shared with me' : 'Tài sản thụ hưởng'}</h1></div>
    {preview && <FeedbackNotice tone="warning">{en ? 'UI preview — sample data, no server changes.' : 'Xem trước giao diện — dữ liệu minh họa, chưa lưu lên máy chủ.'}</FeedbackNotice>}

    {assetsSection && (
      <div key="assets-wrapper" style={{ order: hasDeliveredAssets ? 1 : 3 }}>
        {assetsSection}
      </div>
    )}
    <div key="link-wrapper" style={{ order: hasDeliveredAssets ? 2 : 1 }}>
      {linkCard}
    </div>
    {requestsCard && (
      <div key="requests-wrapper" style={{ order: hasDeliveredAssets ? 3 : 2 }}>
        {requestsCard}
      </div>
    )}
  </div>;
}
