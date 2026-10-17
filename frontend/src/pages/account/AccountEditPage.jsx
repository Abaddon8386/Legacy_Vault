import { useState, useEffect } from 'react';
import {
  User,
  Shield,
  AlertTriangle,
  RotateCcw,
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
import './AccountEditPage.css';

export default function AccountEditPage({
  session = null,
  lang = 'vi',
  onDirtyChange,
  pendingNavigation = null,
  onConfirmNavigation,
  onCancelNavigation,
  onCancel,
}) {
  const t = accountEditI18n[lang] || accountEditI18n.vi;

  // Active user session data
  const initialData = resolveInitialProfileData(session);

  // State adjustment during render if user account switched or logged out
  const [prevUserId, setPrevUserId] = useState(session?.user?.id || null);
  const [fullName, setFullName] = useState(initialData?.fullName || '');
  const [validationError, setValidationError] = useState(null);
  const [localPendingCancel, setLocalPendingCancel] = useState(false);

  if (session?.user?.id !== prevUserId) {
    setPrevUserId(session?.user?.id || null);
    setFullName(initialData?.fullName || '');
    setValidationError(null);
    setLocalPendingCancel(false);
  }

  const dirty = isFormDirty(fullName, initialData?.fullName);

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

    const validation = validateProfileEditForm({ fullName: val });
    if (!validation.isValid && validation.errors.fullName) {
      setValidationError(t.errorFullNameRequired);
    } else {
      setValidationError(null);
    }
  };

  // Reset form to initial session values (revert modifications, stay on page)
  const handleReset = () => {
    setFullName(initialData?.fullName || '');
    setValidationError(null);
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

  // Intercept form submit (disabled API)
  const handleSubmit = (e) => {
    e.preventDefault();
    // Save is strictly unavailable per contract; do nothing
  };

  const isModalOpen = Boolean(pendingNavigation || localPendingCancel);

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
      <div className="lv-notice-callout" role="note">
        <Info size={18} className="lv-notice-callout__icon" aria-hidden="true" />
        <div className="lv-notice-callout__text">
          <span className="lv-notice-callout__title">{t.unavailableNotice}</span>
          <span>{t.unavailableExplanation}</span>
        </div>
      </div>

      {/* Main Form Content */}
      {initialData ? (
        <section className="lv-edit-card" aria-labelledby="profile-edit-heading">
          <h2 id="profile-edit-heading" className="lv-edit-card__title">
            {t.personalInfoSection}
          </h2>
          <p className="lv-edit-card__desc">{t.personalInfoDesc}</p>

          <form className="lv-form" onSubmit={handleSubmit} noValidate>
            {/* 1. Full Name */}
            <div className="lv-form-group">
              <label htmlFor="lv-edit-fullname" className="lv-form-label">
                <span>{t.fullNameLabel}</span>
              </label>
              <input
                id="lv-edit-fullname"
                type="text"
                className={`lv-input-text ${validationError ? 'has-error' : ''}`}
                value={fullName}
                onChange={handleNameChange}
                placeholder={t.fullNamePlaceholder}
                autoComplete="name"
                aria-invalid={Boolean(validationError)}
                aria-describedby={validationError ? 'lv-fullname-error' : undefined}
              />
              {validationError && (
                <p id="lv-fullname-error" className="lv-form-error" role="alert">
                  {validationError}
                </p>
              )}
            </div>

            {/* 2. Email Address (Read-only) */}
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
                type="email"
                className="lv-input-text"
                value={initialData.email}
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
                {initialData.roles.map((role) => (
                  <span key={role} className="lv-role-chip">
                    <Shield size={13} aria-hidden="true" />
                    <span>{formatRoleName(role, lang)}</span>
                  </span>
                ))}
              </div>
              <p className="lv-form-help">{t.rolesHelp}</p>
            </div>

            {/* Actions Bar: Cancel (Exit) vs Reset (Revert) vs Save (Disabled) */}
            <div className="lv-form-actions">
              <button
                type="button"
                className="lv-btn lv-btn-secondary"
                onClick={handleCancelClick}
                aria-label={t.btnCancel}
              >
                <span>{t.btnCancel}</span>
              </button>

              <button
                type="button"
                className="lv-btn lv-btn-secondary"
                onClick={handleReset}
                disabled={!dirty}
                aria-label={t.btnReset}
              >
                <RotateCcw size={15} aria-hidden="true" />
                <span>{t.btnReset}</span>
              </button>

              <button
                type="submit"
                className="lv-btn lv-btn-primary"
                disabled
                title={t.unavailableNotice}
                aria-label={t.unavailableNotice}
              >
                <span>{t.btnSave}</span>
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
                autoFocus
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
