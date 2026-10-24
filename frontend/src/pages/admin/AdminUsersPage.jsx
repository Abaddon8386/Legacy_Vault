import { useState } from 'react';
import { useModalFocus } from '../../components/common/useModalFocus.js';
import { useAdminQuery } from './useAdminQuery.js';
import { adminI18n, adminRoleLabel } from './adminI18n.js';
import { fetchAdminUsers, fetchAdminUserDetail } from '../../utils/adminService.js';
import './AdminPages.css';

export default function AdminUsersPage({
  lang = 'vi',
  accessToken = null,
  fetchOnMount = false,
  onUnauthorized = null,
}) {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const t = adminI18n[lang] || adminI18n.vi;
  const { data, loading, apiPending, error, deny, reload: handleReload } = useAdminQuery(
    fetchAdminUsers, accessToken, { lang, query, role: roleFilter, status: statusFilter, page, pageSize }, fetchOnMount, onUnauthorized, t.accessDenied
  );
  const users = data?.items || [];
  const total = data?.total ?? null;
  const [detailSelection, setDetailSelection] = useState(null);
  const detailUser = detailSelection?.data === data ? detailSelection.record : null;
  const setDetailUser = (record) => setDetailSelection(record ? { record, data } : null);
  const [lockSelection, setLockSelection] = useState(null);
  const lockTargetUser = lockSelection?.data === data ? lockSelection.record : null;
  const setLockTargetUser = (record) => setLockSelection(record ? { record, data } : null);
  const [lockReason, setLockReason] = useState('');
  const lockRef = useModalFocus(Boolean(lockTargetUser), () => setLockTargetUser(null));

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    handleReload();
  };

  const handleResetFilters = () => {
    setQuery('');
    setRoleFilter('');
    setStatusFilter('');
    setPage(1);
  };

  const formatDate = (isoString) => {
    if (!isoString) return t.notAvailable;
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', {
        dateStyle: 'medium',
      });
    } catch {
      return isoString;
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="lv-admin-container" aria-labelledby="admin-users-title">
      <header className="lv-admin-header">
        <h1 id="admin-users-title" className="lv-admin-header-title">
          {t.usersTitle}
        </h1>
        <p className="lv-admin-header-subtitle">{t.usersSubtitle}</p>
      </header>

      {/* Backend Integration Pending Notice */}
      {apiPending && (
        <section className="lv-admin-pending-banner" role="status" aria-label="Users API Pending Notice">
          <div className="lv-admin-pending-banner-header">
            <span className="lv-admin-pending-banner-title">
              {t.usersTitle}
            </span>
            <span className="lv-admin-pending-badge">{t.pendingApiBadge}</span>
          </div>
          <p className="lv-admin-pending-banner-desc">{t.usersPendingNotice}</p>
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
            padding: 16,
            marginBottom: 20,
            color: 'var(--lv-status-error-text)',
          }}
        >
          <p style={{ margin: '0 0 10px 0', fontSize: 14 }}>{error}</p>
          <button type="button" className="lv-admin-btn lv-admin-btn-secondary" onClick={handleReload}>
            {t.retryBtn}
          </button>
        </section>
      )}

      {/* Search & Filters Toolbar */}
      <form className="lv-admin-toolbar" onSubmit={handleSearchSubmit} role="search" aria-label={t.usersTitle}>
        <div className="lv-admin-toolbar-inputs">
          <label className="lv-admin-field lv-admin-field--search">
            <span>{lang === 'en' ? 'Name or email' : 'Tên hoặc email'}</span>
          <input
            type="search"
            className="lv-admin-input lv-admin-search-input"
            placeholder={t.searchPlaceholder}
            maxLength={100}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            aria-label={t.searchPlaceholder}
          />
          </label>
          <label className="lv-admin-field">
            <span>{t.thRoles}</span>
          <select
            className="lv-admin-select"
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            aria-label={t.allRoles}
          >
            <option value="">{t.allRoles}</option>
            <option value="VAULT_OWNER">{t.roleOwner}</option>
            <option value="BENEFICIARY">{t.roleBeneficiary}</option>
            <option value="STAFF_EXECUTOR">{t.roleStaff}</option>
            <option value="LEGAL_VERIFIER">{t.roleLegal}</option>
            <option value="ADMIN">{t.roleAdmin}</option>
          </select>
          </label>
          <label className="lv-admin-field">
            <span>{t.thStatus}</span>
          <select
            className="lv-admin-select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            aria-label={t.allStatuses}
          >
            <option value="">{t.allStatuses}</option>
            <option value="ACTIVE">{t.statusActive}</option>
            <option value="DELETED">{t.statusDeleted}</option>
            <option value="PENDING">{t.statusPending}</option>
          </select>
          </label>
          <div className="lv-admin-filter-actions">
          <button type="submit" className="lv-admin-btn lv-admin-btn-primary">
            {lang === 'vi' ? 'Tìm kiếm' : 'Search'}
          </button>

          {(query || roleFilter || statusFilter) && (
            <button
              type="button"
              className="lv-admin-btn lv-admin-btn-secondary"
              onClick={handleResetFilters}
            >
              {t.resetFilters}
            </button>
          )}
          </div>
        </div>
      </form>

      {/* Users Data Table */}
      <div className="lv-admin-list-meta">
        <p>{lang === 'en' ? 'User directory' : 'Danh sách người dùng'}{total !== null && !loading && <> <strong>({total})</strong></>}</p>
        <span className="lv-admin-scroll-hint">{lang === 'en' ? 'Scroll horizontally to see all columns' : 'Cuộn ngang để xem đầy đủ các cột'}</span>
      </div>
      <div className="lv-admin-table-container" tabIndex={0} role="region" aria-label={lang === 'en' ? 'User table' : 'Bảng người dùng'}>
        <table className="lv-admin-table" aria-label={t.usersTitle}>
          <thead>
            <tr>
              <th scope="col">{t.thName}</th>
              <th scope="col">{t.thEmail}</th>
              <th scope="col">{t.thRoles}</th>
              <th scope="col">{t.thJoinedDate}</th>
              <th scope="col">{t.thStatus}</th>
              <th scope="col" style={{ textAlign: 'right' }}>{t.thActions}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--lv-text-muted)' }}>
                  {t.loading}
                </td>
              </tr>
            ) : error || apiPending ? (
              <tr><td colSpan={6}>{t.notAvailable}</td></tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--lv-text-muted)' }}>
                  {apiPending ? (lang === 'vi' ? 'Đang chờ kết nối API Backend thực tế' : 'Awaiting live Backend API integration') : t.noUsersFound}
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td style={{ fontWeight: 600 }}>{user.fullName || t.notAvailable}</td>
                  <td>{user.email}</td>
                  <td>
                    {user.roles.map((role) => (
                      <span key={role} className="lv-admin-role-badge" title={role}>
                        {adminRoleLabel(role, lang)}
                      </span>
                    ))}
                  </td>
                  <td>{formatDate(user.createdAt)}</td>
                  <td>
                    <span
                      className={`lv-admin-status-badge lv-admin-status-${(user.status || 'neutral').toLowerCase()}`}
                    >
                      {user.status === 'LOCKED'
                        ? t.statusLocked
                        : user.status === 'PENDING'
                        ? t.statusPending
                        : user.status === 'ACTIVE'
                        ? t.statusActive
                        : user.status === 'DELETED' ? t.statusDeleted : t.notAvailable}
                    </span>
                  </td>
                  <td>
                    <div className="lv-admin-row-actions">
                    <button
                      type="button"
                      className="lv-admin-btn lv-admin-btn-secondary"
                      onClick={() => setDetailUser(user)}
                    >
                      {t.viewDetails}
                    </button>
                    <button
                      type="button"
                      className={`lv-admin-btn ${user.status === 'LOCKED' ? 'lv-admin-btn-secondary' : 'lv-admin-btn-danger'}`}
                      onClick={() => {
                        setLockTargetUser(user);
                        setLockReason('');
                      }}
                    >
                      {user.status === 'LOCKED' ? t.unlockAction : t.lockAction}
                    </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && total > 0 && (
        <nav className="lv-admin-pagination" aria-label="User directory pagination">
          <div className="lv-admin-pagination-info">
            {t.paginationPage} <strong>{page}</strong> {t.paginationOf} <strong>{totalPages}</strong> ({total} {lang === 'vi' ? 'người dùng' : 'users'})
          </div>
          <div className="lv-admin-pagination-btns">
            <button
              type="button"
              className="lv-admin-btn lv-admin-btn-secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t.prevPage}
            </button>
            <button
              type="button"
              className="lv-admin-btn lv-admin-btn-secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {t.nextPage}
            </button>
          </div>
        </nav>
      )}

      {detailUser && <UserDetail key={detailUser.id} id={detailUser.id} accessToken={accessToken} lang={lang}
        onClose={() => setDetailUser(null)} onUnauthorized={onUnauthorized} onDenied={deny} />}
      {/* Lock/Unlock Confirmation Dialog */}
      {lockTargetUser && (
        <div className="lv-admin-modal-backdrop" ref={lockRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="lock-dialog-title">
          <div className="lv-admin-modal-card">
            <div className="lv-admin-modal-header">
              <h2 id="lock-dialog-title" className="lv-admin-modal-title">
                {t.lockDialogTitle}
              </h2>
              <button
                type="button"
                className="lv-admin-modal-close-btn"
                onClick={() => setLockTargetUser(null)}
                aria-label={t.cancelBtn}
              >
                ✕
              </button>
            </div>
            <div className="lv-admin-modal-body">
              <p style={{ margin: '0 0 16px 0', color: 'var(--lv-text-body)' }}>
                {t.lockDialogWarning}
              </p>

              <div style={{ background: 'var(--lv-bg-canvas)', padding: 14, borderRadius: 'var(--lv-radius-md)', marginBottom: 16 }}>
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  <strong>{t.lockTargetAccount}</strong> {lockTargetUser.fullName} ({lockTargetUser.email})
                </div>
                <div style={{ fontSize: 12, color: 'var(--lv-text-muted)' }}>
                  ID: {lockTargetUser.id} | {t.thStatus}: {lockTargetUser.status}
                </div>
              </div>

              {/* Policy Pending Notice */}
              <div
                style={{
                  background: '#fffbf5',
                  border: '1px solid #fed7aa',
                  borderRadius: 'var(--lv-radius-md)',
                  padding: 14,
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: '#9a3412',
                  marginBottom: 16,
                }}
              >
                <strong>{t.pendingApiBadge}:</strong> {t.lockPolicyPendingNotice}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="lock-reason-input" style={{ fontSize: 13, fontWeight: 600 }}>
                  {t.lockReasonLabel}
                </label>
                <textarea
                  id="lock-reason-input"
                  className="lv-admin-input"
                  style={{ height: 80, padding: 10, resize: 'vertical' }}
                  placeholder={t.lockReasonPlaceholder}
                  value={lockReason}
                  onChange={(e) => setLockReason(e.target.value)}
                  disabled
                />
              </div>
            </div>
            <div className="lv-admin-modal-footer">
              <button
                type="button"
                className="lv-admin-btn lv-admin-btn-secondary"
                onClick={() => setLockTargetUser(null)}
              >
                {t.cancelBtn}
              </button>
              <button
                type="button"
                className="lv-admin-btn lv-admin-btn-danger"
                disabled
                title={t.lockPolicyPendingNotice}
              >
                {lockTargetUser.status === 'LOCKED' ? t.confirmUnlockBtn : t.confirmLockBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const loadUserDetail = (token, { id, ...options }) => fetchAdminUserDetail(token, id, options);
function UserDetail({ id, accessToken, lang, onClose, onUnauthorized, onDenied }) {
  const t = adminI18n[lang] || adminI18n.vi;
  const ref = useModalFocus(true, onClose);
  const { data, loading, error, apiPending, reload } = useAdminQuery(loadUserDetail, accessToken, { id, lang }, true,
    onUnauthorized, t.accessDenied, failure => { if (failure.status === 403) onDenied(); });
  return <div className="lv-admin-modal-backdrop" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="user-detail-modal-title">
    <div className="lv-admin-modal-card">
      <div className="lv-admin-modal-header"><h2 id="user-detail-modal-title">{t.userDetailTitle}</h2>
        <button type="button" className="lv-admin-modal-close-btn" onClick={onClose} aria-label={t.closeModal}>✕</button></div>
      <div className="lv-admin-modal-body">
        {loading ? <p role="status">{t.loading}</p> : error || apiPending ? <><p role="alert">{error || t.notAvailable}</p>
          <button type="button" className="lv-admin-btn lv-admin-btn-secondary" onClick={reload}>{t.retryBtn}</button></> : data && <dl className="lv-admin-detail-list">
          {[[t.userId, data.id], [t.userFullName, data.fullName], [t.userEmail, data.email], [t.userRoles, data.roles.map(role => adminRoleLabel(role, lang)).join(', ')],
            [t.userStatus, data.status === 'ACTIVE' ? t.statusActive : data.status === 'PENDING' ? t.statusPending : data.status === 'DELETED' ? t.statusDeleted : t.notAvailable],
            [t.userCreatedAt, data.createdAt]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || t.notAvailable}</dd></div>)}
        </dl>}
      </div>
      <div className="lv-admin-modal-footer"><button type="button" className="lv-admin-btn lv-admin-btn-secondary" onClick={onClose}>{t.closeModal}</button></div>
    </div>
  </div>;
}
