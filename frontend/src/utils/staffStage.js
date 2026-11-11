const stages = {
  AWAITING_DEATH: ['Chờ Ban Pháp lý xác minh giấy tờ tử vong', 'Waiting for Legal to verify death documents', 'wait'],
  AWAITING_WILL: ['Chờ Ban Pháp lý đối chiếu di chúc', 'Waiting for Legal to compare the will', 'wait'],
  DOCUMENT_REQUEST_NEEDED: ['Chờ Ban Pháp lý yêu cầu giấy tờ phân chia', 'Waiting for Legal to request distribution documents', 'wait'],
  AWAITING_DOCUMENTS: ['Việc của bạn: nộp giấy tờ phân chia', 'Your turn: submit distribution documents', 'action'],
  DOCUMENTS_UNDER_REVIEW: ['Chờ Ban Pháp lý duyệt giấy tờ', 'Waiting for Legal to review documents', 'wait'],
  AWAITING_ALLOCATIONS: ['Việc của bạn: lập phân bổ tài sản', 'Your turn: prepare the allocation', 'action'],
  ALLOCATIONS_UNDER_REVIEW: ['Chờ Ban Pháp lý kiểm tra phân bổ', 'Waiting for Legal to check the allocation', 'wait'],
  FINAL_APPROVAL: ['Chờ Ban Pháp lý phê duyệt', 'Waiting for Legal approval', 'wait'],
  REJECTED: ['Bị từ chối: chờ Ban Pháp lý yêu cầu bổ sung', 'Rejected: waiting for Legal to request supplements', 'bad'],
  APPROVED: ['Đã phê duyệt, chờ mở khóa', 'Approved, waiting for unlock', 'done'],
  UNLOCKED: ['Đã mở khóa, tiến hành bàn giao', 'Unlocked, proceed to handover', 'done'],
};

/** Where the case is, and whose turn it is, for the Staff case bar. Null while unknown or once the case is closed. */
export function staffStage(workflow, en = false) {
  const phase = workflow?.phase;
  if (!phase || phase === 'CLOSED') return null;
  const key = phase === 'PREREQUISITES_PENDING' ? (workflow.prerequisites?.deathApproved ? 'AWAITING_WILL' : 'AWAITING_DEATH') : phase;
  const stage = stages[key];
  return stage ? { label: stage[en ? 1 : 0], tone: stage[2] } : null;
}
