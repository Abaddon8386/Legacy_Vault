import LiveHandoverPage from './LiveHandoverPage.jsx';
import { isCounterHandoverSimulationPermitted } from './handoverSessionService.js';
import LanguageToggle from '../../components/common/LanguageToggle.jsx';
import { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Lock, AlertTriangle, RotateCcw, Sparkles, RefreshCw, LogOut } from 'lucide-react';

import { getCounterHandoverTranslations } from './handoverSessionI18n.js';
import {
  SYNTHETIC_HANDOVER_CASES,
  fetchHandoverCase,
  openHandoverSession,
} from './handoverSessionService.js';

import './CounterHandoverPage.css';
import { isUuid } from '../../api/contracts.js';

/**
 * Trang "Bàn giao tại quầy" (Staff, đường dẫn `/staff/handover`). Nếu cho phép mô phỏng
 * (`isCounterHandoverSimulationPermitted`) thì dùng `CounterHandoverPreview` với dữ liệu mẫu; ngược lại dùng
 * `LiveHandoverPage` ở chế độ `sessions` (dữ liệu thật từ API Staff).
 *
 * @param {object} props các prop của trang Staff, được chuyển tiếp.
 * @returns {JSX.Element}
 */
export default function CounterHandoverPage(props) {
  return isCounterHandoverSimulationPermitted(props) ? <CounterHandoverPreview {...props} /> : <LiveHandoverPage {...props} mode="sessions" />;
}

/**
 * Bản mô phỏng của trang bàn giao tại quầy (dev preview/test): chọn kịch bản mẫu từ query `scenario`
 * (mặc định `case-standard`), cho đổi hoặc đặt lại kịch bản (đổi `key` của `CounterHandoverContent`). Không gọi API thật.
 *
 * @param {object} props chuyển tiếp cho `CounterHandoverContent`.
 */
function CounterHandoverPreview(props) {
  const [scenario, setScenario] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        const s = params.get('scenario');
        if (s && SYNTHETIC_HANDOVER_CASES[s]) return s;
      } catch {
        void 0;
      }
    }
    return 'case-standard';
  });

  const [resetCount, setResetCount] = useState(0);

  /** Chọn kịch bản mô phỏng và ghi tham số `scenario` vào URL. */
  const handleSelectScenario = (key) => {
    setScenario(key);
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.set('scenario', key);
      window.history.replaceState({}, '', url.toString());
    }
  };

  /** Đặt lại kịch bản hiện tại bằng cách tăng bộ đếm. */
  const handleResetScenario = () => {
    setResetCount((prev) => prev + 1);
  };

  return (
    <CounterHandoverContent
      key={`${scenario}-${resetCount}`}
      {...props}
      scenario={scenario}
      onSelectScenario={handleSelectScenario}
      onResetScenario={handleResetScenario}
    />
  );
}

/**
 * Nội dung màn bàn giao tại quầy ở chế độ mô phỏng: tải hồ sơ mẫu (`fetchHandoverCase`) và cho mở phiên bàn giao
 * (`openHandoverSession`). Thao tác chỉ khả dụng khi hồ sơ không chỉ đọc, kho đã mở khóa (`UNLOCKED`) và phê duyệt
 * Legal còn hiệu lực (`canMutate`). Ngoài mô phỏng, việc mở phiên thật do `LiveHandoverPage` thực hiện
 * (`POST /api/v1/staff/verification-cases/{caseId}/handover-sessions`). Chuỗi giao diện từ `handoverSessionI18n.js`.
 *
 * @param {object} props
 * @param {string|null} [props.accessToken] JWT của staff.
 * @param {boolean} [props.isDevPreview=false] chế độ dev preview.
 * @param {'vi'|'en'} [props.lang='vi'] ngôn ngữ.
 * @param {string} [props.scenario='case-standard'] kịch bản mô phỏng.
 * @param {Function} [props.onSelectScenario] đổi kịch bản.
 * @param {Function} [props.onResetScenario] đặt lại kịch bản.
 * @param {Function} [props.onLogout] đăng xuất.
 * @param {Function} [props.onRefresh] làm mới.
 * @param {boolean} [props.isRefreshing=false] đang làm mới.
 * @param {Function} [props.onToggleLang] đổi ngôn ngữ.
 */
function CounterHandoverContent({
  accessToken = null,
  isDevPreview = false,
  lang = 'vi',
  scenario = 'case-standard',
  onSelectScenario,
  onResetScenario,
  onLogout,
  onRefresh,
  isRefreshing = false,
  onToggleLang,
}) {
  const t = getCounterHandoverTranslations(lang);

  const actionLock = useRef(false);
  const [caseData, setCaseData] = useState(null);
  const [initialCaseSnapshot, setInitialCaseSnapshot] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [actionError, setActionError] = useState(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    /** Tải hồ sơ bàn giao theo kịch bản và lưu bản chụp ban đầu để phát hiện thay đổi. */
    async function load() {
      setIsLoading(true);
      setErrorMessage(null);
      setActionError(null);
      try {
        const res = await fetchHandoverCase(scenario, {
          accessToken,
          isDevPreview,
          signal: controller.signal,
        });
        if (active) {
          setCaseData(res.caseData);
          setInitialCaseSnapshot(JSON.stringify(res.caseData));
        }
      } catch (err) {
        if (active && err.name !== 'AbortError') {
          setErrorMessage(err.code || 'LOAD_FAILED');
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [scenario, accessToken, isDevPreview]);

  if (isLoading) {
    return (
      <div className="lv-counter-handover-view">
        <div className="lv-counter-handover-view__container">
          <p style={{ textAlign: 'center', padding: '60px 0', color: '#164639', fontWeight: 600 }}>
            {lang === 'en' ? 'Loading counter handover session...' : 'Đang tải dữ liệu phiên bàn giao tại quầy...'}
          </p>
        </div>
      </div>
    );
  }

  if (errorMessage && !caseData) {
    return (
      <div className="lv-counter-handover-view">
        <div className="lv-counter-handover-view__container">
          <div className="lv-counter-handover-callout" style={{ borderLeftColor: '#c25149' }} role="alert">
            <h3 className="lv-counter-handover-callout__title" style={{ color: '#c25149' }}>
              <AlertTriangle size={18} />
              <span>{t.errors.loadFailed}</span>
            </h3>
            <p style={{ margin: '8px 0 0' }}>{errorMessage === 'BACKEND_NOT_READY' ? t.errors.backendNotReady : t.errors.loadFailed}</p><button type="button" onClick={onResetScenario}>{lang === 'en' ? 'Retry' : 'Thử lại'}</button>{isDevPreview && <button type="button" onClick={() => onSelectScenario('case-standard')}>{lang === 'en' ? 'Standard scenario' : 'Kịch bản chuẩn'}</button>}
          </div>
        </div>
      </div>
    );
  }

  if (!caseData) return null;

  const isReadOnly = caseData.isReadOnly || caseData.vaultStatus === 'ARCHIVED' || caseData.caseStatus === 'CLOSED' || caseData.session?.status === 'COMPLETED';
  const vaultUnlocked = caseData.vaultStatus === 'UNLOCKED';
  const validApproval = Boolean(caseData.legalApproval?.isFresh);
  const canMutate = !isReadOnly && vaultUnlocked && validApproval;
  const sessionActive = caseData.session?.status === 'ACTIVE';

  // Check if current case is modified from initial snapshot
  const isModified = initialCaseSnapshot && JSON.stringify(caseData) !== initialCaseSnapshot;

  /** Mở phiên bàn giao (có khóa chống bấm trùng) và gắn phiên mới vào state; lỗi hiển thị qua `actionError`. */
  const handleOpenSession = async () => {
    if (actionLock.current) return;
    actionLock.current = true;
    setActionError(null);
    try {
      setIsSubmitting(true);
      const newSession = await openHandoverSession(caseData, { isDevPreview, accessToken, caseData, lang });
      setCaseData((prev) => ({ ...prev, session: newSession }));
    } catch (err) {
      setActionError(lang === 'en' ? t.errors.actionFailed : (err.message || t.errors.actionFailed));
    } finally {
      actionLock.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="lv-counter-handover-view">
      {/* Header Bar */}
      <header className="lv-counter-handover-header">
        <div className="lv-counter-handover-header__inner">
          <div className="lv-counter-handover-header__brand">
            <span className="lv-counter-handover-brand-mark">LV</span>
            <div className="lv-counter-handover-brand-text">
              <span className="lv-counter-handover-brand-title">{t.portalTitle}</span>
              <span className="lv-counter-handover-brand-sub">LegacyVault Sanctuary</span>
            </div>
          </div>

          <div className="lv-counter-handover-header__actions">
            <span className="lv-counter-handover-role-badge">
              <ShieldCheck size={14} aria-hidden="true" />
              <span>{t.roleBadge}</span>
            </span>

            {isDevPreview && (
              <span className="lv-counter-handover-preview-pill">
                <Sparkles size={12} aria-hidden="true" />
                <span>{t.previewTag}</span>
              </span>
            )}

            {onToggleLang && (
              <LanguageToggle lang={lang} onToggleLang={onToggleLang} />
            )}

            {onRefresh && (
              <button
                type="button"
                className={`lv-handover-header-btn ${isRefreshing ? 'is-spinning' : ''}`}
                onClick={() => {
                  onResetScenario();
                  onRefresh?.();
                }}
                disabled={isRefreshing}
                title={t.refreshBtn}
              >
                <RefreshCw size={14} aria-hidden="true" />
              </button>
            )}

            {onLogout && (
              <button
                type="button"
                className="lv-handover-header-btn lv-handover-header-btn--logout"
                onClick={onLogout}
                title={t.logoutBtn}
              >
                <LogOut size={14} aria-hidden="true" />
                <span>{t.logoutBtn}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="lv-counter-handover-view__container">

        {/* Title & Concise Subtitle */}
        <div className="lv-counter-handover-intro">
          <h1 className="lv-counter-handover-intro__title">{t.pageTitle}</h1>
          <p className="lv-counter-handover-intro__sub">{t.pageSubtitle}</p>
        </div>

        {/* DEV Scenario Bar & State Reset */}
        {isDevPreview && (
          <div className="lv-counter-handover-scenario-bar" role="region" aria-label={t.scenarioBar.label}>
            <div className="lv-counter-handover-scenario-left">
              <span className="lv-counter-handover-scenario-label">
                <Sparkles size={14} aria-hidden="true" />
                <span>{t.scenarioBar.label}</span>
              </span>
              <select
                className="lv-counter-handover-scenario-select"
                value={scenario}
                onChange={(e) => onSelectScenario?.(e.target.value)}
                aria-label={t.scenarioBar.label}
              >
                <option value="case-ready-to-open">{lang === 'en' ? 'Ready to open session' : 'Sẵn sàng mở phiên'}</option>
                <option value="case-standard">{t.scenarioBar.standard}</option>
                <option value="case-locked-vault">{t.scenarioBar.lockedVault}</option>
                <option value="case-out-of-scope">{t.scenarioBar.outOfScope}</option>
                <option value="case-partial-progress">{t.scenarioBar.partialProgress}</option>
                <option value="case-archived">{t.scenarioBar.archived}</option>
                <option value="error">{lang === 'en' ? 'Load error' : 'Lỗi tải dữ liệu'}</option>
              </select>

              <button
                type="button"
                className="lv-handover-btn-secondary lv-handover-btn-sm"
                onClick={onResetScenario}
                title={t.scenarioBar.resetBtn}
              >
                <RotateCcw size={13} aria-hidden="true" />
                <span>{t.scenarioBar.resetBtn}</span>
              </button>
            </div>

            <div className="lv-counter-handover-scenario-right">
              <span className="lv-handover-state-pill" title={t.scenarioBar.initialLabel}>
                <span className="lv-handover-state-pill__tag">{t.scenarioBar.initialLabel}</span>
                <span className="lv-handover-state-pill__val">{JSON.parse(initialCaseSnapshot)?.vaultStatus === 'ARCHIVED' ? t.scenarioBar.stateArchived : t.scenarioBar.statePristine}</span>
              </span>
              <span
                className={`lv-handover-state-pill ${
                  isReadOnly
                    ? 'lv-handover-state-pill--archived'
                    : isModified
                    ? 'lv-handover-state-pill--modified'
                    : 'lv-handover-state-pill--pristine'
                }`}
                title={t.scenarioBar.currentLabel}
              >
                <span className="lv-handover-state-pill__tag">{t.scenarioBar.currentLabel}</span>
                <span className="lv-handover-state-pill__val">
                  {isReadOnly
                    ? t.scenarioBar.stateArchived
                    : isModified
                    ? t.scenarioBar.stateModified
                    : t.scenarioBar.statePristine}
                </span>
              </span>
            </div>
          </div>
        )}

        {/* Global Action Error Banner */}
        {actionError && (
          <div className="lv-counter-handover-callout" style={{ borderLeftColor: '#c25149', margin: '14px 0' }} role="alert">
            <h3 className="lv-counter-handover-callout__title" style={{ color: '#c25149' }}>
              <AlertTriangle size={18} />
              <span>{actionError}</span>
            </h3>
          </div>
        )}

        {/* 1. THÔNG TIN HỒ SƠ & PHIÊN BÀN GIAO */}
        <section className="lv-counter-handover-card lv-staff-glow" aria-label={t.sessionSection.title}>
          <div className="lv-counter-handover-card__header">
            <h2 className="lv-counter-handover-card__title">
              <span>{t.sessionSection.title}</span>
            </h2>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span
                className={`lv-handover-badge ${
                  vaultUnlocked ? 'lv-handover-badge--unlocked' : 'lv-handover-badge--locked'
                }`}
              >
                <span>
                  {isReadOnly ? (lang === 'en' ? 'Archived · Read-only' : 'Đã lưu trữ · Chỉ đọc') : vaultUnlocked
                    ? lang === 'en'
                      ? 'Unlocked (Simulated)'
                      : 'Đã mở khóa (Mô phỏng)'
                    : lang === 'en'
                    ? 'Locked'
                    : 'Đang khóa'}
                </span>
              </span>

              {sessionActive && (
                <span className="lv-handover-badge lv-handover-badge--active">
                  {t.sessionSection.statusActive}
                </span>
              )}
              {isReadOnly && (
                <span className="lv-handover-badge lv-handover-badge--archived">
                  {t.sessionSection.statusCompleted}
                </span>
              )}
            </div>
          </div>

          <div className="lv-counter-handover-meta-grid">
            <div className="lv-counter-handover-meta-item">
              <span className="lv-counter-handover-meta-item__label">{t.sessionSection.caseId}</span>
              <span className="lv-counter-handover-meta-item__value">{caseData.caseNumber}</span>
            </div>
            <div className="lv-counter-handover-meta-item">
              <span className="lv-counter-handover-meta-item__label">{t.sessionSection.vaultName}</span>
              <span className="lv-counter-handover-meta-item__value">{caseData.vaultName}</span>
            </div>
            <div className="lv-counter-handover-meta-item">
              <span className="lv-counter-handover-meta-item__label">{t.sessionSection.ownerName}</span>
              <span className="lv-counter-handover-meta-item__value">{caseData.ownerName}</span>
            </div>
            <div className="lv-counter-handover-meta-item">
              <span className="lv-counter-handover-meta-item__label">{t.sessionSection.staffExecutor}</span>
              <span className="lv-counter-handover-meta-item__value">{caseData.assignedStaffName}</span>
            </div>
            <div className="lv-counter-handover-meta-item">
              <span className="lv-counter-handover-meta-item__label">{t.sessionSection.sessionId}</span>
              <span className="lv-counter-handover-meta-item__value">
                {caseData.session?.sessionId ? (isUuid(caseData.session.sessionId) ? (lang === 'en' ? 'Opened' : 'Đã mở') : caseData.session.sessionId) : (lang === 'en' ? 'Not Opened' : 'Chưa mở')}
              </span>
            </div>
            <div className="lv-counter-handover-meta-item">
              <span className="lv-counter-handover-meta-item__label">{t.sessionSection.legalApprovalRef}</span>
              <span className="lv-counter-handover-meta-item__value">
                {caseData.legalApproval?.approvalId || (lang === 'en' ? 'Awaiting Approval' : 'Chờ phê duyệt')}
              </span>
            </div>
          </div>
            <div className="lv-counter-handover-meta-item" style={{ marginTop: '14px' }}>
              <span className="lv-counter-handover-meta-item__label">{t.sessionSection.unlockConfirmationSource}</span>
              <span className="lv-counter-handover-meta-item__value">
                {vaultUnlocked
                  ? (isDevPreview
                      ? (lang === 'en' ? 'Simulated Preview Data (No Live Backend)' : 'Dữ liệu xem trước (Mô phỏng — Chưa nối Backend)')
                      : (caseData.unlockConfirmation?.source || (lang === 'en' ? 'Backend Service' : 'Dịch vụ backend')))
                  : (lang === 'en' ? 'Pending Service Confirmation' : 'Chưa có xác nhận từ dịch vụ')}
              </span>
            </div>

          {!vaultUnlocked && !isReadOnly && (
            <div
              className="lv-counter-handover-callout"
              style={{ borderLeftColor: '#c25149', margin: '14px 0 0' }}
              role="alert"
            >
              <h3 className="lv-counter-handover-callout__title" style={{ color: '#c25149' }}>
                <Lock size={16} />
                <span>{t.sessionSection.statusLockedNotice}</span>
              </h3>
            </div>
          )}

          {!caseData.session && vaultUnlocked && (
            <div style={{ marginTop: '20px' }}>
              <button
                type="button"
                className="lv-handover-btn-primary"
                onClick={handleOpenSession}
                disabled={isSubmitting || !canMutate}
              >
                <span>{t.sessionSection.openSessionBtn}</span>
              </button>
            </div>
          )}
        </section>

        <section className="lv-counter-handover-card lv-staff-glow">
          <h2 className="lv-counter-handover-card__title">{lang === 'en' ? 'Recipients and approved scope' : 'Người nhận và phạm vi phê duyệt'}</h2>
          <div className="lv-handover-scope-layout">
            <div className="lv-handover-scope-block">
              <h3>{lang === 'en' ? 'Recipients' : 'Người nhận di sản'}</h3>
              <ul className="lv-handover-recipients-list">
                {caseData.beneficiaries.map(b => (
                  <li key={b.id} className="lv-handover-recipient-item">
                    <strong>{b.fullName}</strong> — <span>{b.relationship}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="lv-handover-scope-block">
              <h3>{lang === 'en' ? 'Approved assets' : 'Danh mục tài sản phê duyệt'}</h3>
              <ul className="lv-handover-assets-list">
                {caseData.assets.map(a => (
                  <li key={a.id} className="lv-handover-asset-item">
                    <div>
                      <strong>{a.name}</strong> — <span>{a.beneficiaryName}: {a.allocatedShare}</span>
                    </div>
                    <span className={`lv-handover-scope-badge ${a.isOutOfScope ? 'lv-handover-scope-badge--out' : 'lv-handover-scope-badge--in'}`}>
                      {a.isOutOfScope ? (lang === 'en' ? 'Outside approved scope' : 'Ngoài phạm vi') : (lang === 'en' ? 'Within approved scope' : 'Trong phạm vi')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
