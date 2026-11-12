import StaffLiveCase from './StaffLiveCase.jsx';
import { staffAuthFeedback, useStaffSessionExpiry } from './staffFeedback.js';
import { formatCaseReference } from '../../utils/caseReference.js';
import { useState, useEffect } from 'react';
import {
  FileText,
  Filter,
  RefreshCw,
  Search,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '../../components/common/Button.jsx';
import {
  fetchStaffCases,
  isStaffSimulationPermitted,
  SYNTHETIC_STAFF_CASES,
} from './staffCaseService.js';
import { getStaffCaseTranslations } from './staffCaseI18n.js';
import StaffCaseDetailModal from './StaffCaseDetailModal.jsx';
import './StaffCaseDashboard.css';

/**
 * StaffCaseDashboard — Bảng điều hành tiếp nhận & xử lý hồ sơ xác minh cho Staff (PS-25 & PS-26)
 * Tuân thủ phong cách các màn Owner đã được duyệt (Gói sử dụng, Giám sát, Kho, Tài sản, Di chúc).
 */
/** Nạp sẵn (eager) hai trang quy trình `StaffCaseIntakePage` và `StaffCaseVerificationPage` làm giá trị mặc định cho `IntakePage`/`VerificationPage`. */
const workflowPages = import.meta.glob(['./StaffCaseIntakePage.jsx', './StaffCaseVerificationPage.jsx'], { eager: true, import: 'default' });

/**
 * Bảng điều hành hồ sơ xác minh dành cho Staff (đường dẫn `/staff/cases`): danh sách hồ sơ có lọc theo trạng thái,
 * phân trang, làm mới, xem chi tiết và đi vào quy trình xử lý.
 * - Tải danh sách bằng `loadCases` (mặc định `fetchStaffCases` = `GET /api/v1/staff/verification-cases?page&size&status`),
 *   hủy request cũ khi đổi tham số; lỗi 401 xử lý qua `useStaffSessionExpiry` (gọi `onUnauthorized`).
 * - Chế độ mô phỏng (`isDevPreview`, dữ liệu `SYNTHETIC_STAFF_CASES`) khi `isStaffSimulationPermitted`.
 * - Nếu có `caseId` (từ prop hoặc query string) và không mô phỏng thì hiển thị `StaffLiveCase` (không gian làm việc của hồ sơ thật).
 * - Có thể chuyển sang `IntakePage` (`StaffCaseIntakePage`, tiếp nhận hồ sơ) hoặc `VerificationPage`
 *   (`StaffCaseVerificationPage`, xác minh) và mở `StaffCaseDetailModal` để xem thông tin tham chiếu.
 *
 * @param {object} props
 * @param {string|null} [props.accessToken] JWT của staff.
 * @param {boolean} [props.isDevPreview=false] bật dữ liệu mô phỏng.
 * @param {'vi'|'en'} [props.lang='vi'] ngôn ngữ.
 * @param {number} [props.onRefreshTrigger=0] thay đổi giá trị này để buộc tải lại danh sách.
 * @param {Function} [props.onNavigateToLogin] về trang đăng nhập.
 * @param {Function} [props.onUnauthorized] gọi khi phiên hết hạn (mặc định là `onNavigateToLogin`).
 * @param {Function} [props.loadCases] hàm tải danh sách (có thể thay thế khi test).
 * @param {Function} [props.onSubmitRecord] callback gửi biên bản tiếp nhận cho `IntakePage`.
 * @param {Function} [props.onSubmitVerification] callback gửi kết quả xác minh cho `VerificationPage`.
 * @param {Function} [props.loadBeneficiaries] hàm tải người thụ hưởng cho trang xác minh.
 * @param {Function} [props.loadHistory] hàm tải lịch sử cho trang xác minh.
 * @param {React.ComponentType} [props.VerificationPage] component trang xác minh.
 * @param {React.ComponentType} [props.IntakePage] component trang tiếp nhận.
 * @param {object|null} [props.initialIntakeCase] hồ sơ mở sẵn ở trang tiếp nhận.
 * @param {object|null} [props.initialVerifyCase] hồ sơ mở sẵn ở trang xác minh.
 * @param {Function} [props.onSelectIntakeCase] báo hồ sơ được chọn để tiếp nhận.
 * @param {Function} [props.onSelectVerifyCase] báo hồ sơ được chọn để xác minh.
 * @param {string|null} [props.caseId] id hồ sơ đang làm việc (đồng bộ với query `caseId`).
 * @param {Function} [props.onSelectCase] báo cho App hồ sơ đang chọn.
 * @returns {JSX.Element}
 */
export default function StaffCaseDashboard({
  accessToken = null,
  isDevPreview = false,
  lang = 'vi',
  onRefreshTrigger = 0,
  onNavigateToLogin,
  onUnauthorized = onNavigateToLogin,
  loadCases = fetchStaffCases,
  onSubmitRecord = undefined,
  onSubmitVerification = undefined,
  loadBeneficiaries = undefined,
  loadHistory = undefined,
  VerificationPage = workflowPages['./StaffCaseVerificationPage.jsx'],
  IntakePage = workflowPages['./StaffCaseIntakePage.jsx'],
  initialIntakeCase = null,
  initialVerifyCase = null,
  onSelectIntakeCase,
  onSelectVerifyCase,
  caseId: propCaseId = null,
  onSelectCase,
}) {
  const t = getStaffCaseTranslations(lang);
  const simulation = isStaffSimulationPermitted({ accessToken, isDevPreview });
  const dateLabel = simulation ? t.table.colGraceEnd : (lang === 'en' ? 'Created' : 'Ngày tạo');
  const notifySessionExpiry = useStaffSessionExpiry({ accessToken, isDevPreview, onUnauthorized });

  // States
  const [cases, setCases] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(5);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedCase, setSelectedCase] = useState(null);
  const [liveCaseId, setLiveCaseId] = useState(() => {
    if (propCaseId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(propCaseId)) {
      return propCaseId;
    }
    if (typeof window === 'undefined') return null;
    const id = new URLSearchParams(window.location.search).get('caseId');
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '') ? id : null;
  });

  const [prevPropCaseId, setPrevPropCaseId] = useState(propCaseId);
  if (propCaseId !== prevPropCaseId) {
    setPrevPropCaseId(propCaseId);
    if (propCaseId !== undefined && propCaseId !== null) {
      const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(propCaseId || '');
      setLiveCaseId(valid ? propCaseId : null);
    }
  }

  /** Chọn một hồ sơ để làm việc: đặt `caseId` vào state và query string (history.replaceState) rồi báo `onSelectCase`. */
  const openLiveCase = (id, caseItem = null) => {
    setLiveCaseId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('caseId', id); else url.searchParams.delete('caseId');
    window.history.replaceState({}, '', url.pathname + url.search);
    onSelectCase?.(caseItem || id || null);
  };
  const [activeIntakeCase, setActiveIntakeCase] = useState(() => {
    if (initialIntakeCase) return initialIntakeCase;
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        const intakeParam = params.get('intake');
        const caseParam = params.get('case') || params.get('caseId');
        if (isDevPreview && (intakeParam || caseParam)) {
          const targetId = (intakeParam && intakeParam !== 'true') ? intakeParam : (caseParam || 'case-001');
          return SYNTHETIC_STAFF_CASES.find((c) => c.id === targetId || c.caseNumber === targetId) || SYNTHETIC_STAFF_CASES[0];
        }
      } catch {
        // Safe fallback in non-browser environments
      }
    }
    return null;
  });
  const [activeVerifyCase, setActiveVerifyCase] = useState(() => {
    if (initialVerifyCase) return initialVerifyCase;
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        const verifyParam = params.get('verify') || params.get('verification');
        if (isDevPreview && verifyParam) {
          const targetId = verifyParam !== 'true' ? verifyParam : 'case-001';
          return (
            SYNTHETIC_STAFF_CASES.find((c) => c.id === targetId || c.caseNumber === targetId) ||
            SYNTHETIC_STAFF_CASES[0]
          );
        }
      } catch {
        // Safe fallback in non-browser environments
      }
    }
    return null;
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [retry, setRetry] = useState(0);
  const [resultScope, setResultScope] = useState(null);
  const scopeKey = JSON.stringify([accessToken, isDevPreview, lang, page, size, statusFilter, retry, onRefreshTrigger]);
  const pending = isLoading || resultScope?.key !== scopeKey || resultScope?.loader !== loadCases;

  const [prevScope, setPrevScope] = useState({ accessToken, isDevPreview });
  if (prevScope.accessToken !== accessToken || prevScope.isDevPreview !== isDevPreview) {
    setPrevScope({ accessToken, isDevPreview });
    setActiveIntakeCase(null);
    setActiveVerifyCase(null);
  }

  // Asynchronous load effect aligned with React concurrency rules
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    /** Gọi `loadCases` theo trang/kích thước/lọc hiện tại và cập nhật danh sách, tổng số; lỗi được báo qua `notifySessionExpiry` và state `error`. */
    async function load() {
      try {
        const result = await loadCases({
          page,
          size,
          status: statusFilter,
          accessToken,
          isDevPreview,
          lang,
          signal: controller.signal,
        });

        if (!active) return;
        setCases(result.content || []);
        setPage(result.page ?? page);
        setSize(result.size ?? size);
        setTotalElements(result.totalElements ?? 0);
        setTotalPages(result.totalPages ?? 1);
        setError(null);
        setResultScope({ key: scopeKey, loader: loadCases });
      } catch (err) {
        if (!active || err.name === 'AbortError') return;
        notifySessionExpiry(err);
        setError(err);
        setResultScope({ key: scopeKey, loader: loadCases });
      } finally {
        if (active) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    }

    load();

    return () => {
      active = false;
      controller.abort();
    };
  }, [page, size, statusFilter, retry, onRefreshTrigger, accessToken, isDevPreview, lang, scopeKey, loadCases, notifySessionExpiry]);

  // Handlers for filter and pagination
  /** Đổi bộ lọc trạng thái và quay về trang đầu. */
  const handleStatusFilterChange = (newStatus) => {
    setIsLoading(true);
    setStatusFilter(newStatus);
    setPage(0); // Luôn quay về trang đầu khi đổi bộ lọc
  };

  /** Đổi số dòng mỗi trang và quay về trang đầu. */
  const handleSizeChange = (newSize) => {
    setIsLoading(true);
    setSize(newSize);
    setPage(0); // Luôn quay về trang đầu khi đổi số dòng
  };

  /** Tải lại danh sách (hiển thị trạng thái đang làm mới). */
  const handleRefresh = () => {
    setIsRefreshing(true);
    setRetry((r) => r + 1);
  };

  /** Thử tải lại danh sách sau khi lỗi. */
  const handleRetry = () => {
    setIsLoading(true);
    setRetry((r) => r + 1);
  };

  /** Định dạng ISO-8601 thành ngày giờ theo ngôn ngữ; rỗng trả "—", lỗi phân tích trả nguyên chuỗi. */
  const formatDate = (isoString) => {
    if (!isoString) return '—';
    try {
      const date = new Date(isoString);
      // en-GB gives "26/10/2026, 08:18"; vi-VN would put the time first.
      return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch {
      return isoString;
    }
  };

  /** Tạo huy hiệu trạng thái hồ sơ (OPEN/IN_PROGRESS/VERIFIED/CLOSED/CANCELLED) với nhãn theo ngôn ngữ. */
  const renderStatusBadge = (status) => {
    const label = status === 'OPEN' ? (lang === 'en' ? 'Open' : 'Đang mở') : status === 'CLOSED' ? (lang === 'en' ? 'Closed' : 'Đã đóng') : status === 'CANCELLED' ? (lang === 'en' ? 'Cancelled' : 'Đã hủy') : t.statusLabels[status] || status;
    let badgeClass = 'lv-staff-status-badge--awaiting';
    if (status === 'OPEN' || status === 'IN_PROGRESS') badgeClass = 'lv-staff-status-badge--progress';
    if (status === 'VERIFIED') badgeClass = 'lv-staff-status-badge--verified';
    if (status === 'CLOSED') badgeClass = 'lv-staff-status-badge--closed';
    if (status === 'CANCELLED') badgeClass = 'lv-staff-status-badge--cancelled';

    return (
      <span className={`lv-staff-status-badge ${badgeClass}`}>
        <span>{label}</span>
      </span>
    );
  };

  const startIndex = page * size;
  const authFeedback = staffAuthFeedback(error, lang);
  const isBackendNotReady = error?.code === 'BACKEND_NOT_READY';

  if (!simulation && liveCaseId) return <StaffLiveCase key={`${accessToken}:${liveCaseId}`} caseId={liveCaseId} accessToken={accessToken} lang={lang} onUnauthorized={onUnauthorized} onBack={() => { openLiveCase(null, null); setRetry(r => r + 1); }} />;

  if (activeIntakeCase && IntakePage) {
    return (
      <IntakePage
        caseItem={activeIntakeCase}
        onBack={() => {
          setActiveIntakeCase(null);
          if (typeof window !== 'undefined') {
            try {
              const url = new URL(window.location.href);
              if (url.searchParams.has('intake') || url.searchParams.has('case') || url.searchParams.has('caseId')) {
                url.searchParams.delete('intake');
                url.searchParams.delete('case');
                url.searchParams.delete('caseId');
                window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
              }
            } catch {
              // Safe fallback
            }
          }
          setRetry((r) => r + 1);
        }}
        onUnauthorized={onUnauthorized}
        accessToken={accessToken}
        isDevPreview={isDevPreview}
        lang={lang}
        onSubmitRecord={onSubmitRecord}
      />
    );
  }

  if (activeVerifyCase && VerificationPage) {
    return (
      <VerificationPage
        caseItem={activeVerifyCase}
        onBack={() => {
          setActiveVerifyCase(null);
          if (typeof window !== 'undefined') {
            try {
              const url = new URL(window.location.href);
              if (url.searchParams.has('verify') || url.searchParams.has('verification')) {
                url.searchParams.delete('verify');
                url.searchParams.delete('verification');
                window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
              }
            } catch {
              // Safe fallback
            }
          }
          setRetry((r) => r + 1);
        }}
        onUnauthorized={onUnauthorized}
        accessToken={accessToken}
        isDevPreview={isDevPreview}
        lang={lang}
        loadBeneficiaries={loadBeneficiaries}
        loadHistory={loadHistory}
        onSubmitVerification={onSubmitVerification}
      />
    );
  }

  return (
    <div className="lv-staff-dashboard">
      {/* Page Header */}
      <div className="lv-staff-dashboard__header">
        <div className="lv-staff-dashboard__header-content">
          <h1 className="lv-staff-dashboard__title">{t.title}</h1>
        </div>
      </div>

      {/* DEV Preview Notice Banner */}
      {simulation && (
        <div className="lv-staff-preview-banner" role="status">
          <div className="lv-staff-preview-banner__icon-wrap">
            <Sparkles size={16} aria-hidden="true" />
          </div>
          <div className="lv-staff-preview-banner__text">
            {t.previewBanner}
          </div>
        </div>
      )}

      {/* Toolbar: Filter & Actions */}
      <div className="lv-staff-toolbar">
        <div className="lv-staff-toolbar__filter-group">
          <div className="lv-staff-filter-select-wrap">
            <Filter size={15} className="lv-staff-filter-icon" aria-hidden="true" />
            <select
              className="lv-staff-filter-select"
              value={statusFilter}
              onChange={(e) => handleStatusFilterChange(e.target.value)}
              aria-label={t.filters.all}
              disabled={pending}
            >
              <option value="ALL">{t.filters.all}</option>
              {simulation ? <><option value="AWAITING_VERIFICATION">{t.filters.awaiting}</option>
              <option value="IN_PROGRESS">{t.filters.inProgress}</option>
              <option value="VERIFIED">{t.filters.verified}</option></> : <><option value="OPEN">{lang === 'en' ? 'Open' : 'Đang mở'}</option><option value="CLOSED">{lang === 'en' ? 'Closed' : 'Đã đóng'}</option><option value="CANCELLED">{lang === 'en' ? 'Cancelled' : 'Đã hủy'}</option></>}
            </select>
          </div>

          {statusFilter !== 'ALL' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleStatusFilterChange('ALL')}
              className="lv-staff-btn-clear"
            >
              {t.filters.clearBtn}
            </Button>
          )}
        </div>

        <div className="lv-staff-toolbar__action-group">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            isLoading={isRefreshing}
            disabled={pending}
            className="lv-staff-refresh-btn"
            aria-label={t.refreshBtn}
          >
            <RefreshCw size={14} className={isRefreshing ? 'lv-staff-spin' : ''} aria-hidden="true" />
            <span>{isRefreshing ? t.refreshingBtn : t.refreshBtn}</span>
          </Button>
        </div>
      </div>

      {/* Main Content Area based on states */}
      {pending ? (
        /* Skeleton Table Loading State */
        <div className="lv-staff-skeleton" role="status" aria-live="polite">
          <div className="lv-staff-skeleton__header lv-skeleton-pulse" />
          <div className="lv-staff-skeleton__rows">
            {[1, 2, 3, 4, 5].map((idx) => (
              <div key={idx} className="lv-staff-skeleton__row">
                <div className="lv-staff-skeleton__cell lv-staff-skeleton__cell--ref lv-skeleton-pulse" />
                <div className="lv-staff-skeleton__cell lv-staff-skeleton__cell--vault lv-skeleton-pulse" />
                <div className="lv-staff-skeleton__cell lv-staff-skeleton__cell--date lv-skeleton-pulse" />
                <div className="lv-staff-skeleton__cell lv-staff-skeleton__cell--status lv-skeleton-pulse" />
                <div className="lv-staff-skeleton__cell lv-staff-skeleton__cell--action lv-skeleton-pulse" />
              </div>
            ))}
          </div>
          <span className="lv-sr-only">{t.states.loadingText}</span>
        </div>
      ) : error ? (
        /* Error or Backend Not Ready State */
        <div className="lv-staff-state-card" role="alert">
          <div className="lv-staff-state-icon-wrap lv-staff-state-icon-wrap--error">
            {isBackendNotReady ? (
              <ShieldAlert size={28} aria-hidden="true" />
            ) : (
              <AlertCircle size={28} aria-hidden="true" />
            )}
          </div>
          <h2 className="lv-staff-state-title">
            {authFeedback?.title || (isBackendNotReady ? t.states.notReadyTitle : t.states.errorTitle)}
          </h2>
          <p className="lv-staff-state-desc">
            {authFeedback?.description || (isBackendNotReady ? t.states.notReadyDesc : t.states.errorDesc)}
          </p>
          <div className="lv-staff-state-actions">
            <Button variant="primary" onClick={handleRetry}>
              {t.states.retryBtn}
            </Button>
            {(isBackendNotReady || authFeedback) && onNavigateToLogin && (
              <Button variant="secondary" onClick={onNavigateToLogin}>
                {t.states.signInBtn}
              </Button>
            )}
          </div>
        </div>
      ) : totalElements === 0 ? (
        /* Empty or No Match State */
        <div className="lv-staff-state-card">
          <div className="lv-staff-state-icon-wrap">
            {statusFilter === 'ALL' ? (
              <FileText size={28} aria-hidden="true" />
            ) : (
              <Search size={28} aria-hidden="true" />
            )}
          </div>
          <h2 className="lv-staff-state-title">
            {statusFilter === 'ALL' ? t.states.emptyTitle : t.states.noMatchTitle}
          </h2>
          <p className="lv-staff-state-desc">
            {statusFilter === 'ALL' ? t.states.emptyDesc : t.states.noMatchDesc}
          </p>
          {statusFilter !== 'ALL' && (
            <Button
              variant="secondary"
              onClick={() => handleStatusFilterChange('ALL')}
            >
              {t.filters.clearBtn}
            </Button>
          )}
        </div>
      ) : (
        /* Data Presentation View: Desktop Table + Mobile Cards */
        <div className="lv-staff-list-container">
          {/* Desktop Table View */}
          <div className="lv-staff-table-wrap lv-staff-glow">
            <div className="lv-staff-table-scroll">
              <table className="lv-staff-table" aria-label={t.title}>
              <thead>
                <tr>
                  <th scope="col">{t.table.colCaseRef}</th>
                  <th scope="col">{t.table.colVaultOwner}</th>
                  <th scope="col">{dateLabel}</th>
                  <th scope="col">{t.table.colStatus}</th>
                  <th scope="col" className="lv-staff-th-actions"><span className="lv-sr-only">{t.table.colActions}</span></th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id} className="lv-staff-table-row">
                    {/* Case Ref */}
                    <td className="lv-staff-td-ref">
                      <div className="lv-staff-ref-box">
                        <span className="lv-staff-ref-code" title={c.caseNumber}>{formatCaseReference(c.caseNumber)}</span>
                      </div>
                    </td>

                    {/* Vault & Owner */}
                    <td className="lv-staff-td-vault">
                      <div className="lv-staff-vault-info">
                        <span className="lv-staff-vault-name" title={c.vaultName}>
                          {c.vaultName}
                        </span>
                        <div className="lv-staff-owner-sub">
                          <span>{c.ownerName}</span>
                        </div>
                      </div>
                    </td>

                    {/* Grace Period Ended */}
                    <td className="lv-staff-td-date">
                      <div className="lv-staff-date-info">
                        <span>{formatDate(c.gracePeriodEndedAt)}</span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="lv-staff-td-status">
                      {renderStatusBadge(c.status)}
                    </td>

                    {/* Actions */}
                    <td className="lv-staff-td-actions">
                      <div className="lv-staff-actions-group">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="lv-staff-view-btn"
                          onClick={() => simulation ? setSelectedCase({ item: c, scopeKey }) : openLiveCase(c.id, c)}
                          aria-label={`${t.table.viewAction} ${c.caseNumber}`}
                        >
                          <span>{t.table.viewAction}</span>
                        </Button>
                        {simulation && IntakePage && (<Button
                          variant="primary"
                          size="sm"
                          className="lv-staff-intake-btn"
                          onClick={() => {
                            setActiveIntakeCase(c);
                            if (typeof window !== 'undefined') {
                              try {
                                const url = new URL(window.location.href);
                                url.searchParams.set('intake', c.id);
                                window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
                              } catch {
                                // Safe fallback
                              }
                            }
                            onSelectIntakeCase?.(c);
                          }}
                          aria-label={`${t.table.intakeAction} ${c.caseNumber}`}
                        >
                          <FileText size={14} aria-hidden="true" />
                          <span>{t.table.intakeAction}</span>
                        </Button>)}
                        {simulation && VerificationPage && (<Button
                          variant="secondary"
                          size="sm"
                          className="lv-staff-verify-btn"
                          onClick={() => {
                            setActiveVerifyCase(c);
                            if (typeof window !== 'undefined') {
                              try {
                                const url = new URL(window.location.href);
                                url.searchParams.set('verify', c.id);
                                window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
                              } catch {
                                // Safe fallback
                              }
                            }
                            onSelectVerifyCase?.(c);
                          }}
                          aria-label={`${t.table.verifyAction} ${c.caseNumber}`}
                        >
                          <ShieldCheck size={14} aria-hidden="true" />
                          <span>{t.table.verifyAction}</span>
                        </Button>)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

          {/* Mobile Card View */}
          <div className="lv-staff-cards-wrap">
            {cases.map((c) => (
              <div key={c.id} className="lv-staff-card lv-staff-glow">
                <div className="lv-staff-card__header">
                  <span className="lv-staff-card__code" title={c.caseNumber}>{formatCaseReference(c.caseNumber)}</span>
                  {renderStatusBadge(c.status)}
                </div>

                <div className="lv-staff-card__body">
                  <div className="lv-staff-card__field">
                    <span className="lv-staff-card__label">{t.detailModal.vaultName}</span>
                    <span className="lv-staff-card__val lv-staff-card__val--vault">{c.vaultName}</span>
                  </div>

                  <div className="lv-staff-card__field">
                    <span className="lv-staff-card__label">{t.detailModal.ownerName}</span>
                    <span className="lv-staff-card__val">
                      <span>{c.ownerName}</span>
                    </span>
                  </div>

                  <div className="lv-staff-card__field">
                    <span className="lv-staff-card__label">{dateLabel}</span>
                    <span className="lv-staff-card__val">
                      <span>{formatDate(c.gracePeriodEndedAt)}</span>
                    </span>
                  </div>
                </div>

                <div className="lv-staff-card__footer">
                  <div className="lv-staff-card__actions-row">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="lv-staff-card__view-btn"
                      onClick={() => simulation ? setSelectedCase({ item: c, scopeKey }) : openLiveCase(c.id, c)}
                      aria-label={`${t.table.viewAction} ${c.caseNumber}`}
                    >
                      <span>{t.table.viewAction}</span>
                    </Button>
                    {simulation && IntakePage && (<Button
                      variant="primary"
                      size="sm"
                      className="lv-staff-card__intake-btn"
                      onClick={() => {
                        setActiveIntakeCase(c);
                        if (typeof window !== 'undefined') {
                          try {
                            const url = new URL(window.location.href);
                            url.searchParams.set('intake', c.id);
                            window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
                          } catch {
                            // Safe fallback
                          }
                        }
                        onSelectIntakeCase?.(c);
                      }}
                      aria-label={`${t.table.intakeAction} ${c.caseNumber}`}
                    >
                      <FileText size={15} aria-hidden="true" />
                      <span>{t.table.intakeAction}</span>
                    </Button>)}
                    {simulation && VerificationPage && (<Button
                      variant="secondary"
                      size="sm"
                      className="lv-staff-card__verify-btn"
                      onClick={() => {
                        setActiveVerifyCase(c);
                        if (typeof window !== 'undefined') {
                          try {
                            const url = new URL(window.location.href);
                            url.searchParams.set('verify', c.id);
                            window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
                          } catch {
                            // Safe fallback
                          }
                        }
                        onSelectVerifyCase?.(c);
                      }}
                      aria-label={`${t.table.verifyAction} ${c.caseNumber}`}
                    >
                      <ShieldCheck size={15} aria-hidden="true" />
                      <span>{t.table.verifyAction}</span>
                    </Button>)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Bar */}
          <div className="lv-staff-pagination-bar">
            <div className="lv-staff-pagination-info">
              <span>
                {t.pagination.showing}{' '}
                <strong>
                  {totalElements === 0 ? 0 : startIndex + 1}
                  {t.pagination.to}
                  {Math.min(startIndex + size, totalElements)}
                </strong>{' '}
                {t.pagination.of} <strong>{totalElements}</strong>{' '}
                {t.pagination.cases}
              </span>
            </div>

            <div className="lv-staff-pagination-controls">
              {/* Rows per page selector: pointless while every case fits the smallest page */}
              {totalElements > 5 && <div className="lv-staff-page-size-selector">
                <label htmlFor="staff-page-size-select">{t.pagination.rowsPerPage}</label>
                <select
                  id="staff-page-size-select"
                  value={size}
                  onChange={(e) => handleSizeChange(Number(e.target.value))}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                </select>
              </div>}

              {/* Navigation buttons */}
              {totalPages > 1 && <div className="lv-staff-page-nav-btns">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="lv-staff-nav-btn"
                  aria-label={t.pagination.prev}
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                  <span>{t.pagination.prev}</span>
                </Button>

                <span className="lv-staff-page-counter" aria-current="page">
                  {page + 1} / {totalPages}
                </span>

                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  className="lv-staff-nav-btn"
                  aria-label={t.pagination.next}
                >
                  <span>{t.pagination.next}</span>
                  <ChevronRight size={16} aria-hidden="true" />
                </Button>
              </div>}
            </div>
          </div>
        </div>
      )}

      {/* Read-Only Reference Detail Modal */}
      <StaffCaseDetailModal
        isOpen={Boolean(selectedCase && selectedCase.scopeKey === scopeKey && !pending && !error)}
        onClose={() => setSelectedCase(null)}
        caseItem={selectedCase?.item}
        lang={lang}
        onStartIntake={simulation && IntakePage ? (item) => {
          setSelectedCase(null);
          setActiveIntakeCase(item);
          if (typeof window !== 'undefined') {
            try {
              const url = new URL(window.location.href);
              url.searchParams.set('intake', item.id);
              window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
            } catch {
              // Safe fallback
            }
          }
          onSelectIntakeCase?.(item);
        } : undefined}
        onStartVerification={simulation && VerificationPage ? (item) => {
          setSelectedCase(null);
          setActiveVerifyCase(item);
          if (typeof window !== 'undefined') {
            try {
              const url = new URL(window.location.href);
              url.searchParams.set('verify', item.id);
              window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
            } catch {
              // Safe fallback
            }
          }
          onSelectVerifyCase?.(item);
        } : undefined}
      />
    </div>
  );
}
