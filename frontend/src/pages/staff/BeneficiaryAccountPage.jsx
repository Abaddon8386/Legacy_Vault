import LanguageToggle from '../../components/common/LanguageToggle.jsx';
import { useModalFocus } from '../../components/common/useModalFocus.js';
import { useState, useEffect, useRef } from 'react';
import { ShieldCheck, UserCheck, UserPlus, AlertTriangle, RotateCcw, Sparkles, RefreshCw, LogOut } from 'lucide-react';

import { getCounterHandoverTranslations } from './beneficiaryAccountI18n.js';
import {
  SYNTHETIC_HANDOVER_CASES,
  fetchHandoverCase,
  linkExistingBeneficiaryAccount,
  createAndLinkBeneficiaryAccount,
} from './beneficiaryAccountService.js';

import './BeneficiaryAccountPage.css';

export default function BeneficiaryAccountPage(props) {
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

  const handleSelectScenario = (key) => {
    setScenario(key);
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.set('scenario', key);
      window.history.replaceState({}, '', url.toString());
    }
  };

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
  const actionErrorText = actionError ? (Object.values(actionError.fieldErrors || {}).map(key => t.validation[key] || t.errors.actionFailed).join(' ') || t.errors.actionFailed) : '';

  // Modals state
  const [linkModalBeneficiary, setLinkModalBeneficiary] = useState(null);
  const [linkEmail, setLinkEmail] = useState('');
  const [createModalBeneficiary, setCreateModalBeneficiary] = useState(null);
  const [createForm, setCreateForm] = useState({ fullName: '', email: '', phone: '' });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const linkDialogRef = useModalFocus(Boolean(linkModalBeneficiary), () => setLinkModalBeneficiary(null), isSubmitting);
  const createDialogRef = useModalFocus(Boolean(createModalBeneficiary), () => setCreateModalBeneficiary(null), isSubmitting);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

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

  const handleLinkExisting = async (e) => {
    e.preventDefault();
    if (!linkModalBeneficiary) return;
    if (actionLock.current) return;
    actionLock.current = true;
    setActionError(null);
    try {
      setIsSubmitting(true);
      const result = await linkExistingBeneficiaryAccount(
        linkModalBeneficiary.id,
        linkEmail,
        { isDevPreview, accessToken, caseData, lang }
      );
      setCaseData((prev) => ({
        ...prev,
        beneficiaries: prev.beneficiaries.map((b) =>
          b.id === linkModalBeneficiary.id
            ? { ...b, linkedUserId: result.linkedUserId, linkedEmail: result.linkedEmail }
            : b
        ),
      }));
      setLinkModalBeneficiary(null);
    } catch (err) {
      setActionError({ code: err.code, fieldErrors: err.fieldErrors });
    } finally {
      actionLock.current = false;
      setIsSubmitting(false);
    }
  };

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    if (!createModalBeneficiary) return;
    if (actionLock.current) return;
    actionLock.current = true;
    setActionError(null);
    try {
      setIsSubmitting(true);
      const result = await createAndLinkBeneficiaryAccount(
        createModalBeneficiary.id,
        createForm,
        { isDevPreview, accessToken, caseData, lang }
      );
      setCaseData((prev) => ({
        ...prev,
        beneficiaries: prev.beneficiaries.map((b) =>
          b.id === createModalBeneficiary.id
            ? { ...b, linkedUserId: result.linkedUserId, linkedEmail: result.linkedEmail }
            : b
        ),
      }));
      setCreateModalBeneficiary(null);
    } catch (err) {
      setActionError({ code: err.code, fieldErrors: err.fieldErrors });
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
              <span>{actionErrorText}</span>
            </h3>
          </div>
        )}

        {/* 4. NGƯỜI THỤ HƯỞNG & TÀI KHOẢN (Kèm trạng thái ký nhận) */}
        <section className="lv-counter-handover-card" aria-label={t.beneficiarySection.title}>
          <div className="lv-counter-handover-card__header">
            <h2 className="lv-counter-handover-card__title">
              <UserCheck size={20} aria-hidden="true" />
              <span>{t.beneficiarySection.title}</span>
            </h2>
          </div>
          <p className="lv-counter-handover-card__subtitle">{t.beneficiarySection.subtitle}</p>

          <div className="lv-counter-handover-table-wrapper">
            <table className="lv-counter-handover-table">
              <thead>
                <tr>
                  <th>{t.beneficiarySection.colName}</th>
                  <th>{t.beneficiarySection.colRelationship}</th>
                  <th>{t.beneficiarySection.colIdentity}</th>
                  <th>{t.beneficiarySection.colAccountStatus}</th>
                  {!isReadOnly && <th>{t.beneficiarySection.colActions}</th>}
                </tr>
              </thead>
              <tbody>
                {caseData.beneficiaries.map((b) => {
                  return (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 600 }}>{b.fullName}</td>
                      <td>{b.relationship}</td>
                      <td style={{ fontFamily: 'monospace' }}>{b.identityNumberMasked}</td>
                      <td>
                        {b.linkedUserId ? (
                          <div>
                            <span className="lv-handover-badge lv-handover-badge--unlocked">
                              {t.beneficiarySection.accountLinked}
                            </span>
                            <span style={{ display: 'block', fontSize: '11px', color: '#6b726b', marginTop: '2px' }}>
                              {b.linkedEmail}
                            </span>
                          </div>
                        ) : (
                          <span className="lv-handover-badge lv-handover-badge--pending">
                            {t.beneficiarySection.accountUnlinked}
                          </span>
                        )}
                      </td>
                      {!isReadOnly && (
                        <td>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {!b.linkedUserId && (
                              <>
                                <button
                                  type="button"
                                  className="lv-handover-btn-secondary lv-handover-btn-sm"
                                  disabled={!canMutate || !sessionActive || isSubmitting}
                                  onClick={() => {
                                    setLinkModalBeneficiary(b);
                                    setLinkEmail('');
                                  }}
                                >
                                  <UserCheck size={13} />
                                  <span>{t.beneficiarySection.linkExistingBtn}</span>
                                </button>
                                <button
                                  type="button"
                                  className="lv-handover-btn-secondary lv-handover-btn-sm"
                                  disabled={!canMutate || !sessionActive || isSubmitting}
                                  onClick={() => {
                                    setCreateModalBeneficiary(b);
                                    setCreateForm({ fullName: b.fullName, email: '', phone: '' });
                                  }}
                                >
                                  <UserPlus size={13} />
                                  <span>{t.beneficiarySection.createAccountBtn}</span>
                                </button>
                              </>
                            )}

                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ margin: '14px 0 0', fontSize: '12.5px', color: '#6b726b', fontStyle: 'italic' }}>
            {t.beneficiarySection.boundaryNote}
          </p>
        </section>

      </main>
      {/* Modal 1: Link Existing Account */}
      {linkModalBeneficiary && (
        <div className="lv-handover-modal-overlay">
          <div ref={linkDialogRef} className="lv-handover-modal-dialog" role="dialog" aria-modal="true" aria-label={t.beneficiarySection.modalLinkTitle}>
            {actionError && <p role="alert">{actionErrorText}</p>}
            <h3 className="lv-handover-modal-dialog__title">{t.beneficiarySection.modalLinkTitle}</h3>
            <p style={{ fontSize: '13.5px', color: '#4b554b' }}>
              {linkModalBeneficiary.fullName} ({linkModalBeneficiary.relationship})
            </p>
            <form onSubmit={handleLinkExisting} noValidate>
              <div className="lv-handover-modal-dialog__form-group">
                <label className="lv-handover-modal-dialog__label">
                  {t.beneficiarySection.searchEmailPrompt}
                </label>
                <input
                  type="email"
                  required
                  className="lv-handover-modal-dialog__input"
                  value={linkEmail}
                  onChange={(e) => setLinkEmail(e.target.value)}
                  placeholder="beneficiary@example.com"
                />
              </div>
              <div className="lv-handover-modal-dialog__actions">
                <button
                  type="button"
                  className="lv-handover-btn-secondary"
                  onClick={() => setLinkModalBeneficiary(null)}
                >
                  {t.beneficiarySection.cancelBtn}
                </button>
                <button type="submit" className="lv-handover-btn-primary" disabled={isSubmitting || !canMutate}>
                  {t.beneficiarySection.searchBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Create & Activate Account */}
      {createModalBeneficiary && (
        <div className="lv-handover-modal-overlay">
          <div ref={createDialogRef} className="lv-handover-modal-dialog" role="dialog" aria-modal="true" aria-label={t.beneficiarySection.modalCreateTitle}>
            {actionError && <p role="alert">{actionErrorText}</p>}
            <h3 className="lv-handover-modal-dialog__title">{t.beneficiarySection.modalCreateTitle}</h3>
            <form onSubmit={handleCreateAccount} noValidate>
              <div className="lv-handover-modal-dialog__form-group">
                <label className="lv-handover-modal-dialog__label">
                  {t.beneficiarySection.createFullNamePrompt}
                </label>
                <input
                  type="text"
                  required
                  className="lv-handover-modal-dialog__input"
                  value={createForm.fullName}
                  onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                />
              </div>
              <div className="lv-handover-modal-dialog__form-group">
                <label className="lv-handover-modal-dialog__label">
                  {t.beneficiarySection.createEmailPrompt}
                </label>
                <input
                  type="email"
                  required
                  className="lv-handover-modal-dialog__input"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="new.user@example.com"
                />
              </div>
              <div className="lv-handover-modal-dialog__form-group">
                <label className="lv-handover-modal-dialog__label">
                  {t.beneficiarySection.createPhonePrompt}
                </label>
                <input
                  type="tel"
                  required
                  className="lv-handover-modal-dialog__input"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                  placeholder="0901234567"
                />
              </div>
              <div className="lv-handover-modal-dialog__actions">
                <button
                  type="button"
                  className="lv-handover-btn-secondary"
                  onClick={() => setCreateModalBeneficiary(null)}
                >
                  {t.beneficiarySection.cancelBtn}
                </button>
                <button type="submit" className="lv-handover-btn-primary" disabled={isSubmitting || !canMutate}>
                  {t.beneficiarySection.confirmCreateBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
