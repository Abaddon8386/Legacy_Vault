import { useState, useEffect, useRef } from 'react';
import { X, RefreshCw, ChevronLeft, ChevronRight, FileText, User, ShieldAlert } from 'lucide-react';
import { fetchStaffCases } from '../../pages/staff/staffCaseService.js';
import { formatCaseReference } from '../../utils/caseReference.js';
import './StaffCaseSelectorModal.css';

export default function StaffCaseSelectorModal({
  isOpen,
  onClose,
  onSelectCase,
  accessToken = null,
  isDevPreview = false,
  lang = 'vi',
  currentCaseId = '',
  onUnauthorized = null,
}) {
  const en = lang === 'en';
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState('ALL');
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const modalRef = useRef(null);
  const controllerRef = useRef(null);

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (!isOpen) {
      setData(null);
      setError(null);
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!isOpen) {
      controllerRef.current?.abort();
      return;
    }

    if (controllerRef.current) controllerRef.current.abort();
    const c = new AbortController();
    controllerRef.current = c;

    async function loadCases() {
      setData(null);
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetchStaffCases({
          accessToken,
          isDevPreview,
          lang,
          page,
          size: 5,
          status,
          signal: c.signal,
        });
        if (!c.signal.aborted) {
          setData(res);
          setIsLoading(false);
        }
      } catch (err) {
        if (c.signal.aborted) return;
        setData(null);
        setIsLoading(false);
        if (err.status === 401 && onUnauthorized) {
          onUnauthorized();
        }
        setError(err.message || (en ? 'Failed to load cases' : 'Không tải được danh sách hồ sơ'));
      }
    }

    loadCases();

    return () => c.abort();
  }, [isOpen, page, status, refreshTrigger, accessToken, isDevPreview, lang, onUnauthorized, en]);

  // Focus trap & keyboard ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const totalPages = data?.totalPages || 1;
  const cases = data?.content || [];

  return (
    <div className="lv-case-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="lv-case-modal-card lv-staff-selector-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-case-selector-title"
        ref={modalRef}
      >
        <div className="lv-case-modal-header">
          <div>
            <h2 id="staff-case-selector-title" className="lv-case-modal-title">
              {en ? 'Select Verification Case' : 'Chọn hồ sơ xác minh'}
            </h2>
            <p className="lv-case-modal-subtitle">
              {en
                ? 'Select a case from the staff queue to continue workflow'
                : 'Chọn hồ sơ từ danh sách để tiếp tục thực hiện nghiệp vụ'}
            </p>
          </div>
          <button
            type="button"
            className="lv-case-modal-close lv-staff-selector-modal__close-btn"
            onClick={onClose}
            aria-label={en ? 'Close dialog' : 'Đóng hộp thoại'}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Filter bar */}
        <div className="lv-case-modal-filter-bar">
          <label htmlFor="staff-case-status-filter" className="visually-hidden">
            {en ? 'Filter by status' : 'Lọc theo trạng thái'}
          </label>
          <select
            id="staff-case-status-filter"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
            className="lv-case-modal-select"
            disabled={isLoading}
          >
            <option value="ALL">{en ? 'All statuses' : 'Tất cả trạng thái'}</option>
            <option value="OPEN">{en ? 'Open' : 'Đang mở'}</option>
            <option value="CANCELLED">{en ? 'Cancelled' : 'Đã hủy'}</option>
            <option value="CLOSED">{en ? 'Closed' : 'Đã đóng'}</option>
          </select>

          <button
            type="button"
            className="lv-case-modal-refresh-btn"
            onClick={() => setRefreshTrigger((r) => r + 1)}
            disabled={isLoading}
            title={en ? 'Refresh case list' : 'Làm mới danh sách'}
          >
            <RefreshCw size={14} className={isLoading ? 'lv-spin' : ''} aria-hidden="true" />
            <span>{en ? 'Refresh' : 'Làm mới'}</span>
          </button>
        </div>

        {/* Content list */}
        <div className="lv-case-modal-body">
          {isLoading && !data && (
            <div className="lv-case-modal-state" role="status">
              <progress aria-label={en ? 'Loading cases' : 'Đang tải hồ sơ'} />
              <p>{en ? 'Loading case queue…' : 'Đang tải danh sách hồ sơ…'}</p>
            </div>
          )}

          {error && (
            <div className="lv-case-modal-error" role="alert">
              <ShieldAlert size={20} aria-hidden="true" />
              <div>
                <p><strong>{en ? 'Error' : 'Lỗi'}:</strong> {error}</p>
                <button
                  type="button"
                  className="lv-case-modal-retry-btn"
                  onClick={() => setRefreshTrigger((r) => r + 1)}
                >
                  {en ? 'Retry' : 'Thử lại'}
                </button>
              </div>
            </div>
          )}

          {!isLoading && !error && cases.length === 0 && (
            <div className="lv-case-modal-empty">
              <FileText size={32} aria-hidden="true" />
              <p>{en ? 'No cases found matching filter criteria.' : 'Không tìm thấy hồ sơ phù hợp với bộ lọc.'}</p>
            </div>
          )}

          {cases.length > 0 && (
            <div className="lv-staff-selector-table-wrap">
              <table className="lv-staff-selector-table lv-case-modal-table">
                <thead>
                  <tr>
                    <th>{en ? 'Case ID / Reference' : 'Mã hồ sơ'}</th>
                    <th>{en ? 'Vault' : 'Kho di sản'}</th>
                    <th>{en ? 'Owner' : 'Chủ tài khoản'}</th>
                    <th>{en ? 'Status' : 'Trạng thái'}</th>
                    <th style={{ textAlign: 'right' }}>{en ? 'Action' : 'Thao tác'}</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((item) => {
                    const isSelected = item.caseId === currentCaseId || item.id === currentCaseId;
                    const statusLabel =
                      item.status === 'OPEN'
                        ? (en ? 'Open' : 'Đang mở')
                        : item.status === 'CANCELLED'
                        ? (en ? 'Cancelled' : 'Đã hủy')
                        : item.status === 'CLOSED'
                        ? (en ? 'Closed' : 'Đã đóng')
                        : item.status;

                    return (
                      <tr
                        key={item.caseId || item.id}
                        className={`lv-case-modal-row lv-staff-selector-row ${isSelected ? 'lv-case-modal-row--active lv-staff-selector-row--active' : ''}`}
                        onClick={() => {
                          onSelectCase(item);
                          onClose();
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <span className="lv-case-modal-code">
                            {formatCaseReference(item.caseNumber || item.caseId || item.id)}
                          </span>
                        </td>
                        <td>
                          <span className="lv-case-modal-vault">{item.vaultName || '—'}</span>
                        </td>
                        <td>
                          {item.ownerName ? (
                            <span className="lv-case-modal-owner">
                              <User size={12} aria-hidden="true" /> {item.ownerName}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <span
                            className={`lv-case-modal-badge lv-case-modal-badge--${item.status?.toLowerCase()}`}
                          >
                            {statusLabel}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className={`lv-case-modal-select-btn ${isSelected ? 'lv-case-modal-select-btn--current' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectCase(item);
                              onClose();
                            }}
                          >
                            {isSelected
                              ? (en ? 'Current case' : 'Đang chọn')
                              : (en ? 'Select case' : 'Chọn hồ sơ')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination footer */}
        <div className="lv-case-modal-footer">
          <button
            type="button"
            className="lv-case-modal-nav-btn"
            disabled={page === 0 || isLoading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft size={16} aria-hidden="true" />
            <span>{en ? 'Previous' : 'Trước'}</span>
          </button>
          <span className="lv-case-modal-page-info">
            {en ? `Page ${page + 1} of ${totalPages}` : `Trang ${page + 1} / ${totalPages}`}
          </span>
          <button
            type="button"
            className="lv-case-modal-nav-btn"
            disabled={page + 1 >= totalPages || isLoading}
            onClick={() => setPage((p) => p + 1)}
          >
            <span>{en ? 'Next' : 'Sau'}</span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
