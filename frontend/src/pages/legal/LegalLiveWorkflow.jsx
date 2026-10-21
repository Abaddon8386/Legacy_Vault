import { useEffect, useRef, useState } from 'react';
import { isUuid } from '../../api/contracts.js';
import { isSessionActive } from '../../utils/session.js';
import * as api from './legalLiveService.js';
import './LegalLiveWorkflow.css';

const paths = {
  'death-verification': '/legal/death-verification', 'will-document-verification': '/legal/will-document-verification',
  'basis-route-selection': '/legal/basis-route-selection', 'dossier-review': '/legal/dossier-review',
  'approval-review': '/legal/approval-review', 'controlled-unlock': '/legal/controlled-unlock',
};
const titles = {
  'death-verification': ['Xác minh giấy tờ khai tử', 'Death document verification'],
  'will-document-verification': ['Đối chiếu di chúc', 'Will comparison'],
  'basis-route-selection': ['Phân loại căn cứ pháp lý', 'Legal basis classification'],
  'dossier-review': ['Thẩm định hồ sơ căn cứ', 'Legal dossier review'],
  'approval-review': ['Phê duyệt hồ sơ', 'Final approval'], 'controlled-unlock': ['Mở khóa có kiểm soát', 'Controlled unlock'],
};
const choices = {
  APPROVE: ['Chấp thuận', 'Approve'], REJECT: ['Từ chối', 'Reject'], REQUEST_MORE: ['Yêu cầu bổ sung', 'Request more information'],
  MATCH: ['Khớp', 'Match'], MISMATCH: ['Không khớp', 'Mismatch'], INCONCLUSIVE: ['Chưa đủ cơ sở', 'Inconclusive'],
  NOTARIAL: ['Công chứng', 'Notarial'], COURT: ['Tòa án', 'Court'], ON_HOLD: ['Tạm dừng', 'On hold'],
  review: ['Hoàn thành thẩm định', 'Complete review'], 'request-supplementation': ['Yêu cầu bổ sung', 'Request supplementation'],
  hold: ['Tạm dừng xử lý', 'Place on hold'], court: ['Thẩm định quyết định tòa', 'Assess court decision'],
  VALID: ['Hợp lệ', 'Valid'], INVALID: ['Không hợp lệ', 'Invalid'],
  NEW_DISPUTE: ['Tranh chấp mới', 'New dispute'], INSUFFICIENT_EVIDENCE: ['Thiếu chứng cứ', 'Insufficient evidence'],
};
const knownErrors = {
  401: ['Phiên đăng nhập đã hết hạn.', 'Your session has expired.'],
  403: ['Bạn không có quyền thực hiện thao tác này.', 'You do not have permission for this action.'],
  404: ['Không tìm thấy hồ sơ được phép truy cập.', 'An accessible record was not found.'],
  409: ['Hồ sơ đã thay đổi hoặc chưa đủ điều kiện. Hãy tải lại trước khi tiếp tục.', 'The record changed or is not eligible. Reload before continuing.'],
};
const label = (key, en) => choices[key]?.[en ? 1 : 0] || key || '—';

// Discovery is an optional in-process adapter boundary, NOT an HTTP contract.
// Default is unavailable until PS-102 supplies a reviewed Legal queue endpoint.
export default function LegalLiveWorkflow({ session, lang = 'vi', step = 'death-verification', caseId = '', discovery, onNavigate, onUnauthorized }) {
  const en = lang === 'en';
  const [discoveryResult, setDiscoveryResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const auth = useRef(onUnauthorized);
  useEffect(() => { auth.current = onUnauthorized; }, [onUnauthorized]);
  useEffect(() => {
    if (typeof discovery !== 'function' || !isSessionActive(session) || !session.user.roles.includes('LEGAL_VERIFIER')) return;
    const c = new AbortController();
    Promise.resolve().then(() => discovery({ accessToken: session.accessToken, signal: c.signal })).then(value => {
      if (c.signal.aborted) return;
      if (!Array.isArray(value) || !value.every(item => isUuid(item.caseId) && typeof item.label === 'string'
        && Array.isArray(item.deathDocumentIds) && item.deathDocumentIds.every(isUuid))) throw Error('INVALID_RESPONSE');
      setDiscoveryResult({ session, discovery, attempt, queue: value, error: null });
    }).catch(err => { if (!c.signal.aborted) {
      setDiscoveryResult({ session, discovery, attempt, queue: null, error: err });
      if (err.status === 401) auth.current?.();
    } });
    return () => c.abort();
  }, [session, discovery, attempt]);
  // A previously authorized queue is not evidence for a new authorization read.
  // Gate synchronously in render, before effects run, and unmount the old case
  // (aborting reads/writes) while permissions are revalidated or after any error.
  const currentResult = discoveryResult?.session === session && discoveryResult?.discovery === discovery
    && discoveryResult?.attempt === attempt ? discoveryResult : null;
  const queue = currentResult?.error ? null : currentResult?.queue;
  const error = currentResult?.error;
  const busy = typeof discovery === 'function' && !currentResult;
  const selected = !busy && !error && typeof discovery === 'function' ? queue?.find(item => item.caseId === caseId) : null;
  const go = (next, id = caseId) => {
    const params = new URLSearchParams({ lang }); if (id) params.set('caseId', id);
    onNavigate?.(`${paths[next]}?${params}`);
  };
  if (!isSessionActive(session) || !session.user.roles.includes('LEGAL_VERIFIER')) return <p role="alert">{knownErrors[403][en ? 1 : 0]}</p>;
  return <section className="lv-legal-live">
    <p>{en ? 'Legal Verifier' : 'Chuyên viên thẩm định pháp lý'}</p>
    <h1>{titles[step]?.[en ? 1 : 0]}</h1>
    <section className="lv-legal-live__card">
      <h2>{en ? 'Verification cases' : 'Hồ sơ xác minh'}</h2>
      {typeof discovery !== 'function' && <p role="status">{en ? 'The case list is not available yet. Actions will be available after an authorized case can be selected.' : 'Danh sách hồ sơ hiện chưa khả dụng. Bạn có thể thao tác sau khi chọn được hồ sơ thuộc quyền xử lý.'}</p>}
      {busy && <p role="status">{en ? 'Loading cases…' : 'Đang tải hồ sơ…'}</p>}
      {error && <p role="alert">{knownErrors[error.status]?.[en ? 1 : 0] || (en ? 'Unable to load cases.' : 'Không thể tải danh sách hồ sơ.')}</p>}
      {queue?.length === 0 && <p>{en ? 'No cases are available.' : 'Chưa có hồ sơ để xử lý.'}</p>}
      <label>{en ? 'Case' : 'Hồ sơ'}<select value={selected?.caseId || ''} disabled={!queue?.length || busy} onChange={e => go(step, e.target.value)}>
        <option value="">{en ? 'Select a case' : 'Chọn hồ sơ'}</option>
        {queue?.map(item => <option key={item.caseId} value={item.caseId}>{item.label}</option>)}
      </select></label>
      {error && <button type="button" disabled={busy} onClick={() => setAttempt(value => value + 1)}>{en ? 'Retry' : 'Thử lại'}</button>}
    </section>
    {selected && <>
      <nav aria-label={en ? 'Legal workflow steps' : 'Các bước pháp lý'}>{Object.keys(paths).map(key => <button key={key} type="button" aria-current={step === key ? 'step' : undefined} onClick={() => go(key)}>{titles[key][en ? 1 : 0]}</button>)}</nav>
      <LegalCaseStep key={`${session.accessToken}:${selected.caseId}:${step}`} session={session} selected={selected} step={step} lang={lang} onUnauthorized={onUnauthorized} />
    </>}
    <p className="lv-legal-live__notice">{en ? 'Document intake, death verification, final approval and vault unlocking are separate steps. This page does not grant Staff permissions or access to encrypted files.' : 'Tiếp nhận giấy tờ, xác minh tử vong, phê duyệt cuối và mở khóa là các bước riêng biệt. Trang này không cấp quyền Nhân viên hoặc quyền xem file mã hóa.'}</p>
  </section>;
}

function LegalCaseStep({ session, selected, step, lang, onUnauthorized }) {
  const en = lang === 'en';
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [needsReload, setNeedsReload] = useState(false);
  const [documentId, setDocumentId] = useState('');
  const [reload, setReload] = useState(0);
  const controller = useRef(null);
  const lock = useRef(false);
  const auth = useRef(onUnauthorized);
  useEffect(() => { auth.current = onUnauthorized; }, [onUnauthorized]);
  const options = { accessToken: session.accessToken, roles: session.user.roles, userId: session.user.id, lang };
  useEffect(() => {
    const c = new AbortController(); controller.current = c; lock.current = true;
    const opts = { accessToken: session.accessToken, roles: session.user.roles, signal: c.signal };
    let task;
    if (step === 'death-verification') task = documentId ? api.loadDeathDocument(selected.caseId, documentId, opts) : Promise.resolve(null);
    else if (step === 'will-document-verification') task = api.loadWillComparisons(selected.caseId, opts);
    else if (['basis-route-selection', 'dossier-review'].includes(step)) task = Promise.all([
      api.loadWillComparisons(selected.caseId, opts),
      (step === 'dossier-review' ? api.loadLegalReviewContext(selected.caseId, opts) : api.loadLegalDossier(selected.caseId, opts)).catch(err => { if (err.status === 404 && step === 'basis-route-selection') return null; throw err; }),
    ]).then(async ([will, loaded]) => {
      const dossier = step === 'dossier-review' ? loaded.dossier : loaded;
      return { will, dossier, reviewSnapshot: loaded?.reviewSnapshot,
        court: dossier?.route === 'COURT' ? await api.loadCourtDecisions(selected.caseId, opts) : [] };
    });
    else task = Promise.resolve(null); // No guessed GET snapshot/unlock; PS-102 has not supplied this read contract.
    task.then(value => { if (!c.signal.aborted) { setData(value); setError(null); setNeedsReload(false); } })
      .catch(err => { if (!c.signal.aborted) { setData(null); setError(err); setNeedsReload(true); if (err.status === 401) auth.current?.(); } })
      .finally(() => { if (!c.signal.aborted) { lock.current = false; setBusy(false); } });
    return () => c.abort();
  }, [session, selected.caseId, step, documentId, reload]);
  useEffect(() => () => controller.current?.abort(), []);
  const set = (name, value) => setDraft(prev => ({ ...prev, [name]: value }));
  const input = (name, title, values) => <label>{title}<select value={draft[name] || ''} onChange={e => set(name, e.target.value)} disabled={busy} required>
    <option value="">{en ? 'Select' : 'Chọn'}</option>{values.map(([value, title]) => <option key={value} value={value}>{title}</option>)}
  </select></label>;
  const pick = (name, title, values) => input(name, title, values.map(value => [value, label(value, en)]));
  const latest = data?.dossier?.versions?.reduce((best, item) => !best || item.version > best.version ? item : best, null);
  const forwarded = data?.dossier?.status === 'LEGAL_BASIS_FORWARDED' && latest?.forwardStatus === 'FORWARDED'
    && latest.version >= data.dossier.requiredVersion && data.will.vaultStatus === 'LEGAL_BASIS_VERIFICATION';
  const editable = !busy && !needsReload && Boolean(data);
  let eligible = false;
  if (step === 'death-verification') eligible = editable && data.verificationCaseStatus === 'OPEN' && data.vaultStatus === 'AWAITING_VERIFICATION' && data.decisions.length === 0;
  if (step === 'will-document-verification') eligible = editable && ['DOCUMENT_VERIFICATION', 'WILL_VERIFICATION'].includes(data.vaultStatus) && data.wills.length > 0 && data.originalWillIntakes.length > 0;
  if (step === 'basis-route-selection') eligible = editable && !data.will.approvalBlocked && ((!data.dossier && data.will.vaultStatus === 'WILL_VERIFICATION') || (data.dossier?.route === 'ON_HOLD' && data.dossier.status === 'DRAFT' && data.will.vaultStatus === 'ON_HOLD'));
  if (step === 'dossier-review') eligible = editable && (draft.action === 'hold'
    ? ['NOTARIAL', 'COURT'].includes(data.dossier?.route) && ['AWAITING_LEGAL_BASIS', 'LEGAL_BASIS_VERIFICATION'].includes(data.will.vaultStatus)
    : forwarded && data.dossier.route !== 'ON_HOLD');

  async function submit(e) {
    e.preventDefault(); if (lock.current || !eligible) return;
    lock.current = true; const c = new AbortController(); controller.current = c; setBusy(true); setError(null); setReceipt(null);
    const opts = { ...options, signal: c.signal };
    try {
      let value;
      if (step === 'death-verification') {
        const current = await api.loadDeathDocument(selected.caseId, documentId, opts);
        if (c.signal.aborted) return;
        if (current.decisions.length || current.verificationCaseStatus !== 'OPEN' || current.vaultStatus !== 'AWAITING_VERIFICATION') throw { status: 409 };
        value = await api.decideDeathDocument(selected.caseId, documentId, draft, opts);
      }
      if (step === 'will-document-verification') {
        const candidate = data.wills.flatMap(will => will.versions.map(v => ({ ...v, willId: will.id }))).find(item => `${item.willId}:${item.version}` === draft.willVersion);
        const current = await api.loadWillComparisons(selected.caseId, opts);
        if (c.signal.aborted) return;
        const currentVersion = current.wills.find(will => will.id === candidate?.willId)?.versions.find(item => item.version === candidate?.version);
        if (!currentVersion || currentVersion.sha256 !== candidate.sha256 || !current.originalWillIntakes.some(item => item.id === draft.originalWillIntakeId)
          || !['DOCUMENT_VERIFICATION', 'WILL_VERIFICATION'].includes(current.vaultStatus)) throw { status: 409 };
        value = await api.compareWill(selected.caseId, { ...draft, willId: candidate?.willId, version: candidate?.version }, { ...opts, expectedHash: candidate?.sha256 });
      }
      if (['basis-route-selection', 'dossier-review'].includes(step)) {
        const current = await api.loadLegalDossier(selected.caseId, opts).catch(err => { if (err.status === 404 && !data.dossier && step === 'basis-route-selection') return null; throw err; });
        if (c.signal.aborted) return;
        // Compare all server dossier metadata/versions/allocations, never recompute approval hashes in the FE.
        if (JSON.stringify(current) !== JSON.stringify(data.dossier)) throw { status: 409 };
      }
      if (step === 'basis-route-selection') value = await api.classifyLegalDossier(selected.caseId, { route: draft.route, routeReason: draft.reason }, { ...opts, reclassification: Boolean(data.dossier) });
      if (step === 'dossier-review') {
        if (draft.action === 'hold') value = await api.holdLegalDossier(selected.caseId, draft, opts);
        else if (draft.action === 'court') value = await api.decideCourt(selected.caseId, { ...draft, version: latest?.version }, { ...opts, expectedHash: latest?.sha256 });
        else value = await api.reviewLegalDossier(selected.caseId, draft, { ...opts, dossierId: data.dossier?.id, reviewSnapshot: data.reviewSnapshot });
      }
      if (c.signal.aborted) return;
      setReceipt(value); setNeedsReload(true); // A receipt never grants the next capability: reload authoritative state.
    } catch (err) {
      if (c.signal.aborted) return;
      setError(err); if (err.status === 401) auth.current?.();
      if ([401, 403, 404, 409].includes(err.status) || ['INVALID_RESPONSE', 'NETWORK_ERROR'].includes(err.code)) setNeedsReload(true);
    } finally { if (!c.signal.aborted) { lock.current = false; setBusy(false); } }
  }
  return <section className="lv-legal-live__card" aria-busy={busy}>
    {busy && <p role="status">{en ? 'Processing…' : 'Đang xử lý…'}</p>}
    {error && <p role="alert">{knownErrors[error.status]?.[en ? 1 : 0] || (error.code === 'VALIDATION_FAILED'
      ? (en ? 'Check your selections and reason (maximum 1000 characters).' : 'Kiểm tra lựa chọn và lý do (tối đa 1000 ký tự).')
      : (en ? 'The operation could not be confirmed. Reload to check its status before retrying.' : 'Chưa xác nhận được kết quả thao tác. Hãy tải lại để kiểm tra trạng thái trước khi thử lại.'))}</p>}
    {receipt && <p role="status">{en ? 'The server confirmed the operation. Reload the record before continuing.' : 'Máy chủ đã xác nhận thao tác. Tải lại hồ sơ trước khi tiếp tục.'}
      {' '}{session.user.fullName} · {receipt.decidedAt || receipt.comparedAt || receipt.reviewedAt || receipt.checkedAt || receipt.updatedAt || receipt.createdAt || '—'}</p>}
    <button type="button" disabled={busy} onClick={() => { setBusy(true); setReceipt(null); setReload(value => value + 1); }}>{en ? 'Reload record' : 'Tải lại hồ sơ'}</button>
    {step === 'death-verification' && <>
      <label>{en ? 'Death document' : 'Giấy tờ khai tử'}<select value={documentId} disabled={busy} onChange={e => { setDocumentId(e.target.value); setData(null); setDraft({}); setReceipt(null); setBusy(true); }}>
        <option value="">{en ? 'Select a document' : 'Chọn giấy tờ'}</option>{selected.deathDocumentIds.map((id, i) => <option key={id} value={id}>{en ? 'Document' : 'Giấy tờ'} {i + 1}</option>)}
      </select></label>
      {data && <><p>{data.document.issuingAuthority} · {data.document.documentNumber} · {data.document.issuedDate}</p>
        {data.decisions.map((item, i) => <p key={i}>{label(({ APPROVED: 'APPROVE', REJECTED: 'REJECT', NEEDS_CORRECTION: 'REQUEST_MORE' })[item.result], en)} · {item.decidedAt || '—'} · {item.reason} · {item.verifierPublicId || '—'}</p>)}</>}
    </>}
    {step === 'will-document-verification' && data && <>
      <p>{en ? 'Only metadata and version hashes are available here. No file-download API is provided for Legal.' : 'Hiện chỉ có thông tin và mã kiểm tra phiên bản. Chưa có chức năng tải nội dung file dành cho Pháp lý.'}</p>
      {data.comparisons.map(item => <p key={item.id}>{label(item.result, en)} · {item.version} · {item.sha256} · {item.comparedAt} · {item.checkedBy}</p>)}
    </>}
    {data?.dossier && <><p>{label(data.dossier.route, en)}</p>{data.dossier.versions.map(item => <p key={item.version}>{en ? 'Version' : 'Phiên bản'} {item.version} · {item.documentNumber} · {item.sha256} · {item.forwardedAt || '—'}</p>)}
      {data.court?.map(item => <p key={item.id}>{label(item.result, en)} · {item.version} · {item.sha256} · {item.reviewedAt}</p>)}</>}
    {['approval-review', 'controlled-unlock'].includes(step) ? <><p role="status">{en ? 'The latest approval and eligibility information is not available yet. This action remains unavailable until it can be verified.' : 'Chưa có thông tin phê duyệt và điều kiện xử lý mới nhất để kiểm tra. Thao tác hiện chưa khả dụng.'}</p>
      <button type="button" disabled>{titles[step][en ? 1 : 0]}</button></> : <form onSubmit={submit}>
      {step === 'death-verification' && pick('decision', en ? 'Decision' : 'Quyết định', ['APPROVE', 'REJECT', 'REQUEST_MORE'])}
      {step === 'will-document-verification' && <>
        {input('originalWillIntakeId', en ? 'Original intake' : 'Bản gốc đã tiếp nhận', (data?.originalWillIntakes || []).map((item, i) => [item.id, item.evidenceReference || `${en ? 'Intake' : 'Lần nhận'} ${i + 1}`]))}
        {input('willVersion', en ? 'Digitized version / hash' : 'Bản di chúc số / mã kiểm tra', (data?.wills || []).flatMap(will => will.versions.map(item => [`${will.id}:${item.version}`, `${en ? 'Version' : 'Phiên bản'} ${item.version} · ${item.sha256}`])))}
        {pick('result', en ? 'Comparison result' : 'Kết quả đối chiếu', ['MATCH', 'MISMATCH', 'INCONCLUSIVE'])}
      </>}
      {step === 'basis-route-selection' && pick('route', en ? 'Legal basis' : 'Căn cứ pháp lý', data?.dossier ? ['NOTARIAL', 'COURT'] : ['NOTARIAL', 'COURT', 'ON_HOLD'])}
      {step === 'dossier-review' && <>
        {pick('action', en ? 'Action' : 'Thao tác', data?.dossier?.route === 'COURT' ? ['review', 'request-supplementation', 'court', 'hold'] : ['review', 'request-supplementation', 'hold'])}
        {draft.action === 'court' && pick('result', en ? 'Court decision result' : 'Kết luận quyết định tòa', ['VALID', 'INVALID', 'INCONCLUSIVE'])}
        {draft.action === 'hold' && pick('cause', en ? 'Cause' : 'Nguyên nhân', ['NEW_DISPUTE', 'INSUFFICIENT_EVIDENCE'])}
      </>}
      <label>{en ? 'Reason (up to 1000 characters)' : 'Lý do (tối đa 1000 ký tự)'}<textarea value={draft.reason || ''} maxLength={1000} disabled={busy} onChange={e => set('reason', e.target.value)} /></label>
      <button type="submit" disabled={!eligible}>{en ? 'Record decision' : 'Ghi nhận quyết định'}</button>
      {!eligible && !busy && <p>{en ? 'Select the required record and ensure it meets the processing conditions.' : 'Chọn đủ hồ sơ và kiểm tra điều kiện xử lý trước khi ghi nhận.'}</p>}
    </form>}
  </section>;
}
