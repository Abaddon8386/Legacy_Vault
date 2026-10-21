import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  fetchDmsConfig,
  saveDmsConfig,
  checkInDms,
  INTERVAL_PRESETS,
  DEFAULT_INTERVAL_DAYS,
  formatDmsDate,
  formatDmsInterval,
  validateDmsDuration,
  getDmsMessage,
} from '../../utils/dmsService.js';
import StatusBadge from '../../components/common/StatusBadge.jsx';
import ErrorState from '../../components/common/ErrorState.jsx';
import MagneticButton from '../../components/common/MagneticButton.jsx';
import OwnerCancelAlert from '../../components/dms/OwnerCancelAlert.jsx';
import './DMSOverviewPage.css';

export default function DMSOverviewPage({
  lang = 'vi',
  accessToken,
  ownerId,
  onUnauthorized,
  isDevPreview = false,
  showDevToolbar = false, // Kept for prop compatibility, but no toolbar is ever rendered
  onNavigateToLogin,
  onRefreshTrigger, // Numeric counter from parent context, used as dependency
  onRequestRefreshParent, // Optional callback function for refreshing parent/app state
  canCancelAlert,
  customCancelCapability,
  onCancelAlert,
  isOwner = true,
}) {
  const [dmsData, setDmsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Form states
  const [intervalInput, setIntervalInput] = useState(DEFAULT_INTERVAL_DAYS);
  const [hoursInput, setHoursInput] = useState('0');
  const [minutesInput, setMinutesInput] = useState('0');
  const syncedContextRef = useRef(null);
  const syncedRefreshTriggerRef = useRef(onRefreshTrigger);
  const syncedRefreshKeyRef = useRef(refreshKey);
  const activeOwnerIdRef = useRef(ownerId);
  const fetchRequestId = useRef(0);
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saveError, setSaveError] = useState('');
  const [isConfiguringNew, setIsConfiguringNew] = useState(false);

  // Check-in action states
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [checkInNotice, setCheckInNotice] = useState('');
  const [checkInError, setCheckInError] = useState('');

  // Info popover state
  const pendingSave = useRef(false);
  const pendingCheckIn = useRef(false);
  const active = useRef(true);
  const mutationController = useRef(null);
  useEffect(() => { active.current = true; return () => { active.current = false; mutationController.current?.abort(); }; }, []);

  const [showInfoPopover, setShowInfoPopover] = useState(false);
  const isDevPreviewActive = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const searchParams = new URLSearchParams(window.location.search);
    const hasPreview = searchParams.get('preview') === 'true';
    return Boolean(import.meta.env.DEV && !accessToken && (isDevPreview || showDevToolbar || hasPreview));
  }, [accessToken, isDevPreview, showDevToolbar]);

  // Data fetching with intelligent sync, race condition protection and context reset
  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();
    const currentRequestId = ++fetchRequestId.current;

    const currentContextKey = ownerId ?? '__default__';
    const isOwnerChanged = activeOwnerIdRef.current !== ownerId;
    if (isOwnerChanged) {
      activeOwnerIdRef.current = ownerId;
      // Cleanly reset inputs, errors and responses of previous owner/context
      setFieldErrors({});
      setSaveError('');
      setSaveSuccess('');
      setCheckInNotice('');
      setCheckInError('');
      setError(null);
      setDmsData(null);
      setIntervalInput(DEFAULT_INTERVAL_DAYS);
      setHoursInput('0');
      setMinutesInput('0');
    }

    const searchParams = new URLSearchParams(window.location.search);
    const hasPreview = searchParams.get('preview') === 'true';
    const isDevPreviewActive = Boolean(import.meta.env.DEV && !accessToken && (isDevPreview || showDevToolbar || hasPreview));
    const scenario = isDevPreviewActive ? (searchParams.get('scenario') || 'monitoring') : undefined;

    fetchDmsConfig({ scenario, isDevPreview: isDevPreviewActive, lang, accessToken, ownerId, signal: controller.signal })
      .then((data) => {
        if (!ignore && currentRequestId === fetchRequestId.current) {
          setDmsData(data ? { ...data, snapshotTimestamp: Date.now() } : null);
          const needsSync =
            syncedContextRef.current !== currentContextKey ||
            syncedRefreshTriggerRef.current !== onRefreshTrigger ||
            syncedRefreshKeyRef.current !== refreshKey;

          if (needsSync) {
            if (data && data.checkIntervalDays !== undefined && data.checkIntervalDays !== null) {
              setIntervalInput(data.checkIntervalDays);
              setHoursInput(String(data.checkIntervalHours ?? 0));
              setMinutesInput(String(data.checkIntervalMinutes ?? 0));
            }
            syncedContextRef.current = currentContextKey;
            syncedRefreshTriggerRef.current = onRefreshTrigger;
            syncedRefreshKeyRef.current = refreshKey;
          }
          setError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore && currentRequestId === fetchRequestId.current && err.name !== 'AbortError') {
          if (err.status === 401) { onUnauthorized?.(); return; }
          setError(err);
          setDmsData(null);
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [isDevPreview, showDevToolbar, lang, onRefreshTrigger, refreshKey, accessToken, ownerId, onUnauthorized]);


    const handleManualRetry = useCallback(() => {
    setLoading(true);
    setError(null);
    setRefreshKey((k) => k + 1);
  }, []);

  const handlePresetSelect = (days) => {
    setIntervalInput(days);
    setHoursInput('0');
    setMinutesInput('0');
    setFieldErrors({});
    setSaveError('');
  };

  const handleIntervalInputChange = (e) => {
    const val = e.target.value;
    setIntervalInput(val);
    if (fieldErrors.days || fieldErrors.duration || fieldErrors.check_interval_days) {
      const errs = validateDmsDuration({ days: val, hours: hoursInput, minutes: minutesInput }, lang);
      setFieldErrors(errs);
    }
  };

  const handleHoursInputChange = (e) => {
    const val = e.target.value;
    setHoursInput(val);
    if (fieldErrors.hours || fieldErrors.duration) {
      const errs = validateDmsDuration({ days: intervalInput, hours: val, minutes: minutesInput }, lang);
      setFieldErrors(errs);
    }
  };

  const handleMinutesInputChange = (e) => {
    const val = e.target.value;
    setMinutesInput(val);
    if (fieldErrors.minutes || fieldErrors.duration) {
      const errs = validateDmsDuration({ days: intervalInput, hours: hoursInput, minutes: val }, lang);
      setFieldErrors(errs);
    }
  };

  const handleSaveInterval = async (e) => {
    e.preventDefault();
    if (pendingSave.current || pendingCheckIn.current) return;
    const errors = validateDmsDuration({ days: intervalInput, hours: hoursInput, minutes: minutesInput }, lang);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    pendingSave.current = true;
    // A read started before this mutation must never replace its result.
    ++fetchRequestId.current;
    const controller = new AbortController(); mutationController.current = controller;
    setFieldErrors({});
    setIsSaving(true);
    setSaveError('');
    setSaveSuccess('');

    const searchParams = new URLSearchParams(window.location.search);
    const hasPreview = searchParams.get('preview') === 'true';
    const isDevPreviewActive = Boolean(import.meta.env.DEV && !accessToken && (isDevPreview || showDevToolbar || hasPreview));
    const scenario = isDevPreviewActive ? (searchParams.get('scenario') || 'monitoring') : undefined;

    try {
      const updated = await saveDmsConfig(
        { days: intervalInput, hours: hoursInput, minutes: minutesInput },
        {
          isDevPreview: isDevPreviewActive,
          scenario,
          lang, accessToken, ownerId, signal: controller.signal,
        }
      );
      if (!active.current || controller.signal.aborted) return;
      ++fetchRequestId.current;
      syncedContextRef.current = ownerId ?? '__default__';
      syncedRefreshTriggerRef.current = onRefreshTrigger;
      syncedRefreshKeyRef.current = refreshKey;
      setDmsData(updated ? { ...updated, snapshotTimestamp: Date.now() } : null);
      if (updated?.checkIntervalDays != null) setIntervalInput(updated.checkIntervalDays);
      if (updated?.checkIntervalHours != null) setHoursInput(String(updated.checkIntervalHours));
      if (updated?.checkIntervalMinutes != null) setMinutesInput(String(updated.checkIntervalMinutes));
      setIsConfiguringNew(false);
      setSaveSuccess('SAVED');
    } catch (err) {
      if (active.current && !controller.signal.aborted) {
        if (err.status === 401) { onUnauthorized?.(); return; }
        setSaveError(err.code || 'INTERNAL_ERROR');
      }
    } finally {
      pendingSave.current = false;
      if (active.current) setIsSaving(false);
    }
  };

  const handleCheckIn = async () => {
    if (pendingCheckIn.current || pendingSave.current) return;
    pendingCheckIn.current = true;
    ++fetchRequestId.current;
    const controller = new AbortController(); mutationController.current = controller;
    setIsCheckingIn(true);
    setCheckInNotice('');
    setCheckInError('');

    const searchParams = new URLSearchParams(window.location.search);
    const hasPreview = searchParams.get('preview') === 'true';
    const isDevPreviewActive = Boolean(import.meta.env.DEV && !accessToken && (isDevPreview || showDevToolbar || hasPreview));
    const scenario = isDevPreviewActive ? (searchParams.get('scenario') || 'monitoring') : undefined;

    try {
      const result = await checkInDms({
        isDevPreview: isDevPreviewActive,
        scenario,
        lang, accessToken, ownerId, signal: controller.signal,
      });
      if (!active.current || controller.signal.aborted) return;
      ++fetchRequestId.current;
      syncedContextRef.current = ownerId ?? '__default__';
      syncedRefreshTriggerRef.current = onRefreshTrigger;
      syncedRefreshKeyRef.current = refreshKey;
      setDmsData(result ? { ...result, snapshotTimestamp: Date.now() } : null);
      if (result?.checkIntervalDays != null) setIntervalInput(result.checkIntervalDays);
      if (result?.checkIntervalHours != null) setHoursInput(String(result.checkIntervalHours));
      if (result?.checkIntervalMinutes != null) setMinutesInput(String(result.checkIntervalMinutes));
      setCheckInNotice('CHECKED_IN');
    } catch (err) {
      if (active.current && !controller.signal.aborted) {
        if (err.status === 401) { onUnauthorized?.(); return; }
        setCheckInError(err.code || 'INTERNAL_ERROR');
      }
    } finally {
      pendingCheckIn.current = false;
      if (active.current) setIsCheckingIn(false);
    }
  };

  const handleResetForm = () => {
    if (dmsData && dmsData.checkIntervalDays != null) {
      setIntervalInput(dmsData.checkIntervalDays);
      setHoursInput(String(dmsData.checkIntervalHours ?? 0));
      setMinutesInput(String(dmsData.checkIntervalMinutes ?? 0));
    } else {
      setIntervalInput(DEFAULT_INTERVAL_DAYS);
      setHoursInput('0');
      setMinutesInput('0');
    }
    setFieldErrors({});
    setSaveError('');
  };

  // Localized field errors derived from current language and duration state
  const currentErrors = useMemo(() => {
    if (Object.keys(fieldErrors).length === 0) return {};
    return validateDmsDuration({ days: intervalInput, hours: hoursInput, minutes: minutesInput }, lang);
  }, [fieldErrors, intervalInput, hoursInput, minutesInput, lang]);

  const currentIntervalError = currentErrors.days || currentErrors.check_interval_days || currentErrors.duration || null;
  const firstErrorMsg = currentIntervalError || currentErrors.hours || currentErrors.minutes || null;

  // Calculate cycle progress if timestamps are valid
  const cycleProgress = useMemo(() => {
    if (!dmsData || !dmsData.lastCheckInAt || !dmsData.nextCheckAt) return null;
    const start = new Date(dmsData.lastCheckInAt).getTime();
    const end = new Date(dmsData.nextCheckAt).getTime();
    const refTime = dmsData.snapshotTimestamp;
    if (!refTime || isNaN(start) || isNaN(end) || end <= start) return null;
    if (refTime <= start) return 0;
    if (refTime >= end) return 100;
    return Math.min(100, Math.max(0, Math.round(((refTime - start) / (end - start)) * 100)));
  }, [dmsData]);

  // Animate progress bar from 0 to real percentage upon data load
  const [animatedProgress, setAnimatedProgress] = useState(0);

  useEffect(() => {
    if (cycleProgress !== null) {
      const timer = setTimeout(() => {
        setAnimatedProgress(cycleProgress);
      }, 70);
      return () => clearTimeout(timer);
    }
  }, [cycleProgress]);

  const content = {
    vi: {
      eyebrow: 'GIÁM SÁT HOẠT ĐỘNG ĐỊNH KỲ',
      pageTitle: "Giám sát hoạt động",
      pageSubtitle:
        'Thiết lập chu kỳ kiểm tra định kỳ để hệ thống theo dõi tín hiệu hiện diện và chủ động bảo vệ kho di sản của bạn.',
      infoBtnLabel: 'Thông tin bảo vệ di sản',
      infoPopoverTitle: 'Bảo vệ kho di sản số',
      infoPopoverText:
        'Quá hạn xác nhận hoạt động không đồng nghĩa với xác nhận qua đời và không tự động mở khóa kho di sản. Kho di sản vẫn được bảo vệ theo đúng quy tắc ủy quyền.',
      statusCardTitle: 'Trạng thái giám sát hiện hành',
      statusCardSub: 'Thông tin chu kỳ và các mốc thời gian kiểm tra sự sống',
      metricStatus: 'Trạng thái theo dõi',
      metricNextCheck: 'Hạn kiểm tra tiếp theo',
      metricNextCheckSub: 'Thời điểm cần gửi xác nhận hoạt động',
      metricInterval: 'Chu kỳ kiểm tra',
      metricIntervalSub: 'Tần suất giữa các lần kiểm tra',
      metricLastCheck: 'Xác nhận gần nhất',
      metricLastCheckSub: 'Ghi nhận tín hiệu kiểm tra trước đó',
      cycleProgressTitle: 'Tiến trình chu kỳ hiện tại',
      cycleProgressElapsed: 'Đã trôi qua',
      daysUnit: 'ngày',
      hoursUnit: 'giờ',
      minutesUnit: 'phút',
      daysLabel: 'Số ngày',
      hoursLabel: 'Số giờ',
      minutesLabel: 'Số phút',
      savingFeedback: 'Đang lưu cấu hình…',
      subDayNoteLive: 'Cấu hình chu kỳ theo giờ và phút đang chờ máy chủ hỗ trợ (PS-91). Phiên đăng nhập hiện tại chỉ lưu chu kỳ ngày nguyên.',
      demoNotice: 'Dữ liệu minh họa — chưa lưu lên máy chủ',
      actionCardTitle: 'Xác nhận hiện diện trực tuyến',
      actionCardSub: 'Gửi tín hiệu xác nhận để làm mới bộ đếm thời gian chu kỳ tiếp theo',
      checkInBtn: 'Xác nhận còn hoạt động',
      checkingInBtn: 'Đang xác nhận…',
      checkInDisabledTriggered: 'Chức năng tạm khóa trong thời gian kích hoạt quá hạn.',
      triggeredAlertTitle: 'Thông báo: Đã quá hạn xác nhận hoạt động',
      triggeredAlertDesc:
        'Đã quá hạn xác nhận hoạt động. Quá hạn xác nhận hoạt động không đồng nghĩa với xác nhận qua đời và không tự động mở khóa kho di sản.',
      triggeredDeadlinePrefix: 'Thời hạn ân hạn:',
      configCardTitle: 'Cấu hình chu kỳ kiểm tra',
      configCardSub:
        'Tùy chỉnh khoảng thời gian giữa các lần hệ thống yêu cầu bạn gửi tín hiệu xác nhận.',
      presetsLabel: 'Gợi ý chu kỳ đề xuất:',
      presetsHelper: 'Các mức ngày trên là gợi ý nhanh; bạn có thể tùy chọn số ngày phù hợp từ 1 đến 180 ngày.',
      inputLabel: 'Thời lượng chu kỳ:',
      inputHelper: 'Nhập ngày, giờ và phút nguyên; tổng lớn hơn 0 và tối đa 180 ngày. Giờ/phút chỉ mô phỏng khi máy chủ chưa hỗ trợ.',
      saveBtn: 'Lưu cấu hình chu kỳ',
      savingBtn: 'Đang lưu cấu hình…',
      resetBtn: 'Đặt lại',
      emptyBadge: 'CHƯA CẤU HÌNH',
      emptyTitle: 'Chưa cấu hình chu kỳ kiểm tra',
      emptyDesc:
        'Kho di sản chưa được thiết lập lịch kiểm tra hoạt động định kỳ. Hãy thiết lập chu kỳ để hệ thống bắt đầu theo dõi các mốc check-in của bạn.',
      emptyAction: 'Thiết lập chu kỳ ngay',
      policyFootnote:
        'Quá hạn xác nhận hoạt động không đồng nghĩa với xác nhận qua đời và không tự động mở khóa kho di sản.',
    },
    en: {
      eyebrow: 'PERIODIC ACTIVITY MONITORING',
      pageTitle: "Dead Man's Switch (Activity Monitor)",
      pageSubtitle:
        'Configure periodic check-in intervals to monitor presence signals and safeguard your heritage vault.',
      infoBtnLabel: 'Heritage Protection Info',
      infoPopoverTitle: 'Heritage Vault Protection',
      infoPopoverText:
        'Check-in expiration does not signify owner decease and does not automatically unlock the heritage vault. The vault remains protected under configured authorization rules.',
      statusCardTitle: 'Current Vitality Status',
      statusCardSub: 'Monitoring schedule and countdown threshold parameters',
      metricStatus: 'Monitoring Status',
      metricNextCheck: 'Next Check-in Deadline',
      metricNextCheckSub: 'Scheduled time for vitality confirmation prompt',
      metricInterval: 'Check-in Interval',
      metricIntervalSub: 'Countdown frequency between periodic checks',
      metricLastCheck: 'Last Activity Confirmed',
      metricLastCheckSub: 'Previous successful presence verification',
      cycleProgressTitle: 'Current Cycle Progress',
      cycleProgressElapsed: 'Elapsed',
      daysUnit: 'days',
      hoursUnit: 'hours',
      minutesUnit: 'minutes',
      daysLabel: 'Days',
      hoursLabel: 'Hours',
      minutesLabel: 'Minutes',
      savingFeedback: 'Saving configuration…',
      subDayNoteLive: 'Hour and minute intervals are awaiting backend support (PS-91). The current session only saves whole days.',
      demoNotice: 'Demo data — not saved to the server',
      actionCardTitle: 'Online Vitality Confirmation',
      actionCardSub: 'Transmit an active presence signal to refresh your upcoming check-in timer',
      checkInBtn: "Confirm Vitality (I'm active)",
      checkingInBtn: 'Confirming…',
      checkInDisabledTriggered: 'Temporarily disabled during overdue grace period.',
      triggeredAlertTitle: 'Notice: Vitality Check-in Overdue',
      triggeredAlertDesc:
        'Vitality confirmation is overdue. Check-in expiration does not signify owner decease and does not automatically unlock the heritage vault.',
      triggeredDeadlinePrefix: 'Grace period deadline:',
      configCardTitle: 'Configure Check-in Interval',
      configCardSub:
        'Customize the duration between required activity check-in confirmations.',
      presetsLabel: 'Suggested Presets:',
      presetsHelper: 'The presets above are quick suggestions; you can enter any custom day count from 1 to 180 days.',
      inputLabel: 'Check-in interval:',
      inputHelper: 'Enter whole days, hours and minutes; total must exceed zero and not exceed 180 days. Sub-day intervals are demo-only pending server support.',
      saveBtn: 'Save Interval Settings',
      savingBtn: 'Saving Settings…',
      resetBtn: 'Reset',
      emptyBadge: 'NOT CONFIGURED',
      emptyTitle: 'Check-in Interval Not Configured',
      emptyDesc:
        'Your heritage vault currently has no active check-in schedule. Configure an interval to begin tracking your scheduled check-ins.',
      emptyAction: 'Configure Interval Now',
      policyFootnote:
        'Check-in expiration does not signify owner decease and does not automatically unlock the heritage vault.',
    },
  };

  const t = content[lang] || content.vi;

  // Render Loading State
  if (loading) {
    return (
      <div className="lv-dms-page">
        <div className="lv-dms-skeleton" role="status" aria-busy="true" aria-live="polite">
          <span>{lang === 'en' ? 'Loading activity monitoring…' : 'Đang tải thông tin giám sát hoạt động…'}</span>
          <div aria-hidden="true" /><div aria-hidden="true" />
        </div>
      </div>
    );
  }

  // Render Error State
  if (error) {
    return (
      <div className="lv-dms-page">
        <ErrorState
          error={error}
          onRetry={handleManualRetry}
          onNavigateToLogin={onNavigateToLogin}
          lang={lang}
        />
      </div>
    );
  }

  const isTriggered = dmsData && dmsData.status === 'TRIGGERED';
  const isNotConfigured = !dmsData || dmsData.status === 'DISABLED' || dmsData.status === 'NOT_CONFIGURED';

  return (
    <div className="lv-dms-page">
      {/* Toast / Action Notice */}
      {checkInNotice && (
        <div className="lv-dms-toast-notice lv-dms-stagger" style={{ '--stagger': 0 }} role="status" aria-live="polite">
          <span className="lv-dms-toast-icon" aria-hidden="true">✓</span>
          <span>{getDmsMessage(checkInNotice, lang)}</span>
        </div>
      )}

      {checkInError && (
        <div className="lv-dms-toast-error lv-dms-stagger" style={{ '--stagger': 0 }} role="alert" aria-live="polite">
          <span className="lv-dms-toast-icon" aria-hidden="true">!</span>
          <span>{getDmsMessage(checkInError, lang)}</span>
        </div>
      )}

      {/* Page Header */}
      <header className="lv-dms-header lv-dms-stagger" style={{ '--stagger': 0 }}>
        <div className="lv-dms-header-top-row">
          <div className="lv-dms-header-titles">
            <div className="lv-dms-title-row">
              <h1 className="lv-dms-title">{t.pageTitle}</h1>
              {/* Discrete Info Popover Toggle */}
              <div className="lv-dms-info-wrap">
                <button
                  type="button"
                  className="lv-dms-info-trigger"
                  onClick={() => setShowInfoPopover((prev) => !prev)}
                  aria-expanded={showInfoPopover}
                  aria-label={t.infoBtnLabel}
                  title={t.infoBtnLabel}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span className="lv-dms-info-btn-text">{t.infoBtnLabel}</span>
                </button>

                {showInfoPopover && (
                  <div className="lv-dms-info-popover" role="dialog" aria-label={t.infoPopoverTitle}>
                    <div className="lv-dms-info-popover-header">
                      <span className="lv-dms-info-popover-title">
                        <span aria-hidden="true">🛡️</span> {t.infoPopoverTitle}
                      </span>
                      <button
                        type="button"
                        className="lv-dms-info-popover-close"
                        onClick={() => setShowInfoPopover(false)}
                        aria-label={lang === 'en' ? 'Close' : 'Đóng'}
                      >
                        ✕
                      </button>
                    </div>
                    <p className="lv-dms-info-popover-text">{t.infoPopoverText}</p>
                  </div>
                )}
              </div>
            </div>
            <p className="lv-dms-subtitle">{lang === 'en' ? 'Your check-in schedule and activity confirmations.' : 'Theo dõi lịch kiểm tra và xác nhận bạn vẫn đang hoạt động.'}</p>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      {isNotConfigured && !isConfiguringNew ? (
        <section className="lv-dms-empty-panel lv-dms-stagger" style={{ '--stagger': 1 }} aria-label={t.emptyTitle}>
          <div className="lv-dms-empty-icon-wrap" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <span className="lv-dms-empty-badge">{t.emptyBadge}</span>
          <h2 className="lv-dms-empty-heading">{t.emptyTitle}</h2>
          <p className="lv-dms-empty-desc">{t.emptyDesc}</p>
          <MagneticButton
            type="button"
            className="lv-dms-empty-cta"
            onClick={() => setIsConfiguringNew(true)}
            maxOffset={3}
          >
            <span>{t.emptyAction}</span>
            <span aria-hidden="true">→</span>
          </MagneticButton>
        </section>
      ) : (
        <div className="lv-dms-content-grid">
          {/* Status Overview Card */}
          {dmsData && (
            <section className="lv-dms-card lv-dms-stagger" style={{ '--stagger': 1 }} aria-labelledby="dms-overview-heading">
              <div className="lv-dms-card-header">
                <div className="lv-dms-card-heading-group">
                  <div className="lv-dms-card-icon-wrap" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                  <div>
                    <h2 id="dms-overview-heading" className="lv-dms-card-title">
                      {t.statusCardTitle}
                    </h2>
                    <p className="lv-dms-card-subtitle">{t.statusCardSub}</p>
                  </div>
                </div>
                <div className="lv-dms-badge-group">
                  <div className="lv-dms-status-badge-wrap">
                    <StatusBadge status={dmsData.status} lang={lang} />
                  </div>
                  {(dmsData.isSimulation || isDevPreviewActive) && (
                    <span className="lv-dms-simulation-tag">{t.demoNotice}</span>
                  )}
                </div>
              </div>

      {/* TRIGGERED / GRACE PERIOD Alert Banner */}
      {isTriggered && (
        <section className="lv-dms-triggered-banner lv-dms-stagger" style={{ '--stagger': 1 }} role="alert" aria-live="polite">
          <div className="lv-dms-triggered-icon" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div className="lv-dms-triggered-content">
            <h2 className="lv-dms-triggered-title">{t.triggeredAlertTitle}</h2>
            <p className="lv-dms-triggered-desc">{t.triggeredAlertDesc}</p>
            <div className="lv-dms-triggered-actions-row">
              {dmsData.graceDeadline && (
                <span className="lv-dms-triggered-deadline-tag">
                  {t.triggeredDeadlinePrefix} {formatDmsDate(dmsData.graceDeadline, lang)}
                </span>
              )}
              {/* PS-24: Owner Cancel Alert action */}
              <OwnerCancelAlert
                lang={lang}
                dmsStatus={dmsData.status}
                canCancel={canCancelAlert}
                customCapability={customCancelCapability}
                isOwner={isOwner}
                isDevPreview={isDevPreview}
                ownerId={dmsData?.ownerId || ownerId}
                onCancelAlert={onCancelAlert}
                onSuccess={() => {
                  setCheckInNotice('SUCCESS');
                }}
                onRefreshRequired={() => {
                  handleManualRetry();
                  if (typeof onRequestRefreshParent === 'function') {
                    return onRequestRefreshParent();
                  }
                }}
                onUnauthorized={onUnauthorized}
              />
            </div>
          </div>
        </section>
      )}


              {/* Read-Only Summary Metric Cards */}
              <div className="lv-dms-metrics-grid">
                {/* Metric 2: Next Check-in Deadline */}
                <div className="lv-dms-metric-item">
                  <span className="lv-dms-metric-label">{t.metricNextCheck}</span>
                  <div className="lv-dms-metric-value-row">
                    <span className="lv-dms-metric-value">
                      {formatDmsDate(dmsData.nextCheckAt, lang)}
                    </span>
                  </div>
                  <span className="lv-dms-metric-sub">{t.metricNextCheckSub}</span>
                </div>

                {/* Metric 3: Current Interval */}
                <div className="lv-dms-metric-item">
                  <span className="lv-dms-metric-label">{t.metricInterval}</span>
                  <div className="lv-dms-metric-value-row">
                    <span className="lv-dms-metric-value">
                      {dmsData.checkIntervalDays || dmsData.checkIntervalHours || dmsData.checkIntervalMinutes
                        ? formatDmsInterval(dmsData, lang)
                        : '—'}
                    </span>
                  </div>
                  <span className="lv-dms-metric-sub">{t.metricIntervalSub}</span>
                </div>

                {/* Metric 4: Last Check-in Time */}
                <div className="lv-dms-metric-item">
                  <span className="lv-dms-metric-label">{t.metricLastCheck}</span>
                  <div className="lv-dms-metric-value-row">
                    <span className="lv-dms-metric-value">
                      {formatDmsDate(dmsData.lastCheckInAt, lang)}
                    </span>
                  </div>
                  <span className="lv-dms-metric-sub">{t.metricLastCheckSub}</span>
                </div>
              </div>

            <div className="lv-dms-action-card" role="group" aria-labelledby="dms-action-heading">
              <div className="lv-dms-action-card-inner">
                <div className="lv-dms-action-text-col">
                  <div className="lv-dms-action-icon-wrap" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </div>
                  <div>
                    <h2 id="dms-action-heading" className="lv-dms-action-title">
                      {t.actionCardTitle}
                    </h2>
                    <p className="lv-dms-action-sub">
                      {isTriggered ? t.checkInDisabledTriggered : t.actionCardSub}
                    </p>
                  </div>
                </div>

                <div className="lv-dms-action-button-col">
                  <MagneticButton
                    type="button"
                    className={`lv-dms-checkin-btn ${isTriggered ? 'is-disabled' : ''}`}
                    onClick={handleCheckIn}
                    disabled={isCheckingIn || isTriggered}
                    maxOffset={3}
                    aria-label={t.checkInBtn}
                  >
                    {isCheckingIn && <span className="lv-btn-spinner" aria-hidden="true" />}
                    <span>{isCheckingIn ? t.checkingInBtn : t.checkInBtn}</span>
                  </MagneticButton>
                </div>
              </div>
            </div>

              {/* Cycle Timeline / Progress Indicator with visible animation */}
              {cycleProgress !== null && (
                <div className="lv-dms-cycle-timeline">
                  <div className="lv-dms-cycle-timeline-header">
                    <span className="lv-dms-cycle-timeline-label">{t.cycleProgressTitle}</span>
                    <span className="lv-dms-cycle-timeline-percent">{cycleProgress}% {t.cycleProgressElapsed}</span>
                  </div>
                  <div
                    className="lv-dms-cycle-progress-track"
                    role="progressbar"
                    aria-valuenow={cycleProgress}
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-label={t.cycleProgressTitle}
                  >
                    <div
                      className="lv-dms-cycle-progress-bar"
                      style={{ width: `${animatedProgress}%` }}
                    />
                  </div>
                  <div className="lv-dms-cycle-timeline-bounds">
                    <span>{formatDmsDate(dmsData.lastCheckInAt, lang)}</span>
                    <span>{formatDmsDate(dmsData.nextCheckAt, lang)}</span>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Configure Interval Form Card */}
          <section className="lv-dms-card lv-dms-config-card lv-dms-stagger" style={{ '--stagger': 3 }} aria-labelledby="dms-config-heading">
            <div className="lv-dms-card-header">
              <div className="lv-dms-card-heading-group">
                <div className="lv-dms-card-icon-wrap" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </div>
                <div>
                  <h2 id="dms-config-heading" className="lv-dms-card-title">
                    {t.configCardTitle}
                  </h2>
                  <p className="lv-dms-card-subtitle">{t.configCardSub}</p>
                </div>
              </div>
            </div>

            {/* Notification Banners */}
            {saveSuccess && (
              <div className="lv-dms-banner-success" role="status" aria-live="polite">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{getDmsMessage(saveSuccess, lang)}</span>
              </div>
            )}

            {saveError && (
              <div className="lv-dms-banner-error" role="alert" aria-live="polite">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{getDmsMessage(saveError, lang)}</span>
              </div>
            )}

            <form className="lv-dms-form-group" onSubmit={handleSaveInterval} noValidate>
              {/* Recommended Presets */}
              <div className="lv-dms-presets-section">
                <div className="lv-dms-presets-header">
                  <span className="lv-dms-presets-label">{t.presetsLabel}</span>
                  <span className="lv-dms-presets-hint">{t.presetsHelper}</span>
                </div>
                <div className="lv-dms-presets-grid" role="group" aria-label={t.presetsLabel}>
                  {INTERVAL_PRESETS.map((preset) => {
                    const isActive = Number(intervalInput) === preset.days;
                    return (
                      <button
                        key={preset.days}
                        type="button"
                        className={`lv-dms-preset-pill ${isActive ? 'is-active' : ''}`}
                        onClick={() => handlePresetSelect(preset.days)}
                        aria-pressed={isActive}
                      >
                        {lang === 'vi' ? preset.labelVi : preset.labelEn}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Input & Action Cluster */}
              {/* Custom Duration Inputs & Action Cluster */}
              <div className="lv-dms-input-cluster">
                <div className="lv-dms-duration-wrapper">
                  <span className="lv-dms-duration-title">{t.inputLabel}</span>
                  <div className="lv-dms-duration-grid">
                    {/* Ô Ngày */}
                    <div className="lv-dms-input-col">
                      <label htmlFor="dms-interval-input" className="lv-dms-input-sublabel">
                        {t.daysLabel}
                      </label>
                      <div className="lv-dms-input-wrap">
                        <input
                          id="dms-interval-input"
                          name="check_interval_days"
                          type="number"
                          min="0"
                          max="180"
                          step="1"
                          className={`lv-dms-input ${currentErrors.days || currentErrors.check_interval_days || currentErrors.duration ? 'is-invalid' : ''}`}
                          value={intervalInput}
                          onChange={handleIntervalInputChange}
                          disabled={isSaving}
                          aria-invalid={Boolean(currentErrors.days || currentErrors.check_interval_days || currentErrors.duration)}
                          aria-describedby={firstErrorMsg ? 'dms-interval-error' : 'dms-interval-helper'}
                        />
                        <span className="lv-dms-input-unit">{t.daysUnit}</span>
                      </div>
                    </div>

                    {/* Ô Giờ */}
                    <div className="lv-dms-input-col">
                      <label htmlFor="dms-interval-hours-input" className="lv-dms-input-sublabel">
                        {t.hoursLabel}
                      </label>
                      <div className="lv-dms-input-wrap">
                        <input
                          id="dms-interval-hours-input"
                          name="check_interval_hours"
                          type="number"
                          min="0"
                          max="23"
                          step="1"
                          className={`lv-dms-input ${currentErrors.hours ? 'is-invalid' : ''}`}
                          value={hoursInput}
                          onChange={handleHoursInputChange}
                          disabled={isSaving}
                          aria-invalid={Boolean(currentErrors.hours)}
                          aria-describedby={firstErrorMsg ? 'dms-interval-error' : 'dms-interval-helper'}
                        />
                        <span className="lv-dms-input-unit">{t.hoursUnit}</span>
                      </div>
                    </div>

                    {/* Ô Phút */}
                    <div className="lv-dms-input-col">
                      <label htmlFor="dms-interval-minutes-input" className="lv-dms-input-sublabel">
                        {t.minutesLabel}
                      </label>
                      <div className="lv-dms-input-wrap">
                        <input
                          id="dms-interval-minutes-input"
                          name="check_interval_minutes"
                          type="number"
                          min="0"
                          max="59"
                          step="1"
                          className={`lv-dms-input ${currentErrors.minutes ? 'is-invalid' : ''}`}
                          value={minutesInput}
                          onChange={handleMinutesInputChange}
                          disabled={isSaving}
                          aria-invalid={Boolean(currentErrors.minutes)}
                          aria-describedby={firstErrorMsg ? 'dms-interval-error' : 'dms-interval-helper'}
                        />
                        <span className="lv-dms-input-unit">{t.minutesUnit}</span>
                      </div>
                    </div>
                  </div>

                  {firstErrorMsg ? (
                    <span id="dms-interval-error" className="lv-dms-field-error" role="alert">
                      {firstErrorMsg}
                    </span>
                  ) : (
                    <span id="dms-interval-helper" className="lv-dms-input-helper">
                      {t.inputHelper}
                    </span>
                  )}

                  {/* Cảnh báo chu kỳ dưới 24h / giờ phút lẻ khi dùng phiên thật chờ BE PS-91 */}
                  {accessToken && (Number(hoursInput) > 0 || Number(minutesInput) > 0) && (
                    <div className="lv-dms-subday-notice" role="note">
                      <span aria-hidden="true">ℹ️</span> {t.subDayNoteLive}
                    </div>
                  )}

                  {/* Thanh chờ không xác định khi đang lưu cấu hình */}
                  {isSaving && (
                    <div
                      className="lv-dms-save-feedback-area"
                      role="status"
                      aria-live="polite"
                      aria-busy="true"
                    >
                      <div className="lv-dms-save-progress-track">
                        <div className="lv-dms-save-progress-bar" />
                      </div>
                      <div className="lv-dms-save-feedback-label">
                        <span className="lv-btn-spinner" aria-hidden="true" />
                        <span>{t.savingFeedback}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="lv-dms-form-actions">
                  <MagneticButton
                    type="submit"
                    className="lv-dms-submit-btn"
                    disabled={isSaving}
                    maxOffset={2}
                  >
                    {isSaving && <span className="lv-btn-spinner" aria-hidden="true" />}
                    <span>{isSaving ? t.savingBtn : t.saveBtn}</span>
                  </MagneticButton>
                  <button
                    type="button"
                    className="lv-dms-reset-btn"
                    onClick={handleResetForm}
                    disabled={isSaving}
                  >
                    {t.resetBtn}
                  </button>
                </div>
              </div>
            </form>
          </section>

          {/* Quiet, refined Policy Footer */}
          <footer className="lv-dms-policy-footer lv-dms-stagger" style={{ '--stagger': 4 }}>
            <p className="lv-dms-policy-text">
              <span className="lv-dms-policy-shield" aria-hidden="true">🛡️</span>{' '}
              {t.policyFootnote}
            </p>
          </footer>
        </div>
      )}
    </div>
  );
}
