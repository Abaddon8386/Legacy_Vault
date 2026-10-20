import { useState, useEffect, useRef } from 'react';
import { adminI18n } from './adminI18n.js';
import { fetchAdminAuditLogs } from '../../utils/adminService.js';
import './AdminPages.css';

const COMMON_ACTIONS = [
  'AUTH_REGISTERED',
  'AUTH_LOGIN_SUCCEEDED',
  'AUTH_LOGIN_FAILED',
  'VAULT_CREATED',
  'VAULT_ALERT_CANCELLED',
  'ASSET_CREATED',
  'ASSET_UPDATED',
  'ASSET_REVEALED',
  'WILL_UPLOADED',
  'WILL_VERSION_ADDED',
  'TRUSTEE_APPOINTED',
  'TRUSTEE_REVOKED',
  'BENEFICIARY_ADDED',
  'DMS_CHECKED_IN',
  'DMS_CONFIGURED',
  'LEGAL_DEATH_DOCUMENT_DECIDED',
  'HANDOVER_ASSET_DELIVERED',
];

export default function AdminLogsPage({
  lang = 'vi',
  accessToken = null,
  fetchOnMount = false,
  onUnauthorized = null,
}) {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [actionFilter, setActionFilter] = useState('');
  const [actorTypeFilter, setActorTypeFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(fetchOnMount);
  const [apiPending, setApiPending] = useState(!fetchOnMount);
  const [error, setError] = useState(null);

  // Detail Modal
  const [detailLog, setDetailLog] = useState(null);

  const abortControllerRef = useRef(null);
  const isFirstMountRef = useRef(true);
  const requestIdRef = useRef(0);
  const activeTokenRef = useRef(accessToken);
  const t = adminI18n[lang] || adminI18n.vi;

  const handleReload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const reqId = ++requestIdRef.current;
    const requestToken = accessToken;

    setLoading(true);
    setError(null);
    setApiPending(false);

    fetchAdminAuditLogs(accessToken, {
      action: actionFilter,
      actorType: actorTypeFilter,
      fromDate,
      toDate,
      page,
      pageSize,
      signal: controller.signal,
    })
      .then((res) => {
        if (reqId !== requestIdRef.current || requestToken !== activeTokenRef.current) {
          return; // Discard stale response
        }
        setLogs(res.items);
        setTotal(res.total);
        setLoading(false);
      })
      .catch((err) => {
        if (
          reqId !== requestIdRef.current ||
          requestToken !== activeTokenRef.current ||
          err.name === 'AbortError'
        ) {
          return;
        }
        if (err.status === 401 && typeof onUnauthorized === 'function') {
          onUnauthorized();
          return;
        }
        if (err.status === 403) {
          // Lỗi 1: Dọn sạch danh sách và chi tiết khi 403
          setLogs([]);
          setTotal(0);
          setDetailLog(null);
          setError(t.accessDenied || 'Access Denied (403)');
          setLoading(false);
          return;
        }
        if (
          err.status === 404 ||
          err.status === 501 ||
          err.code === 'API_NOT_AVAILABLE' ||
          err.code === 'BACKEND_NOT_READY'
        ) {
          setApiPending(true);
          setLogs([]);
          setTotal(0);
          setDetailLog(null);
        } else {
          setError(err.message || String(err));
        }
        setLoading(false);
      });
  };

  useEffect(() => {
    // Lỗi 2: Khi đổi accessToken / tài khoản, hủy request cũ và xóa dữ liệu phiên cũ ngay lập tức
    if (activeTokenRef.current !== accessToken) {
      activeTokenRef.current = accessToken;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      requestIdRef.current++;
      setLogs([]);
      setTotal(0);
      setDetailLog(null);
      setError(null);
    }

    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      if (!fetchOnMount) {
        return;
      }
    }

    let ignore = false;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const reqId = ++requestIdRef.current;
    const requestToken = accessToken;

    fetchAdminAuditLogs(accessToken, {
      action: actionFilter,
      actorType: actorTypeFilter,
      fromDate,
      toDate,
      page,
      pageSize,
      signal: controller.signal,
    })
      .then((res) => {
        if (ignore || reqId !== requestIdRef.current || requestToken !== activeTokenRef.current) {
          return; // Discard stale response
        }
        setLogs(res.items);
        setTotal(res.total);
        setError(null);
        setApiPending(false);
        setLoading(false);
      })
      .catch((err) => {
        if (
          ignore ||
          reqId !== requestIdRef.current ||
          requestToken !== activeTokenRef.current ||
          err.name === 'AbortError'
        ) {
          return;
        }
        if (err.status === 401 && typeof onUnauthorized === 'function') {
          onUnauthorized();
          return;
        }
        if (err.status === 403) {
          // Lỗi 1: Dọn sạch danh sách và chi tiết khi 403
          setLogs([]);
          setTotal(0);
          setDetailLog(null);
          setError(t.accessDenied || 'Access Denied (403)');
          setLoading(false);
          return;
        }
        if (
          err.status === 404 ||
          err.status === 501 ||
          err.code === 'API_NOT_AVAILABLE' ||
          err.code === 'BACKEND_NOT_READY'
        ) {
          setApiPending(true);
          setLogs([]);
          setTotal(0);
          setDetailLog(null);
        } else {
          setError(err.message || String(err));
        }
        setLoading(false);
      });

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [accessToken, actionFilter, actorTypeFilter, fetchOnMount, fromDate, onUnauthorized, page, pageSize, t.accessDenied, toDate]);

  const handleFilterSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    handleReload();
  };

  const handleResetFilters = () => {
    setActionFilter('');
    setActorTypeFilter('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const formatTimestamp = (isoString) => {
    if (!isoString) return t.notAvailable;
    try {
      const d = new Date(isoString);
      return d.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    } catch {
      return isoString;
    }
  };

  const renderActorLabel = (log) => {
    if (log.actorType === 'SYSTEM') {
      return <span style={{ color: 'var(--lv-brand-forest)', fontWeight: 600 }}>{t.actorSystem}</span>;
    }
    if (!log.actorId && !log.actorName) {
      return <span style={{ color: 'var(--lv-text-muted)', fontStyle: 'italic' }}>{t.actorDeleted}</span>;
    }
    return (
      <div>
        <div style={{ fontWeight: 600 }}>{log.actorName || log.actorId}</div>
        {log.actorId && log.actorName && (
          <div style={{ fontSize: 11, color: 'var(--lv-text-muted)', fontFamily: 'monospace' }}>
            ID: {log.actorId}
          </div>
        )}
      </div>
    );
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="lv-admin-container" aria-labelledby="admin-logs-title">
      <header className="lv-admin-header">
        <h1 id="admin-logs-title" className="lv-admin-header-title">
          {t.logsTitle}
        </h1>
        <p className="lv-admin-header-subtitle">{t.logsSubtitle}</p>
      </header>

      {/* Backend Integration Pending Notice */}
      {apiPending && (
        <section className="lv-admin-pending-banner" role="status" aria-label="Audit Logs API Pending Notice">
          <div className="lv-admin-pending-banner-header">
            <span className="lv-admin-pending-banner-title">
              {lang === 'vi' ? 'Trạng thái API Nhật ký kiểm toán' : 'Audit Logs API Integration Status'}
            </span>
            <span className="lv-admin-pending-badge">{t.pendingApiBadge}</span>
          </div>
          <p className="lv-admin-pending-banner-desc">{t.logsPendingNotice}</p>
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

      {/* Filters Toolbar */}
      <form className="lv-admin-toolbar" onSubmit={handleFilterSubmit} role="search" aria-label={t.logsTitle}>
        <div className="lv-admin-toolbar-inputs">
          <select
            className="lv-admin-select"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            aria-label={t.allActions}
          >
            <option value="">{t.allActions}</option>
            {COMMON_ACTIONS.map((act) => (
              <option key={act} value={act}>
                {act}
              </option>
            ))}
          </select>

          <select
            className="lv-admin-select"
            value={actorTypeFilter}
            onChange={(e) => {
              setActorTypeFilter(e.target.value);
              setPage(1);
            }}
            aria-label={t.allActorTypes}
          >
            <option value="">{t.allActorTypes}</option>
            <option value="USER">{t.actorUser}</option>
            <option value="SYSTEM">{t.actorSystem}</option>
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <label htmlFor="log-from-date" style={{ color: 'var(--lv-text-muted)' }}>{t.fromDate}</label>
            <input
              id="log-from-date"
              type="date"
              className="lv-admin-input"
              style={{ height: 40 }}
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <label htmlFor="log-to-date" style={{ color: 'var(--lv-text-muted)' }}>{t.toDate}</label>
            <input
              id="log-to-date"
              type="date"
              className="lv-admin-input"
              style={{ height: 40 }}
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>

          <button type="submit" className="lv-admin-btn lv-admin-btn-primary">
            {lang === 'vi' ? 'Lọc nhật ký' : 'Filter Logs'}
          </button>

          {(actionFilter || actorTypeFilter || fromDate || toDate) && (
            <button
              type="button"
              className="lv-admin-btn lv-admin-btn-secondary"
              onClick={handleResetFilters}
            >
              {t.resetFilters}
            </button>
          )}
        </div>
      </form>

      {/* Audit Logs Table */}
      <div className="lv-admin-table-container">
        <table className="lv-admin-table" aria-label={t.logsTitle}>
          <thead>
            <tr>
              <th scope="col">{t.thTimestamp}</th>
              <th scope="col">{t.thActor}</th>
              <th scope="col">{t.thActorRoles}</th>
              <th scope="col">{t.thAction}</th>
              <th scope="col">{t.thEntity}</th>
              {logs.some((l) => l.ipAddress) && <th scope="col">{t.logIp}</th>}
              <th scope="col" style={{ textAlign: 'right' }}>{t.thDetails}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--lv-text-muted)' }}>
                  {t.loading}
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--lv-text-muted)' }}>
                  {apiPending
                    ? (lang === 'vi' ? 'Đang chờ mở API Nhật ký kiểm toán' : 'Awaiting Audit Logs API enablement')
                    : t.noLogsFound}
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{formatTimestamp(log.occurredAt)}</td>
                  <td>{renderActorLabel(log)}</td>
                  <td>
                    {log.actorRoles.map((role) => (
                      <span key={role} className="lv-admin-role-badge">
                        {role}
                      </span>
                    ))}
                  </td>
                  <td>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 600,
                        color: log.action.includes('FAILED') ? 'var(--lv-status-error-text)' : 'var(--lv-brand-forest)',
                      }}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td>
                    {log.entityType ? (
                      <span style={{ fontSize: 12 }}>
                        <strong>{log.entityType}</strong>
                        {log.entityId && ` #${log.entityId}`}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  {logs.some((l) => l.ipAddress) && (
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{log.ipAddress || '—'}</td>
                  )}
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      className="lv-admin-btn lv-admin-btn-secondary"
                      style={{ height: 32, padding: '0 10px', fontSize: 12 }}
                      onClick={() => setDetailLog(log)}
                    >
                      {t.viewDetails}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && total > 0 && (
        <nav className="lv-admin-pagination" aria-label="Audit log pagination">
          <div className="lv-admin-pagination-info">
            {t.paginationPage} <strong>{page}</strong> {t.paginationOf} <strong>{totalPages}</strong> ({total} {lang === 'vi' ? 'sự kiện' : 'events'})
          </div>
          <div className="lv-admin-pagination-btns">
            <button
              type="button"
              className="lv-admin-btn lv-admin-btn-secondary"
              style={{ height: 32, padding: '0 12px' }}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t.prevPage}
            </button>
            <button
              type="button"
              className="lv-admin-btn lv-admin-btn-secondary"
              style={{ height: 32, padding: '0 12px' }}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {t.nextPage}
            </button>
          </div>
        </nav>
      )}

      {/* Log Detail Modal */}
      {detailLog && (
        <div className="lv-admin-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="log-detail-modal-title">
          <div className="lv-admin-modal-card" style={{ maxWidth: 640 }}>
            <div className="lv-admin-modal-header">
              <h2 id="log-detail-modal-title" className="lv-admin-modal-title">
                {t.logDetailTitle}
              </h2>
              <button
                type="button"
                className="lv-admin-modal-close-btn"
                onClick={() => setDetailLog(null)}
                aria-label={t.closeModal}
              >
                ✕
              </button>
            </div>
            <div className="lv-admin-modal-body">
              <div className="lv-admin-detail-list">
                <div className="lv-admin-detail-item">
                  <span className="lv-admin-detail-key">{t.logId}</span>
                  <span className="lv-admin-detail-val" style={{ fontFamily: 'monospace' }}>{detailLog.id}</span>
                </div>
                <div className="lv-admin-detail-item">
                  <span className="lv-admin-detail-key">{t.logTimestamp}</span>
                  <span className="lv-admin-detail-val" style={{ fontFamily: 'monospace' }}>{formatTimestamp(detailLog.occurredAt)}</span>
                </div>
                {detailLog.traceId && (
                  <div className="lv-admin-detail-item">
                    <span className="lv-admin-detail-key">{t.logTraceId}</span>
                    <span className="lv-admin-detail-val" style={{ fontFamily: 'monospace' }}>{detailLog.traceId}</span>
                  </div>
                )}
                <div className="lv-admin-detail-item">
                  <span className="lv-admin-detail-key">{t.logActorType}</span>
                  <span className="lv-admin-detail-val">{detailLog.actorType}</span>
                </div>
                <div className="lv-admin-detail-item">
                  <span className="lv-admin-detail-key">{t.logActionCode}</span>
                  <span className="lv-admin-detail-val" style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--lv-brand-forest)' }}>
                    {detailLog.action}
                  </span>
                </div>
                {detailLog.entityType && (
                  <div className="lv-admin-detail-item">
                    <span className="lv-admin-detail-key">{t.logEntityType}</span>
                    <span className="lv-admin-detail-val">{detailLog.entityType} ({detailLog.entityId || 'N/A'})</span>
                  </div>
                )}
                {detailLog.ipAddress && (
                  <div className="lv-admin-detail-item">
                    <span className="lv-admin-detail-key">{t.logIp}</span>
                    <span className="lv-admin-detail-val" style={{ fontFamily: 'monospace' }}>{detailLog.ipAddress}</span>
                  </div>
                )}
                {detailLog.stateBefore && (
                  <div className="lv-admin-detail-item">
                    <span className="lv-admin-detail-key">{t.logStateBefore}</span>
                    <pre style={{ background: 'var(--lv-bg-canvas)', padding: 10, borderRadius: 6, fontSize: 12, overflowX: 'auto', margin: '4px 0 0 0' }}>
                      {typeof detailLog.stateBefore === 'string' ? detailLog.stateBefore : JSON.stringify(detailLog.stateBefore, null, 2)}
                    </pre>
                  </div>
                )}
                {detailLog.stateAfter && (
                  <div className="lv-admin-detail-item">
                    <span className="lv-admin-detail-key">{t.logStateAfter}</span>
                    <pre style={{ background: 'var(--lv-bg-canvas)', padding: 10, borderRadius: 6, fontSize: 12, overflowX: 'auto', margin: '4px 0 0 0' }}>
                      {typeof detailLog.stateAfter === 'string' ? detailLog.stateAfter : JSON.stringify(detailLog.stateAfter, null, 2)}
                    </pre>
                  </div>
                )}
                {detailLog.context && (
                  <div className="lv-admin-detail-item">
                    <span className="lv-admin-detail-key">{t.logContext}</span>
                    <pre style={{ background: 'var(--lv-bg-canvas)', padding: 10, borderRadius: 6, fontSize: 12, overflowX: 'auto', margin: '4px 0 0 0' }}>
                      {typeof detailLog.context === 'string' ? detailLog.context : JSON.stringify(detailLog.context, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
            <div className="lv-admin-modal-footer">
              <button
                type="button"
                className="lv-admin-btn lv-admin-btn-secondary"
                onClick={() => setDetailLog(null)}
              >
                {t.closeModal}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
