import { useEffect, useRef, useState } from 'react';
import { fetchStaffCaseBeneficiaries, recordCounterAttestation, requestInvitationEmail, handoverUrl } from './liveHandoverService.js';
import { linkExistingBeneficiaryAccount } from './beneficiaryAccountService.js';
import { staffAuthFeedback } from './staffFeedback.js';
function errorText(error, en, caseItem) {
  const auth = staffAuthFeedback(error, en ? 'en' : 'vi');
  if (auth) return `${auth.title}. ${auth.description}`;
  if ((error?.code === 'RESOURCE_NOT_FOUND' || error?.status === 404) && caseItem?.status === 'CLOSED') {
    return en
      ? 'This verification case is closed. Counter identity checks and account management are only available for open cases.'
      : 'Hồ sơ xác minh này đã đóng. Thao tác đối chiếu căn cước và quản lý tài khoản tại quầy chỉ áp dụng cho hồ sơ đang mở.';
  }
  const texts = {
    HANDOVER_SESSION_ALREADY_OPEN: ['Đã có phiên mở. Tải lại để chọn phiên hiện có.', 'A session is already open. Reload to select it.'],
    HANDOVER_SESSION_INVALID_STATE: ['Hồ sơ/kho chưa đủ điều kiện hoặc phiên đã thay đổi. Tải lại trước khi thao tác.', 'Case/vault is not eligible or the session has changed. Reload before continuing.'],
    RESOURCE_NOT_FOUND: ['Không tìm thấy hoặc hồ sơ/phiên không được giao cho bạn. Hãy nhận hồ sơ ở danh sách nếu phù hợp.', 'Case/session not found or not assigned to you. Claim an eligible case in the case queue.'],
    INVALID_RESPONSE: ['Dữ liệu máy chủ không hợp lệ. Chưa xác nhận thao tác thành công.', 'Invalid server response. The action has not been confirmed.'],
    LEGAL_APPROVAL_REQUIRED: ['Cần phê duyệt Legal còn hiệu lực trước khi mở phiên.', 'A current Legal approval is required before opening a session.'],
    LEGAL_WORKFLOW_ON_HOLD: ['Hồ sơ pháp lý đang tạm giữ; chưa thể mở phiên bàn giao.', 'The legal workflow is on hold; a handover session cannot be opened.'],
  };
  return texts[error?.code]?.[en ? 1 : 0] || (en ? 'Unable to complete the request. Reload to check the latest state before retrying.' : 'Chưa thực hiện được yêu cầu. Tải lại để kiểm tra trạng thái mới nhất trước khi thử lại.');
}

export default function LegacyCounterBeneficiariesSection({ caseId, caseItem, selectedSessionId, accessToken, lang, mode, onError }) {
  const en = lang === 'en';
  const [expanded, setExpanded] = useState(() => mode === 'accounts');
  const [loading, setLoading] = useState(false);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [error, setError] = useState(null);
  const [attestTarget, setAttestTarget] = useState(null);
  const [linkTarget, setLinkTarget] = useState(null);
  const [accountEmail, setAccountEmail] = useState('');
  const [linking, setLinking] = useState(false);
  const [evidenceRef, setEvidenceRef] = useState('');
  const [confirmedEmail, setConfirmedEmail] = useState('');
  const [submittingAttest, setSubmittingAttest] = useState(false);
  const [requestingEmailId, setRequestingEmailId] = useState(null);
  const [notice, setNotice] = useState('');
  const [beneficiaryRevision, setBeneficiaryRevision] = useState(0);
  const mutation = useRef(null);
  useEffect(() => () => { mutation.current?.abort(); }, []);

  const [previousCaseId, setPreviousCaseId] = useState(caseId);
  if (previousCaseId !== caseId) {
    setPreviousCaseId(caseId);
    setBeneficiaries([]);
    setError(null);
    setNotice('');
    setAttestTarget(null);
    setLinkTarget(null);
    setRequestingEmailId(null);
  }

  useEffect(() => {
    if (!expanded || !caseId || !accessToken || caseItem?.status === 'CLOSED') return;
    const c = new AbortController();
    let cancelled = false;

    fetchStaffCaseBeneficiaries(caseId, { accessToken, lang, signal: c.signal })
      .then((data) => {
        if (!cancelled) {
          setBeneficiaries(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled && err.name !== 'AbortError') {
          setError(err);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      c.abort();
    };
  }, [caseId, accessToken, expanded, lang, beneficiaryRevision, caseItem?.status]);

  const handleAttest = async (e) => {
    e.preventDefault();
    if (!attestTarget || !evidenceRef.trim() || mutation.current) return;
    const c = new AbortController();
    mutation.current = c;
    setSubmittingAttest(true);
    setNotice('');
    try {
      await recordCounterAttestation(caseId, attestTarget.beneficiaryId, {
        evidenceReference: evidenceRef.trim(),
        confirmedEmail: confirmedEmail.trim() || undefined,
      }, { accessToken, lang, signal: c.signal });
      if (c.signal.aborted) return;
      setNotice(en ? 'Counter attestation recorded successfully.' : 'Đã ghi nhận đối chiếu giấy tờ tại quầy thành công.');
      setAttestTarget(null);
      setEvidenceRef('');
      setConfirmedEmail('');
      setBeneficiaryRevision(r => r + 1);
    } catch (err) {
      if (c.signal.aborted) return;
      setError(err);
      if (onError) onError(err);
    } finally {
      if (!c.signal.aborted) { mutation.current = null; setSubmittingAttest(false); }
    }
  };

  const handleRequestInvitationEmail = async (ben) => {
    if (mutation.current || !Number.isSafeInteger(ben.invitation?.generation)) return;
    const c = new AbortController();
    mutation.current = c;
    setRequestingEmailId(ben.beneficiaryId);
    setNotice('');
    try {
      await requestInvitationEmail(caseId, ben.beneficiaryId, ben.invitation.generation, { accessToken, lang, signal: c.signal });
      if (c.signal.aborted) return;
      setNotice(en ? `Invitation email queued for ${ben.fullName}.` : `Đã xếp hàng gửi email lời mời cho ${ben.fullName}.`);
      setBeneficiaryRevision(r => r + 1);
    } catch (err) {
      if (c.signal.aborted) return;
      setError(err);
      if (onError) onError(err);
    } finally {
      if (!c.signal.aborted) { mutation.current = null; setRequestingEmailId(null); }
    }
  };

  const stepLabels = en ? {
    AWAITING_IDENTITY_VERIFICATION: 'Awaiting in-person identity check',
    AWAITING_ACCOUNT_DECISION: 'Identity checked · Awaiting account decision',
    ACCOUNT_LINKED: 'Account linked',
  } : {
    AWAITING_IDENTITY_VERIFICATION: 'Chờ đối chiếu căn cước tại quầy',
    AWAITING_ACCOUNT_DECISION: 'Đã đối chiếu căn cước · Chờ quyết định tài khoản',
    ACCOUNT_LINKED: 'Đã liên kết tài khoản',
  };

  return (
    <aside role="note" className="lv-counter-beneficiaries lv-staff-glow">
      <h3>{en ? 'Counter recipients' : 'Người nhận tại quầy'}</h3>

      {caseItem?.status === 'CLOSED' && (
        <p role="status" className="lv-live-closed-notice">
          {en
            ? 'This verification case is closed. Counter identity checks and account operations are only available for open cases.'
            : 'Hồ sơ xác minh này đã đóng. Thao tác đối chiếu căn cước và quản lý tài khoản tại quầy chỉ áp dụng cho hồ sơ đang mở.'}
        </p>
      )}

      {!expanded && caseItem?.status !== 'CLOSED' && (
        <p>
          <button type="button" onClick={() => setExpanded(true)}>
            {en ? 'Load counter beneficiaries' : 'Tải danh sách người thụ hưởng tại quầy'}
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && !(caseItem?.status === 'CLOSED' && (error.code === 'RESOURCE_NOT_FOUND' || error.status === 404)) && <p role="alert">{errorText(error, en, caseItem)}</p>}
      {loading && <p role="status">{en ? 'Loading beneficiaries…' : 'Đang tải danh sách người thụ hưởng…'}</p>}
      {caseItem?.status !== 'CLOSED' && expanded && !loading && !error && beneficiaries.length === 0 && (
        <p role="status">{en ? 'No eligible beneficiaries found for this case.' : 'Không có người thụ hưởng nào đủ điều kiện trong hồ sơ này.'}</p>
      )}

      {beneficiaries.length > 0 && (
        <ul className="lv-beneficiary-list">
          {beneficiaries.map((ben) => (
            <li key={ben.beneficiaryId} className="lv-beneficiary-item">
              <strong>{ben.fullName}</strong> ({ben.relationship})
              <div>
                <em>{stepLabels[ben.counterStep] || ben.counterStep}</em>
                {' · '}
                <span>{ben.accountLinked ? (en ? 'Account active' : 'Đã có tài khoản') : (en ? 'No account linked' : 'Chưa liên kết tài khoản')}</span>
              </div>
              {ben.counterAttestation?.recorded && (
                <p>
                  ✓ {en ? 'Attested at counter: ' : 'Đã đối chiếu tại quầy lúc: '}
                  {ben.counterAttestation.recordedAt}
                  {ben.counterAttestation.confirmedEmailRecorded ? (en ? ' (Email confirmed)' : ' (Đã lưu email xác nhận)') : ''}
                </p>
              )}
              {ben.invitation && ben.invitation.state !== 'NOT_ISSUED' && (
                <p>
                  {en ? 'Invitation: ' : 'Thư mời: '}
                  <strong>{ben.invitation.state}</strong> (Gen: {ben.invitation.generation})
                </p>
              )}

              <div className="lv-beneficiary-actions" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                <button
                  type="button"
                  onClick={() => setAttestTarget(ben)}
                >
                  {en ? 'Record counter ID attestation' : 'Ghi nhận đối chiếu CCCD tại quầy'}
                </button>

                {ben.actions?.canRequestInvitationEmail && (
                  <button
                    type="button"
                    disabled={requestingEmailId === ben.beneficiaryId}
                    onClick={() => handleRequestInvitationEmail(ben)}
                  >
                    {requestingEmailId === ben.beneficiaryId
                      ? (en ? 'Queueing email…' : 'Đang yêu cầu gửi…')
                      : (en ? 'Request invitation email' : 'Gửi email lời mời')}
                  </button>
                )}

                {ben.actions?.canLinkAccount && mode === 'accounts' && (
                  <button type="button" disabled={linking} onClick={() => {
                    setLinkTarget(ben); setAccountEmail(''); setError(null);
                  }}>{en ? 'Link existing account' : 'Liên kết tài khoản'}</button>
                )}
                {ben.actions?.canLinkAccount && mode !== 'accounts' && (
                  <a
                    href={handoverUrl('/staff/beneficiary-accounts', caseId, selectedSessionId) + `&beneficiaryId=${ben.beneficiaryId}`}
                  >
                    {en ? 'Link existing account' : 'Liên kết tài khoản'}
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {linkTarget && (
        <form onSubmit={async (event) => {
          event.preventDefault();
          if (mutation.current || !accountEmail.trim()) return;
          const c = new AbortController(); mutation.current = c; setLinking(true); setError(null); setNotice('');
          try {
            await linkExistingBeneficiaryAccount(linkTarget.beneficiaryId, accountEmail.trim(), { accessToken, lang, signal: c.signal });
            if (c.signal.aborted) return;
            setNotice(en ? 'Account linked successfully.' : 'Đã liên kết tài khoản thành công.');
            setLinkTarget(null); setAccountEmail(''); setBeneficiaryRevision(value => value + 1);
          } catch (err) {
            if (!c.signal.aborted) { setError(err); onError?.(err); }
          } finally {
            if (!c.signal.aborted) { mutation.current = null; setLinking(false); }
          }
        }}>
          <h4>{en ? 'Link existing account: ' : 'Liên kết tài khoản có sẵn: '}{linkTarget.fullName}</h4>
          <label>{en ? 'Account email' : 'Email tài khoản'}
            <input type="email" required maxLength={254} value={accountEmail} disabled={linking}
              onChange={event => setAccountEmail(event.target.value)} autoComplete="off" />
          </label>
          <button type="submit" disabled={linking || !accountEmail.trim()}>{linking ? (en ? 'Linking…' : 'Đang liên kết…') : (en ? 'Confirm link' : 'Xác nhận liên kết')}</button>
          <button type="button" disabled={linking} onClick={() => setLinkTarget(null)}>{en ? 'Cancel' : 'Hủy'}</button>
        </form>
      )}
      {attestTarget && (
        <form onSubmit={handleAttest} style={{ marginTop: '0.5rem', padding: '0.5rem', border: '1px solid #ccc' }}>
          <h4>{en ? `Record in-person attestation: ${attestTarget.fullName}` : `Ghi nhận đối chiếu tại quầy: ${attestTarget.fullName}`}</h4>
          <div>
            <label>
              {en ? 'Counter document reference: ' : 'Số tham chiếu chứng từ tại quầy: '}
              <input
                type="text"
                required
                maxLength={200}
                value={evidenceRef}
                onChange={(e) => setEvidenceRef(e.target.value)}
                placeholder={en ? 'Counter record reference' : 'Mã biên bản đối chiếu'}
              />
            </label>
          </div>
          <div style={{ marginTop: '0.25rem' }}>
            <label>
              {en ? 'Confirmed email (for invite): ' : 'Email xác nhận (gửi mã mời): '}
              <input
                type="email"
                maxLength={254}
                value={confirmedEmail}
                onChange={(e) => setConfirmedEmail(e.target.value)}
                placeholder="email@example.com"
              />
            </label>
          </div>
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={submittingAttest || !evidenceRef.trim()}>
              {submittingAttest ? (en ? 'Saving…' : 'Đang lưu…') : (en ? 'Save attestation' : 'Lưu ghi nhận đối chiếu')}
            </button>
            <button type="button" onClick={() => setAttestTarget(null)}>
              {en ? 'Cancel' : 'Hủy'}
            </button>
          </div>
        </form>
      )}


    </aside>
  );
}
