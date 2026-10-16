import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  cancelAlertMessages,
  checkCancelAlertCapability,
  executeCancelAlert,
  getCancelAlertMessage,
} from '../../utils/cancelAlertService.js';
import './OwnerCancelAlert.css';

/**
 * OwnerCancelAlert — Component FE cho task PS-24 (Owner Cancel Alert)
 *
 * @param {Object} props
 * @param {'vi'|'en'} [props.lang='vi'] - Ngôn ngữ hiển thị
 * @param {string} [props.dmsStatus] - Trạng thái DMS hiện tại (ví dụ 'TRIGGERED')
 * @param {boolean} [props.canCancel] - Ghi đè capability trực tiếp từ cha/backend
 * @param {Function} [props.customCapability] - Hàm kiểm tra capability tùy biến
 * @param {boolean} [props.isOwner=true] - Người dùng có phải là Owner không
 * @param {boolean} [props.isDevPreview=false] - Cờ chế độ DEV preview
 * @param {string} [props.ownerId] - Định danh chủ sở hữu
 * @param {Function} [props.onCancelAlert] - Adapter thực thi hủy cảnh báo: (signal) => Promise<result>
 * @param {Function} [props.onSuccess] - Callback khi hủy thành công: (result) => void
 * @param {Function} [props.onRefreshRequired] - Callback yêu cầu tải lại trạng thái hệ thống: () => void | Promise<void>
 * @param {Function} [props.onUnauthorized] - Callback khi lỗi 401
 * @param {string} [props.className] - Class bổ sung
 */
export default function OwnerCancelAlert({
  lang = 'vi',
  dmsStatus,
  canCancel,
  customCapability,
  isOwner = true,
  isDevPreview = false,
  ownerId,
  onCancelAlert,
  onSuccess,
  onRefreshRequired,
  onUnauthorized,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(false);
  const [refreshErrorNotice, setRefreshErrorNotice] = useState(false);

  const isMountedRef = useRef(true);
  const pendingSubmitRef = useRef(false);
  const abortControllerRef = useRef(null);
  const activeRequestIdRef = useRef(0);
  const confirmBtnRef = useRef(null);
  const cancelBtnRef = useRef(null);
  const triggerBtnRef = useRef(null);
  const activeTimersRef = useRef(new Set());

  // Lưu trữ ngữ cảnh mới nhất trong ref để tránh stale closure sau await
  const latestContextRef = useRef({
    dmsStatus,
    canCancel,
    customCapability,
    isOwner,
    isDevPreview,
    ownerId,
  });

  useLayoutEffect(() => {
    latestContextRef.current = {
      dmsStatus,
      canCancel,
      customCapability,
      isOwner,
      isDevPreview,
      ownerId,
    };
  });

  useLayoutEffect(() => {
    return () => { abortControllerRef.current?.abort(); };
  }, [ownerId, dmsStatus, canCancel, customCapability, isOwner, isDevPreview, onCancelAlert]);

  const t = cancelAlertMessages[lang] || cancelAlertMessages.vi;

  // Helper quản lý timer an toàn
  const safeSetTimeout = useCallback((fn, delay) => {
    const timerId = setTimeout(() => {
      activeTimersRef.current.delete(timerId);
      if (isMountedRef.current) {
        fn();
      }
    }, delay);
    activeTimersRef.current.add(timerId);
    return timerId;
  }, []);

  const isEligible = checkCancelAlertCapability({
    status: dmsStatus,
    customCapability: typeof canCancel === 'boolean' ? canCancel : customCapability,
    isOwner,
    isDevPreview,
  });

  useEffect(() => {
    isMountedRef.current = true;
    const timers = activeTimersRef.current;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
    };
  }, []);

  const handleOpen = () => {
    if (!isEligible) return;
    setActionError(null);
    setActionSuccess(false);
    setRefreshErrorNotice(false);
    setIsOpen(true);
  };

  const handleClose = useCallback(() => {
    if (isSubmitting) return; // Chặn đóng khi đang pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsOpen(false);
    setActionError(null);
    setRefreshErrorNotice(false);

    // Trả lại focus cho nút kích hoạt
    safeSetTimeout(() => {
      triggerBtnRef.current?.focus();
    }, 30);
  }, [isSubmitting, safeSetTimeout]);

  // Quản lý Focus Trap và phím Escape trong modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isSubmitting) {
        e.preventDefault();
        handleClose();
        return;
      }

      // Focus trap giữa cancelBtn và confirmBtn
      if (e.key === 'Tab') {
        const firstEl = cancelBtnRef.current;
        const lastEl = confirmBtnRef.current;

        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl?.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl?.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, handleClose]);

  // Tự động focus vào nút xác nhận khi modal mở
  useEffect(() => {
    if (isOpen) {
      safeSetTimeout(() => {
        confirmBtnRef.current?.focus();
      }, 50);
    }
  }, [isOpen, safeSetTimeout]);

  const handleConfirmCancel = async () => {
    if (pendingSubmitRef.current || isSubmitting || actionSuccess) return; // Chống double-submit

    const ctxAtStart = latestContextRef.current;

    // 1. Kiểm tra lại capability ngay trước khi bắt đầu request
    if (!checkCancelAlertCapability({
      status: ctxAtStart.dmsStatus,
      customCapability: typeof ctxAtStart.canCancel === 'boolean' ? ctxAtStart.canCancel : ctxAtStart.customCapability,
      isOwner: ctxAtStart.isOwner,
      isDevPreview: ctxAtStart.isDevPreview,
    })) {
      setActionError('ACCESS_DENIED');
      return;
    }

    pendingSubmitRef.current = true;
    setIsSubmitting(true);
    setActionError(null);
    setRefreshErrorNotice(false);

    const requestId = ++activeRequestIdRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await executeCancelAlert({
        adapter: onCancelAlert,
        signal: controller.signal,
        lang,
        onUnauthorized,
        status: ctxAtStart.dmsStatus,
        customCapability: typeof ctxAtStart.canCancel === 'boolean' ? ctxAtStart.canCancel : ctxAtStart.customCapability,
        isOwner: ctxAtStart.isOwner,
        isDevPreview: ctxAtStart.isDevPreview,
      });

      // Nếu request này đã bị supersede bởi request mới hoặc component unmount
      if (!isMountedRef.current || requestId !== activeRequestIdRef.current || controller.signal.aborted) {
        return;
      }

      // 2. Kiểm tra lại capability sau await bằng ngữ cảnh mới nhất (tránh stale closure)
      const currentCtx = latestContextRef.current;
      const isStillAllowed = checkCancelAlertCapability({
        status: currentCtx.dmsStatus,
        customCapability: typeof currentCtx.canCancel === 'boolean' ? currentCtx.canCancel : currentCtx.customCapability,
        isOwner: currentCtx.isOwner,
        isDevPreview: currentCtx.isDevPreview,
      });

      // Nếu đối tượng thao tác hoặc quyền đã bị thay đổi trong lúc request đang bay -> bỏ response
      if (!isStillAllowed || currentCtx.ownerId !== ctxAtStart.ownerId || currentCtx.dmsStatus !== ctxAtStart.dmsStatus) {
        setActionError('INVALID_STATUS');
        return;
      }

      // 3. THAO TÁC HỦY TRÊN SERVER ĐÃ THÀNH CÔNG: Thiết lập UI thành công
      setActionSuccess(true);
      // Post-success callbacks cannot turn a completed server operation into a failure.
      for (const callback of [onSuccess, onRefreshRequired]) {
        if (typeof callback !== 'function') continue;
        try {
          await callback(result);
        } catch {
          if (isMountedRef.current && requestId === activeRequestIdRef.current && !controller.signal.aborted) {
            setRefreshErrorNotice(true);
          }
        }
        if (!isMountedRef.current || controller.signal.aborted) return;
      }

      safeSetTimeout(() => {
        if (isMountedRef.current && requestId === activeRequestIdRef.current) {
          setIsOpen(false);
          setActionSuccess(false);
          setRefreshErrorNotice(false);
          triggerBtnRef.current?.focus();
        }
      }, 800);
    } catch (err) {
      if (!isMountedRef.current || requestId !== activeRequestIdRef.current || controller.signal.aborted) {
        return;
      }
      if (err.name === 'AbortError') return;

      const codeOrStatus = err.code || err.status || 'GENERIC';
      setActionError(codeOrStatus);
    } finally {
      if (isMountedRef.current && requestId === activeRequestIdRef.current) {
        pendingSubmitRef.current = false;
        setIsSubmitting(false);
      }
    }
  };

  if (!isEligible) {
    return null;
  }

  return (
    <div className={`lv-cancel-alert-wrapper ${className}`}>
      {/* Nút kích hoạt mở hộp thoại xác nhận */}
      <button
        ref={triggerBtnRef}
        type="button"
        className="lv-cancel-alert-trigger-btn"
        onClick={handleOpen}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <span className="lv-cancel-alert-trigger-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <polyline points="9 12 11 14 15 10" />
          </svg>
        </span>
        <span className="lv-cancel-alert-trigger-text">{t.buttonLabel}</span>
      </button>

      {/* Hộp thoại xác nhận (Modal Dialog) */}
      {isOpen && createPortal(
        <div
          className="lv-cancel-alert-backdrop"
          role="presentation"
          onClick={handleClose}
        >
          <div
            className="lv-cancel-alert-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lv-cancel-alert-title"
            aria-describedby="lv-cancel-alert-desc"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header modal */}
            <div className="lv-cancel-alert-modal-header">
              <div className="lv-cancel-alert-modal-icon-badge" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div className="lv-cancel-alert-modal-title-col">
                <h3 id="lv-cancel-alert-title" className="lv-cancel-alert-modal-title">
                  {t.modalTitle}
                </h3>
              </div>
            </div>

            {/* Nội dung giải thích */}
            <div className="lv-cancel-alert-modal-body">
              <p id="lv-cancel-alert-desc" className="lv-cancel-alert-modal-desc">
                {t.modalDesc}
              </p>
              <div className="lv-cancel-alert-highlight-box">
                <span className="lv-cancel-alert-box-icon" aria-hidden="true">ℹ</span>
                <span className="lv-cancel-alert-box-text">{t.confirmQuestion}</span>
              </div>

              {/* Thông báo lỗi thao tác hủy trên server */}
              {actionError && (
                <div className="lv-cancel-alert-error-banner" role="alert">
                  <span className="lv-cancel-alert-error-icon" aria-hidden="true">⚠️</span>
                  <span>{getCancelAlertMessage(actionError, lang)}</span>
                </div>
              )}

              {/* Thông báo thành công hủy trên server */}
              {actionSuccess && (
                <div className="lv-cancel-alert-success-banner" role="status">
                  <span className="lv-cancel-alert-success-icon" aria-hidden="true">✓</span>
                  <span>{t.successNotice}</span>
                </div>
              )}

              {/* Cảnh báo riêng nếu làm mới dữ liệu sau đó chậm/gặp lỗi (không làm mất trạng thái thành công) */}
              {refreshErrorNotice && (
                <div className="lv-cancel-alert-warning-banner" role="status">
                  <span className="lv-cancel-alert-warning-icon" aria-hidden="true">ℹ</span>
                  <span>{lang === 'en' ? 'Alert cancelled, but page refresh encountered an issue. Please manually reload.' : 'Đã hủy cảnh báo nhưng việc tải lại dữ liệu gặp trục trặc. Vui lòng tải lại trang thủ công.'}</span>
                </div>
              )}
            </div>

            {/* Footer hành động */}
            <div className="lv-cancel-alert-modal-footer">
              <button
                ref={cancelBtnRef}
                type="button"
                className="lv-cancel-alert-btn lv-cancel-alert-btn-secondary"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                {t.cancelBtn}
              </button>

              <button
                ref={confirmBtnRef}
                type="button"
                className="lv-cancel-alert-btn lv-cancel-alert-btn-primary"
                onClick={handleConfirmCancel}
                disabled={isSubmitting || actionSuccess}
              >
                {isSubmitting ? (
                  <>
                    <span className="lv-cancel-alert-spinner" aria-hidden="true" />
                    <span>{t.confirmingBtn}</span>
                  </>
                ) : (
                  <span>{t.confirmBtn}</span>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
