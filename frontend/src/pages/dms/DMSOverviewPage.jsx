import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
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
import OwnerLiveCancelAlert from '../../components/dms/OwnerLiveCancelAlert.jsx';
import DmsGraceSettings from '../../components/dms/DmsGraceSettings.jsx';
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
  graceActions,
}) {
  const [dmsData, setDmsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [clockNow, setClockNow] = useState(() => Date.now());

  // Form states
  const [intervalInput, setIntervalInput] = useState(DEFAULT_INTERVAL_DAYS);
  const [hoursInput, setHoursInput] = useState('0');
  const [minutesInput, setMinutesInput] = useState('0');
  const syncedContextRef = useRef(null);
  const syncedRefreshTriggerRef = useRef(onRefreshTrigger);
  const syncedRefreshKeyRef = useRef(refreshKey);
  const activeOwnerIdRef = useRef(ownerId);
  const latestAccessTokenRef = useRef(accessToken);
  const latestLangRef = useRef(lang);
  const onUnauthorizedRef = useRef(onUnauthorized);
  const isPollingActiveRef = useRef(false);
  const pollAbortControllerRef = useRef(null);
  const visibilityAbortControllerRef = useRef(null);
  const mutationSeqRef = useRef(0);
  const fetchRequestId = useRef(0);
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSavingGrace, setIsSavingGrace] = useState(false);
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
  useLayoutEffect(() => {
    latestAccessTokenRef.current = accessToken;
    latestLangRef.current = lang;
    onUnauthorizedRef.current = onUnauthorized;
  }, [accessToken, lang, onUnauthorized]);
  const mutationController = useRef(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      mutationController.current?.abort();
      pollAbortControllerRef.current?.abort();
      visibilityAbortControllerRef.current?.abort();
    };
  }, []);

  // Progress and grace-period eligibility are derived from server timestamps, with
  // one page-scoped clock. The interval is cleaned up on unmount/remount.
  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const [showInfoPopover, setShowInfoPopover] = useState(false);
  const isDevPreviewActive = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const searchParams = new URLSearchParams(window.location.search);
    const hasPreview = searchParams.get('preview') === 'true';
    return Boolean(import.meta.env.DEV && !accessToken && (isDevPreview || showDevToolbar || hasPreview));
  }, [accessToken, isDevPreview, showDevToolbar]);

  // Once the backend deadline has passed, the displayed status can remain the
  // old MONITORING snapshot until its scheduler runs. Poll for the authoritative
  // backend transition so the overdue notice appears without leaving this page.
  const deadlineReached = dmsData?.status === 'MONITORING' &&
    Number.isFinite(Date.parse(dmsData.nextCheckAt || '')) &&
    clockNow >= Date.parse(dmsData.nextCheckAt);
  const awaitingGraceDeadline = dmsData?.status === 'TRIGGERED' && !dmsData.graceDeadline;
  const graceExpired = (dmsData?.status === 'TRIGGERED' || dmsData?.status === 'GRACE_PERIOD_EXCEEDED') &&
    Number.isFinite(Date.parse(dmsData?.graceDeadline || '')) &&
    clockNow >= Date.parse(dmsData.graceDeadline);
  const needsPolling = Boolean((deadlineReached || awaitingGraceDeadline || graceExpired) && !isDevPreviewActive);

  // Data fetching with intelligent sync, race condition protection and context reset
  useEffect(() => {
    let ignore = false;
    const currentContextKey = ownerId ?? '__default__';
    const isOwnerChanged = activeOwnerIdRef.current !== ownerId;
    if (isOwnerChanged) {
      activeOwnerIdRef.current = ownerId;
      pollAbortControllerRef.current?.abort();
      visibilityAbortControllerRef.current?.abort();
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

    const isExplicitRefresh =
      syncedContextRef.current !== currentContextKey ||
      syncedRefreshTriggerRef.current !== onRefreshTrigger ||
      syncedRefreshKeyRef.current !== refreshKey;

    // Avoid overlapping duplicate fetch when background polling is already active for the current owner:
    // the polling effect reacts to accessToken/ownerId directly and restarts the poll cycle cleanly.
    if (!isOwnerChanged && !isExplicitRefresh && needsPolling) {
      return undefined;
    }

    const controller = new AbortController();
    const currentRequestId = ++fetchRequestId.current;
    const reqToken = accessToken;
    const reqOwnerId = ownerId;

    fetchDmsConfig({ scenario, isDevPreview: isDevPreviewActive, lang, accessToken: reqToken, ownerId: reqOwnerId, signal: controller.signal })
      .then((data) => {
        if (
          !ignore &&
          !controller.signal.aborted &&
          currentRequestId === fetchRequestId.current &&
          activeOwnerIdRef.current === reqOwnerId &&
          latestAccessTokenRef.current === reqToken
        ) {
          setDmsData(data ? { ...data, snapshotTimestamp: Date.now() } : null);
          const needsSync =
            syncedContextRef.current !== currentContextKey ||
            syncedRefreshTriggerRef.current !== onRefreshTrigger ||
            syncedRefreshKeyRef.current !== refreshKey;

          if (needsSync) {
            if (data) {
              const d = data.days !== undefined ? data.days : (data.checkIntervalDays != null ? data.checkIntervalDays : Math.floor((data.checkIntervalMinutes || 0) / 1440));
              const h = data.hours !== undefined ? data.hours : (data.checkIntervalHours != null ? data.checkIntervalHours : Math.floor(((data.checkIntervalMinutes || 0) % 1440) / 60));
              const m = data.minutes !== undefined ? data.minutes : (data.checkIntervalHours != null ? data.checkIntervalMinutes : ((data.checkIntervalMinutes || 0) % 60));
              setIntervalInput(d);
              setHoursInput(String(h));
              setMinutesInput(String(m));
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
        if (
          !ignore &&
          !controller.signal.aborted &&
          currentRequestId === fetchRequestId.current &&
          err.name !== 'AbortError' &&
          activeOwnerIdRef.current === reqOwnerId &&
          latestAccessTokenRef.current === reqToken
        ) {
          if (err.status === 401) { onUnauthorizedRef.current?.(); return; }
          setError(err);
          setDmsData(null);
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [isDevPreview, showDevToolbar, lang, onRefreshTrigger, refreshKey, accessToken, ownerId, needsPolling]);

  useEffect(() => {
    if (!needsPolling) {
      isPollingActiveRef.current = false;
      pollAbortControllerRef.current?.abort();
      pollAbortControllerRef.current = null;
      return undefined;
    }

    isPollingActiveRef.current = true;
    let stopped = false;
    let timeoutId = null;
    let reqController = null;

    const scheduleNextPoll = (delayMs = 3000) => {
      if (stopped || !active.current) return;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(pollStatus, delayMs);
    };

    const pollStatus = async () => {
      timeoutId = null;
      if (stopped || !active.current) return;
      // Wait if a local mutation is currently in-flight so poll and mutation never overlap
      if (pendingSave.current || pendingCheckIn.current) {
        scheduleNextPoll(1000);
        return;
      }

      const pollMutationSeq = mutationSeqRef.current;
      const pollToken = accessToken;
      const pollOwnerId = ownerId;
      const pollLang = latestLangRef.current;

      reqController?.abort();
      reqController = new AbortController();
      pollAbortControllerRef.current = reqController;
      const currentController = reqController;

      try {
        const latest = await fetchDmsConfig({
          lang: pollLang,
          accessToken: pollToken,
          ownerId: pollOwnerId,
          signal: currentController.signal,
        });
        if (stopped || !active.current) return;
        if (activeOwnerIdRef.current !== pollOwnerId || latestAccessTokenRef.current !== pollToken) {
          // Account or token changed; the effect cleanup + re-run handles starting the new token's poll cycle.
          return;
        }
        if (currentController.signal.aborted || mutationSeqRef.current !== pollMutationSeq) {
          // Stale response from before a local mutation (save interval, grace, check-in, etc.)
          // Drop this stale response, but continue polling if this effect is still active!
          scheduleNextPoll(3000);
          return;
        }
        if (latest) {
          const triggerHasDeadline = latest.status !== 'TRIGGERED' || Boolean(latest.graceDeadline);
          if (triggerHasDeadline) setDmsData({ ...latest, snapshotTimestamp: Date.now() });
          // Poll while waiting for server state transition to take effect
          const stillNeedsPolling = latest.status === 'MONITORING' || !triggerHasDeadline ||
            (latest.status === 'TRIGGERED' && Number.isFinite(Date.parse(latest.graceDeadline || '')) && Date.now() >= Date.parse(latest.graceDeadline));
          if (stillNeedsPolling) scheduleNextPoll(3000);
        } else {
          setDmsData(null);
        }
      } catch (err) {
        if (stopped || !active.current) return;
        if (activeOwnerIdRef.current !== pollOwnerId || latestAccessTokenRef.current !== pollToken) {
          return;
        }
        if (err.name === 'AbortError' || currentController.signal.aborted) {
          // Aborted by an in-page mutation/retry while effect is still active: keep polling schedule alive
          if (!stopped && active.current) {
            scheduleNextPoll(3000);
          }
          return;
        }
        if (err.status === 401) {
          stopped = true;
          isPollingActiveRef.current = false;
          currentController.abort();
          if (activeOwnerIdRef.current === pollOwnerId && latestAccessTokenRef.current === pollToken) {
            onUnauthorizedRef.current?.();
          }
          return;
        }
        scheduleNextPoll(4000);
      } finally {
        if (pollAbortControllerRef.current === currentController) {
          pollAbortControllerRef.current = null;
        }
      }
    };

    scheduleNextPoll(0);
    return () => {
      stopped = true;
      isPollingActiveRef.current = false;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      reqController?.abort();
      if (pollAbortControllerRef.current === reqController) {
        pollAbortControllerRef.current = null;
      }
    };
  }, [needsPolling, accessToken, ownerId]);

  // Tab visibility and focus listener: refresh immediately if expired/overdue upon returning
  useEffect(() => {
    if (isDevPreviewActive) return undefined;
    const handleVisibilityOrFocus = () => {
      setClockNow(Date.now());
      if (document.visibilityState === 'visible') {
        // Skip duplicate overlapping request if background polling loop is actively running
        if (isPollingActiveRef.current) return;

        const isOverdue = (dmsData?.status === 'MONITORING' && Number.isFinite(Date.parse(dmsData?.nextCheckAt || '')) && Date.now() >= Date.parse(dmsData.nextCheckAt)) ||
          (dmsData?.status === 'TRIGGERED' && (!dmsData.graceDeadline || (Number.isFinite(Date.parse(dmsData.graceDeadline)) && Date.now() >= Date.parse(dmsData.graceDeadline))));
        if (isOverdue) {
          // Abort previous in-flight visibility request before launching a fresh check
          visibilityAbortControllerRef.current?.abort();
          const controller = new AbortController();
          visibilityAbortControllerRef.current = controller;

          const reqToken = latestAccessTokenRef.current;
          const reqOwnerId = activeOwnerIdRef.current;
          const reqLang = latestLangRef.current;
          const reqMutationSeq = mutationSeqRef.current;

          fetchDmsConfig({ lang: reqLang, accessToken: reqToken, ownerId: reqOwnerId, signal: controller.signal })
            .then(latest => {
              if (!active.current || controller.signal.aborted) return;
              // Guard against late response after account/token/lang switch or recent mutation
              if (mutationSeqRef.current !== reqMutationSeq || activeOwnerIdRef.current !== reqOwnerId || latestAccessTokenRef.current !== reqToken) {
                return;
              }
              if (latest) setDmsData({ ...latest, snapshotTimestamp: Date.now() });
            })
            .catch(err => {
              if (!active.current || controller.signal.aborted || err.name === 'AbortError') return;
              if (err.status === 401) {
                if (activeOwnerIdRef.current === reqOwnerId && latestAccessTokenRef.current === reqToken) {
                  onUnauthorizedRef.current?.();
                }
              }
            });
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    return () => {
      visibilityAbortControllerRef.current?.abort();
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [dmsData, isDevPreviewActive]);


    const handleManualRetry = useCallback(() => {
    mutationSeqRef.current += 1;
    pollAbortControllerRef.current?.abort();
    visibilityAbortControllerRef.current?.abort();
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
    if (dmsData && dmsData.status !== 'MONITORING') return;
    if (pendingSave.current || pendingCheckIn.current) return;
    const errors = validateDmsDuration({ days: intervalInput, hours: hoursInput, minutes: minutesInput }, lang);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    pendingSave.current = true;
    mutationSeqRef.current += 1;
    visibilityAbortControllerRef.current?.abort();
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
      mutationSeqRef.current += 1;
      visibilityAbortControllerRef.current?.abort();
      ++fetchRequestId.current;
      syncedContextRef.current = ownerId ?? '__default__';
      syncedRefreshTriggerRef.current = onRefreshTrigger;
      syncedRefreshKeyRef.current = refreshKey;
      setDmsData(updated ? { ...updated, snapshotTimestamp: Date.now() } : null);
      if (updated) {
        const d = updated.days !== undefined ? updated.days : (updated.checkIntervalDays != null ? updated.checkIntervalDays : Math.floor((updated.checkIntervalMinutes || 0) / 1440));
        const h = updated.hours !== undefined ? updated.hours : (updated.checkIntervalHours != null ? updated.checkIntervalHours : Math.floor(((updated.checkIntervalMinutes || 0) % 1440) / 60));
        const m = updated.minutes !== undefined ? updated.minutes : (updated.checkIntervalHours != null ? updated.checkIntervalMinutes : ((updated.checkIntervalMinutes || 0) % 60));
        setIntervalInput(d);
        setHoursInput(String(h));
        setMinutesInput(String(m));
      }
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
    if (cannotCheckIn) return;
    if (pendingCheckIn.current || pendingSave.current) return;
    pendingCheckIn.current = true;
    mutationSeqRef.current += 1;
    visibilityAbortControllerRef.current?.abort();
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
      if (result) {
        const d = result.days !== undefined ? result.days : (result.checkIntervalDays != null ? result.checkIntervalDays : Math.floor((result.checkIntervalMinutes || 0) / 1440));
        const h = result.hours !== undefined ? result.hours : (result.checkIntervalHours != null ? result.checkIntervalHours : Math.floor(((result.checkIntervalMinutes || 0) % 1440) / 60));
        const m = result.minutes !== undefined ? result.minutes : (result.checkIntervalHours != null ? result.checkIntervalMinutes : ((result.checkIntervalMinutes || 0) % 60));
        setIntervalInput(d);
        setHoursInput(String(h));
        setMinutesInput(String(m));
      }
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

  // Localized field errors derived from current language and duration state
  const currentErrors = useMemo(() => {
    if (Object.keys(fieldErrors).length === 0) return {};
    return validateDmsDuration({ days: intervalInput, hours: hoursInput, minutes: minutesInput }, lang);
  }, [fieldErrors, intervalInput, hoursInput, minutesInput, lang]);

  const currentIntervalError = currentErrors.days || currentErrors.check_interval_days || currentErrors.duration || null;
  const firstErrorMsg = currentIntervalError || currentErrors.hours || currentErrors.minutes || null;

  // Calculate cycle progress if timestamps are valid
  const cycleProgress = useMemo(() => {
    if (!dmsData || !dmsData.nextCheckAt) return null;
    const end = new Date(dmsData.nextCheckAt).getTime();
    const intervalMs = Number(dmsData.checkIntervalTotalMinutes) * 60_000;
    const explicitStart = dmsData.lastCheckInAt ? new Date(dmsData.lastCheckInAt).getTime() : NaN;
    const start = Number.isFinite(explicitStart) ? explicitStart : end - intervalMs;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    if (clockNow <= start) return 0;
    if (clockNow >= end) return 100;
    return Math.min(100, Math.max(0, Math.round(((clockNow - start) / (end - start)) * 100)));
  }, [dmsData, clockNow]);

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
      deadlinePendingTitle: 'Đã đến hạn xác nhận hoạt động',
      deadlinePendingDesc: 'Đang xác minh trạng thái DMS mới nhất từ máy chủ. Quá hạn check-in chưa đồng nghĩa với việc DMS đã kích hoạt.',
      configCardTitle: 'Cấu hình chu kỳ kiểm tra',
      configCardSub:
        'Tùy chỉnh khoảng thời gian giữa các lần hệ thống yêu cầu bạn gửi tín hiệu xác nhận.',
      presetsLabel: 'Gợi ý chu kỳ đề xuất:',
      presetsHelper: 'Chọn nhanh hoặc điều chỉnh ngày, giờ, phút bên dưới.',
      inputLabel: 'Thời lượng chu kỳ:',
      inputHelper: 'Nhập số nguyên; tổng thời gian từ 1 phút đến 180 ngày.',
      saveBtn: 'Lưu cấu hình chu kỳ',
      savingBtn: 'Đang lưu cấu hình…',
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
      deadlinePendingTitle: 'Check-in deadline reached',
      deadlinePendingDesc: 'Confirming the latest DMS status with the server. A missed check-in deadline alone does not mean DMS has been triggered.',
      configCardTitle: 'Configure Check-in Interval',
      configCardSub:
        'Customize the duration between required activity check-in confirmations.',
      presetsLabel: 'Suggested Presets:',
      presetsHelper: 'Choose a preset or adjust days, hours and minutes below.',
      inputLabel: 'Check-in interval:',
      inputHelper: 'Enter whole numbers; total duration must be 1 minute to 180 days.',
      saveBtn: 'Save Interval Settings',
      savingBtn: 'Saving Settings…',
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

  const isGraceEnded = dmsData?.status === 'GRACE_PERIOD_EXCEEDED' || Boolean(graceExpired);
  const isTriggered = isGraceEnded ||
    (dmsData?.status === 'TRIGGERED' && Boolean(dmsData.graceDeadline));
  const effectiveDmsStatus = isGraceEnded ? 'GRACE_PERIOD_EXCEEDED' : (dmsData?.status || '');
  const isDeadlinePending = dmsData?.status === 'MONITORING' &&
    Number.isFinite(Date.parse(dmsData.nextCheckAt || '')) &&
    clockNow >= Date.parse(dmsData.nextCheckAt);
  const canCheckInDuringGrace = dmsData?.status === 'TRIGGERED' &&
    Number.isFinite(Date.parse(dmsData.graceDeadline || '')) &&
    clockNow < Date.parse(dmsData.graceDeadline);
  const cannotCheckIn = !isOwner || (dmsData?.status !== 'MONITORING' && !canCheckInDuringGrace);
  const configReadOnly = isSavingGrace || Boolean(dmsData && dmsData.status !== 'MONITORING');
  const monitoringLockedMessage = !isOwner
    ? (lang === 'en' ? 'Only the Owner can check in.' : 'Chỉ Chủ sở hữu mới có thể xác nhận hoạt động.')
    : (lang === 'en'
      ? 'The check-in window has closed; check-in and schedule changes are locked.'
      : 'Thời hạn check-in đã kết thúc; chức năng xác nhận và đổi chu kỳ đang khóa.');
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
            <section className="lv-dms-card lv-dms-stagger lv-owner-card" style={{ '--stagger': 1 }} aria-labelledby="dms-overview-heading">
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
      {(isTriggered || isDeadlinePending) && (
        <section className="lv-dms-triggered-banner lv-dms-stagger" style={{ '--stagger': 1 }} role="alert" aria-live="polite">
          <div className="lv-dms-triggered-icon" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div className="lv-dms-triggered-content">
            <h2 className="lv-dms-triggered-title">{isGraceEnded ? (lang === 'en' ? 'Grace period has ended' : 'Đã hết thời gian ân hạn') : (isTriggered ? t.triggeredAlertTitle : t.deadlinePendingTitle)}</h2>
            <p className="lv-dms-triggered-desc">{isGraceEnded ? (lang === 'en' ? 'The record is awaiting verification. This status does not confirm death or unlock assets.' : 'Hồ sơ đang chờ xác minh. Trạng thái này chưa xác nhận tử vong và chưa mở khóa tài sản.') : (isTriggered ? t.triggeredAlertDesc : t.deadlinePendingDesc)}</p>
            <div className="lv-dms-triggered-actions-row">
              {dmsData.graceDeadline && (
                <span className="lv-dms-triggered-deadline-tag">
                  {t.triggeredDeadlinePrefix} {formatDmsDate(dmsData.graceDeadline, lang)}
                </span>
              )}
              {/* PS-24: Owner Cancel Alert action */}
              {accessToken && !onCancelAlert && canCancelAlert === undefined && !customCancelCapability ? <OwnerLiveCancelAlert
                accessToken={accessToken} ownerId={ownerId} dmsStatus={effectiveDmsStatus} lang={lang} isOwner={isOwner}
                onUnauthorized={onUnauthorized} onRefreshRequired={handleManualRetry} /> : <OwnerCancelAlert
                lang={lang}
                dmsStatus={effectiveDmsStatus}
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
              />}
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
                </div>

                {/* Metric 3: Current Interval */}
                <div className="lv-dms-metric-item">
                  <span className="lv-dms-metric-label">{t.metricInterval}</span>
                  <div className="lv-dms-metric-value-row">
                    <span className="lv-dms-metric-value">
                      {dmsData.checkIntervalDays != null || dmsData.checkIntervalHours != null || dmsData.checkIntervalMinutes != null || dmsData.days != null
                        ? formatDmsInterval(dmsData, lang)
                        : '—'}
                    </span>
                  </div>
                </div>

                {/* Metric 4: Last Check-in Time */}
                <div className="lv-dms-metric-item">
                  <span className="lv-dms-metric-label">{t.metricLastCheck}</span>
                  <div className="lv-dms-metric-value-row">
                    <span className="lv-dms-metric-value">
                      {formatDmsDate(dmsData.lastCheckInAt, lang)}
                    </span>
                  </div>
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
                    {cannotCheckIn && <p className="lv-dms-action-sub">{monitoringLockedMessage}</p>}
                  </div>
                </div>

                <div className="lv-dms-action-button-col">
                  <MagneticButton
                    type="button"
                    className={`lv-dms-checkin-btn ${cannotCheckIn ? 'is-disabled' : ''}`}
                    onClick={handleCheckIn}
                    disabled={isCheckingIn || isSavingGrace || cannotCheckIn}
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
                      style={{ width: `${cycleProgress}%` }}
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
          <section className="lv-dms-card lv-dms-config-card lv-dms-stagger lv-owner-card" style={{ '--stagger': 3 }} aria-labelledby="dms-config-heading">
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
                        disabled={configReadOnly || isSaving}
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
                          disabled={isSaving || configReadOnly}
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
                          disabled={isSaving || configReadOnly}
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
                          disabled={isSaving || configReadOnly}
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
                    disabled={isSaving || configReadOnly}
                    maxOffset={2}
                  >
                    {isSaving && <span className="lv-btn-spinner" aria-hidden="true" />}
                    <span>{isSaving ? t.savingBtn : t.saveBtn}</span>
                  </MagneticButton>
                </div>
              </div>
            </form>
          </section>
          <DmsGraceSettings data={dmsData} actions={graceActions} ownerId={ownerId} accessToken={accessToken}
            resetKey={`${refreshKey}:${onRefreshTrigger}`} lang={lang} isOwner={isOwner} onUnauthorized={onUnauthorized}
            busy={isSaving || isCheckingIn || loading}
            onBusyChange={value => {
              if (value && (pendingSave.current || pendingCheckIn.current)) return false;
              pendingSave.current = value;
              if (value) {
                mutationSeqRef.current += 1;
                visibilityAbortControllerRef.current?.abort();
              }
              ++fetchRequestId.current;
              setIsSavingGrace(value);
              return true;
            }}
            onSaved={value => {
              mutationSeqRef.current += 1;
              visibilityAbortControllerRef.current?.abort();
              setDmsData({ ...value, snapshotTimestamp: Date.now() });
            }} />

        </div>
      )}
    </div>
  );
}
