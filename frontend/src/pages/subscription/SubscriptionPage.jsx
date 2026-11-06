import { useState, useEffect, useCallback } from 'react';
import ErrorState from '../../components/common/ErrorState.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import {
  SUBSCRIPTION_PLANS,
  COMMON_FEATURES_VI,
  COMMON_FEATURES_EN,
  SUBSCRIPTION_SCENARIOS,
  subscriptionMessages,
  formatStorageBytes,
  subscriptionStatusLabel,
  fetchSubscription,
  subscriptionScenario,
  isSimulationPermitted,
  subscriptionErrorMessage,
} from '../../utils/subscriptionService.js';
import './SubscriptionPage.css';
import PaymentCheckout from './PaymentCheckout.jsx';

function getInitialScenario() {
  return subscriptionScenario(typeof window === 'undefined' ? '' : window.location.search);
}

function PlanComparison({ data, lang, t, payment }) {
  const commonFeatures = lang === 'en' ? COMMON_FEATURES_EN : COMMON_FEATURES_VI;

  return (
    <section className="lv-sub-plans-section" aria-label={lang === 'en' ? 'Plans' : 'Các gói'}>
      <div className="lv-sub-section-header">
        <h2 className="lv-sub-section-title">{lang === 'en' ? 'Plans' : 'Các gói'}</h2>
      </div>

      <div className="lv-sub-cards-grid">
        {SUBSCRIPTION_PLANS.map((plan) => {
          const isCurrent = plan.code === data.planCode;
          const isUpgrade = SUBSCRIPTION_PLANS.findIndex(item => item.code === plan.code) > SUBSCRIPTION_PLANS.findIndex(item => item.code === data.planCode);
          const purchasePlan = payment?.plans.find(item => item.code === plan.code);
          const features = (lang === 'en' ? plan.featuresEn : plan.featuresVi).slice(0, 2);
          const formattedPrice = purchasePlan?.priceVnd > 0
            ? `${purchasePlan.priceVnd.toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN')} ${lang === 'en' ? 'VND' : 'đ'}`
            : (lang === 'en' ? plan.priceEn : plan.priceVi);

          return (
            <div
              key={plan.code}
              className={`lv-plan-card lv-owner-card ${isCurrent ? 'is-current' : ''}`}
              aria-current={isCurrent ? 'true' : undefined}
            >
              <div className="lv-plan-card-header">
                <div className="lv-plan-card-title">
                  <h3 className="lv-plan-card-name">{lang === 'en' ? plan.nameEn : plan.nameVi}</h3>
                  {isCurrent && <span className="lv-plan-current-badge">{t.currentPlanBadge}</span>}
                </div>
                <div className="lv-plan-card-price-wrap">
                  <span className="lv-plan-card-price">{formattedPrice}</span>
                </div>
              </div>

              <div className="lv-plan-card-divider" aria-hidden="true" />

              <ul className="lv-plan-card-features">
                {features.map((feat, idx) => (
                  <li key={idx} className="lv-plan-feature-item">
                    <svg className="lv-plan-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>

              <div className="lv-plan-card-footer">
                {payment && isUpgrade && (
                  <button
                    type="button"
                    className="lv-plan-select-btn"
                    disabled={payment.busy || payment.catalogLoading || !purchasePlan}
                    onClick={() => payment.onChoose(purchasePlan)}
                  >
                    {payment.catalogLoading
                      ? (lang === 'en' ? 'Loading price…' : 'Đang tải giá…')
                      : (lang === 'en' ? 'Choose ' : 'Chọn gói ')}
                    {!payment.catalogLoading && (lang === 'en' ? plan.nameEn : plan.nameVi)}
                    <span aria-hidden="true"> →</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {payment?.catalogError && (
        <p className="lv-sub-catalog-error" role="alert">
          {lang === 'en' ? 'Unable to load current prices.' : 'Chưa tải được bảng giá hiện tại.'}{' '}
          <button type="button" onClick={payment.retryCatalog}>
            {lang === 'en' ? 'Retry' : 'Thử lại'}
          </button>
        </p>
      )}

      <div className="lv-sub-common-section">
        <h3 className="lv-sub-common-title">{lang === 'en' ? 'In every plan' : 'Có trong mọi gói'}</h3>
        <div className="lv-sub-common-grid">
          {commonFeatures.map((feature, idx) => (
            <div key={idx} className="lv-sub-common-item">
              <svg className="lv-sub-common-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{feature}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function SubscriptionPage({
  accessToken,
  ownerId,
  lang = 'vi',
  isDevPreview = false,
  onUnauthorized,
  onRefreshTrigger = 0,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeScenario, setActiveScenario] = useState(getInitialScenario);
  const canDemo = Boolean(import.meta.env.DEV && isDevPreview && isSimulationPermitted({ isDevPreview, accessToken }));

  const [reloadKey, setReloadKey] = useState(0);
  const [resultKey, setResultKey] = useState(null);
  const scopeKey = [accessToken, ownerId, lang, isDevPreview, activeScenario, onRefreshTrigger, reloadKey].join('|');

  const t = subscriptionMessages[lang] || subscriptionMessages.vi;

  // Synchronize scenario state if browser navigation (popstate) occurs
  useEffect(() => {
    if (!isDevPreview || typeof window === 'undefined') return;
    const onPopState = () => {
      setActiveScenario(getInitialScenario());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isDevPreview]);

  const loadData = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();
    fetchSubscription({
      accessToken,
      ownerId,
      lang,
      isDevPreview,
      scenario: activeScenario,
      signal: controller.signal,
    })
      .then((res) => {
        if (!ignore) {
          setResultKey(scopeKey);
          setData(res);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          if (!isDevPreview && err.status === 401 && typeof onUnauthorized === 'function') {
            onUnauthorized();
            return;
          }
          setResultKey(scopeKey);
          setError(err);
          setData(null);
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [accessToken, ownerId, lang, isDevPreview, activeScenario, onUnauthorized, onRefreshTrigger, reloadKey, scopeKey]);

  const handleScenarioChange = (e) => {
    const nextScenario = e.target.value;
    setActiveScenario(nextScenario);
    setLoading(true);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('scenario', nextScenario);
      window.history.replaceState({}, '', url.toString());
    }
  };

  const devControls = (
    canDemo && (
      <details className="lv-sub-dev-banner" open>
        <summary>{lang === 'en' ? 'DEV Preview' : 'Xem thử DEV'}</summary>
        <span className="lv-sub-dev-badge">
          <span aria-hidden="true">⚙</span> {t.devSimulationBadge}
        </span>
        <div className="lv-sub-dev-controls">
          <label htmlFor="scenario-select" style={{ fontWeight: 600, fontSize: '14px' }}>
            {lang === 'en' ? 'Scenario:' : 'Kịch bản:'}
          </label>
          <select
            id="scenario-select"
            className="lv-sub-dev-select"
            value={activeScenario}
            onChange={handleScenarioChange}
          >
            {SUBSCRIPTION_SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {lang === 'vi' ? s.labelVi : s.labelEn}
              </option>
            ))}
          </select>
        </div>
      </details>
    )
  );

  if (loading || resultKey !== scopeKey) {
    return (
      <div className="lv-sub-page">
        {devControls}
        <div className="lv-sub-skeleton" role="status" aria-live="polite" aria-busy="true">
          <span>{lang === 'en' ? 'Loading subscription details…' : 'Đang tải thông tin gói sử dụng…'}</span>
          <div className="lv-sub-skeleton-current" aria-hidden="true" />
          <div className="lv-sub-skeleton-plans" aria-hidden="true"><div /><div /><div /></div>
        </div>
      </div>
    );
  }

  if (error) {
    const policyPending = error.code === 'SUBSCRIPTION_POLICY_PENDING';
    const isBackendUnready = error.code === 'BACKEND_NOT_READY' || error.status === 404;
    return (
      <div className="lv-sub-page">
        {devControls}

        <ErrorState
          error={error}
          lang={lang}
          onNavigateToLogin={isDevPreview ? loadData : onUnauthorized}
          actionLabel={lang === 'en' ? 'Retry' : 'Thử lại'}
          badge={lang === 'en' ? 'SUBSCRIPTION' : 'GÓI SỬ DỤNG'}
          title={policyPending ? (lang === 'en' ? 'Subscription policy pending' : 'Chính sách gói đang được thống nhất') : isBackendUnready ? (lang === 'en' ? 'Service Unavailable' : 'Dịch vụ chưa sẵn sàng') : t.title}
          message={subscriptionErrorMessage(error, lang)}
          onRetry={loadData}
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="lv-sub-page">
        {devControls}

        <EmptyState
          lang={lang}
          showPillars={false}
          badge={lang === 'en' ? 'SUBSCRIPTION' : 'GÓI SỬ DỤNG'}
          title={lang === 'en' ? 'No Subscription Found' : 'Chưa có thông tin gói'}
          description={t.notFound}
          onAction={loadData}
          actionLabel={lang === 'en' ? 'Refresh' : 'Tải lại dữ liệu'}
        />
      </div>
    );
  }

  // Calculate usage percentages
  const assetsUsagePercent = Math.round((data.assetsUsed / data.maxAssets) * 100);
  const assetsPercent = Math.min(100, assetsUsagePercent);
  const storageUsagePercent = Math.round((data.storageUsedBytes / data.maxStorageBytes) * 100);
  const storagePercent = Math.min(100, storageUsagePercent);

  const formatStorageValue = (bytes) => {
    const formatted = formatStorageBytes(bytes);
    return lang === 'vi' ? formatted.replace('.', ',') : formatted;
  };
  const storageUsedFormatted = formatStorageValue(data.storageUsedBytes);
  const storageMaxFormatted = formatStorageValue(data.maxStorageBytes);

  return (
    <div className="lv-sub-page">
      {/* Dev Simulation Bar — Strictly Gated in DEV Preview */}
      {devControls}

      {/* Page Header */}
      <header className="lv-sub-header">
        <h1 className="lv-sub-title">{lang === 'en' ? 'Your subscription' : 'Gói sử dụng'}</h1>
      </header>

      {/* Hero Card: Current Subscription & Quota Gauges */}
      <section className="lv-sub-current-card lv-owner-card" aria-label={lang === 'en' ? 'Current subscription' : 'Thông tin gói hiện tại'}>
        <div className="lv-sub-current-left">
          {data.status !== 'ACTIVE' && (<span className="lv-sub-plan-status" role="status">{subscriptionStatusLabel(data.status, lang)}</span>)}
          <h2 className="lv-sub-plan-name">
            {lang === 'vi' ? data.planNameVi : data.planNameEn}
          </h2>
          <span className="lv-sub-vault-count">
            {lang === 'en' ? 'Vaults' : 'Số kho'} <strong>{data.vaultsCreatedLifetime}/{data.maxVaultsLifetime}</strong>
          </span>
          {data.isTrialGrant && (
            <span className="lv-sub-trial-tag">
              <span aria-hidden="true">✦</span> {lang === 'en' ? 'Trial Grant' : 'Gói dùng thử nghiệm'}
            </span>
          )}
          {data.expiresAt && (
            <div className="lv-sub-expiry-row">
              <span className="lv-sub-expiry-label">{t.expiryDate}:</span>{' '}
              <span className="lv-sub-expiry-val">
                {new Date(data.expiresAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'vi-VN', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
            </div>
          )}
        </div>

        {/* Quota Progress Gauges */}
        <div className="lv-sub-quota-grid">
          {/* Digital Assets Quota */}
          <div className="lv-sub-quota-item">
            <div className="lv-sub-quota-header">
              <span className="lv-sub-quota-label">{t.assetsUsage}</span>
              <span className="lv-sub-quota-numbers">{data.assetsUsed}/{data.maxAssets}</span>
            </div>
            <div
              className="lv-sub-progress-track"
              role="progressbar"
              aria-label={t.assetsUsage}
              aria-valuenow={assetsPercent}
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuetext={`${data.assetsUsed}/${data.maxAssets}`}
            >
              <div
                className={`lv-sub-progress-bar ${assetsPercent >= 90 ? 'is-danger' : assetsPercent >= 75 ? 'is-warning' : ''}`}
                style={{ width: `${assetsPercent}%` }}
              />
            </div>
          </div>

          {/* Document Storage Quota */}
          <div className="lv-sub-quota-item">
            <div className="lv-sub-quota-header">
              <span className="lv-sub-quota-label">{t.storageUsage}</span>
              <span className="lv-sub-quota-numbers">{storageUsedFormatted} / {storageMaxFormatted}</span>
            </div>
            <div
              className="lv-sub-progress-track"
              role="progressbar"
              aria-label={t.storageUsage}
              aria-valuenow={storagePercent}
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuetext={`${storageUsedFormatted} / ${storageMaxFormatted}`}
            >
              <div
                className={`lv-sub-progress-bar ${storagePercent >= 90 ? 'is-danger' : storagePercent >= 75 ? 'is-warning' : ''}`}
                style={{ width: `${storagePercent}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {(assetsUsagePercent > 100 || storageUsagePercent > 100) && (
        <p role="status" className="lv-sub-quota-exceeded">
          {lang === 'en' ? 'Usage exceeds your current limits. Existing records are retained.' : 'Mức sử dụng vượt hạn mức hiện tại. Dữ liệu đã lưu vẫn được giữ nguyên.'}
        </p>
      )}

      {accessToken && !canDemo ? (
        <PaymentCheckout
          key={accessToken}
          accessToken={accessToken}
          lang={lang}
          currentPlan={data.planCode}
          onPaid={loadData}
          PlanView={PlanComparison}
          planViewProps={{ data, lang, t }}
        />
      ) : (
        <PlanComparison data={data} lang={lang} t={t} />
      )}
    </div>
  );
}
