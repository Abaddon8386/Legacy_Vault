import { workflowNotificationFeedback } from '../../utils/workflowNotificationFeedback.js';
import { useEffect, useRef, useState } from 'react';
import { Archive, CircleAlert, CircleCheck, Clock3, FileCheck2, FileText, FolderOpen, Info, RefreshCw, SquarePen } from 'lucide-react';
import { legalDate, legalReadOnly, legalStatus, legalStatusTone, legalStepBlocker } from './legalPresentation.js';
import FeedbackNotice from '../../components/common/FeedbackNotice.jsx';
import { LegalRecordDetails } from './LegalRecordDetails.jsx';
import { isUuid } from '../../api/contracts.js';
import { isSessionActive } from '../../utils/session.js';
import * as api from './legalLiveService.js';
import LegalDistributionWorkspace, { LegalDistributionFinalWorkspace } from './LegalDistributionWorkspace.jsx';
import { useDistributionWorkflow } from '../../workflows/useDistributionWorkflow.js';
import LegalEvidenceFiles from './LegalEvidenceFiles.jsx';
import LegalAllocations from './LegalAllocations.jsx';
import { LEGAL_NAVIGATION_REGISTRY, legalStepTitle } from '../../utils/legalNavigation.js';
import './LegalLiveWorkflow.css';
import WorkflowGuide, { WorkflowActionHint } from '../../components/common/WorkflowGuide.jsx';
import { legalGuidance } from '../../utils/workflowGuidance.js';

const paths = Object.fromEntries(LEGAL_NAVIGATION_REGISTRY.map(item => [item.id, item.path]));
const statusIcons = { neutral: Archive, warning: Clock3, success: CircleCheck, info: Info, error: CircleAlert };
const choices = {
  APPROVE: ['Chấp thuận', 'Approve'], REJECT: ['Từ chối', 'Reject'], REQUEST_MORE: ['Yêu cầu bổ sung', 'Request more information'],
  MATCH: ['Khớp', 'Match'], MISMATCH: ['Không khớp', 'Mismatch'], INCONCLUSIVE: ['Chưa đủ cơ sở', 'Inconclusive'],
  NOTARIAL: ['Hồ sơ công chứng', 'Notarial documents'], COURT: ['Tòa án', 'Court'], ON_HOLD: ['Tạm dừng', 'On hold'],
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
const label = (key, en) => choices[key]?.[en ? 1 : 0] || (en ? 'Not yet determined' : 'Chưa xác định');
// Linking can change while Legal reviews a document. It is not an approval condition.
const dossierScope = dossier => JSON.stringify(dossier && { ...dossier, versions: dossier.versions.map(item => ({ ...item,
  allocations: item.allocations?.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'accountLinked'))),
})) });

export default function LegalLiveWorkflow({ session, lang = 'vi', step: requestedStep = 'death-verification', caseId = '', discovery = api.loadLegalQueue,
  contextLoader = api.loadLegalContext, onNavigate, onUnauthorized }) {
  const step = requestedStep === 'dossier-review' ? 'basis-route-selection' : requestedStep;
  const en = lang === 'en';
  const [discoveryResult, setDiscoveryResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(0);
  const auth = useRef(onUnauthorized);
  const locale = useRef(lang);
  useEffect(() => { locale.current = lang; }, [lang]);
  useEffect(() => { auth.current = onUnauthorized; }, [onUnauthorized]);
  useEffect(() => {
    if (typeof discovery !== 'function' || !isSessionActive(session) || !session.user.roles.includes('LEGAL_VERIFIER')) return;
    const c = new AbortController();
    Promise.resolve().then(() => discovery({ accessToken: session.accessToken, signal: c.signal, page, lang: locale.current })).then(result => {
      if (c.signal.aborted) return;
      const value = Array.isArray(result) ? result : result?.items;
      if (!Array.isArray(value) || !value.every(item => isUuid(item.caseId) && typeof item.label === 'string'
        && Array.isArray(item.deathDocumentIds) && item.deathDocumentIds.every(isUuid))) throw Error('INVALID_RESPONSE');
      setDiscoveryResult({ session, discovery, attempt, page, queue: value, totalPages: Array.isArray(result) ? 1 : result.totalPages, error: null });
    }).catch(err => { if (!c.signal.aborted) {
      setDiscoveryResult({ session, discovery, attempt, page, queue: null, error: err });
      if (err.status === 401) auth.current?.();
    } });
    return () => c.abort();
  }, [session, discovery, attempt, page]);
  // A previously authorized queue is not evidence for a new authorization read.
  // Gate synchronously in render, before effects run, and unmount the old case
  // (aborting reads/writes) while permissions are revalidated or after any error.
  const currentResult = discoveryResult?.session === session && discoveryResult?.discovery === discovery
    && discoveryResult?.attempt === attempt && discoveryResult.page === page ? discoveryResult : null;
  const queue = currentResult?.error ? null : currentResult?.queue;
  const error = currentResult?.error;
  const busy = typeof discovery === 'function' && !currentResult;
  const listed = queue?.find(item => item.caseId === caseId);
  // A deep link can refer to a case on a different page. Its Legal context GET
  // authorizes access; the current page is not the complete authorization scope.
  const selected = !busy && !error && queue && typeof discovery === 'function'
    ? listed || (discovery === api.loadLegalQueue && isUuid(caseId) ? { caseId, deathDocumentIds: [] } : null) : null;
  const go = (next, id = caseId) => {
    const params = new URLSearchParams({ lang }); if (id) params.set('caseId', id);
    onNavigate?.(`${paths[next]}?${params}`);
  };
  if (!isSessionActive(session)) return <div className="lv-legal-live" role="alert"><p>{knownErrors[401][en ? 1 : 0]}</p>
    {onUnauthorized && <button type="button" className="lv-legal-primary" onClick={onUnauthorized}>{en ? 'Sign in again' : 'Đăng nhập lại'}</button>}</div>;
  if (!session.user.roles.includes('LEGAL_VERIFIER')) return <p role="alert">{knownErrors[403][en ? 1 : 0]}</p>;
  return <section className="lv-legal-live">
    <header className="lv-legal-live__header"><div>
      <h1>{legalStepTitle(step, lang)}</h1>
    </div></header>
    <section className="lv-legal-live__queue lv-surface-card" aria-label={en ? 'Verification cases' : 'Hồ sơ xác minh'}>
      {typeof discovery !== 'function' && <p role="status">{en ? 'The case list is not available yet. Actions will be available after an authorized case can be selected.' : 'Danh sách hồ sơ hiện chưa khả dụng. Bạn có thể thao tác sau khi chọn được hồ sơ thuộc quyền xử lý.'}</p>}
      {busy && <p role="status">{en ? 'Loading cases…' : 'Đang tải hồ sơ…'}</p>}
      {error && <p role="alert">{knownErrors[error.status]?.[en ? 1 : 0] || (en ? 'Unable to load cases.' : 'Không thể tải danh sách hồ sơ.')}</p>}
      {queue?.length === 0 && <p>{en ? 'No cases are available.' : 'Chưa có hồ sơ để xử lý.'}</p>}
      <label><span><FolderOpen size={18} aria-hidden="true" />{en ? 'Case' : 'Hồ sơ'}</span><select value={selected?.caseId || ''} disabled={!queue?.length || busy} onChange={e => go(step, e.target.value)}>
        <option value="">{en ? 'Select a case' : 'Chọn hồ sơ'}</option>
        {selected && !listed && <option value={selected.caseId}>{en ? 'Selected case' : 'Hồ sơ đang chọn'}</option>}
        {queue?.map(item => <option key={item.caseId} value={item.caseId}>{item.label}</option>)}
      </select></label>
      {currentResult?.totalPages > 1 && <div role="group" aria-label={en ? 'Case pages' : 'Trang hồ sơ'}>
        <button type="button" disabled={busy || page === 0} onClick={() => { setPage(value => value - 1); go(step, ''); }}>{en ? 'Previous' : 'Trước'}</button>
        <span>{page + 1} / {currentResult.totalPages}</span>
        <button type="button" disabled={busy || page + 1 >= currentResult.totalPages} onClick={() => { setPage(value => value + 1); go(step, ''); }}>{en ? 'Next' : 'Sau'}</button>
      </div>}
      {error && <button type="button" disabled={busy} onClick={() => setAttempt(value => value + 1)}>{en ? 'Retry' : 'Thử lại'}</button>}
    </section>
    {selected && <>
      <LegalContextStep key={`${session.accessToken}:${selected.caseId}:${step}`} session={session} selected={selected} step={step}
        lang={lang} contextLoader={contextLoader} onUnauthorized={onUnauthorized}
        onNavigate={onNavigate}
        onDenied={error => setDiscoveryResult({ session, discovery, attempt, page, error, queue: null })} />
    </>}
    {!selected && queue?.length > 0 && !busy && !error && <div className="lv-legal-live__empty"><FileCheck2 size={36} aria-hidden="true" /><h2>{en ? 'Select a case to begin' : 'Chọn hồ sơ để bắt đầu'}</h2><p>{en ? 'Choose a case above to view documents and available actions.' : 'Chọn hồ sơ ở trên để xem giấy tờ và các thao tác được phép thực hiện.'}</p></div>}
  </section>;
}

function LegalContextStep({ session, selected, step, lang, contextLoader, onUnauthorized, onDenied, onNavigate }) {
  const [result, setResult] = useState(null);
  const [guidanceStale, setGuidanceStale] = useState(false);


  const [attempt, setAttempt] = useState(0);
  // Keep only the input draft here. Revalidation unmounts stale records and actions;
  // the caller's case/step/session key still discards the draft when scope changes.
  const [draft, setDraft] = useState({});
  const [documentId, setDocumentId] = useState('');
  const [savedReceipt, setSavedReceipt] = useState(null);
  const en = lang === 'en';
  const auth = useRef(onUnauthorized);
  const denied = useRef(onDenied);
  useEffect(() => { denied.current = onDenied; }, [onDenied]);
  const locale = useRef(lang);
  useEffect(() => { locale.current = lang; }, [lang]);
  useEffect(() => { auth.current = onUnauthorized; }, [onUnauthorized]);
  useEffect(() => {
    const controller = new AbortController();
    contextLoader(selected.caseId, { accessToken: session.accessToken, roles: session.user.roles, lang: locale.current, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setResult({ attempt, contextLoader, session, data }); setGuidanceStale(false); } })
      .catch(error => { if (!controller.signal.aborted) {
        setResult({ attempt, contextLoader, session, error }); if (error.status === 401) auth.current?.();
        if (error.status === 403) denied.current?.(error);
      } });
    return () => controller.abort();
  }, [selected.caseId, session, contextLoader, attempt]);
  const current = result?.attempt === attempt && result.session === session && result.contextLoader === contextLoader ? result : null;
  const distribution = useDistributionWorkflow({ caseId: selected.caseId, workspace: 'LEGAL', accessToken: session.accessToken, lang,
    enabled: !!current?.data && current.data.basisDossier?.route !== 'ON_HOLD' && current.data.vaultStatus !== 'ON_HOLD'
      && ['basis-route-selection', 'approval-review', 'controlled-unlock'].includes(step), onUnauthorized, onDenied });
  const visibleReceipt = savedReceipt?.workflowStep === step ? savedReceipt : null;
  const outcome = visibleReceipt?.holdAction === 'held' ? (en ? 'Case placed on hold.' : 'Đã tạm dừng xử lý hồ sơ.')
    : visibleReceipt?.holdAction === 'resumed' ? (en ? 'Case processing resumed.' : 'Đã tiếp tục xử lý hồ sơ.')
    : visibleReceipt?.decision === 'LEGAL_REJECTED'
    ? (en ? 'Case approval rejected.' : 'Đã từ chối phê duyệt hồ sơ.')
    : visibleReceipt?.decision === 'LEGAL_APPROVED' ? (en ? 'Case approved.' : 'Đã phê duyệt hồ sơ.')
    : visibleReceipt?.status === 'UNLOCKED' ? (en ? 'Vault unlocked.' : 'Đã mở khóa kho.')
    : visibleReceipt?.reviewRequired ? (en ? 'Supplementation requested.' : 'Đã yêu cầu bổ sung giấy tờ.')
    : (en ? 'Decision saved.' : 'Đã lưu quyết định.');
  const notificationFeedback = workflowNotificationFeedback(visibleReceipt, 'STAFF', lang);
  const confirmation = visibleReceipt && <FeedbackNotice className="lv-workflow-feedback" tone="success" title={outcome}>
    {notificationFeedback && <p>{notificationFeedback.trim()}</p>}
    {!current && <p>{en ? 'Checking the latest case status before further action.' : 'Đang kiểm tra trạng thái mới nhất trước khi tiếp tục.'}</p>}
    {current?.error && <p>{en ? 'Saved successfully, but the latest case status could not be loaded. Retry before continuing.' : 'Thao tác đã lưu, nhưng chưa tải được trạng thái mới nhất. Hãy thử lại trước khi tiếp tục.'}</p>}
  </FeedbackNotice>;
  const saved = receipt => {
    setSavedReceipt({ ...receipt, workflowStep:step });
    window.dispatchEvent(new window.Event('lv-workflow-notifications-changed'));
    if (['approval-review', 'controlled-unlock'].includes(step)) setDraft({});
    setAttempt(value => value + 1);
  };
  if (!current) return <>{confirmation}<p role="status">{en ? 'Loading case context…' : 'Đang tải thông tin hồ sơ…'}</p></>;
  if (current.error) return <>{![401, 403, 404].includes(current.error.status) && confirmation}<div role="alert"><p>{knownErrors[current.error.status]?.[en ? 1 : 0] || (en ? 'Unable to load case information.' : 'Không thể tải thông tin hồ sơ.')}</p>
    <button type="button" onClick={() => setAttempt(value => value + 1)}>{en ? 'Retry' : 'Thử lại'}</button></div></>;
  const guideModel = legalGuidance({ context: guidanceStale ? null : { ...current.data, distributionWorkflow: distribution.data }, error: guidanceStale, current: step, caseId: selected.caseId, lang });
  if (guidanceStale) guideModel.message = en ? 'Reload the record to check the next step.' : 'Tải lại hồ sơ để kiểm tra bước tiếp theo.';
  const guide = <WorkflowGuide lang={lang} onNavigate={onNavigate} model={guideModel} />;
  const context = current.data;
  const readOnly = legalReadOnly(context);
  const caseStatus = ['CANCELLED', 'CLOSED', 'ARCHIVED', 'COMPLETED'].includes(context.caseStatus) ? context.caseStatus : context.vaultStatus;
  const statusTone = legalStatusTone(caseStatus);
  const StatusIcon = statusIcons[statusTone];
  return <>
    {confirmation}
    {visibleReceipt && step === 'approval-review' && context.snapshot?.approvalCurrent && context.capabilities.unlock.allowed && !readOnly &&
      <p className="lv-legal-help">{en ? 'Approval is recorded. Unlocking requires a separate confirmation.' : 'Đã ghi nhận phê duyệt. Mở khóa cần một lần xác nhận riêng.'}{' '}
        <a href={`${paths['controlled-unlock']}?${new URLSearchParams({ caseId: context.caseId, lang })}`}>{legalStepTitle('controlled-unlock', lang)}</a></p>}
    {guide}
    <div className="lv-legal-case-banner lv-surface-card">
      <div className="lv-legal-case-banner__icon"><FolderOpen size={28} aria-hidden="true" /></div>
      <div className="lv-legal-case-banner__content"><span>{en ? 'Selected case' : 'Hồ sơ đang xem'}</span>
        <strong>{context.caseNumber || selected.label}</strong>
        {caseStatus && <span className={`lv-legal-case-status is-${statusTone}`}><StatusIcon size={16} aria-hidden="true" />{legalStatus(caseStatus, en)}</span>}
      </div>
      {readOnly && <span className="lv-legal-case-banner__readonly"><Archive size={18} aria-hidden="true" />{en ? 'Read only' : 'Chỉ đọc'}</span>}
    </div>
    {step === 'basis-route-selection'
      ? <LegalDistributionWorkspace workflow={distribution} session={session} context={context} lang={lang}
          onComplete={() => setAttempt(value => value + 1)} onSaved={saved} onUnauthorized={onUnauthorized} onDenied={onDenied} />
      : ['approval-review', 'controlled-unlock'].includes(step)
      ? <LegalDistributionFinalWorkspace workflow={distribution} session={session} context={context} step={step} lang={lang}
        draft={draft} setDraft={setDraft} onReload={() => setAttempt(value => value + 1)} onSaved={saved} onContextChanged={() => setGuidanceStale(true)} onUnauthorized={onUnauthorized} onDenied={onDenied} />
      : <LegalCaseStep session={session} selected={{ ...selected, deathDocumentIds: context.deathDocuments.map(item => item.id) }}
        step={step === 'basis-route-selection' ? 'dossier-review' : step} lang={lang} readOnly={readOnly} onUnauthorized={onUnauthorized} onDenied={onDenied} onSaved={saved}
        draft={draft} setDraft={setDraft} documentId={context.deathDocuments.some(item => item.id === documentId) ? documentId : context.deathDocuments.length === 1 ? context.deathDocuments[0].id : ''}
        setDocumentId={setDocumentId} onReload={() => setAttempt(value => value + 1)} />}
  </>;
}

function LegalCaseStep({ session, selected, step, lang, onUnauthorized, onDenied, onSaved, readOnly, draft: storedDraft, setDraft, documentId, setDocumentId, onReload }) {
  const en = lang === 'en';
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [needsReload, setNeedsReload] = useState(false);
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
    else task = Promise.resolve(null); // Final actions use LegalFinalDecision and the PS-102 context.
    task.then(value => { if (!c.signal.aborted) { setData(value); setError(null); setNeedsReload(false); } })
      .catch(err => { if (!c.signal.aborted) { setData(null); setError(err); setNeedsReload(true); if (err.status === 401) auth.current?.(); } })
      .finally(() => { if (!c.signal.aborted) { lock.current = false; setBusy(false); } });
    return () => c.abort();
  }, [session, selected.caseId, step, documentId]);
  useEffect(() => () => controller.current?.abort(), []);
  const singleOriginal = data?.originalWillIntakes?.length === 1 ? data.originalWillIntakes[0].id : '';
  const digitalOptions = (data?.wills || []).flatMap(will => will.versions.map(item => will.id + ':' + item.version));
  const draft = { ...storedDraft, originalWillIntakeId: storedDraft.originalWillIntakeId || singleOriginal,
    willVersion: storedDraft.willVersion || (digitalOptions.length === 1 ? digitalOptions[0] : '') };
  const set = (name, value) => setDraft(prev => ({ ...prev, [name]: value }));
  const input = (name, title, values) => ['originalWillIntakeId', 'willVersion'].includes(name) && values.length === 1 ? <LegalRecordDetails rows={[[title, values[0][1]]]} /> : <label>{title}<select value={draft[name] || ''} onChange={e => set(name, e.target.value)} disabled={busy} required>
    <option value="">{en ? 'Select' : 'Chọn'}</option>{values.map(([value, title]) => <option key={value} value={value}>{title}</option>)}
  </select></label>;
  const pick = (name, title, values) => input(name, title, values.map(value => [value, label(value, en)]));
  const latest = data?.dossier?.versions?.reduce((best, item) => !best || item.version > best.version ? item : best, null);
  const forwarded = data?.dossier?.status === 'LEGAL_BASIS_FORWARDED' && latest?.forwardStatus === 'FORWARDED'
    && latest.version >= data.dossier.requiredVersion && data.will.vaultStatus === 'LEGAL_BASIS_VERIFICATION' && data.will.approvalBlocked === false;
  const editable = !busy && !needsReload && !readOnly && Boolean(data);
  const evidenceProps = { caseId: selected.caseId, accessToken: session.accessToken, lang, inlineOnDesktop: true,
    onUnauthorized, onDenied: failure => { setData(null); setReceipt(null); setError(failure); setNeedsReload(true); } };
  let eligible = false;
  if (step === 'death-verification') eligible = editable && data.verificationCaseStatus === 'OPEN' && data.vaultStatus === 'AWAITING_VERIFICATION' && data.decisions.length === 0;
  if (step === 'will-document-verification') eligible = editable && ['DOCUMENT_VERIFICATION', 'WILL_VERIFICATION'].includes(data.vaultStatus) && data.wills.length > 0 && data.originalWillIntakes.length > 0;
  if (step === 'basis-route-selection') eligible = editable && ((!data.dossier && ['DOCUMENT_VERIFICATION', 'WILL_VERIFICATION'].includes(data.will.vaultStatus)) || (data.dossier?.route === 'ON_HOLD' && data.dossier.status === 'DRAFT' && data.will.vaultStatus === 'ON_HOLD'));
  if (step === 'dossier-review') eligible = editable && (data.dossier?.route === 'ON_HOLD' ? data.dossier.status === 'DRAFT' && data.will.vaultStatus === 'ON_HOLD' : ['COURT', 'NOTARIAL'].includes(data.dossier?.route) && (draft.action === 'hold'
    ? ['AWAITING_LEGAL_BASIS', 'LEGAL_BASIS_VERIFICATION'].includes(data.will.vaultStatus)
    : forwarded && data.dossier.route !== 'ON_HOLD'));
  const fieldsComplete = Boolean((step === 'death-verification' ? draft.decision
    : step === 'will-document-verification' ? draft.originalWillIntakeId && draft.willVersion && draft.result
    : step === 'basis-route-selection' ? draft.route
    : data?.dossier?.route === 'ON_HOLD' ? draft.route : draft.action && (draft.action !== 'court' || draft.result) && (draft.action !== 'hold' || draft.cause))
    && (step === 'will-document-verification' && draft.result === 'MATCH' || draft.reason?.trim()));
  const disabledReason = busy ? (en ? 'Loading the latest record. Please wait.' : 'Đang tải hồ sơ mới nhất. Vui lòng chờ.')
    : needsReload ? (receipt ? (en ? 'Select “View latest status” to continue.' : 'Chọn “Xem trạng thái mới” để tiếp tục.') : (en ? 'Select “Try again” to check the latest status before continuing.' : 'Chọn “Thử lại” để kiểm tra trạng thái mới nhất trước khi tiếp tục.'))
    : legalStepBlocker(step, { data, documentId, documentCount: selected.deathDocumentIds.length, action: draft.action }, en);

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
        // Compare document/allocation scope; never recompute server approval hashes.
        if (dossierScope(current) !== dossierScope(data.dossier)) throw { status: 409 };
      }
      if (step === 'basis-route-selection') value = await api.classifyLegalDossier(selected.caseId, { route: draft.route, routeReason: draft.reason }, { ...opts, reclassification: Boolean(data.dossier) });
      if (step === 'dossier-review') {
        if (data.dossier?.route === 'ON_HOLD') value = await api.classifyLegalDossier(selected.caseId, { route:draft.route, routeReason:draft.reason }, { ...opts, reclassification:true });
        else if (draft.action === 'hold') value = await api.holdLegalDossier(selected.caseId, draft, opts);
        else if (draft.action === 'court') value = await api.decideCourt(selected.caseId, { ...draft, version: latest?.version }, { ...opts, expectedHash: latest?.sha256 });
        else value = await api.reviewLegalDossier(selected.caseId, draft, { ...opts, dossierId: data.dossier?.id, reviewSnapshot: data.reviewSnapshot });
      }
      if (c.signal.aborted) return;
      setReceipt(value); setNeedsReload(true); // A receipt never grants the next capability: reload authoritative state.
      onSaved(value);
    } catch (err) {
      if (c.signal.aborted) return;
      setError(err); if (err.status === 401) auth.current?.();
      if ([401, 403, 404].includes(err.status)) setData(null);
      if (err.status === 403) onDenied?.(err);
      if ([401, 403, 404, 409].includes(err.status) || ['INVALID_RESPONSE', 'NETWORK_ERROR'].includes(err.code)) setNeedsReload(true);
    } finally { if (!c.signal.aborted) { lock.current = false; setBusy(false); } }
  }
  return <div className={`lv-legal-workspace${readOnly ? ' is-readonly' : ''}`} aria-busy={busy}>
    <section className="lv-legal-live__card lv-legal-documents lv-surface-card">
    <header className="lv-legal-card-heading"><h2><FileText size={20} aria-hidden="true" />{en ? 'Documents and assessment' : 'Giấy tờ và kết luận thẩm định'}</h2>
      {(error || needsReload || receipt) && <button type="button" disabled={busy} onClick={onReload}><RefreshCw size={16} aria-hidden="true" />{receipt ? (en ? 'View latest status' : 'Xem trạng thái mới') : (en ? 'Try again' : 'Thử lại')}</button>}
    </header>
    {readOnly && <p className="lv-legal-live__notice" role="status">{en ? 'This record is available for reference only. Editing is no longer available.' : 'Hồ sơ đã kết thúc xử lý. Bạn có thể tra cứu thông tin, không thể chỉnh sửa.'}</p>}
    {busy && <p role="status">{en ? 'Processing…' : 'Đang xử lý…'}</p>}
    {error && <p role="alert">{!data ? (error.status === 401 || error.status === 403 ? knownErrors[error.status][en ? 1 : 0]
      : error.status === 404 ? (en ? 'No accessible legal documents were found for this case. Check with Staff whether the documents have been forwarded for review.' : 'Chưa tìm thấy hồ sơ pháp lý được phép truy cập. Hãy kiểm tra với nhân viên xem giấy tờ đã được chuyển thẩm định chưa.')
      : (en ? 'Unable to load the case documents. Select “Try again” to reload them.' : 'Chưa tải được giấy tờ của hồ sơ. Chọn “Thử lại” để tải lại.')) : knownErrors[error.status]?.[en ? 1 : 0] || (error.code === 'VALIDATION_FAILED'
      ? (en ? 'Check your selections and reason (maximum 1000 characters).' : 'Kiểm tra lựa chọn và lý do (tối đa 1000 ký tự).')
      : (en ? 'The operation could not be confirmed. Reload to check its status before retrying.' : 'Chưa xác nhận được kết quả thao tác. Hãy tải lại để kiểm tra trạng thái trước khi thử lại.'))}</p>}
    {receipt && <div className="lv-legal-live__success" role="status"><p>{en ? 'Decision saved. Select “View latest status” to check the next available action.' : 'Đã lưu quyết định. Chọn “Xem trạng thái mới” để kiểm tra thao tác có thể thực hiện tiếp theo.'}</p>
      <LegalRecordDetails rows={[[en ? 'Reviewed by' : 'Người xử lý', session.user.fullName], [en ? 'Recorded at' : 'Thời gian ghi nhận', legalDate(receipt.decidedAt || receipt.comparedAt || receipt.reviewedAt || receipt.checkedAt || receipt.updatedAt || receipt.createdAt)]]} /></div>}
    {step === 'death-verification' && <>
      {selected.deathDocumentIds.length === 1 ? <p>{en ? 'The death document received by Staff is shown below.' : 'Giấy chứng tử do Nhân viên tiếp nhận được hiển thị bên dưới.'}</p> : <label>{en ? 'Death document' : 'Giấy tờ khai tử'}<select value={documentId} disabled={busy} onChange={e => { setDocumentId(e.target.value); setData(null); setDraft({}); setReceipt(null); setBusy(true); }}>
        <option value="">{en ? 'Select a document' : 'Chọn giấy tờ'}</option>{selected.deathDocumentIds.map((id, i) => <option key={id} value={id}>{en ? 'Document' : 'Giấy tờ'} {i + 1}</option>)}
      </select></label>}
      {data && <><LegalRecordDetails rows={[[en ? 'Issuing authority' : 'Cơ quan cấp', data.document.issuingAuthority], [en ? 'Document number' : 'Số giấy tờ', data.document.documentNumber], [en ? 'Issue date' : 'Ngày cấp', legalDate(data.document.issuedDate)]]} />
        {data.decisions.map((item, i) => <div key={i} className="lv-legal-history-item"><LegalRecordDetails rows={[[en ? 'Decision' : 'Quyết định', label(({ APPROVED: 'APPROVE', REJECTED: 'REJECT', NEEDS_CORRECTION: 'REQUEST_MORE' })[item.result], en)], [en ? 'Recorded at' : 'Thời gian ghi nhận', legalDate(item.decidedAt)], [en ? 'Reason' : 'Lý do', item.reason]]} /></div>)}</>}
      {!busy && data && documentId && <LegalEvidenceFiles {...evidenceProps} kind="death" subjectId={documentId} />}
    </>}
    {step === 'will-document-verification' && data && <>
      {data.originalWillIntakes.length > 0 ? <>
        <p>{en ? 'Review the received paper will and compare it with the saved digital version.' : 'Xem di chúc giấy đã tiếp nhận và đối chiếu với bản di chúc số đã lưu.'}</p>
        {input('originalWillIntakeId', en ? 'Original intake' : 'Bản gốc đã tiếp nhận', data.originalWillIntakes.map((item, i) => [item.id, `${en ? 'Intake' : 'Lần nhận'} ${i + 1}`]))}
      </> : <div className="lv-legal-live__notice" role="status"><Info size={20} aria-hidden="true" /><div>
        <strong>{en ? 'No original paper will has been received for this case.' : 'Hồ sơ này chưa có di chúc bản cứng được tiếp nhận.'}</strong>
        {!readOnly && <p>{en ? 'Staff must record the original paper will and attach its scan before Legal can compare it with the digitized version.' : 'Nhân viên cần ghi nhận tiếp nhận di chúc bản cứng và đính kèm bản scan trước khi Pháp lý đối chiếu với bản di chúc số.'}</p>}
      </div></div>}
      {data.comparisons.map(item => <div key={item.id} className="lv-legal-history-item"><LegalRecordDetails rows={[[en ? 'Result' : 'Kết quả', label(item.result, en)], [en ? 'Version' : 'Phiên bản', item.version], [en ? 'Compared at' : 'Thời gian đối chiếu', legalDate(item.comparedAt)]]} /></div>)}
      {!busy && data.originalWillIntakes.some(item => item.id === draft.originalWillIntakeId) &&
        <LegalEvidenceFiles {...evidenceProps} kind="original-will" subjectId={draft.originalWillIntakeId} />}
    </>}
    {step === 'dossier-review' && data && !data.dossier && <div role="status" className="lv-legal-live__notice">
      <p>{en ? 'Staff have not yet received the distribution documents for this case.' : 'Nhân viên chưa tiếp nhận giấy tờ phân chia tài sản cho hồ sơ này.'}</p>
    </div>}
    {data?.dossier && <><p className="lv-legal-route-label">{label(data.dossier.route, en)}</p>
      {[...data.dossier.versions].sort((a, b) => b.version - a.version).map(item => <section key={item.version} className="lv-legal-document-version">
        <h3>{en ? `Version ${item.version}` : `Phiên bản ${item.version}`} · {item.version === latest.version ? (en ? 'Current document' : 'Văn bản hiện tại') : (en ? 'Historical document' : 'Văn bản cũ để tra cứu')}</h3>
        <LegalRecordDetails rows={[[en ? 'Document number' : 'Số giấy tờ', item.documentNumber], [en ? 'Issuing authority' : 'Cơ quan ban hành', item.issuingAuthority], [en ? 'Issue date' : 'Ngày ban hành', legalDate(item.issueDate)], ...(data.dossier.route === 'NOTARIAL' ? [[en ? 'Notary office' : 'Tổ chức công chứng', item.notaryAuthority], [en ? 'Notarial document number' : 'Số văn bản công chứng', item.notarialDocumentNumber], [en ? 'Notarized on' : 'Ngày công chứng', legalDate(item.notarizedAt)]] : []), [en ? 'Forwarded at' : 'Thời gian chuyển thẩm định', legalDate(item.forwardedAt)]]} />
        <LegalAllocations version={item} lang={lang} />
        {!busy && item.forwardStatus === 'FORWARDED' && <LegalEvidenceFiles {...evidenceProps} kind="basis" versionNo={item.version}
          file={{ contentType: item.contentType, sizeBytes: item.sizeBytes, sha256: item.sha256 }} />}
      </section>)}
      {data.court?.map(item => <div key={item.id} className="lv-legal-history-item"><LegalRecordDetails rows={[[en ? 'Result' : 'Kết quả', label(item.result, en)], [en ? 'Version' : 'Phiên bản', item.version], [en ? 'Reviewed at' : 'Thời gian thẩm định', legalDate(item.reviewedAt)]]} /></div>)}</>}
    </section>
    {!readOnly && <section className="lv-legal-live__card lv-legal-action-panel lv-surface-card">
      <header className="lv-legal-card-heading"><h2><SquarePen size={20} aria-hidden="true" />{en ? 'Record assessment' : 'Ghi nhận kết luận'}</h2></header>
      <form onSubmit={submit}>
      {step === 'death-verification' && pick('decision', en ? 'Decision' : 'Quyết định', ['APPROVE', 'REJECT', 'REQUEST_MORE'])}
      {step === 'will-document-verification' && <>
        {input('willVersion', en ? 'Digitized version' : 'Bản di chúc số', (data?.wills || []).flatMap((will, index) => will.versions.map(item => [`${will.id}:${item.version}`, `${en ? 'Will' : 'Di chúc'} ${index + 1}: ${en ? 'Version' : 'Phiên bản'} ${item.version}`])))}
        {pick('result', en ? 'Comparison result' : 'Kết quả đối chiếu', ['MATCH', 'MISMATCH', 'INCONCLUSIVE'])}
      </>}
      {step === 'basis-route-selection' && pick('route', en ? 'Legal basis' : 'Căn cứ pháp lý', data?.dossier ? ['COURT'] : ['COURT', 'ON_HOLD'])}
      {step === 'dossier-review' && <>
        {data?.dossier?.route === 'ON_HOLD' ? pick('route', en ? 'Resume with these documents' : 'Tiếp tục xử lý theo giấy tờ', ['NOTARIAL', 'COURT']) : pick('action', en ? 'Action' : 'Thao tác', data?.dossier?.route === 'COURT' ? ['review', 'request-supplementation', 'court', 'hold'] : ['review', 'request-supplementation'])}
        {draft.action === 'court' && pick('result', en ? 'Court decision result' : 'Kết luận quyết định tòa', ['VALID', 'INVALID', 'INCONCLUSIVE'])}
        {draft.action === 'hold' && pick('cause', en ? 'Cause' : 'Nguyên nhân', ['NEW_DISPUTE', 'INSUFFICIENT_EVIDENCE'])}
      </>}
      <label>{en ? 'Reason (up to 1000 characters)' : 'Lý do (tối đa 1000 ký tự)'}<textarea value={draft.reason || ''} maxLength={1000} disabled={busy} required={step !== 'will-document-verification' || draft.result !== 'MATCH'} onChange={e => set('reason', e.target.value)} /></label>
      <div className="lv-legal-form-actions"><button type="submit" disabled={!eligible || !fieldsComplete} aria-describedby={!eligible || !fieldsComplete ? 'legal-review-blocked' : undefined}><FileCheck2 size={18} aria-hidden="true" />{en ? 'Record decision' : 'Ghi nhận quyết định'}</button></div>
      <WorkflowActionHint id="legal-review-blocked" reason={!eligible ? disabledReason : !fieldsComplete ? (en ? 'Complete the selections and enter a reason above.' : 'Chọn đầy đủ thông tin và nhập lý do phía trên.') : ''} />
    </form></section>}
  </div>;
}
