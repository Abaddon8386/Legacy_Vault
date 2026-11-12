import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useModalFocus } from '../../components/common/useModalFocus.js';
import { adminI18n, adminRoleLabel } from './adminI18n.js';
import {
  ASSIGNABLE_ADMIN_ROLES,
  changeAdminUserRole,
  setAdminUserLocked,
  createAdminUser,
  validateCreateAdminUserForm,
} from '../../utils/adminService.js';
import './AdminPages.css';

/**
 * Khóa i18n của dòng gợi ý quyền hạn cho từng vai trò có thể gán (STAFF_EXECUTOR, LEGAL_VERIFIER, VAULT_OWNER).
 */
const ROLE_HINT = {
  STAFF_EXECUTOR: 'roleHintStaff',
  LEGAL_VERIFIER: 'roleHintLegal',
  VAULT_OWNER: 'roleHintOwner',
};

/**
 * Ánh xạ trường form -> loại lỗi -> khóa i18n của thông báo lỗi.
 */
const FIELD_ERROR = {
  fullName: { required: 'errRequired', tooLong: 'errTooLong' },
  email: { required: 'errRequired', invalid: 'errEmailInvalid', tooLong: 'errEmailInvalid' },
  phone: { invalid: 'errPhoneInvalid' },
  password: { required: 'errRequired', invalid: 'errPasswordInvalid' },
  confirmPassword: { required: 'errRequired', mismatch: 'errConfirmMismatch' },
  role: { required: 'errRoleRequired' },
};

/** Field-level problems reported by the server (HTTP 400), mapped onto this form's own error keys. */
/**
 * Ánh xạ lỗi `VALIDATION_FAILED` (HTTP 400) do backend trả về, cụ thể là mảng `fieldErrors`, sang mã lỗi của chính form này.
 *
 * @param {ApiError} error Lỗi từ `request()`.
 * @returns {Object<string,string>} Bản đồ trường -> loại lỗi ('required' | 'tooLong' | 'invalid'); rỗng nếu không phải lỗi validate.
 */
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
/**
 * Chuyển lỗi API thành thông báo cho người dùng. Các mã lỗi nghiệp vụ được xử lý: EMAIL_ALREADY_EXISTS, ADMIN_OWNER_HAS_VAULT,
 * ADMIN_ACCOUNT_PROTECTED, RESOURCE_NOT_FOUND, ADMIN_ACCOUNT_STATE_INVALID, ADMIN_ACCOUNT_IN_HANDOVER; mã khác dùng thông báo chung.
 *
 * @param {object} t Bộ chuỗi i18n.
 * @param {ApiError} error Lỗi từ API.
 * @param {{onUnauthorized: Function, onDenied: Function}} handlers Gọi khi 401 hoặc 403 `ACCESS_DENIED`.
 * @returns {string} Thông báo.
 */
function failureMessage(t, error, { onUnauthorized, onDenied }) {
  if (error?.status === 401) onUnauthorized?.();
  if (error?.status === 403 && error.code === 'ACCESS_DENIED') onDenied?.();
  return {
    EMAIL_ALREADY_EXISTS: t.errEmailExists,
    ADMIN_OWNER_HAS_VAULT: t.errOwnerHasVault,
    ADMIN_ACCOUNT_PROTECTED: t.errProtected,
    RESOURCE_NOT_FOUND: t.errNotFound,
    ADMIN_ACCOUNT_STATE_INVALID: t.errStateInvalid,
    ADMIN_ACCOUNT_IN_HANDOVER: t.errInHandover,
  }[error?.code] || t.errSubmit;
}

/** Red asterisk for required fields; hidden from assistive tech because the input carries aria-required. */
/**
 * Dấu * đỏ đánh dấu trường bắt buộc (ẩn khỏi trình đọc màn hình).
 */
function RequiredMark() {
  return <span className="lv-admin-required" aria-hidden="true"> *</span>;
}

/**
 * Khung modal dùng chung của các form quản trị: tiêu đề, nút đóng, khóa focus qua `useModalFocus`.
 *
 * @param {object} props `titleId`, `title`, `closeLabel`, `onClose`, `wide` (modal rộng), `children`.
 */
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

/**
 * Ô chọn vai trò từ `ASSIGNABLE_ADMIN_ROLES` (STAFF_EXECUTOR, LEGAL_VERIFIER, VAULT_OWNER).
 *
 * @param {object} props `id`, `t`, `lang`, `value`, `onChange(value)`, `describedBy`, `invalid`, `disabled`.
 */
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

/**
 * Modal "Tạo tài khoản" của admin. Kiểm tra form phía client bằng `validateCreateAdminUserForm`, rồi gọi `createAdminUser`
 * -> `POST /api/v1/admin/users` (body fullName, email, phone, password, role; mong đợi 201). Lỗi 400 `VALIDATION_FAILED`
 * được gắn vào từng trường; lỗi khác hiện qua `failureMessage`. Dùng bởi `AdminUsersPage`.
 *
 * @param {object} props
 * @param {'vi'|'en'} [props.lang]
 * @param {string} props.accessToken JWT admin.
 * @param {Function} props.onClose Đóng modal.
 * @param {Function} props.onCreated Nhận tài khoản vừa tạo.
 * @param {Function} props.onUnauthorized Callback 401.
 * @param {Function} props.onDenied Callback 403.
 */
export function CreateUserModal({ lang = 'vi', accessToken, onClose, onCreated, onUnauthorized, onDenied }) {
  const t = adminI18n[lang] || adminI18n.vi;
  const uid = useId();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', confirmPassword: '', role: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);
  /**
   * Trả về hàm cập nhật một trường của form và xóa lỗi của trường đó.
   */
  const set = (key) => (value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };
  /**
   * Lấy thông báo lỗi i18n của một trường (rỗng nếu không có lỗi).
   */
  const errorText = (field) => fieldErrors[field] ? t[FIELD_ERROR[field][fieldErrors[field]]] : '';

  /**
   * Submit tạo tài khoản: validate, gọi API, báo `onCreated` khi thành công; chặn gửi trùng bằng cờ `busy`.
   */
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

  /**
   * Ghép id các phần tử gợi ý/lỗi cho `aria-describedby` của một trường.
   */
  const describedBy = (key, hasHint) => [hasHint && `${uid}-${key}-hint`, fieldErrors[key] && `${uid}-${key}-error`].filter(Boolean).join(' ') || undefined;
  /**
   * Dựng một dòng trường form (nhãn, dấu bắt buộc, input, gợi ý, lỗi) giống form đăng ký công khai.
   */
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
  /**
   * Dựng ô nhập văn bản gắn với state `form` và thuộc tính trợ năng.
   */
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
  /**
   * Dựng ô nhập mật khẩu có nút hiện/ẩn mật khẩu.
   */
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

/**
 * Modal đổi vai trò của một tài khoản. Gọi `changeAdminUserRole` -> `PUT /api/v1/admin/users/{id}/role`
 * với body `{role: "ROLE_<VAI_TRÒ>"}` (mong đợi 200). Dùng bởi `AdminUsersPage`.
 *
 * @param {object} props
 * @param {object} props.user Tài khoản đang sửa (dùng `id`, `roles`).
 * @param {Function} props.onChanged Nhận tài khoản sau khi đổi.
 * @param {Function} props.onClose Đóng modal.
 * Các props còn lại (`lang`, `accessToken`, `onUnauthorized`, `onDenied`) giống `CreateUserModal`.
 */
export function ChangeRoleModal({ lang = 'vi', accessToken, user, onClose, onChanged, onUnauthorized, onDenied }) {
  const t = adminI18n[lang] || adminI18n.vi;
  const uid = useId();
  const current = user.roles.find((role) => ASSIGNABLE_ADMIN_ROLES.includes(role)) || '';
  const [role, setRole] = useState(current);
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);

  /**
   * Submit đổi vai trò: yêu cầu đã chọn vai trò rồi gọi API; lỗi hiện qua `failureMessage`.
   */
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

  /**
   * Submit khóa/mở khóa: gọi `setAdminUserLocked` (`POST /api/v1/admin/users/{id}/lock` kèm `reason` tùy chọn, hoặc `/unlock`).
   */
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
