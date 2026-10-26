import { evaluateCompletionProgress } from './completionProgressValidation.js';

const words = {
  intake: ['Tiếp nhận', 'Intake'], legal: ['Thẩm định pháp lý', 'Legal review'],
  handover: ['Bàn giao', 'Handover'], confirmation: ['Xác nhận đã nhận', 'Confirm receipt'], archive: ['Đóng và lưu trữ', 'Close and archive'],
  account: ['Tài khoản', 'Account'], request: ['Gửi mã hồ sơ', 'Submit case number'], link: ['Staff đối chiếu', 'Staff verification'], assets: ['Tài sản đã nhận', 'Received assets'],
  death: ['Giấy tờ khai tử', 'Death documents'], will: ['Đối chiếu di chúc', 'Compare will'], basis: ['Căn cứ Tòa án', 'Court basis'], review: ['Thẩm định phân bổ', 'Review allocation'], approval: ['Phê duyệt', 'Approval'], unlock: ['Mở khóa', 'Unlock'],
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
  forwarded, sessionStatus, assets, beneficiaries, confirmationReady = false, intakeDestinationNeeded = false, hasReceipts = false, canArchive = false, lang = 'vi', preview = false } = {}) {
  const urls = { intake: '/staff/legal-documents', legal: '/staff/legal-documents', handover: sessionId ? '/staff/asset-handover' : '/staff/handover', confirmation: '/staff/beneficiary-confirmation', archive: '/staff/close-and-archive' };
  const progress = evaluateCompletionProgress(assets, beneficiaries);
  const archived = vaultStatus === 'ARCHIVED';
  const closed = ['CLOSED', 'CANCELLED'].includes(caseStatus);
  const states = Object.fromEntries(Object.keys(urls).map(id => [id, 'waiting']));
  let message = text('Chọn hồ sơ để xem việc cần làm.', 'Select a case to see the next task.', lang), next;
  if (caseId && !loading && !error) {
    if (vaultStatus === 'ON_HOLD') {
      states.legal = 'blocked'; states.handover = 'blocked';
      message = text('Hồ sơ đang tạm dừng. Xem yêu cầu bổ sung hoặc thẩm định lại.', 'The case is on hold. Check supplementation or re-review requirements.', lang); next = 'intake';
    } else if (archived || closed) {
      message = archived ? text('Hồ sơ đã lưu trữ. Bạn vẫn có thể xem lịch sử.', 'Archived record. History remains available.', lang)
        : text('Hồ sơ đã đóng hoặc hủy; chỉ xem thông tin.', 'This case is closed or cancelled; viewing remains available.', lang);
      if (archived) states.archive = 'done';
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
      message = text('Hoàn thiện văn bản Tòa án và phân bổ rồi chuyển Legal.', 'Complete the court document and allocation, then forward to Legal.', lang);
    } else {
      message = text('Xem hồ sơ căn cứ để kiểm tra bước đang chờ; chưa có dữ liệu xác nhận hoàn tất.', 'Check the basis dossier for outstanding tasks; completion is not yet confirmed.', lang); next = 'intake';
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
  if (context.basisDossier?.route === 'NOTARIAL') return text('Hồ sơ công chứng cũ chỉ được xem lịch sử.', 'Legacy notarial records are read-only.', lang);
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
  const ids = ['death', 'will', 'basis', 'review', 'approval', 'unlock'];
  const routes = ['death-verification', 'will-document-verification', 'basis-route-selection', 'dossier-review', 'approval-review', 'controlled-unlock'];
  const index = routes.indexOf(current);
  const states = Object.fromEntries(ids.map(id => [id, 'waiting']));
  let message = text('Đang kiểm tra điều kiện hồ sơ…', 'Checking case conditions…', lang), next;
  if (context && !loading && !error) {
    const s = context.snapshot;
    if (s?.currentVersion > 0 && context.basisDossier?.versions?.some(v => v.version === s.currentVersion && v.forwardStatus === 'FORWARDED')) states.basis = 'done';
    if (s?.reviewFresh && s.courtResult === 'VALID') states.review = 'done';
    if (s?.approvalCurrent) states.approval = 'done';
    if (context.caseStatus !== 'OPEN' || ['NOTARIAL', 'ON_HOLD'].includes(context.basisDossier?.route) || context.vaultStatus === 'ON_HOLD') {
      states.approval = 'blocked'; states.unlock = 'blocked'; message = legalBlockedReason(context, 'approval', lang);
    } else if (context.vaultStatus === 'UNLOCKED') { states.unlock = 'done'; message = text('Kho đã mở khóa. Nhân viên có thể kiểm tra điều kiện bàn giao tại quầy.', 'Vault unlocked. Staff can check counter handover conditions.', lang); }
    else if (context.capabilities?.unlock?.allowed) { states.unlock = 'action'; next = 'unlock'; message = text('Đã phê duyệt. Mở khóa là thao tác xác nhận riêng.', 'Approved. Unlocking requires a separate confirmation.', lang); }
    else if (context.capabilities?.approval?.allowed) { states.approval = 'action'; next = 'approval'; message = text('Đủ điều kiện ghi nhận quyết định pháp lý.', 'Ready to record the final legal decision.', lang); }
    else {
      message = legalBlockedReason(context, current === 'controlled-unlock' ? 'unlock' : 'approval', lang);
      if (index >= 4) states[ids[index]] = 'blocked';
      if (context.caseStatus === 'OPEN' && !['NOTARIAL', 'ON_HOLD'].includes(context.basisDossier?.route)) next = states.basis === 'done' ? 'review' : 'basis';
    }
  }
  if (error) message = text('Chưa tải được trạng thái. Tải lại trước khi ra quyết định.', 'Status unavailable. Reload before making a decision.', lang);
  const steps = ids.map((id, i) => step(id, states[id], lang, workflowUrl(`/legal/${routes[i]}`, { caseId, lang })));
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
