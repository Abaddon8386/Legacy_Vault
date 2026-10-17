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
  const requestKey = [vaultId, ownerId, accessToken, lang, refreshKey].join('|');

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

  const en = lang === 'en';
  const data = isSimulation ? getSimulationData(lang) : (state?.key === requestKey ? state.data : null);
  const isLoading = !isSimulation && !data;

  const assetsCount = data?.assets?.available ? data.assets.value : null;
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
      {/* Decorative Top Accent Line */}
      <div className="lv-summary-top-bar" aria-hidden="true" />

      {/* Header Row */}
      <div className="lv-summary-header">
        <div className="lv-summary-header__title-group">
          <span className="lv-summary-header__eyebrow">
            {en ? 'RESOURCE & OPERATIONAL STATUS' : 'CHỈ SỐ & TRẠNG THÁI HOẠT ĐỘNG'}
          </span>
          <h2 className="lv-summary-header__title">
            {en ? 'Vault Summary' : 'Tổng quan kho di sản'}
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
            <p className="lv-summary-card__desc">
              {en ? 'Secured assets recorded in your heritage vault.' : 'Tài sản số an toàn đã được ghi nhận trong kho.'}
            </p>
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
            <p className="lv-summary-card__desc">
              {en ? 'Designated beneficiaries recorded in vault.' : 'Danh sách người được chỉ định quyền thụ hưởng.'}
            </p>
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
    </section>
  );
}
