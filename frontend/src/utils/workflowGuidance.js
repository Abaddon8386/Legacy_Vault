import { evaluateCompletionProgress } from './completionProgressValidation.js';

const words = {
  intake: ['Tiếp nhận', 'Intake'], legal: ['Thẩm định pháp lý', 'Legal review'],
  handover: ['Bàn giao', 'Handover'], confirmation: ['Xác nhận đã nhận', 'Confirm receipt'], archive: ['Đóng và lưu trữ', 'Close and archive'],
  account: ['Tài khoản', 'Account'], request: ['Gửi mã hồ sơ', 'Submit case number'], link: ['Staff đối chiếu', 'Staff verification'], assets: ['Tài sản đã nhận', 'Received assets'],
  death: ['Giấy tờ khai tử', 'Death documents'], will: ['Đối chiếu di chúc', 'Compare will'], basis: ['Thẩm định căn cứ', 'Basis assessment'], review: ['Thẩm định phân bổ', 'Review allocation'], approval: ['Phê duyệt', 'Approval'], unlock: ['Mở khóa', 'Unlock'],
};
const text = (vi, en, lang) => lang === 'en' ? en : vi;
const step = (id, state, lang, href) => ({ id, state, label: words[id][lang === 'en' ? 1 : 0], href });
export function workflowUrl(path, { caseId, sessionId, lang = 'vi', preview = false } = {}) {
  const params = new URLSearchParams({ lang });
  if (caseId) params.set('caseId', caseId);
  if (sessionId) params.set('sessionId', sessionId);
  if (preview) params.set('preview', 'true');
  return `${path}?${params}`;
}

// Presentation only. A visited screen is never evidence that a step is complete.
export function staffGuidance({ current = 'intake', caseId, sessionId, caseStatus, vaultStatus, loading, error,
  forwarded, distributionWorkflow, legalApproved = false, sessionStatus, assets, beneficiaries, confirmationReady = false, intakeDestinationNeeded = false, hasReceipts = false, canArchive = false, lang = 'vi', preview = false } = {}) {
  const urls = { intake: '/staff/legal-documents', legal: '/staff/legal-documents', handover: sessionId ? '/staff/asset-handover' : '/staff/handover', confirmation: '/staff/beneficiary-confirmation', archive: '/staff/close-and-archive' };
  const progress = evaluateCompletionProgress(assets, beneficiaries);
  const archived = vaultStatus === 'ARCHIVED';
  const closed = ['CLOSED', 'CANCELLED'].includes(caseStatus);
  const states = Object.fromEntries(Object.keys(urls).map(id => [id, 'waiting']));
  let message = text('Chọn hồ sơ để xem việc cần làm.', 'Select a case to see the next task.', lang), next;
  if (caseId && !loading && !error) {
    // Only authoritative completion evidence, never a session ID or a visited route.
    if (forwarded === true || legalApproved === true || ['UNLOCKED', 'HANDOVER_IN_PROGRESS', 'ARCHIVED'].includes(vaultStatus)) states.intake = 'done';
    if (legalApproved === true || ['UNLOCKED', 'HANDOVER_IN_PROGRESS', 'ARCHIVED'].includes(vaultStatus)) states.legal = 'done';
    if (vaultStatus === 'ON_HOLD') {
      states.legal = 'blocked'; states.handover = 'blocked';
      message = text('Hồ sơ đang tạm dừng. Xem yêu cầu bổ sung hoặc thẩm định lại.', 'The case is on hold. Check supplementation or re-review requirements.', lang); next = 'intake';
    } else if (archived || closed) {
      message = archived ? text('Hồ sơ đã lưu trữ. Bạn vẫn có thể xem lịch sử.', 'Archived record. History remains available.', lang)
        : text('Hồ sơ đã đóng hoặc hủy; chỉ xem thông tin.', 'This case is closed or cancelled; viewing remains available.', lang);
      if (archived) { states.handover = 'done'; states.confirmation = 'done'; states.archive = 'done'; }
    } else if (canArchive) {
      states.archive = 'action'; states.handover = 'done'; states.confirmation = 'done';
      message = text('Đã đủ điều kiện lưu trữ hồ sơ.', 'The case is ready to archive.', lang); next = 'archive';
    } else if (progress.isComplete) {
      states.handover = 'done'; states.confirmation = 'done'; states.archive = 'action';
      message = sessionStatus === 'COMPLETED' && !hasReceipts
        ? text('Phiên đã đóng. Lập biên nhận Staff trước khi lưu trữ.', 'Session closed. Create the Staff receipt before archiving.', lang)
        : text('Đã đủ bàn giao và ký nhận. Kiểm tra đóng phiên, biên nhận và lưu trữ.', 'Delivery and receipt gates are complete. Check closing, receipts and archiving.', lang);
      next = 'archive';
    } else if (progress.assetMetric.is100) {
      states.handover = 'done'; states.confirmation = 'action'; states.archive = 'blocked';
      message = progress.beneficiaryMetric.isVerified ? text('Còn người nhận chưa ký nhận. Mở phần xác nhận đã nhận tài sản.', 'Recipient confirmations are still missing. Open receipt confirmation.', lang)
        : text('Đã đủ bàn giao; cần tải trạng thái ký nhận để kiểm tra điều kiện đóng.', 'Delivery is complete; load receipt status before checking closure.', lang); next = 'confirmation';
    } else if (current === 'confirmation' && confirmationReady) {
      states.confirmation = 'action';
      message = text('Ghi nhận ký nhận cho đúng người đã nhận tài sản.', 'Record receipt confirmation for the recipient who received the assets.', lang);
    } else if (sessionId || vaultStatus === 'UNLOCKED') {
      states.handover = sessionStatus === 'CANCELLED' ? 'blocked' : 'action';
      message = sessionStatus === 'CANCELLED' ? text('Phiên đã hủy. Quay lại chọn phiên hợp lệ.', 'Session cancelled. Select a valid session.', lang)
        : text('Bàn giao theo từng người và phần đã duyệt; phần đã giao vẫn xem được.', 'Deliver each recipient’s approved items; delivered items remain viewable.', lang);
      next = sessionStatus === 'CANCELLED' ? undefined : 'handover';
    } else if (forwarded === true) {
      states.intake = 'done'; states.legal = 'waiting'; states.handover = 'blocked';
      message = text('Đã chuyển Legal. Chờ thẩm định, phê duyệt và mở khóa.', 'Sent to Legal. Await review, approval and unlocking.', lang);
    } else if (forwarded === false) {
      states.intake = 'action'; states.handover = 'blocked'; next = 'intake';
      message = text('Tiếp nhận giấy tờ Legal yêu cầu; chỉ lập phân bổ sau khi căn cứ được duyệt.', 'Receive the requested documents; prepare allocations after Legal accepts them.', lang);
    } else {
      message = text('Xem hồ sơ căn cứ để kiểm tra bước đang chờ; chưa có dữ liệu xác nhận hoàn tất.', 'Check the basis dossier for outstanding tasks; completion is not yet confirmed.', lang); next = 'intake';
    }
  }
  if (distributionWorkflow && !['UNLOCKED', 'CLOSED'].includes(distributionWorkflow.phase)) {
    const phase = distributionWorkflow.phase;
    const messages = {
      DOCUMENT_REQUEST_NEEDED: ['Chờ Legal yêu cầu giấy tờ phân chia sau khi duyệt khai tử và đối chiếu di chúc.', 'Await Legal’s distribution document request.'],
      AWAITING_DOCUMENTS: ['Người nộp mang giấy tờ về; Staff chỉ tải giấy tờ, chưa lập phân bổ.', 'Upload the applicant’s documents. Do not prepare allocations yet.'],
      DOCUMENTS_UNDER_REVIEW: ['Chờ Legal duyệt căn cứ hoặc yêu cầu bổ sung kèm lý do.', 'Await Legal’s document assessment or supplementation request.'],
      AWAITING_ALLOCATIONS: ['Căn cứ đã duyệt. Mở tab Phân bổ tài sản rồi gửi Legal kiểm tra.', 'Documents accepted. Open Asset allocations and send them for review.'],
      ALLOCATIONS_UNDER_REVIEW: ['Chờ Legal kiểm tra từng tài sản và người nhận.', 'Await Legal’s check of each asset and recipient.'],
      FINAL_APPROVAL: ['Phân bổ đã chấp thuận. Chờ phê duyệt hồ sơ rồi mở kho riêng.', 'Allocations accepted. Await final approval and separate unlocking.'],
      APPROVED: ['Hồ sơ đã duyệt; chờ Legal xác nhận mở kho.', 'Case approved; await separate vault unlocking.'],
    };
    if (messages[phase]) {
      message = messages[phase][lang === 'en' ? 1 : 0];
      states.intake = ['AWAITING_DOCUMENTS', 'AWAITING_ALLOCATIONS'].includes(phase) ? 'action' : 'done';
      states.legal = states.intake === 'action' ? 'waiting' : 'action'; next = 'intake';
    }
  }
  if (caseId && loading) message = text('Đang kiểm tra trạng thái hồ sơ…', 'Checking case status…', lang);
  if (error) message = text('Chưa kiểm tra được điều kiện. Tải lại thông tin trước khi thao tác.', 'Conditions could not be checked. Reload before making changes.', lang);
  const steps = Object.keys(urls).map(id => step(id, states[id], lang, caseId ? workflowUrl(urls[id], { caseId, sessionId, lang, preview }) : undefined));
  return { current, steps, message, next: next && (next !== current || intakeDestinationNeeded) ? { ...steps.find(item => item.id === next), label: text('Đến bước ', 'Go to ', lang) + words[next][lang === 'en' ? 1 : 0].toLowerCase() } : undefined };
}

export function legalBlockedReason(context, action, lang = 'vi') {
  if (!context) return text('Chọn hồ sơ và tải lại trạng thái.', 'Select a case and reload its status.', lang);
  if (context.caseStatus !== 'OPEN') return text('Hồ sơ không còn mở; chỉ xem lịch sử.', 'The case is no longer open; history is read-only.', lang);
  if (context.basisDossier?.route === 'ON_HOLD' || context.vaultStatus === 'ON_HOLD') return text('Hồ sơ đang tạm dừng. Cần xử lý yêu cầu bổ sung/thẩm định lại.', 'The case is on hold. Resolve supplementation or re-review.', lang);
  const code = context.capabilities?.[action]?.blockedReason;
  const reasons = {
    LEGAL_WORKFLOW_ON_HOLD: ['Hồ sơ đang tạm dừng. Cần xử lý yêu cầu bổ sung/thẩm định lại.', 'The case is on hold. Resolve supplementation or re-review.'],
    COURT_DECISION_REQUIRED: ['Chưa xác nhận văn bản Tòa án hợp lệ cho phiên bản hiện tại.', 'The current court evidence has not been validated.'],
    LEGAL_DECISION_STALE: ['Phiên bản hoặc phân bổ đã thay đổi. Cần thẩm định/phê duyệt lại.', 'The version or allocation changed. Re-review or re-approval is required.'],
    LEGAL_APPROVAL_REQUIRED: ['Chưa có phê duyệt còn hiệu lực cho phiên bản và phân bổ này.', 'No current approval covers this version and allocation.'],
    BASIS_DOSSIER_INVALID_STATE: ['Nhân viên cần chuyển văn bản và thông tin phân chia tài sản mới nhất để thẩm định.', 'Staff must forward the latest documents and asset allocations for review.'],
  };
  return reasons[code]?.[lang === 'en' ? 1 : 0] || text('Chưa thể thực hiện bước này. Tải lại hồ sơ và kiểm tra các bước thẩm định trước đó.', 'This step is not available yet. Reload the case and check the earlier review steps.', lang);
}

export function legalGuidance({ context, current, caseId, lang = 'vi', loading = false, error = false } = {}) {
  const ids = ['death', 'will', 'basis', 'approval', 'unlock'];
  const routes = ['death-verification', 'will-document-verification', 'basis-route-selection', 'approval-review', 'controlled-unlock'];
  const index = routes.indexOf(current === 'dossier-review' ? 'basis-route-selection' : current);
  const states = Object.fromEntries(ids.map(id => [id, 'waiting']));
  let message = text('Đang kiểm tra điều kiện hồ sơ…', 'Checking case conditions…', lang), next;
  if (context && !loading && !error) {
    const status = context.vaultStatus, phase = context.distributionWorkflow?.phase;
    const closed = ['CLOSED', 'CANCELLED', 'COMPLETED', 'ARCHIVED'].includes(context.caseStatus) || ['ARCHIVED', 'COMPLETED'].includes(status);
    const unlocked = ['UNLOCKED', 'HANDOVER_IN_PROGRESS', 'ARCHIVED'].includes(status);
    const approved = ['APPROVED', 'UNLOCKED'].includes(phase) || unlocked;
    const deathDone = ['DOCUMENT_VERIFICATION', 'WILL_VERIFICATION', 'AWAITING_LEGAL_BASIS', 'LEGAL_BASIS_VERIFICATION', 'ON_HOLD'].includes(status) || unlocked;
    const willDone = context.willComparison?.latestResult === 'MATCH' && context.willComparison.approvalBlocked === false;
    if (deathDone) states.death = 'done';
    if (willDone || approved) states.will = 'done';
    if (['FINAL_APPROVAL', 'APPROVED', 'UNLOCKED'].includes(phase) || approved) states.basis = 'done';
    if (approved) states.approval = 'done'; if (unlocked) states.unlock = 'done';
    if (closed) { if (!approved) states.approval = 'blocked'; if (!unlocked) states.unlock = 'blocked'; message = text('Hồ sơ đã kết thúc xử lý; chỉ xem lịch sử.', 'This record is closed; history is read-only.', lang); }
    else if (unlocked) message = text('Kho đã mở khóa. Nhân viên tiếp tục bàn giao.', 'Vault unlocked. Staff can continue handover.', lang);
    else if (phase === 'APPROVED' && context.capabilities?.unlock?.allowed) { next = 'unlock'; message = text('Đã phê duyệt. Kiểm tra và xác nhận mở khóa kho.', 'Approval recorded. Review and confirm vault unlocking.', lang); }
    else if (phase === 'FINAL_APPROVAL' && context.capabilities?.approval?.allowed) { next = 'approval'; message = text('Đã kiểm tra phân bổ. Duyệt hoặc từ chối hồ sơ kèm lý do.', 'Allocations checked. Approve or reject the case with a reason.', lang); }
    else if (!deathDone) { next = 'death'; message = text('Kiểm tra giấy chứng tử và ghi kết quả xác minh.', 'Check the death document and record the decision.', lang); }
    else if (!willDone) { next = 'will'; message = text('Đối chiếu di chúc trước khi yêu cầu giấy tờ phân chia.', 'Compare the will before requesting distribution documents.', lang); }
    else { next = 'basis'; const messages = {
      DOCUMENT_REQUEST_NEEDED: ['Yêu cầu giấy tờ phân chia lần đầu, nêu rõ nội dung người nộp cần chuẩn bị.', 'Request distribution documents and explain what the applicant must provide.'],
      AWAITING_DOCUMENTS: ['Chờ người nộp mang giấy tờ về cho Staff tải lên.', 'Await documents brought to Staff by the applicant.'],
      DOCUMENTS_UNDER_REVIEW: ['Thẩm định giấy tờ; duyệt căn cứ hoặc yêu cầu bổ sung.', 'Assess the documents; accept them or request supplementation.'],
      AWAITING_ALLOCATIONS: ['Căn cứ đã duyệt. Chờ Staff lập phân bổ tài sản và người nhận.', 'Documents accepted. Await Staff’s asset and recipient allocations.'],
      ALLOCATIONS_UNDER_REVIEW: ['Kiểm tra từng tài sản/người nhận; chấp thuận hoặc yêu cầu Staff sửa.', 'Check each asset and recipient; accept or request corrections.'],
    }; message = messages[phase]?.[lang === 'en' ? 1 : 0] || text('Mở thẩm định căn cứ để kiểm tra yêu cầu giấy tờ và bước đang chờ.', 'Open basis assessment to check the document request and current step.', lang); }
    if (next) states[next] = next === 'basis' && ['AWAITING_DOCUMENTS', 'AWAITING_ALLOCATIONS'].includes(phase) ? 'waiting' : 'action';
  }
  if (error) message = text('Chưa tải được trạng thái. Tải lại trước khi ra quyết định.', 'Status unavailable. Reload before making a decision.', lang);
  const steps = ids.map((id, i) => step(id, states[id], lang, workflowUrl('/legal/' + routes[i], { caseId, lang })));
  return { current: ids[index], steps, message, next: next && next !== ids[index] ? { ...steps.find(item => item.id === next), label: text('Đến bước ', 'Go to ', lang) + words[next][lang === 'en' ? 1 : 0].toLowerCase() } : undefined };
}

export function beneficiaryGuidance({ requests = [], stage, ready, loading, error, eligible, lang = 'vi' } = {}) {
  const pending = requests.some(r => r.status === 'PENDING');
  const approved = requests.some(r => r.status === 'APPROVED');
  const received = ['PARTIAL', 'RECEIVED'].includes(stage);
  const linked = approved || received || stage === 'AWAITING_HANDOVER';
  const states = { account: eligible ? 'done' : 'blocked', request: pending || linked ? 'done' : ready ? 'action' : 'blocked', link: !pending && linked ? 'done' : 'waiting', assets: stage === 'PARTIAL' ? 'action' : received ? 'done' : 'waiting' };
  let current = pending ? 'link' : linked ? 'assets' : 'request';
  let message = pending ? text('Chờ Staff đối chiếu tại quầy. Tài sản đã nhận trước đó vẫn xem được.', 'Await Staff verification at the counter. Previously received assets remain available.', lang)
    : received ? text('Bạn có thể xem phần tài sản đã được bàn giao cho mình.', 'You can view the assets already delivered to you.', lang)
      : linked ? text('Đã liên kết; chờ Staff bàn giao. Liên kết chưa cấp quyền xem phần chưa giao.', 'Linked; awaiting Staff handover. Undelivered items are not accessible.', lang)
        : ready ? text('Nhập mã hồ sơ để gửi yêu cầu liên kết.', 'Enter the case number to request a link.', lang)
          : text('Chưa hỗ trợ gửi yêu cầu. Phần tài sản đã nhận vẫn có thể xem bên dưới.', 'Requests are not available yet. Previously received assets remain accessible below.', lang);
  if (requests[0]?.status === 'REJECTED' && !pending) message = text('Yêu cầu bị từ chối. Liên hệ Staff để đối chiếu lại thông tin.', 'Request declined. Ask Staff to check the recipient information.', lang);
  if (!eligible) message = text('Dùng tài khoản cá nhân của người nhận.', 'Use the recipient’s personal account.', lang);
  if (loading || error) { states.request = 'waiting'; states.link = 'waiting'; current = 'request'; message = error ? text('Chưa tải được yêu cầu. Tải lại để kiểm tra trạng thái.', 'Requests could not be loaded. Reload to check status.', lang) : text('Đang tải trạng thái yêu cầu…', 'Loading request status…', lang); }
  return { current, message, steps: Object.keys(states).map(id => ({
    ...step(id, states[id], lang, id === 'request' ? '#case-link-number' : id === 'assets' ? '#received-assets-title' : undefined),
    ...(id === 'assets' && stage === 'PARTIAL' ? { statusLabel: text('Đã nhận một phần', 'Partially received', lang) } : {}),
    ...(id === 'request' && linked && !pending && !approved ? { statusLabel: text('Đã có liên kết', 'Already linked', lang) } : {}),
  })) };
}
