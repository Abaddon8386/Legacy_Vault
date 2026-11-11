import { AlertTriangle, ArrowRightLeft, CheckCircle2, History, XCircle } from 'lucide-react';
import { formatCaseReference } from '../../utils/caseReference.js';
import './StaffCaseContextBar.css';

export default function StaffCaseContextBar({
  caseId = '',
  caseItem = null,
  sessionId = '',
  onOpenSelector,
  onChangeCase,
  outcomeChip = null,
  statusLabel: statusLabelOverride = '',
  stage = null,
  lang = 'vi',
}) {
  const en = lang === 'en';
  const hasCase = Boolean(caseId);

  const rawCode = caseItem?.caseNumber || (!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(caseId) ? caseId : '');
  const displayCaseRef = rawCode ? formatCaseReference(rawCode) : (en ? 'Loading case…' : 'Đang tải hồ sơ…');

  const statusLabel = statusLabelOverride || (caseItem?.status === 'OPEN'
    ? (en ? 'Open' : 'Đang mở')
    : caseItem?.status === 'CANCELLED'
    ? (en ? 'Cancelled' : 'Đã hủy')
    : caseItem?.status === 'CLOSED'
    ? (en ? 'Closed' : 'Đã đóng')
    : caseItem?.status === 'AWAITING_VERIFICATION'
    ? (en ? 'Awaiting verification' : 'Chờ xác minh')
    : caseItem?.status === 'IN_PROGRESS'
    ? (en ? 'In progress' : 'Đang xử lý')
    : caseItem?.status === 'VERIFIED'
    ? (en ? 'Verified' : 'Đã xác minh')
    : caseItem?.status || '');

  return (
    <div className={`lv-staff-context-bar lv-staff-glow ${hasCase ? 'lv-staff-context-bar--active' : 'lv-staff-context-bar--empty'}`}>
      <div className="lv-staff-context-bar__inner">
        {hasCase ? (
          <>
            <div className="lv-staff-context-bar__main">
              <div className="lv-staff-context-bar__details">
                <div className="lv-staff-context-bar__row1">
                  <span className="lv-staff-context-bar__label">
                    {en ? 'Case:' : 'Hồ sơ:'}
                  </span>
                  <strong className="lv-staff-context-bar__code">{displayCaseRef}</strong>
                  {statusLabel && (
                    <span className={`lv-staff-context-badge lv-staff-context-badge--${caseItem?.status?.toLowerCase() || 'open'}`}>
                      {statusLabel}
                    </span>
                  )}
                  {stage && <span className={`lv-staff-context-stage is-${stage.tone}`}>{stage.label}</span>}
                  {outcomeChip && (
                    <span className={`lv-staff-context-badge lv-staff-context-badge--outcome-${outcomeChip.tone}`}>
                      {outcomeChip.tone === 'history' ? <History size={16} aria-hidden="true" /> : outcomeChip.tone === 'positive' ? <CheckCircle2 size={16} aria-hidden="true" /> : outcomeChip.tone === 'negative' ? <XCircle size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
                      {outcomeChip.label}
                    </span>
                  )}
                  {sessionId && (
                    <span className="lv-staff-context-session">{en ? 'Session selected' : 'Đã chọn phiên'}</span>
                  )}
                </div>

                {(caseItem?.vaultName || caseItem?.ownerName) && (
                  <div className="lv-staff-context-bar__row2">
                    {caseItem?.vaultName && (
                      <span className="lv-staff-context-bar__vault">{caseItem.vaultName}</span>
                    )}
                    {caseItem?.ownerName && (
                      <span className="lv-staff-context-bar__owner">{en ? 'Owner: ' : 'Chủ sở hữu: '}{caseItem.ownerName}</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="lv-staff-context-bar__actions">
              <button
                type="button"
                className="lv-staff-context-bar__btn-change lv-staff-context-bar__change-btn"
                onClick={onChangeCase || onOpenSelector}
              >
                <ArrowRightLeft size={14} aria-hidden="true" />
                <span>{en ? 'Change case' : 'Đổi hồ sơ'}</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="lv-staff-context-bar__empty-text">
              <span>{en ? 'No verification case selected. Select a case to continue.' : 'Chưa chọn hồ sơ xác minh. Chọn hồ sơ để tiếp tục.'}</span>
            </div>
            <button
              type="button"
              className="lv-staff-context-bar__btn-select lv-staff-context-bar__select-btn"
              onClick={onOpenSelector}
            >
              <span>{en ? 'Select case' : 'Chọn hồ sơ'}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
