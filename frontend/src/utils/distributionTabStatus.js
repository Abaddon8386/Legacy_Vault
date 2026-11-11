const labels = {
  waiting: ['Chờ xử lý', 'Waiting'],
  active: ['Đang xử lý', 'In progress'],
  done: ['Đã xử lý', 'Done'],
  rejected: ['Bị từ chối', 'Rejected'],
  none: ['Chưa đến bước này', 'Not started'],
};
const finished = ['APPROVED', 'UNLOCKED', 'CLOSED'];

function status(phase, hasVersions, hasAllocation) {
  const rejected = phase === 'REJECTED';
  return {
    // Until death and will checks pass nothing here has started, so the overview must not look lit.
    overview: rejected ? 'rejected' : finished.includes(phase) ? 'done'
      : ['DOCUMENTS_UNDER_REVIEW', 'ALLOCATIONS_UNDER_REVIEW', 'FINAL_APPROVAL'].includes(phase) ? 'active'
        : phase && phase !== 'PREREQUISITES_PENDING' ? 'waiting' : 'none',
    intake: rejected ? 'rejected' : phase === 'AWAITING_DOCUMENTS' ? 'waiting' : phase === 'DOCUMENTS_UNDER_REVIEW' ? 'active'
      : ['AWAITING_ALLOCATIONS', 'ALLOCATIONS_UNDER_REVIEW', 'FINAL_APPROVAL', ...finished].includes(phase) ? 'done' : 'none',
    allocations: rejected ? (hasAllocation ? 'rejected' : 'none') : phase === 'AWAITING_ALLOCATIONS' ? 'waiting' : phase === 'ALLOCATIONS_UNDER_REVIEW' ? 'active'
      : ['FINAL_APPROVAL', ...finished].includes(phase) ? 'done' : 'none',
    history: hasVersions ? 'done' : 'none',
  };
}

/** Status of each tab on the staff documents screen, from the server workflow phase. */
export function distributionTabStatus(workflow, hasVersions, en = false) {
  const result = status(workflow?.phase, hasVersions, Boolean(workflow?.allocation));
  return Object.fromEntries(Object.entries(result).map(([tab, tone]) => [tab, { tone, label: labels[tone][en ? 1 : 0] }]));
}
