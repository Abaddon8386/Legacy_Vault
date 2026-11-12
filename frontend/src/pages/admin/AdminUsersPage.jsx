import { useState } from 'react';
import { Eye, KeyRound, Lock, LockOpen, Plus, UserCog } from 'lucide-react';
import { useModalFocus } from '../../components/common/useModalFocus.js';
import { useAdminQuery } from './useAdminQuery.js';
import { adminI18n, adminRoleLabel } from './adminI18n.js';
import { formatAdminTimestamp } from './adminPresentation.js';
import { ADMIN_VAULT_STATUSES, PROCESSING_ACCOUNT_ROLES, fetchAdminUsers, fetchAdminUserDetail } from '../../utils/adminService.js';
import { ChangeRoleModal, CreateUserModal, LockUserModal, ResetPasswordModal } from './AdminUserForms.jsx';
import './AdminPages.css';

// The backend refuses to lock an ACTIVE account that is in a case or whose vault is archived; hide the actions up front.
const manageBlocked = user => user.status === 'ACTIVE'
  && (user.accountStatus === 'IN_PROCESS' || ['IN_PROCESS', 'ARCHIVED'].includes(user.vaultStatus));

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
  const [vaultStatusFilter, setVaultStatusFilter] = useState('');
  const showVaultStatus = roleFilter === 'VAULT_OWNER';
  const showProcessStatus = PROCESSING_ACCOUNT_ROLES.includes(roleFilter);
  const t = adminI18n[lang] || adminI18n.vi;
  const { data, loading, apiPending, error, deny, reload: handleReload } = useAdminQuery(
    fetchAdminUsers, accessToken, { lang, query, role: roleFilter, status: statusFilter, vaultStatus: showVaultStatus ? vaultStatusFilter : '', page, pageSize }, fetchOnMount, onUnauthorized, t.accessDenied
  );
  const users = data?.items || [];
  const total = data?.total ?? null;
  const [detailSelection, setDetailSelection] = useState(null);
  const detailUser = detailSelection?.data === data ? detailSelection.record : null;
  const setDetailUser = (record) => setDetailSelection(record ? { record, data } : null);
  const [creating, setCreating] = useState(false);
  const [roleTarget, setRoleTarget] = useState(null);
  const [lockTarget, setLockTarget] = useState(null);
  // null = dialog closed; { user: null } = opened from the header (any e-mail); { user } = opened from a table row.
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [notice, setNotice] = useState('');

  const handleCreated = () => {
    setCreating(false);
    setNotice(t.createdOk);
    setQuery('');
    setRoleFilter('');
    setStatusFilter('');
    setPage(1);
    handleReload();
  };
  const handleLockDone = () => {
    setNotice(lockTarget?.lock ? t.lockedOk : t.unlockedOk);
    setLockTarget(null);
    handleReload();
  };
  /** Closes the reset-password dialog and shows the success notice. */
  const handlePasswordReset = () => {
    setPasswordTarget(null);
    setNotice(t.resetPasswordOk);
  };
  const handleRoleChanged = () => {
    setRoleTarget(null);
    setNotice(t.roleChangedOk);
    handleReload();
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    handleReload();
  };

  const handleResetFilters = () => {
    setQuery('');
    setRoleFilter('');
    setStatusFilter('');
    setVaultStatusFilter('');
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
      <header className="lv-admin-header lv-admin-header--with-action">
        <div>
          <h1 id="admin-users-title" className="lv-admin-header-title">
            {t.usersTitle}
          </h1>
          <p className="lv-admin-header-subtitle">{t.usersSubtitle}</p>
        </div>
        <div className="lv-admin-header-actions" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="lv-admin-btn lv-admin-btn-secondary" onClick={() => { setNotice(''); setPasswordTarget({ user: null }); }}>
            <KeyRound size={18} aria-hidden="true" />
            {t.resetPasswordBtn}
          </button>
          <button type="button" className="lv-admin-btn lv-admin-btn-primary" onClick={() => { setNotice(''); setCreating(true); }}>
            <Plus size={18} aria-hidden="true" />
            {t.createUserBtn}
          </button>
        </div>
      </header>

      {notice && <p className="lv-admin-form-notice" role="status">{notice}</p>}

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
      <form className="lv-admin-toolbar lv-surface-card" onSubmit={handleSearchSubmit} role="search" aria-label={t.usersTitle}>
        <div className="lv-admin-toolbar-inputs">
          <label className="lv-admin-field lv-admin-field--search">
            <span>{t.searchLabel}</span>
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
              setVaultStatusFilter('');
              if ((statusFilter === 'IN_PROCESS' && e.target.value && !PROCESSING_ACCOUNT_ROLES.includes(e.target.value))
                  || (['PENDING', 'DELETED'].includes(statusFilter)
                    && (e.target.value === 'VAULT_OWNER' || PROCESSING_ACCOUNT_ROLES.includes(e.target.value)))) setStatusFilter('');
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
            <option value="LOCKED">{t.statusLocked}</option>
            {(showProcessStatus || !roleFilter) && <option value="IN_PROCESS">{t.statusInProcess}</option>}
            {!showProcessStatus && !showVaultStatus && <option value="DELETED">{t.statusDeleted}</option>}
            {!showProcessStatus && !showVaultStatus && <option value="PENDING">{t.statusPending}</option>}
          </select>
          </label>
          {showVaultStatus && <label className="lv-admin-field">
            <span>{t.vaultStatus}</span>
            <select className="lv-admin-select" value={vaultStatusFilter} aria-label={t.vaultStatus}
              onChange={event => { setVaultStatusFilter(event.target.value); setPage(1); }}>
              <option value="">{t.allVaultStatuses}</option>
              {ADMIN_VAULT_STATUSES.map(status => <option key={status} value={status}>{t.vaultStatuses[status]}</option>)}
            </select>
          </label>}
          <div className="lv-admin-filter-actions">
          <button type="submit" className="lv-admin-btn lv-admin-btn-primary">
            {lang === 'vi' ? 'Tìm kiếm' : 'Search'}
          </button>

          {(query || roleFilter || statusFilter || vaultStatusFilter) && (
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
      <div className="lv-admin-table-frame lv-surface-card">
      <div className="lv-admin-table-container" tabIndex={0} role="region" aria-label={lang === 'en' ? 'User table' : 'Bảng người dùng'}>
        <table className="lv-admin-table lv-admin-table--users" aria-label={t.usersTitle}>
          <thead>
            <tr>
              <th scope="col">{t.thName}</th>
              <th scope="col">{t.thEmail}</th>
              <th scope="col">{t.thRoles}</th>
              <th scope="col">{t.thJoinedDate}</th>
              <th scope="col">{t.thStatus}</th>
              {showVaultStatus && <th scope="col">{t.vaultStatus}</th>}
              <th scope="col" style={{ textAlign: 'right' }}>{t.thActions}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={showVaultStatus ? 7 : 6} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--lv-text-muted)' }}>
                  {t.loading}
                </td>
              </tr>
            ) : error || apiPending ? (
              <tr><td colSpan={showVaultStatus ? 7 : 6}>{t.notAvailable}</td></tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={showVaultStatus ? 7 : 6} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--lv-text-muted)' }}>
                  {apiPending ? (lang === 'vi' ? 'Đang chờ kết nối API Backend thực tế' : 'Awaiting live Backend API integration') : t.noUsersFound}
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td style={{ fontWeight: 600 }}>
                    <div className="lv-admin-name-cell">
                      <span>{user.fullName || t.notAvailable}</span>
                      <span
                        className={`lv-admin-mobile-status lv-admin-status-badge lv-admin-status-${(user.accountStatus || 'neutral').toLowerCase()}`}
                      >
                        {user.accountStatus === 'LOCKED'
                          ? t.statusLocked
                          : user.accountStatus === 'IN_PROCESS'
                          ? t.statusInProcess
                          : user.accountStatus === 'PENDING'
                          ? t.statusPending
                          : user.accountStatus === 'ACTIVE'
                          ? t.statusActive
                          : user.accountStatus === 'DELETED' ? t.statusDeleted : t.notAvailable}
                      </span>
                    </div>
                  </td>
                  <td>{user.email}</td>
                  <td>
                    <div className="lv-admin-role-list">
                      {user.roles.map((role) => (
                        <span key={role} className="lv-admin-role-badge" title={role}>
                          {adminRoleLabel(role, lang)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>{formatDate(user.createdAt)}</td>
                  <td>
                    <span
                      className={`lv-admin-status-badge lv-admin-status-${(user.accountStatus || 'neutral').toLowerCase()}`}
                    >
                      {user.accountStatus === 'LOCKED'
                        ? t.statusLocked
                        : user.accountStatus === 'IN_PROCESS'
                          ? t.statusInProcess
                          : user.accountStatus === 'PENDING'
                        ? t.statusPending
                        : user.accountStatus === 'ACTIVE'
                        ? t.statusActive
                        : user.accountStatus === 'DELETED' ? t.statusDeleted : t.notAvailable}
                    </span>
                  </td>
                  {showVaultStatus && <td><span className={`lv-admin-status-badge lv-admin-vault-${(user.vaultStatus || 'unknown').toLowerCase()}`}>
                    {t.vaultStatuses[user.vaultStatus] || t.notAvailable}
                  </span></td>}
                  <td className="lv-admin-cell-actions">
                    <div className="lv-admin-row-actions">
                    <button
                      type="button"
                      className="lv-admin-icon-btn"
                      onClick={() => setDetailUser(user)}
                      aria-label={t.viewDetails}
                      title={t.viewDetails}
                    >
                      <Eye size={18} aria-hidden="true" />
                    </button>
                    {!user.roles.includes('ADMIN') && user.status !== 'DELETED' && (
                      <button
                        type="button"
                        className="lv-admin-icon-btn"
                        onClick={() => { setNotice(''); setPasswordTarget({ user }); }}
                        aria-label={t.resetPasswordRowBtn}
                        title={t.resetPasswordRowBtn}
                      >
                        <KeyRound size={18} aria-hidden="true" />
                      </button>
                    )}
                    {!user.roles.includes('ADMIN') && ['ACTIVE', 'LOCKED'].includes(user.status) && !manageBlocked(user) && (
                      <button
                        type="button"
                        className="lv-admin-icon-btn"
                        onClick={() => { setNotice(''); setRoleTarget(user); }}
                        disabled={user.status === 'LOCKED'}
                        aria-label={t.changeRoleBtn}
                        title={user.status === 'LOCKED' ? t.roleUnavailableLocked : t.changeRoleBtn}
                      >
                        <UserCog size={18} aria-hidden="true" />
                      </button>
                    )}
                    {!user.roles.includes('ADMIN') && ['ACTIVE', 'LOCKED'].includes(user.status) && !manageBlocked(user) && (
                      <button
                        type="button"
                        className={`lv-admin-icon-btn${user.status === 'LOCKED' ? ' lv-admin-icon-btn--locked' : ''}`}
                        onClick={() => { setNotice(''); setLockTarget({ user, lock: user.status !== 'LOCKED' }); }}
                        aria-label={user.status === 'LOCKED' ? t.unlockBtn : t.lockBtn}
                        title={user.status === 'LOCKED' ? t.unlockBtn : t.lockBtn}
                      >
                        {user.status === 'LOCKED'
                          ? <Lock size={18} aria-hidden="true" />
                          : <LockOpen size={18} aria-hidden="true" />}
                      </button>
                    )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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

      {creating && <CreateUserModal lang={lang} accessToken={accessToken} onClose={() => setCreating(false)}
        onCreated={handleCreated} onUnauthorized={onUnauthorized} onDenied={deny} />}
      {passwordTarget && <ResetPasswordModal key={passwordTarget.user?.id || 'any'} lang={lang} accessToken={accessToken} user={passwordTarget.user}
        onClose={() => setPasswordTarget(null)} onDone={handlePasswordReset} onUnauthorized={onUnauthorized} onDenied={deny} />}
      {roleTarget && <ChangeRoleModal key={roleTarget.id} lang={lang} accessToken={accessToken} user={roleTarget}
        onClose={() => setRoleTarget(null)} onChanged={handleRoleChanged} onUnauthorized={onUnauthorized} onDenied={deny} />}

      {lockTarget && <LockUserModal key={`${lockTarget.user.id}-${lockTarget.lock}`} lang={lang} accessToken={accessToken}
        user={lockTarget.user} lock={lockTarget.lock} onClose={() => setLockTarget(null)} onDone={handleLockDone}
        onUnauthorized={onUnauthorized} onDenied={deny} />}

      {detailUser && <UserDetail key={detailUser.id} id={detailUser.id} accessToken={accessToken} lang={lang} role={roleFilter} showVaultStatus={showVaultStatus}
        onClose={() => setDetailUser(null)} onUnauthorized={onUnauthorized} onDenied={deny} />}
    </div>
  );
}

const loadUserDetail = (token, { id, ...options }) => fetchAdminUserDetail(token, id, options);
function UserDetail({ id, accessToken, lang, role, showVaultStatus, onClose, onUnauthorized, onDenied }) {
  const t = adminI18n[lang] || adminI18n.vi;
  const ref = useModalFocus(true, onClose);
  const { data, loading, error, apiPending, reload } = useAdminQuery(loadUserDetail, accessToken, { id, lang, role }, true,
    onUnauthorized, t.accessDenied, failure => { if (failure.status === 403) onDenied(); });
  return <div className="lv-admin-modal-backdrop" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="user-detail-modal-title">
    <div className="lv-admin-modal-card">
      <div className="lv-admin-modal-header"><h2 id="user-detail-modal-title">{t.userDetailTitle}</h2>
        <button type="button" className="lv-admin-modal-close-btn" onClick={onClose} aria-label={t.closeModal}>✕</button></div>
      <div className="lv-admin-modal-body">
        {loading ? <p role="status">{t.loading}</p> : error || apiPending ? <><p role="alert">{error || t.notAvailable}</p>
          <button type="button" className="lv-admin-btn lv-admin-btn-secondary" onClick={reload}>{t.retryBtn}</button></> : data && <dl className="lv-admin-detail-list">
          {[[t.userId, data.id], [t.userFullName, data.fullName], [t.userEmail, data.email], [t.userRoles, data.roles.map(role => adminRoleLabel(role, lang)).join(', ')],
            [t.userStatus, data.accountStatus === 'ACTIVE' ? t.statusActive : data.accountStatus === 'IN_PROCESS' ? t.statusInProcess : data.accountStatus === 'PENDING' ? t.statusPending : data.accountStatus === 'LOCKED' ? t.statusLocked : data.accountStatus === 'DELETED' ? t.statusDeleted : t.notAvailable],
            ...(showVaultStatus ? [[t.vaultStatus, t.vaultStatuses[data.vaultStatus] || t.notAvailable]] : []),
            [t.userCreatedAt, formatAdminTimestamp(data.createdAt, lang)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || t.notAvailable}</dd></div>)}
        </dl>}
      </div>
      <div className="lv-admin-modal-footer"><button type="button" className="lv-admin-btn lv-admin-btn-secondary" onClick={onClose}>{t.closeModal}</button></div>
    </div>
  </div>;
}
