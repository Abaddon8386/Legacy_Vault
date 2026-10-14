import { useState, useEffect, useRef } from 'react';
import { validateVaultInput } from '../../utils/vaultService.js';
import StatusBadge from '../common/StatusBadge.jsx';
import MagneticButton from '../common/MagneticButton.jsx';
import './CreateVaultModal.css';

function CreateVaultModalDialog({
  onClose,
  onSubmitVault,
  lang = 'vi',
  initialShowErrors = false,
}) {
  const [form, setForm] = useState({ vault_name: '', description: '' });
  const [errors, setErrors] = useState(() => {
    if (initialShowErrors) {
      return validateVaultInput({ vault_name: '', description: '' }, lang);
    }
    return {};
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const pendingRef = useRef(false);
  const firstInputRef = useRef(null);
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);

  // Auto-focus, body scroll locking, and focus restoration
  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Gently shift focus to first interactive input
    const focusTimer = setTimeout(() => {
      firstInputRef.current?.focus();
    }, 50);

    return () => {
      clearTimeout(focusTimer);
      document.body.style.overflow = originalOverflow;
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, []);

  // Keyboard navigation: Escape key and accessible focus trapping
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isSubmitting) {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const firstEl = focusables[0];
        const lastEl = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSubmitting, onClose]);

  const content = {
    vi: {
      eyebrow: 'THIẾT LẬP KHO DI SẢN SỐ',
      title: 'Khởi tạo Kho di sản cá nhân',
      subtitle:
        'Thiết lập không gian an toàn để bắt đầu bảo vệ tài sản số, tài liệu di chúc và chuẩn bị chuyển giao cho thế hệ mai sau.',
      nameLabel: 'Tên kho di sản',
      namePlaceholder: 'Ví dụ: Kho di sản gia đình tôi',
      descLabel: 'Mô tả kho di sản (Tùy chọn)',
      descPlaceholder: 'Nhập mô tả ngắn gọn về mục đích hoặc phạm vi của kho di sản…',
      statusNoticeLabel: 'Trạng thái ban đầu:',
      ruleNotice:
        'Mỗi chủ tài khoản sở hữu duy nhất một kho di sản cá nhân. Sau khi khởi tạo, bạn có toàn quyền quản lý kho.',
      cancelBtn: 'Hủy bỏ',
      submitBtn: 'Khởi tạo kho di sản',
      submittingBtn: 'Đang khởi tạo…',
    },
    en: {
      eyebrow: 'HERITAGE VAULT SETUP',
      title: 'Initialize personal heritage vault',
      subtitle:
        'Set up your secure digital sanctuary to begin safeguarding digital assets, wills, and future transfer directives.',
      nameLabel: 'Vault Name',
      namePlaceholder: 'e.g. My family heritage vault',
      descLabel: 'Vault Description (Optional)',
      descPlaceholder: 'Enter a brief description of the purpose or scope of this vault…',
      statusNoticeLabel: 'Initial Status:',
      ruleNotice:
        'Each account owner holds exclusive ownership of one personal vault. Full autonomous control is granted upon creation.',
      cancelBtn: 'Cancel',
      submitBtn: 'Initialize vault',
      submittingBtn: 'Initializing…',
    },
  };

  const t = content[lang] || content.vi;

  const handleChange = (field, val) => {
    setForm((prev) => ({ ...prev, [field]: val }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    if (submitError) setSubmitError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pendingRef.current) return;

    const validationErrors = validateVaultInput(form, lang);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    pendingRef.current = true;
    setIsSubmitting(true);
    setSubmitError('');

    try {
      if (typeof onSubmitVault === 'function') {
        await onSubmitVault(form);
      }
      onClose();
    } catch {
      setIsSubmitting(false);
      setSubmitError(
        (lang === 'vi'
            ? 'Không thể khởi tạo kho di sản. Vui lòng thử lại.'
            : 'Failed to create heritage vault. Please try again.')
      );
    } finally { pendingRef.current = false; }
  };

  return (
    <div
      className="lv-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="lv-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lv-create-vault-title"
      >
        {/* Header */}
        <div className="lv-modal-header">
          <div>
            <span className="lv-modal-eyebrow">{t.eyebrow}</span>
            <h2 id="lv-create-vault-title" className="lv-modal-title">
              {t.title}
            </h2>
            <p className="lv-modal-subtitle">{t.subtitle}</p>
          </div>
          <button
            type="button"
            className="lv-modal-close-btn"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label={lang === 'en' ? 'Close dialog' : 'Đóng biểu mẫu'}
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="lv-modal-form" noValidate>
          {submitError && (
            <div className="lv-modal-alert-error" role="alert">
              <span className="lv-alert-icon" aria-hidden="true">!</span>
              <span>{submitError}</span>
            </div>
          )}

          {/* Field: Vault Name */}
          <div className="lv-form-group">
            <div className="lv-form-label-row">
              <label htmlFor="lv-vault-name" className="lv-form-label">
                {t.nameLabel} <span className="lv-req-star">*</span>
              </label>
              <span className="lv-char-count">{form.vault_name.length}/150</span>
            </div>
            <input
              ref={firstInputRef}
              id="lv-vault-name"
              type="text"
              className={`lv-form-input ${errors.vault_name ? 'has-error' : ''}`}
              placeholder={t.namePlaceholder}
              value={form.vault_name}
              onChange={(e) => handleChange('vault_name', e.target.value)}
              disabled={isSubmitting}
              maxLength={150}
              aria-invalid={errors.vault_name ? 'true' : 'false'}
              aria-describedby={errors.vault_name ? 'lv-vault-name-error' : undefined}
            />
            {errors.vault_name && (
              <span id="lv-vault-name-error" className="lv-form-error" role="alert">
                {errors.vault_name}
              </span>
            )}
          </div>

          {/* Field: Description */}
          <div className="lv-form-group">
            <div className="lv-form-label-row">
              <label htmlFor="lv-vault-desc" className="lv-form-label">
                {t.descLabel}
              </label>
              <span className="lv-char-count">{form.description.length}/1000</span>
            </div>
            <textarea
              id="lv-vault-desc"
              rows={3}
              className={`lv-form-textarea ${errors.description ? 'has-error' : ''}`}
              placeholder={t.descPlaceholder}
              value={form.description}
              onChange={(e) => handleChange('description', e.target.value)}
              disabled={isSubmitting}
              maxLength={1000}
              aria-invalid={errors.description ? 'true' : 'false'}
              aria-describedby={errors.description ? 'lv-vault-desc-error' : undefined}
            />
            {errors.description && (
              <span id="lv-vault-desc-error" className="lv-form-error" role="alert">
                {errors.description}
              </span>
            )}
          </div>

          {/* Status & Policy Banner */}
          <div className="lv-modal-policy-card">
            <div className="lv-policy-status-row">
              <span className="lv-policy-status-label">{t.statusNoticeLabel}</span>
              <StatusBadge status="ACTIVE" lang={lang} />
            </div>
            <p className="lv-policy-note">{t.ruleNotice}</p>
          </div>

          {/* Actions */}
          <div className="lv-modal-actions">
            <MagneticButton
              type="button"
              className="lv-btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
              maxOffset={4}
            >
              {t.cancelBtn}
            </MagneticButton>
            <MagneticButton
              type="submit"
              className="lv-btn-primary"
              disabled={isSubmitting}
              maxOffset={5}
            >
              {isSubmitting && <span className="lv-btn-spinner" aria-hidden="true" />}
              <span>{isSubmitting ? t.submittingBtn : t.submitBtn}</span>
              {!isSubmitting && <span className="lv-btn-arrow" aria-hidden="true">→</span>}
            </MagneticButton>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CreateVaultModal({ isOpen, ...props }) {
  if (!isOpen) return null;
  return <CreateVaultModalDialog {...props} />;
}
