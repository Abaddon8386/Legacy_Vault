import { staffAuthFeedback, useStaffSessionExpiry } from './staffFeedback.js';
import { useState, useEffect } from 'react';
import {
  FileText,
  Filter,
  RefreshCw,
  Search,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Eye,
  Clock,
  User,
  AlertCircle,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '../../components/common/Button.jsx';
import {
  fetchStaffCases,
  submitPhysicalIntakeRecord,
  SYNTHETIC_STAFF_CASES,
  submitIdentityVerification,
  fetchCaseBeneficiaries,
  fetchVerificationHistory,
} from './staffCaseService.js';
import { getStaffCaseTranslations } from './staffCaseI18n.js';
import StaffCaseDetailModal from './StaffCaseDetailModal.jsx';
import StaffCaseIntakePage from './StaffCaseIntakePage.jsx';
import StaffCaseVerificationPage from './StaffCaseVerificationPage.jsx';
import './StaffCaseDashboard.css';

/**
 * StaffCaseDashboard — Bảng điều hành tiếp nhận & xử lý hồ sơ xác minh cho Staff (PS-25 & PS-26)
 * Tuân thủ phong cách các màn Owner đã được duyệt (Gói sử dụng, Giám sát, Kho, Tài sản, Di chúc).
 */
export default function StaffCaseDashboard({
  accessToken = null,
  isDevPreview = false,
  lang = 'vi',
  onRefreshTrigger = 0,
  onNavigateToLogin,
  onUnauthorized = onNavigateToLogin,
  loadCases = fetchStaffCases,
  onSubmitRecord = submitPhysicalIntakeRecord,
  onSubmitVerification = submitIdentityVerification,
  loadBeneficiaries = fetchCaseBeneficiaries,
  loadHistory = fetchVerificationHistory,
  initialIntakeCase = null,
  initialVerifyCase = null,
  onSelectIntakeCase,
  onSelectVerifyCase,
}) {
  const t = getStaffCaseTranslations(lang);
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
  const handleStatusFilterChange = (newStatus) => {
    setIsLoading(true);
    setStatusFilter(newStatus);
    setPage(0); // Luôn quay về trang đầu khi đổi bộ lọc
  };

  const handleSizeChange = (newSize) => {
    setIsLoading(true);
    setSize(newSize);
    setPage(0); // Luôn quay về trang đầu khi đổi số dòng
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setRetry((r) => r + 1);
  };

  const handleRetry = () => {
    setIsLoading(true);
    setRetry((r) => r + 1);
  };

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    try {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'vi-VN', {
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

  const renderStatusBadge = (status) => {
    const label = t.statusLabels[status] || status;
    let badgeClass = 'lv-staff-status-badge--awaiting';
    if (status === 'IN_PROGRESS') badgeClass = 'lv-staff-status-badge--progress';
    if (status === 'VERIFIED') badgeClass = 'lv-staff-status-badge--verified';

    return (
      <span className={`lv-staff-status-badge ${badgeClass}`}>
        <span className="lv-staff-status-dot" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  };

  const startIndex = page * size;
  const authFeedback = staffAuthFeedback(error, lang);
  const isBackendNotReady = error?.code === 'BACKEND_NOT_READY';

  if (activeIntakeCase) {
    return (
      <StaffCaseIntakePage
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

  if (activeVerifyCase) {
    return (
      <StaffCaseVerificationPage
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
          <div className="lv-staff-dashboard__eyebrow">{t.eyebrow}</div>
          <h1 className="lv-staff-dashboard__title">{t.title}</h1>
          <p className="lv-staff-dashboard__subtitle">{t.subtitle}</p>
        </div>
      </div>

      {/* DEV Preview Notice Banner */}
      {isDevPreview && (
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
              <option value="AWAITING_VERIFICATION">{t.filters.awaiting}</option>
              <option value="IN_PROGRESS">{t.filters.inProgress}</option>
              <option value="VERIFIED">{t.filters.verified}</option>
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

      {/* Scope Note */}
      <p className="lv-staff-filter-scope" role="note">
        {t.filters.scopeNote}
      </p>

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
          <div className="lv-staff-table-wrap">
            <table className="lv-staff-table" aria-label={t.title}>
              <thead>
                <tr>
                  <th scope="col">{t.table.colCaseRef}</th>
                  <th scope="col">{t.table.colVaultOwner}</th>
                  <th scope="col">{t.table.colGraceEnd}</th>
                  <th scope="col">{t.table.colStatus}</th>
                  <th scope="col" className="lv-staff-th-actions">{t.table.colActions}</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id} className="lv-staff-table-row">
                    {/* Case Ref */}
                    <td className="lv-staff-td-ref">
                      <div className="lv-staff-ref-box">
                        <span className="lv-staff-ref-code">{c.caseNumber}</span>
                      </div>
                    </td>

                    {/* Vault & Owner */}
                    <td className="lv-staff-td-vault">
                      <div className="lv-staff-vault-info">
                        <span className="lv-staff-vault-name" title={c.vaultName}>
                          {c.vaultName}
                        </span>
                        <div className="lv-staff-owner-sub">
                          <User size={12} aria-hidden="true" />
                          <span>{c.ownerName}</span>
                        </div>
                      </div>
                    </td>

                    {/* Grace Period Ended */}
                    <td className="lv-staff-td-date">
                      <div className="lv-staff-date-info">
                        <Clock size={13} className="lv-staff-date-icon" aria-hidden="true" />
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
                          onClick={() => setSelectedCase({ item: c, scopeKey })}
                          aria-label={`${t.table.viewAction} ${c.caseNumber}`}
                        >
                          <Eye size={14} aria-hidden="true" />
                          <span>{t.table.viewAction}</span>
                        </Button>
                        <Button
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
                        </Button>
                        <Button
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
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="lv-staff-cards-wrap">
            {cases.map((c) => (
              <div key={c.id} className="lv-staff-card">
                <div className="lv-staff-card__header">
                  <span className="lv-staff-card__code">{c.caseNumber}</span>
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
                      <User size={13} aria-hidden="true" />
                      <span>{c.ownerName}</span>
                    </span>
                  </div>

                  <div className="lv-staff-card__field">
                    <span className="lv-staff-card__label">{t.table.colGraceEnd}</span>
                    <span className="lv-staff-card__val">
                      <Clock size={13} aria-hidden="true" />
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
                      onClick={() => setSelectedCase({ item: c, scopeKey })}
                      aria-label={`${t.table.viewAction} ${c.caseNumber}`}
                    >
                      <Eye size={15} aria-hidden="true" />
                      <span>{t.table.viewAction}</span>
                    </Button>
                    <Button
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
                    </Button>
                    <Button
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
                    </Button>
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
              {/* Rows per page selector */}
              <div className="lv-staff-page-size-selector">
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
              </div>

              {/* Navigation buttons */}
              <div className="lv-staff-page-nav-btns">
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
              </div>
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
        onStartIntake={(item) => {
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
        }}
        onStartVerification={(item) => {
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
        }}
      />
    </div>
  );
}
