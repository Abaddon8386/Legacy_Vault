import { AlertTriangle, ArrowRightLeft, CheckCircle2, History, XCircle } from 'lucide-react';
import { formatCaseReference } from '../../utils/caseReference.js';
import './StaffCaseContextBar.css';

/**
 * Thanh ngữ cảnh ở đầu các trang Staff (và LegalLiveWorkflow), cho biết hồ sơ xác minh đang làm việc.
 * Khi đã chọn hồ sơ (`caseId`) hiển thị mã hồ sơ (qua `formatCaseReference`), trạng thái, giai đoạn,
 * chip kết quả của Ban Pháp lý, tên kho và chủ sở hữu cùng nút "Đổi hồ sơ";
 * nếu chưa chọn thì hiện lời nhắc và nút "Chọn hồ sơ". Không gọi API, dữ liệu do trang cha truyền xuống
 * (thường lấy từ `GET /api/v1/staff/verification-cases/{caseId}`).
 *
 * @param {object} props
 * @param {string} [props.caseId] id hồ sơ (UUID) hoặc mã hồ sơ; rỗng nghĩa là chưa chọn.
 * @param {object|null} [props.caseItem] hồ sơ đã tải (`caseNumber`, `status`, `vaultName`, `ownerName`).
 * @param {string} [props.sessionId] id phiên bàn giao; có giá trị thì hiện nhãn "Đã chọn phiên".
 * @param {Function} props.onOpenSelector mở hộp thoại chọn hồ sơ (`StaffCaseSelectorModal`).
 * @param {Function} [props.onChangeCase] nếu có sẽ thay `onOpenSelector` cho nút "Đổi hồ sơ".
 * @param {{label: string, tone: string}|null} [props.outcomeChip] chip từ `versionOutcomeChip`.
 * @param {string} [props.statusLabel] nhãn trạng thái ghi đè nhãn suy ra từ `caseItem.status`.
 * @param {{label: string, tone: string}|null} [props.stage] giai đoạn xử lý hiện tại.
 * @param {'vi'|'en'} [props.lang='vi'] ngôn ngữ giao diện.
 * @returns {JSX.Element}
 */
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
