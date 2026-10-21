import { readPreviewSchedule, normalizePreviewScenario } from '../../utils/previewState.js';
import { useEffect, useState } from 'react';
import {
  Layers,
  Users,
  ShieldCheck,
  Clock,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { fetchVaultSummary, describeNextCheck } from '../../utils/vaultSummaryService.js';
import { mockDmsAdapter } from '../../utils/dmsService.js';
import { fetchSubscription, formatStorageBytes } from '../../utils/subscriptionService.js';
import './VaultSummary.css';

function formatNextDate(dateStr, lang) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const isEn = lang === 'en';
  if (isEn) {
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  const datePart = d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timePart = d.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${datePart} (${timePart})`;
}

function getSimulationData(lang = 'vi') {
  if (typeof window === 'undefined') {
    return {
      assets: { available: true, value: 2 },
      configuration: { available: true, value: { beneficiaryCount: 1, ready: true } },
      dms: { available: true, value: readPreviewSchedule('monitoring', key => mockDmsAdapter.fetch(key, lang)) },
    };
  }

  const params = new URLSearchParams(window.location.search);
  const scenario = normalizePreviewScenario(params.get('scenario') || params.get('summary') || params.get('dms') || 'monitoring');

  if (scenario === 'not_configured') {
    return {
      assets: { available: true, value: 1 },
      configuration: { available: true, value: { beneficiaryCount: 0, ready: false } },
      dms: { available: true, value: readPreviewSchedule('not_configured', key => mockDmsAdapter.fetch(key, lang)) },
    };
  }

  if (scenario === 'api_error' || scenario === 'network_error') {
    return {
      assets: { available: true, value: 1 },
      configuration: { available: true, value: { beneficiaryCount: 0, ready: false } },
      dms: { available: false },
    };
  }

  if (scenario === 'triggered' || scenario === 'overdue') {
    return {
      assets: { available: true, value: 2 },
      configuration: { available: true, value: { beneficiaryCount: 1, ready: true } },
      dms: { available: true, value: readPreviewSchedule('triggered', key => mockDmsAdapter.fetch(key, lang)) },
    };
  }

  // Default is 'monitoring', in sync with DMSOverviewPage default
  return {
    assets: { available: true, value: 2 },
    configuration: { available: true, value: { beneficiaryCount: 1, ready: true } },
    dms: { available: true, value: readPreviewSchedule('monitoring', key => mockDmsAdapter.fetch(key, lang)) },
  };
}

export default function VaultSummary({
  vaultId,
  ownerId,
  accessToken,
  lang = 'vi',
  onUnauthorized,
  refreshKey,
  isSimulation,
  onNavigate,
}) {
  const [state, setState] = useState(null);
  const [subState, setSubState] = useState(null);
  const requestKey = [vaultId, ownerId, accessToken, lang, refreshKey].join('|');
  const subRequestKey = `${requestKey}|${Boolean(isSimulation)}`;
  const subData = subState?.key === subRequestKey ? subState.data : null;
  const subPolicyPending = subState?.key === subRequestKey && subState.error === 'SUBSCRIPTION_POLICY_PENDING';
  const subLoading = subState?.key !== subRequestKey;

  useEffect(() => {
    if (isSimulation) return;
    let active = true;
    const controller = new AbortController();
    fetchVaultSummary(vaultId, { ownerId, accessToken, lang, signal: controller.signal })
      .then((data) => {
        if (active) setState({ key: requestKey, data });
      })
      .catch((error) => {
        if (active && error.status === 401) onUnauthorized?.();
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [vaultId, ownerId, accessToken, lang, onUnauthorized, refreshKey, isSimulation, requestKey]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const isDevPreviewActive = Boolean(typeof window !== 'undefined' && import.meta.env.DEV && (isSimulation || new URLSearchParams(window.location.search).get('preview') === 'true'));
    const scenario = isDevPreviewActive ? (typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('scenario') || 'active_basic') : 'active_basic') : undefined;

    fetchSubscription({
      accessToken,
      ownerId,
      lang,
      isDevPreview: isDevPreviewActive,
      scenario,
      signal: controller.signal,
    })
      .then((data) => {
        if (active) setSubState({ key: subRequestKey, data });
      })
      .catch((error) => {
        if (active) setSubState({ key: subRequestKey, data: null, error: error.code });
        if (active && !isDevPreviewActive && error.status === 401) onUnauthorized?.();
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [accessToken, ownerId, lang, onUnauthorized, refreshKey, isSimulation, subRequestKey]);

  const en = lang === 'en';
  const data = isSimulation ? getSimulationData(lang) : (state?.key === requestKey ? state.data : null);
  const isLoading = !isSimulation && !data;

  const assetsCount = isSimulation && subData ? subData.assetsUsed : (data?.assets?.available ? data.assets.value : null);
  const config = data?.configuration?.available ? data.configuration.value : null;
  const beneficiaryCount = config ? config.beneficiaryCount : null;
  const isBeneficiaryReady = Boolean(config?.ready);

  const isDmsAvailable = Boolean(data?.dms?.available);
  const dms = isDmsAvailable ? data.dms.value : null;
  const isDmsConfigured = isDmsAvailable && dms !== null;
  const isDmsUnconfigured = isDmsAvailable && dms === null;
  const isDmsFailed = Boolean(data && !data.dms?.available);

  const dmsDescription = dms ? describeNextCheck(dms, lang) : '';
  const isDmsOverdue = dms ? dms.status !== 'MONITORING' : false;
  const isDmsDue = dms ? (dmsDescription.includes('đến hạn') || dmsDescription.includes('due')) : false;
  const dmsPillClass = isDmsOverdue
    ? 'lv-summary-pill lv-summary-pill--danger'
    : isDmsDue
    ? 'lv-summary-pill lv-summary-pill--urgent'
    : 'lv-summary-pill lv-summary-pill--success';

  return (
    <section
      className="lv-overview-summary"
      aria-label={en ? 'Vault resource and operational overview' : 'Tổng quan tài nguyên và vận hành kho'}
    >
      {/* Header Row */}
      <div className="lv-summary-header">
        <div className="lv-summary-header__title-group">
          <h2 className="lv-summary-header__title">
            {en ? 'Resources & activity' : 'Tài nguyên và hoạt động'}
          </h2>
        </div>
        {isSimulation && (
          <span className="lv-sim-tag">
            {en ? 'Sample data' : 'Dữ liệu minh họa'}
          </span>
        )}
      </div>

      {/* 4 Information Cards Grid */}
      <div className="lv-summary-grid">
        {/* Card 1: Assets Count */}
        <div className="lv-summary-card lv-summary-card--metric">
          <div className="lv-summary-card__header">
            <div className="lv-summary-card__icon lv-summary-card__icon--forest" aria-hidden="true">
              <Layers size={18} />
            </div>
            <span className="lv-summary-card__label">
              {en ? 'Stored Assets' : 'Tài sản lưu trữ'}
            </span>
          </div>

          <div className="lv-summary-card__body">
            {isLoading ? (
              <span className="lv-summary-loading">{en ? 'Loading…' : 'Đang tải…'}</span>
            ) : assetsCount !== null ? (
              <div className="lv-summary-stat-row">
                <span className="lv-summary-stat-val lv-tabular-num">{assetsCount}</span>
                <span className="lv-summary-stat-unit">{en ? 'items' : 'tài sản'}</span>
              </div>
            ) : (
              <span className="lv-summary-unavailable">
                {en ? 'Unavailable' : 'Chưa có thông tin'}
              </span>
            )}

          </div>

          <div className="lv-summary-card__footer">
            <button
              type="button"
              className="lv-summary-link-btn"
              onClick={() => onNavigate?.('assets')}
            >
              <span>{en ? 'View assets' : 'Xem danh mục'}</span>
              <ArrowRight size={13} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Card 2: Beneficiaries Count */}
        <div className="lv-summary-card lv-summary-card--metric">
          <div className="lv-summary-card__header">
            <div className="lv-summary-card__icon lv-summary-card__icon--gold" aria-hidden="true">
              <Users size={18} />
            </div>
            <span className="lv-summary-card__label">
              {en ? 'Beneficiaries' : 'Người thụ hưởng'}
            </span>
          </div>

          <div className="lv-summary-card__body">
            {isLoading ? (
              <span className="lv-summary-loading">{en ? 'Loading…' : 'Đang tải…'}</span>
            ) : beneficiaryCount !== null ? (
              <div className="lv-summary-stat-row">
                <span className="lv-summary-stat-val lv-tabular-num">{beneficiaryCount}</span>
                <span className="lv-summary-stat-unit">{en ? 'people' : 'người'}</span>
              </div>
            ) : (
              <span className="lv-summary-unavailable">
                {en ? 'Unavailable' : 'Chưa có thông tin'}
              </span>
            )}

          </div>

          <div className="lv-summary-card__footer">
            <button
              type="button"
              className="lv-summary-link-btn"
              onClick={() => onNavigate?.('beneficiaries')}
            >
              <span>{en ? 'Manage list' : 'Xem danh sách'}</span>
              <ArrowRight size={13} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Card 3: Beneficiary Requirement Condition (Strictly: "Đã đáp ứng yêu cầu có người thụ hưởng") */}
        <div className="lv-summary-card lv-summary-card--status">
          <div className="lv-summary-card__header">
            <div className="lv-summary-card__icon lv-summary-card__icon--gold" aria-hidden="true">
              <ShieldCheck size={18} />
            </div>
            <span className="lv-summary-card__label">
              {en ? 'Beneficiary Status' : 'Tình trạng người thụ hưởng'}
            </span>
          </div>

          <div className="lv-summary-card__body">
            {isLoading ? (
              <span className="lv-summary-loading">{en ? 'Checking…' : 'Đang kiểm tra…'}</span>
            ) : !config ? (
              <div className="lv-summary-pill lv-summary-pill--neutral">
                <span>{en ? 'Information unavailable' : 'Chưa có thông tin'}</span>
              </div>
            ) : isBeneficiaryReady ? (
              <div className="lv-summary-pill lv-summary-pill--success">
                <CheckCircle2 size={13} aria-hidden="true" />
                <span>{en ? 'Beneficiary requirement met' : 'Đã đáp ứng yêu cầu có người thụ hưởng'}</span>
              </div>
            ) : (
              <div className="lv-summary-pill lv-summary-pill--warning">
                <AlertCircle size={13} aria-hidden="true" />
                <span>{en ? 'No beneficiaries' : 'Chưa có người thụ hưởng'}</span>
              </div>
            )}

            <p className="lv-summary-card__desc">
              {!config
                ? (en ? 'Unable to load configuration check.' : 'Chưa thể tải kết quả kiểm tra cấu hình.')
                : isBeneficiaryReady
                ? (en ? 'Vault configuration has designated beneficiaries.' : 'Kho đã ghi nhận người thụ hưởng hợp lệ theo cấu hình.')
                : (en ? 'At least one designated beneficiary is required in vault configuration.' : 'Cần chỉ định tối thiểu 01 người thụ hưởng trong cấu hình kho.')}
            </p>
          </div>

          <div className="lv-summary-card__footer">
            {config?.beneficiaryCount === 0 && (
              <button
                type="button"
                className="lv-summary-cta-btn lv-summary-cta-btn--primary"
                onClick={() => onNavigate?.('beneficiaries')}
              >
                <span>{en ? 'Add a beneficiary' : 'Thêm người thụ hưởng'}</span>
                <ArrowRight size={13} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Card 4: Activity Confirmation Schedule (DMS) */}
        <div className="lv-summary-card lv-summary-card--status">
          <div className="lv-summary-card__header">
            <div className="lv-summary-card__icon lv-summary-card__icon--forest" aria-hidden="true">
              <Clock size={18} />
            </div>
            <span className="lv-summary-card__label">
              {en ? 'Activity Schedule' : 'Lịch xác nhận hoạt động'}
            </span>
          </div>

          <div className="lv-summary-card__body">
            {isLoading ? (
              <span className="lv-summary-loading">{en ? 'Loading…' : 'Đang tải…'}</span>
            ) : isDmsFailed ? (
              <div className="lv-summary-pill lv-summary-pill--neutral">
                <AlertCircle size={13} aria-hidden="true" />
                <span>{en ? 'Unable to load confirmation schedule' : 'Chưa tải được lịch xác nhận'}</span>
              </div>
            ) : isDmsUnconfigured ? (
              <div className="lv-summary-pill lv-summary-pill--warning">
                <Clock size={13} aria-hidden="true" />
                <span>{en ? 'Confirmation schedule not set' : 'Chưa thiết lập lịch xác nhận'}</span>
              </div>
            ) : isDmsConfigured ? (
              <div className={dmsPillClass}>
                <CheckCircle2 size={13} aria-hidden="true" />
                <span>{dmsDescription}</span>
              </div>
            ) : (
              <div className="lv-summary-pill lv-summary-pill--neutral">
                <span>{en ? 'Unavailable' : 'Chưa có thông tin'}</span>
              </div>
            )}

            <p className="lv-summary-card__desc">
              {isDmsFailed
                ? (en ? 'Monitoring information is unavailable. Please retry.' : 'Chưa tải được thông tin giám sát. Vui lòng thử lại.')
                : isDmsUnconfigured
                ? (en ? 'Set check interval to maintain active vault monitoring.' : 'Thiết lập chu kỳ định kỳ để hệ thống duy trì giám sát an toàn.')
                : isDmsConfigured && dms.nextCheckAt
                ? (
                  <span className="lv-summary-date-line">
                    <span className="lv-summary-date-label">{en ? 'Next confirmation:' : 'Xác nhận tiếp theo:'}</span>
                    <strong className="lv-summary-date-val">{formatNextDate(dms.nextCheckAt, lang)}</strong>
                  </span>
                )
                : (en ? 'Monitoring status pending check.' : 'Đang đồng bộ trạng thái giám sát.')}
            </p>
          </div>

          <div className="lv-summary-card__footer">
            {isDmsUnconfigured && (
              <button
                type="button"
                className="lv-summary-cta-btn lv-summary-cta-btn--gold"
                onClick={() => onNavigate?.('dms')}
              >
                <span>{en ? 'Set up now' : 'Thiết lập ngay'}</span>
                <ArrowRight size={13} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Subscription Quota Usage & Plan Link Widget (CR-01) */}
      <div className="lv-summary-sub-widget" aria-label={en ? 'Subscription quota usage' : 'Mức sử dụng hạn mức gói'}>
        <div className="lv-summary-sub-left">
          {!subData ? <p role="status">{subLoading
            ? (en ? 'Loading subscription details…' : 'Đang tải thông tin gói…')
            : subPolicyPending
              ? (en ? 'Subscription plans are not available yet. Your account has not been assigned the proposed plan limits.' : 'Gói sử dụng hiện chưa được mở. Tài khoản chưa được áp dụng các hạn mức gói đề xuất.')
              : (en ? 'Subscription details unavailable. Open plans to retry.' : 'Chưa tải được thông tin gói. Mở trang gói để thử lại.')}</p> : <>

          <div className="lv-summary-sub-badge-row">
            <span className="lv-summary-sub-plan-badge">
              <Layers size={16} aria-hidden="true" />
              <span>{en ? subData.planNameEn : subData.planNameVi}</span>
            </span>
            {subData?.isTrialGrant && (
              <span className="lv-summary-sub-trial-badge">
                {en ? 'Trial Grant' : 'Dùng thử nghiệm'}
              </span>
            )}
          </div>

          <div className="lv-summary-sub-meters">
            {/* Meter 1: Assets */}
            <div className="lv-sub-meter-item">
              <div className="lv-sub-meter-header">
                <span className="lv-sub-meter-label">{en ? 'Digital Assets:' : 'Tài sản số:'}</span>
                <span className="lv-sub-meter-val">
                  {`${subData.assetsUsed} / ${subData.maxAssets}`}
                </span>
              </div>
              <div className="lv-sub-meter-track" role="progressbar" aria-label={en ? 'Subscription usage' : 'Mức sử dụng gói'} aria-valuenow={Math.min(100, Math.round((subData.assetsUsed / subData.maxAssets) * 100))} aria-valuemin="0" aria-valuemax="100">
                <div
                  className="lv-sub-meter-bar"
                  style={{
                    width: `${Math.min(100, Math.round((subData.assetsUsed / subData.maxAssets) * 100))}%`
                  }}
                />
              </div>
            </div>

            {/* Meter 2: Storage */}
            <div className="lv-sub-meter-item">
              <div className="lv-sub-meter-header">
                <span className="lv-sub-meter-label">{en ? 'Storage space:' : 'Dung lượng lưu trữ:'}</span>
                <span className="lv-sub-meter-val">
                  {`${formatStorageBytes(subData.storageUsedBytes)} / ${formatStorageBytes(subData.maxStorageBytes)}`}
                </span>
              </div>
              <div className="lv-sub-meter-track" role="progressbar" aria-label={en ? 'Subscription usage' : 'Mức sử dụng gói'} aria-valuenow={Math.min(100, Math.round((subData.storageUsedBytes / subData.maxStorageBytes) * 100))} aria-valuemin="0" aria-valuemax="100">
                <div
                  className="lv-sub-meter-bar"
                  style={{
                    width: `${Math.min(100, Math.round((subData.storageUsedBytes / subData.maxStorageBytes) * 100))}%`
                  }}
                />
              </div>
            </div>
          </div>
          </>}
        </div>

        <div className="lv-summary-sub-right">
          <button
            type="button"
            className="lv-summary-cta-btn lv-summary-cta-btn--gold"
            onClick={() => onNavigate?.('subscription')}
            aria-label={en ? 'Upgrade plan' : 'Nâng cấp gói'}
          >
            <span>{en ? 'Upgrade plan' : 'Nâng cấp gói'}</span>
            <ArrowRight size={13} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
