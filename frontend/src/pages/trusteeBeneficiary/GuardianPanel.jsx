import { useEffect, useRef, useState } from 'react';
import { guardianService } from '../../services/guardianService.js';
import { EMAIL_REGEX, PHONE_REGEX } from '../../utils/trusteeValidation.js';
import '../../components/common/RelatedAttachments.css';

function validateGuardianDraft(values = {}, lang = 'vi') {
  const en = lang === 'en';
  const errors = {};
  const hasControl = (str) => typeof str === 'string' && Array.from(str).some((ch) => {
    const code = ch.charCodeAt(0);
    return code <= 31 || (code >= 127 && code <= 159);
  });

  const fullName = (values.fullName || '').trim();
  if (!fullName) {
    errors.fullName = en
      ? 'Please enter the guardian full name.'
      : 'Vui lòng nhập họ và tên người giám hộ.';
  } else if (fullName.length > 150) {
    errors.fullName = en
      ? 'Full name must not exceed 150 characters.'
      : 'Họ và tên không được vượt quá 150 ký tự.';
  } else if (hasControl(fullName)) {
    errors.fullName = en
      ? 'Full name contains invalid characters.'
      : 'Họ và tên chứa ký tự không hợp lệ.';
  }

  const relationship = (values.relationship || '').trim();
  if (!relationship) {
    errors.relationship = en
      ? 'Please enter the relationship with the beneficiary.'
      : 'Vui lòng nhập mối quan hệ với người thụ hưởng.';
  } else if (relationship.length > 100) {
    errors.relationship = en
      ? 'Relationship must not exceed 100 characters.'
      : 'Mối quan hệ không được vượt quá 100 ký tự.';
  } else if (hasControl(relationship)) {
    errors.relationship = en
      ? 'Relationship contains invalid characters.'
      : 'Mối quan hệ chứa ký tự không hợp lệ.';
  }

  const email = (values.email || '').trim();
  const phone = (values.phone || '').trim();

  if (!email && !phone) {
    const contactMsg = en
      ? 'Provide at least an email address or a phone number.'
      : 'Cần ít nhất email hoặc số điện thoại liên hệ.';
    errors.email = contactMsg;
    errors.phone = contactMsg;
  } else {
    if (email) {
      if (email.length > 254 || hasControl(email) || !EMAIL_REGEX.test(email)) {
        errors.email = en
          ? 'Please enter a valid email address.'
          : 'Địa chỉ email chưa đúng định dạng.';
      }
    }
    if (phone) {
      if (phone.length > 20 || hasControl(phone) || !PHONE_REGEX.test(phone)) {
        errors.phone = en
          ? 'Invalid phone number format (e.g. 0901234567 or +84...).'
          : 'Số điện thoại không hợp lệ (ví dụ: 0901234567 hoặc +84...).';
      }
    }
  }

  return errors;
}

function formatGuardianTimestamp(isoString, en) {
  if (!isoString || typeof isoString !== 'string') return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return en ? `${y}-${m}-${d}` : `${d}/${m}/${y}`;
}

function formatEndReason(reason, endedAt, en) {
  if (!endedAt) return en ? 'Current' : 'Hiện hành';
  if (reason === 'REPLACED') return en ? 'Replaced' : 'Đã thay thế';
  if (reason === 'REVOKED') return en ? 'Revoked' : 'Đã thu hồi';
  return reason || (en ? 'Ended' : 'Đã kết thúc');
}

export default function GuardianPanel(props) {
  return (
    <GuardianContent
      key={`${props.vaultId}:${props.beneficiaryId}:${props.accessToken}`}
      {...props}
    />
  );
}

function GuardianContent({
  vaultId,
  beneficiaryId,
  beneficiaryName,
  beneficiaryRelationship,
  beneficiaryDob,
  isMinorHint = false,
  accessToken,
  lang = 'vi',
  onUnauthorized,
}) {
  const en = lang === 'en';
  const [expanded, setExpanded] = useState(false);
  const [context, setContext] = useState(null);
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState(null); // 'load' | 'save' | 'revoke' | 'history'
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [draft, setDraft] = useState(null);
  const [touched, setTouched] = useState({});
  const [history, setHistory] = useState(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const controller = useRef(null);
  const fieldRefs = useRef({});
  const errorBannerRef = useRef(null);

  useEffect(() => () => controller.current?.abort(), []);

  async function run(actionType, task) {
    if (controller.current) return;
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setBusyAction(actionType);
    setError(null);
    if (actionType !== 'history') {
      setSuccessMsg(null);
    }
    try {
      await task({ accessToken, lang, signal: c.signal }, c);
    } catch (err) {
      if (!c.signal.aborted) {
        setError(err);
        if (err.status === 401) onUnauthorized?.();
      }
    } finally {
      if (!c.signal.aborted) {
        controller.current = null;
        setBusy(false);
        setBusyAction(null);
      }
    }
  }

  const load = () =>
    run('load', async (options, c) => {
      const value = await guardianService.get(vaultId, beneficiaryId, options);
      if (!c.signal.aborted) {
        setContext(value);
        setDraft(null);
        setTouched({});
        setHistory(null);
        setConfirmRevoke(false);
      }
    });

  const showHistory = (page) =>
    run('history', async (options, c) => {
      const value = await guardianService.history(vaultId, beneficiaryId, page, options);
      if (!c.signal.aborted) setHistory(value);
    });

  const openDraftForm = () => {
    setConfirmRevoke(false);
    setSuccessMsg(null);
    setError(null);
    setTouched({});
    setDraft({
      fullName: context?.guardian?.fullName || '',
      relationship: context?.guardian?.relationship || '',
      email: context?.guardian?.email || '',
      phone: context?.guardian?.phone || '',
    });
  };

  const fieldOrder = ['fullName', 'relationship', 'email', 'phone'];
  const validationErrors = draft ? validateGuardianDraft(draft, lang) : {};

  const handleSaveSubmit = (e) => {
    e.preventDefault();
    if (!draft || busy) return;

    const allTouched = { fullName: true, relationship: true, email: true, phone: true };
    setTouched(allTouched);

    const currentErrors = validateGuardianDraft(draft, lang);
    const firstErrorKey = fieldOrder.find((k) => Boolean(currentErrors[k]));
    if (firstErrorKey) {
      const el = fieldRefs.current[firstErrorKey];
      if (el) {
        if (typeof el.scrollIntoView === 'function') {
          try {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } catch {
            el.scrollIntoView();
          }
        }
        if (typeof el.focus === 'function') {
          el.focus();
        }
      }
      return;
    }

    run('save', async (options, c) => {
      const value = await guardianService.save(
        vaultId,
        beneficiaryId,
        { ...draft, expectedRevision: context.revision },
        options
      );
      if (!c.signal.aborted) {
        setContext(value);
        setDraft(null);
        setTouched({});
        setHistory(null);
        setConfirmRevoke(false);
        setSuccessMsg('saved');
      }
    });
  };

  const handleConfirmRevoke = () => {
    if (!context || busy) return;
    run('revoke', async (options, c) => {
      const value = await guardianService.revoke(vaultId, beneficiaryId, context.revision, options);
      if (!c.signal.aborted) {
        setContext(value);
        setConfirmRevoke(false);
        setDraft(null);
        setTouched({});
        setHistory(null);
        setSuccessMsg('revoked');
      }
    });
  };

  const isStaleError = error?.code === 'BENEFICIARY_GUARDIAN_STALE';
  const isVaultLockedError = error?.code === 'VAULT_NOT_EDITABLE';

  const errorMessage = error
    ? isStaleError
      ? en
        ? 'Information changed. Reload before saving again.'
        : 'Thông tin đã thay đổi. Tải lại trước khi lưu.'
      : isVaultLockedError
      ? en
        ? 'This vault cannot be edited right now.'
        : 'Kho hiện không cho phép chỉnh sửa.'
      : en
      ? 'Unable to complete. Retry or reload.'
      : 'Chưa thực hiện được. Vui lòng thử lại hoặc tải lại.'
    : null;

  const successText =
    successMsg === 'saved'
      ? en
        ? 'Guardian contact saved successfully.'
        : 'Đã lưu thông tin người giám hộ thành công.'
      : successMsg === 'revoked'
      ? en
        ? 'Current guardian contact has been revoked.'
        : 'Đã thu hồi thông tin người giám hộ hiện hành.'
      : null;

  const ageBadge = context
    ? context.ageStatus === 'MINOR'
      ? {
          tone: 'minor',
          text: en ? 'Under 18 (Minor)' : 'Dưới 18 tuổi (Chưa thành niên)',
        }
      : context.ageStatus === 'ADULT'
      ? {
          tone: 'adult',
          text: en ? '18+ (Adult)' : 'Từ đủ 18 tuổi',
        }
      : {
          tone: 'unknown',
          text: en ? 'Age unverified (No DOB)' : 'Chưa rõ độ tuổi (Thiếu ngày sinh)',
        }
    : isMinorHint
    ? {
        tone: 'minor',
        text: en ? 'Under 18 (Minor)' : 'Dưới 18 tuổi (Chưa thành niên)',
      }
    : null;

  const fieldDefinitions = [
    [
      'fullName',
      en ? 'Full name' : 'Họ tên',
      'text',
      150,
      true,
      en ? 'e.g. Pham Hoang Lan' : 'Ví dụ: Phạm Hoàng Lan',
    ],
    [
      'relationship',
      en ? 'Relationship' : 'Quan hệ',
      'text',
      100,
      true,
      en ? 'e.g. Mother, Father, Legal guardian...' : 'Ví dụ: Mẹ ruột, Bố ruột, Cô/Chú...',
    ],
    [
      'email',
      'Email',
      'email',
      254,
      false,
      'guardian@example.com',
    ],
    [
      'phone',
      en ? 'Phone' : 'Số điện thoại',
      'tel',
      20,
      false,
      en ? '0901234567 or +84...' : '0901234567 hoặc +84...',
    ],
  ];

  const baseId = `guardian-${beneficiaryId || 'panel'}`;

  return (
    <section
      className={`lv-tb-guardian ${expanded ? 'is-expanded' : 'is-collapsed'}`}
      aria-label={
        beneficiaryName
          ? en
            ? `Guardian for ${beneficiaryName}`
            : `Người giám hộ của ${beneficiaryName}`
          : en
          ? 'Guardian'
          : 'Người giám hộ'
      }
    >
      {/* Top Bar: Trigger button + Beneficiary context & status summary */}
      <div className="lv-tb-guardian-bar">
        <div className="lv-tb-guardian-bar-left">
          <button
            type="button"
            className="lv-tb-guardian-trigger"
            aria-expanded={expanded}
            onClick={() => {
              setExpanded(true);
              load();
            }}
            disabled={busy}
          >
            {en ? 'Guardian' : 'Người giám hộ'}
          </button>

          {beneficiaryName && (
            <span className="lv-tb-guardian-owner-tag">
              {en ? 'For beneficiary:' : 'Cho người thụ hưởng:'}{' '}
              <strong>{beneficiaryName}</strong>
              {beneficiaryRelationship ? ` (${beneficiaryRelationship})` : ''}
            </span>
          )}
        </div>

        <div className="lv-tb-guardian-bar-right">
          {ageBadge && (
            <span className={`lv-tb-guardian-age-pill is-${ageBadge.tone}`}>
              {ageBadge.text}
            </span>
          )}
          {context && (
            <span
              className={`lv-tb-guardian-state-pill ${
                context.guardian ? 'has-guardian' : 'no-guardian'
              }`}
            >
              {context.guardian
                ? en
                  ? 'Guardian recorded'
                  : 'Đã có người giám hộ'
                : en
                ? 'Not set'
                : 'Chưa khai báo'}
            </span>
          )}
          {expanded && (
            <button
              type="button"
              className="lv-tb-guardian-reload-btn"
              disabled={busy}
              onClick={load}
            >
              {en ? 'Reload guardian' : 'Tải lại người giám hộ'}
            </button>
          )}
        </div>
      </div>

      {/* Calm hint when collapsed & minor */}
      {!expanded && isMinorHint && (
        <p className="lv-tb-guardian-collapsed-hint">
          {en
            ? 'Beneficiary is under 18. Open Guardian to add a contact person (optional).'
            : 'Người thụ hưởng dưới 18 tuổi. Mở mục Người giám hộ để khai báo thông tin liên hệ (khuyến nghị).'}
        </p>
      )}

      {expanded && (
        <div className="lv-tb-guardian-body">
          {/* Role Distinction Notice: Guardian vs Trustee */}
          <p className="lv-tb-guardian-scope-note">
            {en
              ? 'Contact information only; this does not grant account or asset access. A beneficiary’s guardian is distinct from the vault’s External Executor (Trustee).'
              : 'Chỉ lưu thông tin liên hệ; không cấp tài khoản hay quyền xem, nhận tài sản. Người giám hộ gắn riêng với người thụ hưởng này, không phải Người thi hành bên ngoài (Trustee) của kho.'}
          </p>

          {/* Loading State */}
          {busy && (
            <div className="lv-tb-guardian-status-banner is-loading" role="status" aria-live="polite">
              <span className="lv-tb-guardian-spinner" aria-hidden="true" />
              <span>
                {busyAction === 'save'
                  ? en
                    ? 'Saving guardian…'
                    : 'Đang lưu thông tin người giám hộ…'
                  : busyAction === 'revoke'
                  ? en
                    ? 'Revoking guardian…'
                    : 'Đang thu hồi thông tin người giám hộ…'
                  : en
                  ? 'Loading…'
                  : 'Đang xử lý…'}
              </span>
            </div>
          )}

          {/* Error State */}
          {errorMessage && (
            <div
              ref={errorBannerRef}
              className="lv-tb-guardian-status-banner is-error"
              role="alert"
            >
              <span className="lv-tb-guardian-status-text">{errorMessage}</span>
            </div>
          )}

          {/* Success State */}
          {successText && !errorMessage && !busy && (
            <div className="lv-tb-guardian-status-banner is-success" role="status" aria-live="polite">
              <span className="lv-tb-guardian-status-text">{successText}</span>
            </div>
          )}

          {context && (
            <>
              {/* Calm recommendation notice for minor or missing DOB */}
              {context.guardianRecommended && (
                <div className="lv-tb-guardian-minor-callout" role="status">
                  <span className="lv-tb-guardian-callout-dot" aria-hidden="true" />
                  <p>
                    {en
                      ? 'A guardian is recommended for this minor.'
                      : 'Nên bổ sung người giám hộ cho người thụ hưởng chưa thành niên.'}
                  </p>
                </div>
              )}

              {!context.guardianRecommended &&
                context.warningCode === 'BENEFICIARY_DOB_REQUIRED' &&
                !beneficiaryDob && (
                  <div className="lv-tb-guardian-dob-callout" role="status">
                    <p>
                      {en
                        ? 'Add a date of birth on the beneficiary to automatically determine minor/adult status.'
                        : 'Bổ sung ngày sinh của người thụ hưởng để hệ thống tự động xác định độ tuổi thành niên.'}
                    </p>
                  </div>
                )}

              {/* Current Guardian Details OR Empty State */}
              {context.guardian ? (
                <div className="lv-tb-guardian-card">
                  <div className="lv-tb-guardian-card-head">
                    <div className="lv-tb-guardian-card-identity">
                      <span className="lv-tb-guardian-card-label">
                        {en ? 'Current guardian' : 'Người giám hộ hiện hành'}
                      </span>
                      <h4 className="lv-tb-guardian-card-name">{context.guardian.fullName}</h4>
                    </div>
                    <span className="lv-tb-guardian-relation-badge">
                      {context.guardian.relationship}
                    </span>
                  </div>

                  <dl className="lv-tb-guardian-dl">
                    <div className="lv-tb-guardian-dl-item">
                      <dt>{en ? 'Relationship' : 'Mối quan hệ'}</dt>
                      <dd>{context.guardian.relationship || '—'}</dd>
                    </div>
                    <div className="lv-tb-guardian-dl-item">
                      <dt>Email</dt>
                      <dd>{context.guardian.email || '—'}</dd>
                    </div>
                    <div className="lv-tb-guardian-dl-item">
                      <dt>{en ? 'Phone number' : 'Số điện thoại'}</dt>
                      <dd className="is-tabular">{context.guardian.phone || '—'}</dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <div className="lv-tb-guardian-empty">
                  <p className="lv-tb-guardian-empty-title">
                    {en ? 'No current guardian.' : 'Chưa có người giám hộ hiện hành.'}
                  </p>
                  <p className="lv-tb-guardian-empty-sub">
                    {en
                      ? 'You can record one contact person for this beneficiary at any time.'
                      : 'Bạn có thể thêm thông tin liên hệ của người giám hộ cho người thụ hưởng này bất cứ lúc nào.'}
                  </p>
                </div>
              )}

              {/* Action Toolbar */}
              <div className="lv-tb-guardian-actions">
                <button
                  type="button"
                  className="lv-tb-guardian-btn lv-tb-guardian-btn--primary"
                  disabled={busy}
                  onClick={openDraftForm}
                >
                  {en ? 'Add / replace guardian' : 'Thêm / thay thế người giám hộ'}
                </button>

                {context.guardian && (
                  <button
                    type="button"
                    className="lv-tb-guardian-btn lv-tb-guardian-btn--danger-outline"
                    disabled={busy}
                    onClick={() => {
                      setDraft(null);
                      setSuccessMsg(null);
                      setConfirmRevoke(true);
                    }}
                  >
                    {en ? 'Revoke guardian' : 'Thu hồi người giám hộ'}
                  </button>
                )}

                <button
                  type="button"
                  className="lv-tb-guardian-btn lv-tb-guardian-btn--secondary"
                  disabled={busy}
                  onClick={() => showHistory(0)}
                >
                  {en ? 'Guardian history' : 'Lịch sử người giám hộ'}
                </button>
              </div>

              {/* Revoke Confirmation Box */}
              {confirmRevoke && (
                <div
                  className="lv-tb-guardian-revoke-box"
                  role="group"
                  aria-label={en ? 'Confirm guardian revocation' : 'Xác nhận thu hồi người giám hộ'}
                >
                  <p className="lv-tb-guardian-revoke-text">
                    {en
                      ? 'Revoke this contact? History will be preserved.'
                      : 'Thu hồi thông tin hiện hành? Lịch sử vẫn được giữ.'}
                  </p>
                  <div className="lv-tb-guardian-revoke-actions">
                    <button
                      type="button"
                      className="lv-tb-guardian-btn lv-tb-guardian-btn--danger"
                      disabled={busy}
                      onClick={handleConfirmRevoke}
                    >
                      {en ? 'Confirm revoke' : 'Xác nhận thu hồi'}
                    </button>
                    <button
                      type="button"
                      className="lv-tb-guardian-btn lv-tb-guardian-btn--secondary"
                      disabled={busy}
                      onClick={() => setConfirmRevoke(false)}
                    >
                      {en ? 'Cancel' : 'Hủy'}
                    </button>
                  </div>
                </div>
              )}

              {/* Add / Replace Guardian Form */}
              {draft && (
                <form className="lv-tb-guardian-form" onSubmit={handleSaveSubmit} noValidate>
                  <div className="lv-tb-guardian-form-head">
                    <h4 className="lv-tb-guardian-form-title">
                      {context.guardian
                        ? en
                          ? 'Replace current guardian'
                          : 'Cập nhật / thay thế người giám hộ'
                        : en
                        ? 'Add guardian contact'
                        : 'Thêm thông tin người giám hộ'}
                    </h4>
                    <p className="lv-tb-guardian-form-hint">
                      {en
                        ? 'Provide an email or phone number.'
                        : 'Cần ít nhất email hoặc số điện thoại.'}
                    </p>
                  </div>

                  <div className="lv-tb-guardian-form-grid">
                    {fieldDefinitions.map(([key, label, type, max, isReq, placeholder]) => {
                      const fieldId = `${baseId}-${key}`;
                      const errId = `${baseId}-err-${key}`;
                      const hasErr = Boolean(touched[key] && validationErrors[key]);
                      return (
                        <div className="lv-tb-guardian-field" key={key}>
                          <label className="lv-tb-guardian-label" htmlFor={fieldId}>
                            <span>
                              {label}
                              {isReq && <span className="lv-tb-req"> *</span>}
                            </span>
                            <input
                              ref={(el) => {
                                fieldRefs.current[key] = el;
                              }}
                              id={fieldId}
                              name={key}
                              type={type}
                              maxLength={max}
                              required={isReq}
                              placeholder={placeholder}
                              className={`lv-tb-guardian-input ${hasErr ? 'has-error' : ''}`}
                              value={draft[key]}
                              disabled={busy}
                              aria-invalid={hasErr}
                              aria-describedby={hasErr ? errId : undefined}
                              onBlur={() =>
                                setTouched((prev) => ({
                                  ...prev,
                                  [key]: true,
                                }))
                              }
                              onChange={(e) => {
                                const val = e.target.value;
                                setDraft((prev) => ({ ...prev, [key]: val }));
                                if (error && !isStaleError) setError(null);
                              }}
                            />
                          </label>
                          {hasErr && (
                            <span id={errId} className="lv-tb-guardian-field-error" role="alert">
                              {validationErrors[key]}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="lv-tb-guardian-form-actions">
                    <button
                      type="submit"
                      className="lv-tb-guardian-btn lv-tb-guardian-btn--primary"
                      disabled={busy || isStaleError}
                    >
                      {busy && busyAction === 'save'
                        ? en
                          ? 'Saving…'
                          : 'Đang lưu…'
                        : en
                        ? 'Save guardian'
                        : 'Lưu người giám hộ'}
                    </button>
                    <button
                      type="button"
                      className="lv-tb-guardian-btn lv-tb-guardian-btn--secondary"
                      disabled={busy}
                      onClick={() => {
                        setDraft(null);
                        setTouched({});
                      }}
                    >
                      {en ? 'Cancel' : 'Hủy'}
                    </button>
                  </div>
                </form>
              )}

              {/* Guardian History Section */}
              {history && (
                <div className="lv-tb-guardian-history">
                  <div className="lv-tb-guardian-history-head">
                    <h4 className="lv-tb-guardian-history-title">
                      {en ? 'Guardian record history' : 'Lịch sử ghi nhận người giám hộ'}
                    </h4>
                    <span className="lv-tb-guardian-history-count">
                      {history.content.length}{' '}
                      {en
                        ? history.content.length === 1
                          ? 'record'
                          : 'records'
                        : 'bản ghi'}
                    </span>
                  </div>

                  {history.content.length === 0 ? (
                    <p className="lv-tb-guardian-history-empty">
                      {en
                        ? 'No guardian history records yet.'
                        : 'Chưa có lịch sử thay đổi người giám hộ.'}
                    </p>
                  ) : (
                    <ul className="lv-tb-guardian-history-list">
                      {history.content.map((item) => {
                        const isCurrent = !item.endedAt;
                        return (
                          <li key={item.id} className="lv-tb-guardian-history-item">
                            <div className="lv-tb-guardian-history-main">
                              <span className="lv-tb-guardian-history-name">{item.fullName}</span>
                              <span className="lv-tb-guardian-history-rel">{item.relationship}</span>
                              {(item.email || item.phone) && (
                                <span className="lv-tb-guardian-history-contact">
                                  {[item.email, item.phone].filter(Boolean).join(' · ')}
                                </span>
                              )}
                            </div>
                            <div className="lv-tb-guardian-history-meta">
                              <span className="lv-tb-guardian-history-dates is-tabular">
                                {formatGuardianTimestamp(item.createdAt, en)} →{' '}
                                {item.endedAt
                                  ? formatGuardianTimestamp(item.endedAt, en)
                                  : en
                                  ? 'Current'
                                  : 'Hiện hành'}
                              </span>
                              <span
                                className={`lv-tb-guardian-history-badge ${
                                  isCurrent ? 'is-current' : 'is-ended'
                                }`}
                              >
                                {formatEndReason(item.endReason, item.endedAt, en)}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <div className="lv-tb-guardian-history-pager">
                    <button
                      type="button"
                      className="lv-tb-guardian-btn lv-tb-guardian-btn--secondary"
                      disabled={busy || history.page === 0}
                      onClick={() => showHistory(history.page - 1)}
                    >
                      {en ? 'Previous' : 'Trước'}
                    </button>
                    <span className="lv-tb-guardian-history-page-info is-tabular">
                      {history.totalPages > 0 ? `${history.page + 1} / ${history.totalPages}` : '1 / 1'}
                    </span>
                    <button
                      type="button"
                      className="lv-tb-guardian-btn lv-tb-guardian-btn--secondary"
                      disabled={busy || history.page + 1 >= history.totalPages}
                      onClick={() => showHistory(history.page + 1)}
                    >
                      {en ? 'Next' : 'Sau'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
