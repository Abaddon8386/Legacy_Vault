import { readUser } from '../../api/contracts.js';
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  User,
  Shield,
  AlertTriangle,
  Info,
  Lock,
} from 'lucide-react';
import {
  formatRoleName,
  validateProfileEditForm,
  isFormDirty,
  resolveInitialProfileData,
} from '../../utils/accountEditValidation.js';
import { accountEditI18n } from './accountEditI18n.js';
import { useModalFocus } from '../../components/common/useModalFocus.js';
import './AccountEditPage.css';

export default function AccountEditPage({
  session = null,
  lang = 'vi',
  onDirtyChange,
  pendingNavigation = null,
  onConfirmNavigation,
  onCancelNavigation,
  onCancel,
  preview = false,
  saveProfile,
  onProfileSaved,
  onUnauthorized,
}) {
  const t = accountEditI18n[lang] || accountEditI18n.vi;

  // Active user session data, or empty form structure in DEV preview
  const resolvedSessionData = resolveInitialProfileData(session);
  const isDevPreviewActive = Boolean(typeof import.meta !== 'undefined' && import.meta.env?.DEV && preview);
  const initialData = resolvedSessionData || (isDevPreviewActive
    ? { id: '', fullName: '', email: '', roles: [] }
    : null);

  // State adjustment during render if user account switched or logged out
  const currentUserId = session?.user?.id || (isDevPreviewActive ? 'dev-preview' : null);
  const [prevUserId, setPrevUserId] = useState(currentUserId);
  const [fullName, setFullName] = useState(initialData?.fullName || '');
  const [previousName, setPreviousName] = useState(initialData?.fullName || '');
  const [phoneNumber, setPhoneNumber] = useState(initialData?.phoneNumber || '');
  const [previousPhone, setPreviousPhone] = useState(initialData?.phoneNumber || '');
  const [validationError, setValidationError] = useState(null);
  const [localPendingCancel, setLocalPendingCancel] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const requestRef = useRef(null);
  const pendingRef = useRef(false);
  const saveScope = `${session?.accessToken || ''}:${initialData?.id || ''}`;
  const activeScope = useRef(saveScope);
  useLayoutEffect(() => {
    activeScope.current = saveScope;
    return () => { requestRef.current?.abort(); requestRef.current = null; pendingRef.current = false; };
  }, [saveScope]);
  const [previousScope, setPreviousScope] = useState(saveScope);
  if (previousScope !== saveScope) { setPreviousScope(saveScope); setIsSaving(false); setSaveFeedback(null); setAccessDenied(false); }

  if (currentUserId !== prevUserId) {
    setPrevUserId(currentUserId);
    setFullName(initialData?.fullName || '');
    setPreviousName(initialData?.fullName || '');
    setPhoneNumber(initialData?.phoneNumber || '');
    setPreviousPhone(initialData?.phoneNumber || '');
    setValidationError(null);
    setLocalPendingCancel(false);
  } else if (previousName !== (initialData?.fullName || '')) {
    // Refresh a clean form, but retain an unsaved draft for the same account.
    setPreviousName(initialData?.fullName || '');
    if (!isFormDirty(fullName, previousName)) {
      setFullName(initialData?.fullName || '');
      setValidationError(null);
    }
  }
  if (currentUserId === prevUserId && previousPhone !== (initialData?.phoneNumber || '')) {
    setPreviousPhone(initialData?.phoneNumber || '');
    if (phoneNumber.trim() === previousPhone) setPhoneNumber(initialData?.phoneNumber || '');
  }

  const dirty = isFormDirty(fullName, initialData?.fullName) || phoneNumber.trim() !== (initialData?.phoneNumber || '');

  // Notify parent of dirty state changes for in-app navigation guard
  useEffect(() => {
    if (typeof onDirtyChange === 'function') {
      onDirtyChange(dirty);
    }
  }, [dirty, onDirtyChange]);

  // Native browser prompt on window close / refresh when form is dirty
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  // Handle name input change
  const handleNameChange = (e) => {
    const val = e.target.value;
    setFullName(val);
    setSaveFeedback(null);

    const validation = validateProfileEditForm({ fullName: val });
    if (!validation.isValid && validation.errors.fullName) {
      setValidationError('REQUIRED');
    } else {
      setValidationError(null);
    }
  };


  // Cancel action: leave the page, prompt if dirty
  const handleCancelClick = () => {
    if (dirty) {
      setLocalPendingCancel(true);
    } else if (typeof onCancel === 'function') {
      onCancel();
    }
  };

  // Modal actions
  const handleModalStay = () => {
    setLocalPendingCancel(false);
    if (typeof onCancelNavigation === 'function') {
      onCancelNavigation();
    }
  };

  const handleModalDiscard = () => {
    if (localPendingCancel) {
      setLocalPendingCancel(false);
      if (typeof onCancel === 'function') {
        onCancel();
      }
    } else if (typeof onConfirmNavigation === 'function') {
      onConfirmNavigation();
    }
  };

  const canSave = typeof saveProfile === 'function' && Boolean(initialData?.id) && !isDevPreviewActive;
  const fieldErrors = validateProfileEditForm({ fullName, phoneNumber }).errors;
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSave || !dirty || pendingRef.current || accessDenied) return;
    if (Object.keys(fieldErrors).length) { setValidationError('INVALID'); document.getElementById(fieldErrors.fullName ? 'lv-edit-fullname' : 'lv-edit-phone')?.focus(); return; }
    pendingRef.current = true; setIsSaving(true); setSaveFeedback(null);
    const controller = new AbortController(); requestRef.current = controller;
    const requestedId = initialData.id;
    try {
      const changes = {};
      if (isFormDirty(fullName, initialData.fullName)) changes.fullName = fullName.trim();
      if (phoneNumber.trim() !== (initialData.phoneNumber || '')) changes.phoneNumber = phoneNumber.trim();
      const response = await saveProfile(changes, { signal: controller.signal, lang });
      if (controller.signal.aborted || requestRef.current !== controller || activeScope.current !== saveScope) return;
      const user = readUser(response);
      if (user.id !== requestedId) throw new Error('MISMATCHED_PROFILE');
      onProfileSaved?.(user, { accessToken: session.accessToken, userId: requestedId });
      setFullName(user.fullName); setPhoneNumber(user.phoneNumber || ''); setValidationError(null); setSaveFeedback('success');
    } catch (error) {
      if (!controller.signal.aborted && requestRef.current === controller && activeScope.current === saveScope) {
        if (error.status === 401) onUnauthorized?.();
        if (error.status === 403) setAccessDenied(true);
        setSaveFeedback(error.status === 403 ? 'accessDenied' : error.code === 'VALIDATION_FAILED' ? 'validationFailed' : 'error');
      }
    } finally {
      if (requestRef.current === controller) { pendingRef.current = false; requestRef.current = null; if (!controller.signal.aborted) setIsSaving(false); }
    }
  };

  const isModalOpen = Boolean(pendingNavigation || localPendingCancel);
  const modalRef = useModalFocus(isModalOpen, handleModalStay);

  return (
    <div className="lv-account-edit-view">
      {/* Header */}
      <header className="lv-edit-header">
        <div className="lv-edit-title-wrap">
          <h1 className="lv-edit-title">{t.pageTitle}</h1>
          <p className="lv-edit-subtitle">{t.pageSubtitle}</p>
        </div>

        {dirty && (
          <div className="lv-unsaved-pill" role="status" aria-live="polite">
            <AlertTriangle size={14} aria-hidden="true" />
            <span>{t.unsavedChangesBadge}</span>
          </div>
        )}
      </header>

      {/* Contract Notice Callout */}
      {!canSave && <div className="lv-notice-callout" role="note">
        <Info size={18} className="lv-notice-callout__icon" aria-hidden="true" />
        <div className="lv-notice-callout__text">
          <span className="lv-notice-callout__title">{t.unavailableNotice}</span>
          <span>{t.unavailableExplanation}</span>
        </div>
      </div>

      }
      {saveFeedback && <p role={saveFeedback === 'success' ? 'status' : 'alert'}>{saveFeedback === 'success' ? t.saveSuccess : t[saveFeedback] || t.saveError}</p>}

      {/* Main Form Content */}
      {initialData ? (
        <section className="lv-edit-card" aria-labelledby="profile-edit-heading">
          <h2 id="profile-edit-heading" className="lv-edit-card__title">
            {t.personalInfoSection}
          </h2>
          <p className="lv-edit-card__desc">{t.personalInfoDesc}</p>

          <form className="lv-form" onSubmit={handleSubmit} noValidate aria-busy={isSaving}>
            {/* 1. Full Name */}
            <div className="lv-form-group">
              <label htmlFor="lv-edit-fullname" className="lv-form-label">
                <span>{t.fullNameLabel}</span>
              </label>
              <input
                id="lv-edit-fullname"
                type="text"
                className={`lv-input-text ${validationError && fieldErrors.fullName ? 'has-error' : ''}`}
                value={fullName}
                onChange={handleNameChange}
                placeholder={t.fullNamePlaceholder}
                disabled={isSaving || accessDenied}
                autoComplete="name"
                maxLength={150}
                aria-invalid={Boolean(validationError && fieldErrors.fullName)}
                aria-describedby={validationError && fieldErrors.fullName ? 'lv-fullname-error' : undefined}
              />
              {validationError && fieldErrors.fullName && (
                <p id="lv-fullname-error" className="lv-form-error" role="alert">
                  {fieldErrors.fullName === 'REQUIRED' ? t.errorFullNameRequired : t.errorFullNameInvalid}
                </p>
              )}
            </div>

            <div className="lv-form-group">
              <label htmlFor="lv-edit-phone" className="lv-form-label">{t.phoneLabel}</label>
              <input id="lv-edit-phone" type="tel" className="lv-input-text" value={phoneNumber}
                onChange={event => { setPhoneNumber(event.target.value); setValidationError(null); setSaveFeedback(null); }}
                autoComplete="tel" maxLength={16} disabled={isSaving || accessDenied}
                aria-invalid={Boolean(validationError && fieldErrors.phoneNumber)}
                aria-describedby={validationError && fieldErrors.phoneNumber ? 'lv-phone-error' : 'lv-phone-help'} />
              <p id="lv-phone-help" className="lv-form-help">{t.phoneHelp}</p>
              {validationError && fieldErrors.phoneNumber && <p id="lv-phone-error" className="lv-form-error" role="alert">{t.errorPhoneInvalid}</p>}
            </div>

            {/* Email changes are implemented by the separate role-based email task. */}
            <div className="lv-form-group">
              <div className="lv-form-label">
                <span>{t.emailLabel}</span>
                <span className="lv-readonly-badge">
                  <Lock size={11} aria-hidden="true" />
                  <span>{t.readOnlyBadge}</span>
                </span>
              </div>
              <input
                id="lv-edit-email"
                type="text"
                className="lv-input-text"
                value={initialData.email || t.noInformation}
                disabled
                readOnly
                aria-readonly="true"
              />
              <p className="lv-form-help">{t.emailHelp}</p>
            </div>

            {/* 3. System Roles (Read-only chips) */}
            <div className="lv-form-group">
              <div className="lv-form-label">
                <span>{t.rolesLabel}</span>
                <span className="lv-readonly-badge">
                  <Lock size={11} aria-hidden="true" />
                  <span>{t.readOnlyBadge}</span>
                </span>
              </div>
              <div className="lv-role-chips" aria-label={t.rolesLabel}>
                {Array.isArray(initialData.roles) && initialData.roles.length > 0 ? (
                  initialData.roles.map((role) => (
                    <span key={role} className="lv-role-chip">
                      <Shield size={13} aria-hidden="true" />
                      <span>{formatRoleName(role, lang)}</span>
                    </span>
                  ))
                ) : (
                  <span className="lv-role-chip lv-role-chip--empty">
                    <Shield size={13} aria-hidden="true" />
                    <span>{t.noInformation}</span>
                  </span>
                )}
              </div>
              <p className="lv-form-help">{t.rolesHelp}</p>
            </div>

            {/* Saving stays unavailable until a real save handler is supplied. */}
            <div className="lv-form-actions">
              <button
                type="button"
                className="lv-btn lv-btn-secondary"
                disabled={isSaving}
                onClick={handleCancelClick}
                aria-label={t.btnCancel}
              >
                <span>{t.btnCancel}</span>
              </button>

              <button
                type="submit"
                className="lv-btn lv-btn-primary"
                disabled={!canSave || !dirty || isSaving || accessDenied}
                title={!canSave ? t.unavailableNotice : undefined}
                aria-label={canSave ? t.btnSave : t.unavailableNotice}
              >
                <span>{isSaving ? t.btnSaving : t.btnSave}</span>
              </button>
            </div>
          </form>
        </section>
      ) : (
        /* Truthful Empty State when unauthenticated or data unavailable */
        <section className="lv-empty-state" aria-labelledby="empty-profile-title">
          <div className="lv-empty-icon" aria-hidden="true">
            <User size={26} />
          </div>
          <h2 id="empty-profile-title" className="lv-empty-title">
            {t.noDataTitle}
          </h2>
          <p className="lv-empty-desc">{t.noDataDesc}</p>
        </section>
      )}

      {/* Unsaved Changes Confirmation Modal */}
      {isModalOpen && (
        <div
          className="lv-modal-overlay"
          role="dialog"
          ref={modalRef}
          tabIndex={-1}
          aria-modal="true"
          aria-labelledby="unsaved-modal-title"
          aria-describedby="unsaved-modal-desc"
        >
          <div className="lv-modal-card">
            <div className="lv-modal-card__header">
              <div className="lv-modal-card__icon" aria-hidden="true">
                <AlertTriangle size={20} />
              </div>
              <h3 id="unsaved-modal-title" className="lv-modal-card__title">
                {t.unsavedWarningTitle}
              </h3>
            </div>
            <p id="unsaved-modal-desc" className="lv-modal-card__desc">
              {t.unsavedWarningDesc}
            </p>
            <div className="lv-modal-card__actions">
              <button
                type="button"
                className="lv-btn lv-modal-btn-stay"
                onClick={handleModalStay}
              >
                {t.btnStay}
              </button>
              <button
                type="button"
                className="lv-btn lv-modal-btn-discard"
                onClick={handleModalDiscard}
              >
                {t.btnDiscardAndLeave}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
