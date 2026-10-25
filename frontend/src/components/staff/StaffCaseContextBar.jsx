import { FolderOpen, ArrowRightLeft, User, Layers } from 'lucide-react';
import { formatCaseReference } from '../../utils/caseReference.js';
import './StaffCaseContextBar.css';

export default function StaffCaseContextBar({
  caseId = '',
  caseItem = null,
  sessionId = '',
  onOpenSelector,
  onChangeCase,
  lang = 'vi',
}) {
  const en = lang === 'en';
  const hasCase = Boolean(caseId);

  const rawCode = caseItem?.caseNumber || caseItem?.caseId || caseId || '';
  const displayCaseRef = rawCode ? formatCaseReference(rawCode) : '';

  const statusLabel = caseItem?.status === 'OPEN'
    ? (en ? 'Open' : 'Đang mở')
    : caseItem?.status === 'CANCELLED'
    ? (en ? 'Cancelled' : 'Đã hủy')
    : caseItem?.status === 'CLOSED'
    ? (en ? 'Closed' : 'Đã đóng')
    : caseItem?.status || '';

  return (
    <div className={`lv-staff-context-bar ${hasCase ? 'lv-staff-context-bar--active' : 'lv-staff-context-bar--empty'}`}>
      <div className="lv-staff-context-bar__inner">
        {hasCase ? (
          <>
            <div className="lv-staff-context-bar__main">
              <div className="lv-staff-context-bar__icon-wrap">
                <FolderOpen size={18} aria-hidden="true" />
              </div>
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
                  {sessionId && (
                    <span className="lv-staff-context-session">
                      <Layers size={13} aria-hidden="true" />
                      <span title={sessionId}>{en ? 'Session selected' : 'Đã chọn phiên'}</span>
                    </span>
                  )}
                </div>

                {(caseItem?.vaultName || caseItem?.ownerName) && (
                  <div className="lv-staff-context-bar__row2">
                    {caseItem?.vaultName && (
                      <span className="lv-staff-context-bar__vault">{caseItem.vaultName}</span>
                    )}
                    {caseItem?.ownerName && (
                      <span className="lv-staff-context-bar__owner">
                        <User size={12} aria-hidden="true" /> {caseItem.ownerName}
                      </span>
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
              <FolderOpen size={18} className="lv-staff-context-bar__empty-icon" aria-hidden="true" />
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
