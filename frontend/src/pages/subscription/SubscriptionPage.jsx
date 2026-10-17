import { useState, useEffect, useCallback } from 'react';
import ErrorState from '../../components/common/ErrorState.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import {
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_SCENARIOS,
  subscriptionMessages,
  formatStorageBytes,
  fetchSubscription,
  subscriptionScenario,
  isSimulationPermitted,
  subscriptionStatusLabel,
  subscriptionErrorMessage,
} from '../../utils/subscriptionService.js';
import './SubscriptionPage.css';

function getInitialScenario() {
  return subscriptionScenario(typeof window === 'undefined' ? '' : window.location.search);
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
              <label htmlFor="scenario-select" style={{ fontWeight: 600, fontSize: '13px' }}>
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

  return (
    <div className="lv-sub-page">
      {/* Dev Simulation Bar — Strictly Gated in DEV Preview */}
      {devControls}

      {/* Page Header */}
      <header className="lv-sub-header">
        <h1 className="lv-sub-title">{lang === 'en' ? 'Your subscription' : 'Gói sử dụng'}</h1>
        <p className="lv-sub-subtitle">{lang === 'en' ? 'Your plan, usage and storage limits in one place.' : 'Theo dõi gói hiện tại và dung lượng bạn đã sử dụng.'}</p>
      </header>

      {/* Hero Card: Current Subscription & Quota Gauges */}
      <section className="lv-sub-current-card" aria-label={lang === 'en' ? 'Current subscription' : 'Thông tin gói hiện tại'}>
        <div className="lv-sub-current-top">
          <div className="lv-sub-plan-meta">
            <div className="lv-sub-plan-badge-row">
              <span className="lv-sub-plan-status" role="status">{subscriptionStatusLabel(data.status, lang)}</span>
              {data.isTrialGrant && (
                <span className="lv-sub-trial-tag">
                  <span aria-hidden="true">✦</span> {lang === 'en' ? 'Trial Grant' : 'Gói dùng thử nghiệm'}
                </span>
              )}
            </div>
            <h2 className="lv-sub-plan-name">
              {lang === 'vi' ? data.planNameVi : data.planNameEn}
            </h2>
            <span className="lv-sub-plan-price">
              {SUBSCRIPTION_PLANS.find((p) => p.code === data.planCode)?.[lang === 'en' ? 'priceEn' : 'priceVi'] || ''}
            </span>
          </div>

          <div className="lv-sub-expiry-info">
            <span className="lv-sub-expiry-label">{t.expiryDate}</span>
            <span className="lv-sub-expiry-val">
              {data.expiresAt
                ? new Date(data.expiresAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'vi-VN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : data.planCode === 'BASIC' ? t.lifetimeExpiry : (lang === 'en' ? 'Not provided' : 'Chưa có thông tin')}
            </span>
            <span className="lv-sub-vault-count">{lang === 'en' ? 'Vaults created' : 'Số kho đã tạo'} <strong>{data.vaultsCreatedLifetime} / {data.maxVaultsLifetime}</strong></span>
          </div>
        </div>

        {(assetsUsagePercent > 100 || storageUsagePercent > 100) && <p role="status">
          {lang === 'en' ? 'Usage exceeds your current limits. Existing records are retained.' : 'Mức sử dụng vượt hạn mức hiện tại. Dữ liệu đã lưu vẫn được giữ nguyên.'}
        </p>}
        {/* Quota Progress Gauges */}
        <div className="lv-sub-quota-grid">
          {/* Digital Assets Quota */}
          <div className="lv-sub-quota-item">
            <div className="lv-sub-quota-header">
              <span className="lv-sub-quota-label">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
                {t.assetsUsage}
              </span>
              <span className="lv-sub-quota-numbers">
                {data.assetsUsed} / {data.maxAssets}
              </span>
            </div>
            <div className="lv-sub-progress-track" role="progressbar" aria-label={t.assetsUsage} aria-valuenow={assetsPercent} aria-valuemin="0" aria-valuemax="100">
              <div
                className={`lv-sub-progress-bar ${assetsPercent >= 90 ? 'is-danger' : assetsPercent >= 75 ? 'is-warning' : ''}`}
                style={{ width: `${assetsPercent}%` }}
              />
            </div>
            <div className="lv-sub-quota-footer">
              <span>{assetsUsagePercent}% {lang === 'en' ? 'used' : 'đã dùng'}</span>
              <span>{Math.max(0, data.maxAssets - data.assetsUsed)} {lang === 'en' ? 'remaining' : 'còn lại'}</span>
            </div>
          </div>

          {/* Document Storage Quota */}
          <div className="lv-sub-quota-item">
            <div className="lv-sub-quota-header">
              <span className="lv-sub-quota-label">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                {t.storageUsage}
              </span>
              <span className="lv-sub-quota-numbers">
                {formatStorageBytes(data.storageUsedBytes)} / {formatStorageBytes(data.maxStorageBytes)}
              </span>
            </div>
            <div className="lv-sub-progress-track" role="progressbar" aria-label={t.storageUsage} aria-valuenow={storagePercent} aria-valuemin="0" aria-valuemax="100">
              <div
                className={`lv-sub-progress-bar ${storagePercent >= 90 ? 'is-danger' : storagePercent >= 75 ? 'is-warning' : ''}`}
                style={{ width: `${storagePercent}%` }}
              />
            </div>
            <div className="lv-sub-quota-footer">
              <span>{storageUsagePercent}% {lang === 'en' ? 'used' : 'đã dùng'}</span>
              <span>{formatStorageBytes(Math.max(0, data.maxStorageBytes - data.storageUsedBytes))} {lang === 'en' ? 'free' : 'trống'}</span>
            </div>
          </div>


        </div>
        <p className="lv-sub-policy">{t.lifetimeRuleNotice}</p>
      </section>

      {/* Plan Comparison Section (Information-Only for Owner) */}
      <section className="lv-sub-plans-section" aria-label={lang === 'en' ? 'Compare plans' : 'So sánh các gói cước'}>
        <div className="lv-sub-section-header">
          <h2 className="lv-sub-section-title">{lang === 'en' ? 'Compare plans' : 'So sánh các gói'}</h2>
          <p className="lv-sub-section-desc">{lang === 'en' ? 'Choose the capacity that suits your needs.' : 'Ba mức lưu trữ cho nhu cầu của bạn.'}</p>
        </div>

        <div className="lv-sub-cards-grid">
          {SUBSCRIPTION_PLANS.map((plan) => {
            const isCurrent = plan.code === data.planCode;
            const features = (lang === 'en' ? plan.featuresEn : plan.featuresVi).slice(0, 2);

            return (
              <div
                key={plan.code}
                className={`lv-plan-card ${isCurrent ? 'is-current' : ''}`}
              >
                {isCurrent && (
                  <span className="lv-plan-card-tag is-current-tag">
                    {t.currentPlanBadge}
                  </span>
                )}

                <div className="lv-plan-card-header">
                  <h3 className="lv-plan-card-name">{lang === 'en' ? plan.nameEn : plan.nameVi}</h3>
                  <div className="lv-plan-card-price-wrap">
                    <span className="lv-plan-card-price">
                      {lang === 'en' ? plan.priceEn : plan.priceVi}
                    </span>
                  </div>
                </div>

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
                  <span className="lv-plan-static-label">{isCurrent ? (lang === 'en' ? 'Your current plan' : 'Bạn đang dùng gói này') : (lang === 'en' ? 'Plan information' : 'Thông tin gói')}</span>
                </div>
              </div>
            );
          })}
        </div>

        <details className="lv-sub-shared-features">
          <summary>{lang === 'en' ? 'Included in every plan' : 'Quyền lợi chung của các gói'}</summary>
          <ul>{(lang === 'en' ? SUBSCRIPTION_PLANS[0].featuresEn : SUBSCRIPTION_PLANS[0].featuresVi).slice(2).map(feature => <li key={feature}>{feature}</li>)}</ul>
        </details>

        {/* Informational Policy Footnote */}
        <p className="lv-sub-plans-footer-note">
          {lang === 'en'
            ? 'Online plan changes are currently unavailable.'
            : 'Hệ thống hiện chưa hỗ trợ thay đổi gói trực tuyến.'}
        </p>
      </section>
    </div>
  );
}
