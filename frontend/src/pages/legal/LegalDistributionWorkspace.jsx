import { useId, useRef, useState } from 'react';
import DistributionWorkflowOverview from '../../workflows/DistributionWorkflowOverview.jsx';
import { canUseDistributionAction, documentMatchesWorkflow, distributionFinalReady, preflightDistributionFinal } from '../../workflows/distributionWorkflowService.js';
import LegalEvidenceFiles from './LegalEvidenceFiles.jsx';
import LegalFinalDecision from './LegalFinalDecision.jsx';
import LegalHoldControls from './LegalHoldControls.jsx';
import { legalReadOnly } from './legalPresentation.js';
import LegalDocumentRequestForm from './LegalDocumentRequestForm.jsx';

export default function LegalDistributionWorkspace({ workflow, context, session, lang = 'vi', onComplete, onSaved, onUnauthorized, onDenied, draftState, onDraftStateChange, holdDraft, onHoldDraftChange, onPendingChange }) {
  const en = lang === 'en', data = workflow.data;
  const [localDraft, setLocalDraft] = useState({ scope: '', reason: '' });
  const draft=draftState || localDraft, setDraft=onDraftStateChange || setLocalDraft;
  const operation = useRef(false), [holdPending, setHoldPending] = useState(false);
  const onHold = context.basisDossier?.route === 'ON_HOLD' || context.vaultStatus === 'ON_HOLD';
  const scope = `${context.caseId}:${session.accessToken}:${data?.phase}:${data?.document?.version}:${data?.allocation?.version}`;
  const scopedDraft = draft.scope === scope ? draft : {};
  const reason = scopedDraft.reason || '';
  const decisionForm = useId();
  const allocationHeadings = en ? ['Asset', 'Recipient', 'Allocation'] : ['Tài sản', 'Người nhận', 'Phần được hưởng'];
  const matches = documentMatchesWorkflow(data, context.basisDossier);
  const can = action => !onHold && !holdPending && !legalReadOnly(context) && canUseDistributionAction(data, action, 'LEGAL') && (action === 'requestDocuments' || matches);
  const request = data?.phase === 'DOCUMENT_REQUEST_NEEDED';
  const documents = data?.phase === 'DOCUMENTS_UNDER_REVIEW';
  const allocations = data?.phase === 'ALLOCATIONS_UNDER_REVIEW';
  const rejected = data?.phase === 'REJECTED';
  const actions = documents ? [['approveDocuments', en ? 'Accept documents' : 'Duyệt căn cứ'], ['requestDocumentSupplementation', en ? 'Request more documents' : 'Yêu cầu bổ sung giấy tờ']]
      : allocations ? [['approveAllocations', en ? 'Accept allocations' : 'Chấp thuận phân bổ'], ['requestAllocationChanges', en ? 'Request allocation corrections' : 'Yêu cầu sửa phân bổ']]
      : rejected ? [['requestDocumentSupplementation', en ? 'Request document supplementation' : 'Mở bước bổ sung giấy tờ']] : [];
  async function save(action, value) {
    if (operation.current || !can(action) || !value.trim() || value.trim().length > 1000) return;
    operation.current = true;
    try {
      const saved = await workflow.run(action, { reason: value });
      if (saved) { setDraft({ scope, reason: '' }); onComplete?.(); }
    } finally { operation.current = false; }
  }
  function submit(event) {
    event.preventDefault();
    return save(event.nativeEvent?.submitter?.value || actions[0]?.[0], reason);
  }
  const holdControls = toolbar => <LegalHoldControls key={`${context.caseId}:${session.accessToken}`} toolbar={toolbar} context={context} session={session} lang={lang}
    draft={holdDraft} onDraftChange={onHoldDraftChange} onPendingChange={onPendingChange}
    disabled={workflow.pending} onUnauthorized={onUnauthorized} onDenied={onDenied}
    claimOperation={() => { if (operation.current || workflow.pending) return false; operation.current = true; setHoldPending(true); return true; }}
    releaseOperation={() => { operation.current = false; setHoldPending(false); }}
    onComplete={receipt => receipt ? onSaved?.(receipt) : onComplete?.()} />;
  if (onHold) return holdControls();
  return <>
    <DistributionWorkflowOverview workflow={workflow} workspace="LEGAL" lang={lang} showRefresh={false} />
    {!actions.length && <div className="lv-legal-basis-other-actions">{holdControls()}</div>}
    {request && <LegalDocumentRequestForm lang={lang} draft={scopedDraft} onDraftChange={value => setDraft({ ...value, scope })}
      pending={workflow.pending || holdPending} allowed={can('requestDocuments')} onSubmit={value => save('requestDocuments', value)} />}
    <div className={`lv-legal-basis-workspace${actions.length ? ' is-review' : ''}`}>
    <div className="lv-legal-basis-source">
    {data?.document && <section className="lv-legal-step-data lv-legal-live__card lv-legal-basis-evidence">
      <h2>{en ? 'Submitted distribution documents' : 'Giấy tờ phân chia đã nộp'}</h2>
      <p>{en ? 'Check the document content and validity before deciding.' : 'Đối chiếu nội dung và tính hợp lệ của văn bản trước khi quyết định.'}</p>
      {!matches ? <p role="alert">{en ? 'The document version changed. Reload the case before deciding.' : 'Phiên bản giấy tờ đã thay đổi. Tải lại hồ sơ trước khi quyết định.'}</p>
        : <LegalEvidenceFiles caseId={context.caseId} kind="basis" versionNo={data.document.version}
          accessToken={session.accessToken} lang={lang} onUnauthorized={onUnauthorized} onDenied={onDenied} />}
    </section>}
    {data?.allocation && <section className="lv-legal-step-data lv-legal-live__card lv-legal-allocations" aria-label={en ? 'Asset and recipient review' : 'Kiểm tra tài sản và người nhận'}>
      <h2>{en ? 'Check each allocation' : 'Kiểm tra từng phần phân bổ'}</h2>
      <p>{en ? 'Compare each asset, recipient and entitlement with the accepted document. Request corrections if they do not match.' : 'Đối chiếu từng tài sản, người nhận và phần được hưởng với giấy tờ đã duyệt. Yêu cầu Staff sửa nếu thông tin chưa khớp.'}</p>
      <table>
        <thead><tr>{allocationHeadings.map(heading => <th key={heading} scope="col">{heading}</th>)}</tr></thead>
        <tbody>{data.allocation.items.map((item, index) => <tr key={`${item.assetId}:${item.beneficiaryId}:${index}`}>
          {[item.assetName, item.recipientName, item.description || '—'].map((value, cell) => <td key={allocationHeadings[cell]}><span className="lv-legal-allocation-mobile-label" aria-hidden="true">{allocationHeadings[cell]}</span><div className="lv-legal-allocation-cell">{value}</div></td>)}
        </tr>)}</tbody>
      </table>
      {data.allocation.documentVersion !== data.document?.version && <p role="alert">{en ? 'These allocations refer to an older document. Staff must prepare them again.' : 'Phân bổ này dựa trên giấy tờ cũ. Staff cần lập lại theo giấy tờ mới nhất.'}</p>}
    </section>}
    </div>
    {!!actions.length && <section className="lv-legal-step-data lv-legal-live__card lv-legal-basis-decision">
      <h2>{documents ? (en ? 'Document assessment' : 'Kết quả thẩm định căn cứ') : allocations ? (en ? 'Allocation review' : 'Kết quả kiểm tra phân bổ') : (en ? 'Document supplementation' : 'Yêu cầu bổ sung giấy tờ')}</h2>
      <form id={decisionForm} className="lv-distribution-form" onSubmit={submit}>
        <label><span>{en ? 'Assessment or correction reason' : 'Nội dung đánh giá hoặc lý do cần bổ sung/sửa'}<span className="lv-required-mark" aria-hidden="true">*</span></span>
          <textarea required maxLength={1000} rows={4} value={reason} disabled={workflow.pending}
            placeholder={en ? 'Enter your assessment or specify what needs to be supplemented.' : 'Nhập nhận xét hoặc nêu rõ nội dung cần bổ sung, chỉnh sửa.'}
            onChange={event => setDraft({ scope, reason: event.target.value })} /></label>
      </form>
      <div className="lv-legal-basis-hold-footer">{holdControls(actions.map(([action, title]) => <button type="submit" form={decisionForm} className={action.startsWith('approve') ? 'lv-decision--positive' : 'lv-decision--warning'} key={action} value={action}
          disabled={workflow.pending || !reason.trim() || !can(action)}>{title}</button>))}</div>
    </section>}
    </div>
  </>;
}

export function LegalDistributionFinalWorkspace({ workflow, context, step, lang, ...props }) {
  const en = lang === 'en';
  const ready = distributionFinalReady(workflow.data, context, step);
  const [suppReason, setSuppReason] = useState('');
  const [suppSubmitting, setSuppSubmitting] = useState(false);
  const [suppError, setSuppError] = useState(null);
  const canSupplement = step === 'approval-review' && workflow.data?.phase === 'REJECTED'
    && canUseDistributionAction(workflow.data, 'requestDocumentSupplementation', 'LEGAL');

  async function handleSupplement(event) {
    event.preventDefault();
    if (!suppReason.trim() || suppSubmitting) return;
    setSuppSubmitting(true);
    setSuppError(null);
    try {
      const receipt = await workflow.run('requestDocumentSupplementation', { reason: suppReason.trim() });
      if (receipt) {
        setSuppReason('');
        props.onSaved?.(receipt);
        props.onReload?.();
      }
    } catch (err) {
      setSuppError(err);
    } finally {
      setSuppSubmitting(false);
    }
  }

  return <>
    <DistributionWorkflowOverview workflow={workflow} workspace="LEGAL" lang={lang} showRefresh={false} />
    {canSupplement && (
      <section className="lv-legal-step-data lv-legal-live__card lv-legal-basis-decision lv-surface-card" style={{ marginBlock: '16px' }}>
        <header className="lv-legal-card-heading">
          <h2>{en ? 'Open document supplementation' : 'Mở bước bổ sung giấy tờ'}</h2>
        </header>
        <p>{en ? 'This version was rejected. Enter instructions and open the supplementation step for Staff.' : 'Hồ sơ đã bị từ chối. Nhập nội dung hướng dẫn và mở bước bổ sung để Staff tiếp nhận tài liệu mới.'}</p>
        <form onSubmit={handleSupplement} className="lv-distribution-form">
          <label>
            <span>{en ? 'Supplementation instructions' : 'Nội dung yêu cầu bổ sung'}<span className="lv-required-mark" aria-hidden="true">*</span></span>
            <textarea
              required
              rows={3}
              maxLength={1000}
              value={suppReason}
              disabled={suppSubmitting || workflow.pending}
              placeholder={en ? 'Specify what documents or corrections are required…' : 'Nêu rõ giấy tờ hoặc nội dung cần bổ sung…'}
              onChange={e => setSuppReason(e.target.value)}
            />
          </label>
          {suppError && <p role="alert">{en ? 'Unable to request supplementation. Please reload and try again.' : 'Không thể gửi yêu cầu bổ sung. Vui lòng tải lại và thử lại.'}</p>}
          <div className="lv-legal-basis-hold-footer">
            <button
              type="submit"
              className="lv-decision--warning"
              disabled={suppSubmitting || workflow.pending || !suppReason.trim()}
            >
              {suppSubmitting ? (en ? 'Sending…' : 'Đang gửi…') : (en ? 'Open supplementation step' : 'Mở bước bổ sung')}
            </button>
          </div>
        </form>
      </section>
    )}
    <LegalFinalDecision {...props} context={context} step={step} lang={lang} workflowReadOnly={!ready}
      beforeCommit={(fresh, options) => preflightDistributionFinal(context.caseId, workflow.data, fresh, step, options)} />
  </>;
}
