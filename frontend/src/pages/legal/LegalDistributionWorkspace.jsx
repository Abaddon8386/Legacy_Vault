import { useRef, useState } from 'react';
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
  const matches = documentMatchesWorkflow(data, context.basisDossier);
  const can = action => !onHold && !holdPending && !legalReadOnly(context) && canUseDistributionAction(data, action, 'LEGAL') && (action === 'requestDocuments' || matches);
  const request = data?.phase === 'DOCUMENT_REQUEST_NEEDED';
  const documents = data?.phase === 'DOCUMENTS_UNDER_REVIEW';
  const allocations = data?.phase === 'ALLOCATIONS_UNDER_REVIEW';
  const actions = documents ? [['approveDocuments', en ? 'Accept documents' : 'Duyệt căn cứ'], ['requestDocumentSupplementation', en ? 'Request more documents' : 'Yêu cầu bổ sung giấy tờ']]
      : allocations ? [['approveAllocations', en ? 'Accept allocations' : 'Chấp thuận phân bổ'], ['requestAllocationChanges', en ? 'Request allocation corrections' : 'Yêu cầu sửa phân bổ']] : [];
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
  const holdControls = <LegalHoldControls key={`${context.caseId}:${session.accessToken}`} context={context} session={session} lang={lang}
    draft={holdDraft} onDraftChange={onHoldDraftChange} onPendingChange={onPendingChange}
    disabled={workflow.pending} onUnauthorized={onUnauthorized} onDenied={onDenied}
    claimOperation={() => { if (operation.current || workflow.pending) return false; operation.current = true; setHoldPending(true); return true; }}
    releaseOperation={() => { operation.current = false; setHoldPending(false); }}
    onComplete={receipt => receipt ? onSaved?.(receipt) : onComplete?.()} />;
  if (onHold) return holdControls;
  return <>
    <DistributionWorkflowOverview workflow={workflow} workspace="LEGAL" lang={lang} showRefresh={false} />
    {holdControls}
    {request && <LegalDocumentRequestForm lang={lang} draft={scopedDraft} onDraftChange={value => setDraft({ ...value, scope })}
      pending={workflow.pending || holdPending} allowed={can('requestDocuments')} onSubmit={value => save('requestDocuments', value)} />}
    {data?.document && <section className="lv-legal-step-data lv-surface-card">
      <h2>{en ? 'Submitted distribution documents' : 'Giấy tờ phân chia đã nộp'}</h2>
      {!matches ? <p role="alert">{en ? 'The document version changed. Reload the case before deciding.' : 'Phiên bản giấy tờ đã thay đổi. Tải lại hồ sơ trước khi quyết định.'}</p>
        : <LegalEvidenceFiles caseId={context.caseId} kind="basis" versionNo={data.document.version}
          accessToken={session.accessToken} lang={lang} inlineOnDesktop onUnauthorized={onUnauthorized} onDenied={onDenied} />}
      <p>{en ? 'Assess the actual submitted document and its validity. The applicant chooses where to obtain it outside this system.' : 'Kiểm tra loại giấy tờ thực tế được nộp và tính hợp lệ. Người nộp tự làm giấy tờ bên ngoài hệ thống; Legal không chọn nhánh Tòa án từ đầu.'}</p>
    </section>}
    {data?.allocation && <section className="lv-legal-step-data lv-surface-card" aria-label={en ? 'Asset and recipient review' : 'Kiểm tra tài sản và người nhận'}>
      <h2>{en ? 'Check each allocation' : 'Kiểm tra từng phần phân bổ'}</h2>
      <p>{en ? 'Compare each asset, recipient and entitlement with the accepted document. Request corrections if they do not match.' : 'Đối chiếu từng tài sản, người nhận và phần được hưởng với giấy tờ đã duyệt. Yêu cầu Staff sửa nếu thông tin chưa khớp.'}</p>
      <ol className="lv-distribution-review-list">{data.allocation.items.map((item, index) => <li key={`${item.assetId}:${item.beneficiaryId}:${index}`}>
        <strong>{item.assetName}</strong><span>{en ? 'Recipient: ' : 'Người nhận: '}{item.recipientName}</span><p>{item.description}</p>
      </li>)}</ol>
      {data.allocation.documentVersion !== data.document?.version && <p role="alert">{en ? 'These allocations refer to an older document. Staff must prepare them again.' : 'Phân bổ này dựa trên giấy tờ cũ. Staff cần lập lại theo giấy tờ mới nhất.'}</p>}
    </section>}
    {!!actions.length && <section className="lv-legal-step-data lv-surface-card">
      <h2>{documents ? (en ? 'Document assessment' : 'Kết quả thẩm định căn cứ') : (en ? 'Allocation review' : 'Kết quả kiểm tra phân bổ')}</h2>
      <form className="lv-distribution-form" onSubmit={submit}>
        <label>{en ? 'Assessment or correction reason' : 'Nội dung đánh giá hoặc lý do cần bổ sung/sửa'}
          <textarea required maxLength={1000} value={reason} disabled={workflow.pending}
            onChange={event => setDraft({ scope, reason: event.target.value })} /></label>
        <div className="lv-distribution-actions">{actions.map(([action, title]) => <button type="submit" className={action.startsWith('approve') ? 'lv-decision--positive' : 'lv-decision--neutral'} key={action} value={action}
          disabled={workflow.pending || !reason.trim() || !can(action)}>{title}</button>)}</div>
      </form>
    </section>}
  </>;
}

export function LegalDistributionFinalWorkspace({ workflow, context, step, lang, ...props }) {
  const ready = distributionFinalReady(workflow.data, context, step);
  return <>
    <DistributionWorkflowOverview workflow={workflow} workspace="LEGAL" lang={lang} showRefresh={false} />
    <LegalFinalDecision {...props} context={context} step={step} lang={lang} workflowReadOnly={!ready}
      beforeCommit={(fresh, options) => preflightDistributionFinal(context.caseId, workflow.data, fresh, step, options)} />
  </>;
}
