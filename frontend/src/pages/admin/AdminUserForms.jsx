import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useModalFocus } from '../../components/common/useModalFocus.js';
import { adminI18n, adminRoleLabel } from './adminI18n.js';
import {
  ASSIGNABLE_ADMIN_ROLES,
  changeAdminUserRole,
  setAdminUserLocked,
  createAdminUser,
  resetAdminUserPassword,
  validateCreateAdminUserForm,
  validateResetAdminPasswordForm,
} from '../../utils/adminService.js';
import './AdminPages.css';

const ROLE_HINT = {
  STAFF_EXECUTOR: 'roleHintStaff',
  LEGAL_VERIFIER: 'roleHintLegal',
  VAULT_OWNER: 'roleHintOwner',
};

const FIELD_ERROR = {
  fullName: { required: 'errRequired', tooLong: 'errTooLong' },
  email: { required: 'errRequired', invalid: 'errEmailInvalid', tooLong: 'errEmailInvalid' },
  phone: { invalid: 'errPhoneInvalid' },
  password: { required: 'errRequired', invalid: 'errPasswordInvalid' },
  confirmPassword: { required: 'errRequired', mismatch: 'errConfirmMismatch' },
  role: { required: 'errRoleRequired' },
};

/** Field-level problems reported by the server (HTTP 400), mapped onto this form's own error keys. */
function serverFieldErrors(error) {
  const mapped = {};
  if (error?.code !== 'VALIDATION_FAILED') return mapped;
  for (const item of error.fieldErrors || []) {
    const blank = item?.code === 'NOT_BLANK';
    if (item?.field === 'fullName') mapped.fullName = blank ? 'required' : 'tooLong';
    else if (item?.field === 'email') mapped.email = blank ? 'required' : 'invalid';
    else if (item?.field === 'phone') mapped.phone = 'invalid';
    else if (item?.field === 'password') mapped.password = blank ? 'required' : 'invalid';
    else if (item?.field === 'role') mapped.role = 'required';
  }
  return mapped;
}

/** Maps an API failure to a message; 401/403 are escalated to the page so the session/permission UI reacts. */
function failureMessage(t, error, { onUnauthorized, onDenied, overrides = {} }) {
  if (error?.status === 401) onUnauthorized?.();
  if (error?.status === 403 && error.code === 'ACCESS_DENIED') onDenied?.();
  return {
    EMAIL_ALREADY_EXISTS: t.errEmailExists,
    ADMIN_OWNER_HAS_VAULT: t.errOwnerHasVault,
    ADMIN_ACCOUNT_PROTECTED: t.errProtected,
    RESOURCE_NOT_FOUND: t.errNotFound,
    ADMIN_ACCOUNT_STATE_INVALID: t.errStateInvalid,
    ADMIN_ACCOUNT_IN_HANDOVER: t.errInHandover,
    ...overrides, // per-dialog wording wins over the generic message for the same code
  }[error?.code] || t.errSubmit;
}

/** Red asterisk for required fields; hidden from assistive tech because the input carries aria-required. */
function RequiredMark() {
  return <span className="lv-admin-required" aria-hidden="true"> *</span>;
}

function ModalShell({ titleId, title, closeLabel, onClose, wide = false, children }) {
  const ref = useModalFocus(true, onClose);
  return (
    <div className="lv-admin-modal-backdrop" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className={`lv-admin-modal-card${wide ? " lv-admin-modal-card--wide" : ""}`}>
        <div className="lv-admin-modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="lv-admin-modal-close-btn" onClick={onClose} aria-label={closeLabel}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RoleSelect({ id, t, lang, value, onChange, describedBy, invalid, disabled = false }) {
  return (
    <select
      id={id}
      className="lv-admin-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={invalid || undefined}
      aria-required="true"
      aria-describedby={describedBy}
      disabled={disabled}
    >
      <option value="">{t.selectRole}</option>
      {ASSIGNABLE_ADMIN_ROLES.map((role) => (
        <option key={role} value={role}>{adminRoleLabel(role, lang)}</option>
      ))}
    </select>
  );
}

export function CreateUserModal({ lang = 'vi', accessToken, onClose, onCreated, onUnauthorized, onDenied }) {
  const t = adminI18n[lang] || adminI18n.vi;
  const uid = useId();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', confirmPassword: '', role: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };
  const errorText = (field) => fieldErrors[field] ? t[FIELD_ERROR[field][fieldErrors[field]]] : '';

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const errors = validateCreateAdminUserForm(form);
    setFieldErrors(errors);
    setSubmitError('');
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      const { fullName, email, phone, password, role } = form;
      onCreated(await createAdminUser(accessToken, { fullName, email, phone, password, role, lang }));
    } catch (error) {
      const mapped = serverFieldErrors(error);
      if (Object.keys(mapped).length) setFieldErrors(mapped);
      else setSubmitError(failureMessage(t, error, { onUnauthorized, onDenied }));
      setBusy(false);
    }
  };

  const describedBy = (key, hasHint) => [hasHint && `${uid}-${key}-hint`, fieldErrors[key] && `${uid}-${key}-error`].filter(Boolean).join(' ') || undefined;
  // Same field order and look as the public sign-up form: required fields carry a red asterisk, optional ones none.
  const field = (key, label, input, { required = true, labelHint = null, hint = null } = {}) => (
    <div className="lv-admin-field lv-admin-form-field">
      <label htmlFor={`${uid}-${key}`}>
        <span>{label}{required && <RequiredMark />}</span>
        {labelHint && <span className="lv-admin-label-hint">({labelHint})</span>}
      </label>
      {input}
      {hint && <small id={`${uid}-${key}-hint`} className="lv-admin-field-hint">{hint}</small>}
      {fieldErrors[key] && <small id={`${uid}-${key}-error`} className="lv-admin-field-error" role="alert">{errorText(key)}</small>}
    </div>
  );
  const textInput = (key, type, extra = {}) => (
    <input
      id={`${uid}-${key}`}
      className="lv-admin-input"
      type={type}
      value={form[key]}
      onChange={(e) => set(key)(e.target.value)}
      aria-invalid={fieldErrors[key] ? true : undefined}
      aria-required={key !== 'phone' || undefined}
      aria-describedby={describedBy(key, false)}
      disabled={busy}
      {...extra}
    />
  );
  const passwordInput = (key) => (
    <div className="lv-admin-input-wrap">
      {textInput(key, showPassword ? 'text' : 'password', { maxLength: 72, autoComplete: 'new-password', placeholder: '••••••••' })}
      {key === 'password' && (
        <button type="button" className="lv-admin-eye-btn" onClick={() => setShowPassword((shown) => !shown)}
          aria-label={showPassword ? t.hidePassword : t.showPassword} title={showPassword ? t.hidePassword : t.showPassword}
          aria-pressed={showPassword} disabled={busy}>
          {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      )}
    </div>
  );

  return (
    <ModalShell titleId={`${uid}-title`} title={t.createUserTitle} closeLabel={t.closeModal} onClose={onClose} wide>
      <form className="lv-admin-modal-form" onSubmit={submit} noValidate>
        <div className="lv-admin-modal-body lv-admin-form-grid">
          <p className="lv-admin-form-intro">{t.createUserIntro}</p>
          <div className="lv-admin-form-row">
            {field('fullName', t.fieldFullName, textInput('fullName', 'text', { maxLength: 150, autoComplete: 'off', placeholder: t.placeholderFullName }))}
            {field('phone', t.fieldPhone, textInput('phone', 'tel', { maxLength: 16, autoComplete: 'off', placeholder: t.placeholderPhone }), { required: false })}
          </div>
          {field('email', t.fieldEmail, textInput('email', 'email', { maxLength: 254, autoComplete: 'off', placeholder: t.placeholderEmail }))}
          <div className="lv-admin-form-row">
            {field('password', t.fieldPassword, passwordInput('password'), { labelHint: t.passwordHint })}
            {field('confirmPassword', t.fieldConfirmPassword, passwordInput('confirmPassword'))}
          </div>
          {field('role', t.fieldRole,
            <RoleSelect id={`${uid}-role`} t={t} lang={lang} value={form.role} onChange={set('role')} disabled={busy}
              describedBy={describedBy('role', Boolean(form.role))} invalid={Boolean(fieldErrors.role)} />,
            { hint: form.role ? t[ROLE_HINT[form.role]] : null })}
          {submitError && <p className="lv-admin-form-error" role="alert">{submitError}</p>}
        </div>
        <div className="lv-admin-modal-footer">
          <button type="button" className="lv-admin-btn lv-admin-btn-secondary" onClick={onClose} disabled={busy}>{t.cancelBtn}</button>
          <button type="submit" className="lv-admin-btn lv-admin-btn-primary" disabled={busy}>{busy ? t.submitting : t.submitCreate}</button>
        </div>
      </form>
    </ModalShell>
  );
}

export function ChangeRoleModal({ lang = 'vi', accessToken, user, onClose, onChanged, onUnauthorized, onDenied }) {
  const t = adminI18n[lang] || adminI18n.vi;
  const uid = useId();
  const current = user.roles.find((role) => ASSIGNABLE_ADMIN_ROLES.includes(role)) || '';
  const [role, setRole] = useState(current);
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!role) { setSubmitError(t.errRoleRequired); return; }
    setBusy(true);
    setSubmitError('');
    try {
      onChanged(await changeAdminUserRole(accessToken, user.id, role, { lang }));
    } catch (error) {
      setSubmitError(failureMessage(t, error, { onUnauthorized, onDenied }));
      setBusy(false);
    }
  };

  return (
    <ModalShell titleId={`${uid}-title`} title={t.changeRoleTitle} closeLabel={t.closeModal} onClose={onClose}>
      <form className="lv-admin-modal-form" onSubmit={submit} noValidate>
        <div className="lv-admin-modal-body lv-admin-form-grid">
          <p className="lv-admin-form-intro">{t.changeRoleIntro}</p>
          <dl className="lv-admin-detail-list">
            <div><dt>{t.thName}</dt><dd>{user.fullName || t.notAvailable}</dd></div>
            <div><dt>{t.thEmail}</dt><dd>{user.email}</dd></div>
            <div><dt>{t.currentRoles}</dt><dd>{user.roles.map((r) => adminRoleLabel(r, lang)).join(', ') || t.notAvailable}</dd></div>
          </dl>
          <div className="lv-admin-field lv-admin-form-field">
            <label htmlFor={`${uid}-role`}>{t.newRole}<RequiredMark /></label>
            <RoleSelect id={`${uid}-role`} t={t} lang={lang} value={role} onChange={setRole}
              describedBy={role ? `${uid}-role-hint` : undefined} invalid={Boolean(submitError) && !role} />
            {role && <small id={`${uid}-role-hint`} className="lv-admin-field-hint">{t[ROLE_HINT[role]]}</small>}
          </div>
          {submitError && <p className="lv-admin-form-error" role="alert">{submitError}</p>}
        </div>
        <div className="lv-admin-modal-footer">
          <button type="button" className="lv-admin-btn lv-admin-btn-secondary" onClick={onClose} disabled={busy}>{t.cancelBtn}</button>
          <button type="submit" className="lv-admin-btn lv-admin-btn-primary" disabled={busy || !role || role === current}>
            {busy ? t.submitting : t.submitChangeRole}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/** Confirmation for locking or unlocking one account; locking can carry a reason for the audit trail. */
export function LockUserModal({ lang = 'vi', accessToken, user, lock, onClose, onDone, onUnauthorized, onDenied }) {
  const t = adminI18n[lang] || adminI18n.vi;
  const uid = useId();
  const [reason, setReason] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setSubmitError('');
    try {
      onDone(await setAdminUserLocked(accessToken, user.id, lock, { reason, lang }));
    } catch (error) {
      setSubmitError(failureMessage(t, error, { onUnauthorized, onDenied }));
      setBusy(false);
    }
  };

  return (
    <ModalShell titleId={`${uid}-title`} title={lock ? t.lockTitle : t.unlockTitle} closeLabel={t.closeModal} onClose={onClose}>
      <form className="lv-admin-modal-form" onSubmit={submit} noValidate>
        <div className="lv-admin-modal-body lv-admin-form-grid">
          <p className="lv-admin-form-intro">{lock ? t.lockIntro : t.unlockIntro}</p>
          <dl className="lv-admin-detail-list">
            <div><dt>{t.thName}</dt><dd>{user.fullName || t.notAvailable}</dd></div>
            <div><dt>{t.thEmail}</dt><dd>{user.email}</dd></div>
          </dl>
          {lock && (
            <div className="lv-admin-field lv-admin-form-field">
              <label htmlFor={`${uid}-reason`}>{t.fieldReason}</label>
              <textarea id={`${uid}-reason`} className="lv-admin-input lv-admin-textarea" rows={3} maxLength={255}
                value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t.reasonPlaceholder} disabled={busy} />
            </div>
          )}
          {submitError && <p className="lv-admin-form-error" role="alert">{submitError}</p>}
        </div>
        <div className="lv-admin-modal-footer">
          <button type="button" className="lv-admin-btn lv-admin-btn-secondary" onClick={onClose} disabled={busy}>{t.cancelBtn}</button>
          <button type="submit" className={`lv-admin-btn ${lock ? 'lv-admin-btn-danger' : 'lv-admin-btn-primary'}`} disabled={busy}>
            {busy ? t.submitting : lock ? t.submitLock : t.submitUnlock}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/** Field-level problems for the reset-password form -> message keys in adminI18n. */
const RESET_FIELD_ERROR = {
  email: { required: 'errRequired', invalid: 'errEmailInvalid' },
  newPassword: { required: 'errRequired', invalid: 'errPasswordInvalid' },
  confirmPassword: { required: 'errRequired', mismatch: 'errConfirmMismatch' },
};

/**
 * Dialog for an Admin to set a new password for any non-Admin account.
 *
 * The Admin types the account e-mail, the new password and its confirmation. When the dialog is opened from a row
 * of the user table the e-mail is prefilled from that row (and can still be edited); when opened from the page
 * header it starts empty so the Admin can target any account by e-mail.
 *
 * Behaviour:
 * - Validates locally with {@link validateResetAdminPasswordForm} (e-mail format, password policy, confirmation).
 * - Calls {@link resetAdminUserPassword}; on success calls {@code onDone(updatedUser)} so the page can show a notice.
 * - On failure shows a message in the dialog: unknown e-mail, protected (Admin) account, Google-only account,
 *   or the generic error. 401 / 403 are escalated through {@code onUnauthorized} / {@code onDenied}.
 * - The password fields are never prefilled, and the eye button toggles visibility of both password inputs.
 *
 * @param {object} props
 * @param {'vi'|'en'} [props.lang='vi'] UI language.
 * @param {string} props.accessToken Admin bearer token.
 * @param {{email?: string}|null} [props.user=null] Row the dialog was opened from (only its e-mail is used).
 * @param {() => void} props.onClose Close without changing anything.
 * @param {(user: object) => void} props.onDone Called with the updated account after a successful reset.
 * @param {() => void} [props.onUnauthorized] Called on HTTP 401.
 * @param {() => void} [props.onDenied] Called on HTTP 403 ACCESS_DENIED.
 */
export function ResetPasswordModal({ lang = 'vi', accessToken, user = null, onClose, onDone, onUnauthorized, onDenied }) {
  const t = adminI18n[lang] || adminI18n.vi;
  const uid = useId();
  const [form, setForm] = useState({ email: user?.email || '', newPassword: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);

  /** Updates one field and clears that field's error while the Admin corrects it. */
  const set = (key) => (value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  /** Validates, sends the request and reports the outcome; guarded against double submits by {@code busy}. */
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const errors = validateResetAdminPasswordForm(form);
    setFieldErrors(errors);
    setSubmitError('');
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      onDone(await resetAdminUserPassword(accessToken, { email: form.email, newPassword: form.newPassword, lang }));
    } catch (error) {
      setSubmitError(failureMessage(t, error, {
        onUnauthorized,
        onDenied,
        overrides: { RESOURCE_NOT_FOUND: t.errResetNotFound, ADMIN_ACCOUNT_STATE_INVALID: t.errNoPasswordLogin },
      }));
      setBusy(false);
    }
  };

  /** One labelled field with its inline error message (same markup as the create-account form). */
  const field = (key, label, input) => (
    <div className="lv-admin-field lv-admin-form-field">
      <label htmlFor={`${uid}-${key}`}><span>{label}<RequiredMark /></span></label>
      {input}
      {fieldErrors[key] && <small id={`${uid}-${key}-error`} className="lv-admin-field-error" role="alert">{t[RESET_FIELD_ERROR[key][fieldErrors[key]]]}</small>}
    </div>
  );
  /** Password input; the first one carries the eye button that shows or hides both password fields. */
  const passwordInput = (key, withEye) => (
    <div className="lv-admin-input-wrap">
      <input id={`${uid}-${key}`} className="lv-admin-input" type={showPassword ? 'text' : 'password'} value={form[key]}
        onChange={(e) => set(key)(e.target.value)} maxLength={72} autoComplete="new-password" placeholder="••••••••"
        aria-required="true" aria-invalid={fieldErrors[key] ? true : undefined}
        aria-describedby={fieldErrors[key] ? `${uid}-${key}-error` : undefined} disabled={busy} />
      {withEye && (
        <button type="button" className="lv-admin-eye-btn" onClick={() => setShowPassword((shown) => !shown)}
          aria-label={showPassword ? t.hidePassword : t.showPassword} title={showPassword ? t.hidePassword : t.showPassword}
          aria-pressed={showPassword} disabled={busy}>
          {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      )}
    </div>
  );

  return (
    <ModalShell titleId={`${uid}-title`} title={t.resetPasswordTitle} closeLabel={t.closeModal} onClose={onClose}>
      <form className="lv-admin-modal-form" onSubmit={submit} noValidate>
        <div className="lv-admin-modal-body lv-admin-form-grid">
          <p className="lv-admin-form-intro">{t.resetPasswordIntro}</p>
          {field('email', t.fieldEmail,
            <input id={`${uid}-email`} className="lv-admin-input" type="email" value={form.email} maxLength={254}
              onChange={(e) => set('email')(e.target.value)} autoComplete="off" placeholder={t.placeholderEmail}
              aria-required="true" aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? `${uid}-email-error` : undefined} disabled={busy} />)}
          {field('newPassword', t.fieldNewPassword, passwordInput('newPassword', true))}
          {field('confirmPassword', t.fieldConfirmPassword, passwordInput('confirmPassword', false))}
          <small className="lv-admin-field-hint">{t.passwordHint}</small>
          {submitError && <p className="lv-admin-form-error" role="alert">{submitError}</p>}
        </div>
        <div className="lv-admin-modal-footer">
          <button type="button" className="lv-admin-btn lv-admin-btn-secondary" onClick={onClose} disabled={busy}>{t.cancelBtn}</button>
          <button type="submit" className="lv-admin-btn lv-admin-btn-primary" disabled={busy}>{busy ? t.submitting : t.submitResetPassword}</button>
        </div>
      </form>
    </ModalShell>
  );
}
