import { useState, useEffect, useRef } from 'react';
import { adminI18n } from './adminI18n.js';
import { fetchAdminOverview } from '../../utils/adminService.js';
import './AdminPages.css';

export default function AdminHome({
  lang = 'vi',
  accessToken = null,
  fetchOnMount = false,
  onUnauthorized = null,
  onOpenProfile = null,
  onOpenSubscriptions = null,
  onNavigate = null,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(fetchOnMount);
  const [apiPending, setApiPending] = useState(!fetchOnMount);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  const t = adminI18n[lang] || adminI18n.vi;

  const handleReload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    setApiPending(false);

    fetchAdminOverview(accessToken, { signal: controller.signal })
      .then((overviewData) => {
        setData(overviewData);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (err.status === 401 && typeof onUnauthorized === 'function') {
          onUnauthorized();
          return;
        }
        if (err.status === 404 || err.status === 501 || err.code === 'API_NOT_AVAILABLE' || err.code === 'BACKEND_NOT_READY') {
          setApiPending(true);
        } else {
          setError(err.message || String(err));
        }
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!fetchOnMount) return;
    let ignore = false;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    fetchAdminOverview(accessToken, { signal: controller.signal })
      .then((overviewData) => {
        if (!ignore) {
          setData(overviewData);
          setError(null);
          setApiPending(false);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (ignore || err.name === 'AbortError') return;
        if (err.status === 401 && typeof onUnauthorized === 'function') {
          onUnauthorized();
          return;
        }
        if (err.status === 404 || err.status === 501 || err.code === 'API_NOT_AVAILABLE' || err.code === 'BACKEND_NOT_READY') {
          setApiPending(true);
        } else {
          setError(err.message || String(err));
        }
        setLoading(false);
      });

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [accessToken, fetchOnMount, onUnauthorized]);

  const formatDate = (isoString) => {
    if (!isoString) return t.notAvailable;
    try {
      const d = new Date(isoString);
      return d.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'medium',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="lv-admin-container" aria-labelledby="admin-home-title">
      <header className="lv-admin-header">
        <h1 id="admin-home-title" className="lv-admin-header-title">
          {t.overviewTitle}
        </h1>
        <p className="lv-admin-header-subtitle">{t.overviewSubtitle}</p>
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--lv-text-muted)' }}>
          <strong>{t.statsAsOf}</strong>{' '}
          {loading ? t.loading : apiPending ? t.notAvailable : formatDate(data?.asOf)}
        </div>
      </header>

      {/* Backend Integration Pending Notice */}
      {apiPending && (
        <section className="lv-admin-pending-banner" role="status" aria-label="API Pending Notice">
          <div className="lv-admin-pending-banner-header">
            <span className="lv-admin-pending-banner-title">
              {lang === 'vi' ? 'Trạng thái tích hợp API Tổng quan' : 'Overview API Integration Status'}
            </span>
            <span className="lv-admin-pending-badge">{t.pendingApiBadge}</span>
          </div>
          <p className="lv-admin-pending-banner-desc">{t.overviewPendingNotice}</p>
        </section>
      )}

      {/* Error View */}
      {error && !loading && (
        <section
          role="alert"
          style={{
            background: 'var(--lv-status-error-bg)',
            border: '1px solid var(--lv-status-error-border)',
            borderRadius: 'var(--lv-radius-md)',
            padding: 18,
            marginBottom: 24,
            color: 'var(--lv-status-error-text)',
          }}
        >
          <h2 style={{ margin: '0 0 8px 0', fontSize: 16 }}>{t.errorHeading}</h2>
          <p style={{ margin: '0 0 12px 0', fontSize: 14 }}>{error}</p>
          <button
            type="button"
            className="lv-admin-btn lv-admin-btn-secondary"
            onClick={handleReload}
          >
            {t.retryBtn}
          </button>
        </section>
      )}

      {/* Metrics Grid */}
      <section aria-labelledby="overview-metrics-heading">
        <h2 id="overview-metrics-heading" style={{ fontSize: 18, margin: '0 0 16px 0', color: 'var(--lv-brand-forest)' }}>
          {t.metricsHeading}
        </h2>

        <div className="lv-admin-overview-grid">
          <div className="lv-admin-metric-card">
            <div className="lv-admin-metric-label">{t.totalUsers}</div>
            <div className="lv-admin-metric-value">
              {loading ? '...' : apiPending ? '—' : data?.totalUsers ?? 0}
            </div>
            <div className="lv-admin-metric-subtext">
              {apiPending ? t.notAvailable : `${data?.activeUsers ?? 0} ${t.statusActive.toLowerCase()}`}
            </div>
          </div>

          <div className="lv-admin-metric-card">
            <div className="lv-admin-metric-label">{t.activeUsers}</div>
            <div className="lv-admin-metric-value" style={{ color: 'var(--lv-status-success-text)' }}>
              {loading ? '...' : apiPending ? '—' : data?.activeUsers ?? 0}
            </div>
            <div className="lv-admin-metric-subtext">
              {apiPending ? t.notAvailable : `${data?.totalUsers ? Math.round(((data.activeUsers || 0) / data.totalUsers) * 100) : 0}%`}
            </div>
          </div>

          <div className="lv-admin-metric-card">
            <div className="lv-admin-metric-label">{t.lockedUsers}</div>
            <div className="lv-admin-metric-value" style={{ color: 'var(--lv-status-error-text)' }}>
              {loading ? '...' : apiPending ? '—' : data?.lockedUsers ?? 0}
            </div>
            <div className="lv-admin-metric-subtext">
              {apiPending ? t.notAvailable : t.statusLocked}
            </div>
          </div>

          <div className="lv-admin-metric-card">
            <div className="lv-admin-metric-label">{t.totalRolesAssigned}</div>
            <div className="lv-admin-metric-value" style={{ color: 'var(--lv-accent-gold)' }}>
              {loading ? '...' : apiPending ? '—' : data?.totalRolesAssigned ?? 0}
            </div>
            <div className="lv-admin-metric-subtext">
              {apiPending ? t.notAvailable : (lang === 'vi' ? 'Bao gồm tài khoản đa vai trò' : 'Includes multi-role users')}
            </div>
          </div>
        </div>
      </section>

      {/* Multi-role Distribution */}
      <section className="lv-admin-card-section" aria-labelledby="role-distribution-title">
        <h2 id="role-distribution-title" className="lv-admin-card-title">
          {t.roleDistributionHeading}
        </h2>
        <p className="lv-admin-card-help">{t.roleDistributionHelp}</p>

        <div className="lv-admin-role-bars">
          <div className="lv-admin-role-row">
            <span className="lv-admin-role-label">{t.roleOwner}</span>
            <span className="lv-admin-role-count">
              {loading ? '...' : apiPending ? '—' : data?.roleDistribution?.VAULT_OWNER ?? 0}
            </span>
          </div>
          <div className="lv-admin-role-row">
            <span className="lv-admin-role-label">{t.roleBeneficiary}</span>
            <span className="lv-admin-role-count">
              {loading ? '...' : apiPending ? '—' : data?.roleDistribution?.BENEFICIARY ?? 0}
            </span>
          </div>
          <div className="lv-admin-role-row">
            <span className="lv-admin-role-label">{t.roleStaff}</span>
            <span className="lv-admin-role-count">
              {loading ? '...' : apiPending ? '—' : data?.roleDistribution?.STAFF_EXECUTOR ?? 0}
            </span>
          </div>
          <div className="lv-admin-role-row">
            <span className="lv-admin-role-label">{t.roleLegal}</span>
            <span className="lv-admin-role-count">
              {loading ? '...' : apiPending ? '—' : data?.roleDistribution?.LEGAL_VERIFIER ?? 0}
            </span>
          </div>
          <div className="lv-admin-role-row">
            <span className="lv-admin-role-label">{t.roleAdmin}</span>
            <span className="lv-admin-role-count">
              {loading ? '...' : apiPending ? '—' : data?.roleDistribution?.ADMIN ?? 0}
            </span>
          </div>
        </div>
      </section>

      {/* Quick Action Cards Grid */}
      <div className="lv-admin-action-cards">
        <div className="lv-admin-action-card">
          <h2 className="lv-admin-action-card-title">{t.subscriptionsCardTitle}</h2>
          <p className="lv-admin-action-card-desc">{t.subscriptionsCardDesc}</p>
          <button
            type="button"
            className="lv-admin-btn lv-admin-btn-primary"
            onClick={onOpenSubscriptions}
          >
            {t.manageSubscriptionsBtn}
          </button>
        </div>

        <div className="lv-admin-action-card">
          <h2 className="lv-admin-action-card-title">{t.usersTitle}</h2>
          <p className="lv-admin-action-card-desc">{t.usersSubtitle}</p>
          <button
            type="button"
            className="lv-admin-btn lv-admin-btn-primary"
            onClick={() => typeof onNavigate === 'function' && onNavigate('users')}
          >
            {t.viewUsersBtn}
          </button>
        </div>

        <div className="lv-admin-action-card">
          <h2 className="lv-admin-action-card-title">{t.logsTitle}</h2>
          <p className="lv-admin-action-card-desc">{t.logsSubtitle}</p>
          <button
            type="button"
            className="lv-admin-btn lv-admin-btn-primary"
            onClick={() => typeof onNavigate === 'function' && onNavigate('logs')}
          >
            {t.viewLogsBtn}
          </button>
        </div>

        <div className="lv-admin-action-card">
          <h2 className="lv-admin-action-card-title">{t.accountProfileCardTitle}</h2>
          <p className="lv-admin-action-card-desc">{t.accountProfileCardDesc}</p>
          <button
            type="button"
            className="lv-admin-btn lv-admin-btn-secondary"
            onClick={onOpenProfile}
          >
            {t.viewProfileBtn}
          </button>
        </div>
      </div>

      {/* Admin Boundary Warning */}
      <footer style={{ marginTop: 24, padding: '16px 20px', borderRadius: 'var(--lv-radius-md)', background: '#f5f5f5', border: '1px solid #e0e0e0', fontSize: 13, color: '#666', lineHeight: 1.6 }}>
        {t.adminBoundaryWarning}
      </footer>
    </div>
  );
}