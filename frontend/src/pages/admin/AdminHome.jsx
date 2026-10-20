import { useAdminQuery } from './useAdminQuery.js';
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
  const t = adminI18n[lang] || adminI18n.vi;
  const { data, loading, apiPending, error, reload: handleReload } = useAdminQuery(
    fetchAdminOverview, accessToken, {}, fetchOnMount, onUnauthorized, t.accessDenied
  );

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
              {loading ? '...' : apiPending ? '—' : data?.totalUsers !== null && data?.totalUsers !== undefined ? data.totalUsers : t.notAvailable}
            </div>
            <div className="lv-admin-metric-subtext">
              {apiPending
                ? t.notAvailable
                : data?.activeUsers !== null && data?.activeUsers !== undefined
                ? `${data.activeUsers} ${t.statusActive.toLowerCase()}`
                : t.notAvailable}
            </div>
          </div>

          <div className="lv-admin-metric-card">
            <div className="lv-admin-metric-label">{t.activeUsers}</div>
            <div className="lv-admin-metric-value" style={{ color: 'var(--lv-status-success-text)' }}>
              {loading ? '...' : apiPending ? '—' : data?.activeUsers !== null && data?.activeUsers !== undefined ? data.activeUsers : t.notAvailable}
            </div>
            <div className="lv-admin-metric-subtext">
              {apiPending
                ? t.notAvailable
                : data?.totalUsers && data?.activeUsers !== null && data?.activeUsers !== undefined
                ? `${Math.round((data.activeUsers / data.totalUsers) * 100)}%`
                : t.notAvailable}
            </div>
          </div>

          <div className="lv-admin-metric-card">
            <div className="lv-admin-metric-label">{t.lockedUsers}</div>
            <div className="lv-admin-metric-value" style={{ color: 'var(--lv-status-error-text)' }}>
              {loading ? '...' : apiPending ? '—' : data?.lockedUsers !== null && data?.lockedUsers !== undefined ? data.lockedUsers : t.notAvailable}
            </div>
            <div className="lv-admin-metric-subtext">
              {apiPending ? t.notAvailable : t.statusLocked}
            </div>
          </div>

          <div className="lv-admin-metric-card">
            <div className="lv-admin-metric-label">{t.totalRolesAssigned}</div>
            <div className="lv-admin-metric-value" style={{ color: 'var(--lv-accent-gold)' }}>
              {loading ? '...' : apiPending ? '—' : data?.totalRolesAssigned !== null && data?.totalRolesAssigned !== undefined ? data.totalRolesAssigned : t.notAvailable}
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
              {loading ? '...' : apiPending ? '—' : data?.roleDistribution?.VAULT_OWNER !== null && data?.roleDistribution?.VAULT_OWNER !== undefined ? data.roleDistribution.VAULT_OWNER : t.notAvailable}
            </span>
          </div>
          <div className="lv-admin-role-row">
            <span className="lv-admin-role-label">{t.roleBeneficiary}</span>
            <span className="lv-admin-role-count">
              {loading ? '...' : apiPending ? '—' : data?.roleDistribution?.BENEFICIARY !== null && data?.roleDistribution?.BENEFICIARY !== undefined ? data.roleDistribution.BENEFICIARY : t.notAvailable}
            </span>
          </div>
          <div className="lv-admin-role-row">
            <span className="lv-admin-role-label">{t.roleStaff}</span>
            <span className="lv-admin-role-count">
              {loading ? '...' : apiPending ? '—' : data?.roleDistribution?.STAFF_EXECUTOR !== null && data?.roleDistribution?.STAFF_EXECUTOR !== undefined ? data.roleDistribution.STAFF_EXECUTOR : t.notAvailable}
            </span>
          </div>
          <div className="lv-admin-role-row">
            <span className="lv-admin-role-label">{t.roleLegal}</span>
            <span className="lv-admin-role-count">
              {loading ? '...' : apiPending ? '—' : data?.roleDistribution?.LEGAL_VERIFIER !== null && data?.roleDistribution?.LEGAL_VERIFIER !== undefined ? data.roleDistribution.LEGAL_VERIFIER : t.notAvailable}
            </span>
          </div>
          <div className="lv-admin-role-row">
            <span className="lv-admin-role-label">{t.roleAdmin}</span>
            <span className="lv-admin-role-count">
              {loading ? '...' : apiPending ? '—' : data?.roleDistribution?.ADMIN !== null && data?.roleDistribution?.ADMIN !== undefined ? data.roleDistribution.ADMIN : t.notAvailable}
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