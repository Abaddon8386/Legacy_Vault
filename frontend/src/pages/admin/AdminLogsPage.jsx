import { useState } from 'react';
import DatePicker from '../../components/common/DatePicker.jsx';
import { useAdminQuery } from './useAdminQuery.js';
import { adminI18n } from './adminI18n.js';
import { adminActionLabel, formatAdminTimestamp } from './adminPresentation.js';
import { Modal } from '../../components/common/Modal.jsx';
import { fetchAdminAuditDetail, fetchAdminAuditLogs } from '../../utils/adminService.js';
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
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [actionFilter, setActionFilter] = useState('');
  const [actorTypeFilter, setActorTypeFilter] = useState('');
  const [actorIdFilter, setActorIdFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const t = adminI18n[lang] || adminI18n.vi;
  const { data, loading, apiPending, error, deny, reload: handleReload } = useAdminQuery(
    fetchAdminAuditLogs, accessToken, { lang, action: actionFilter, actorType: actorTypeFilter, actorId: actorIdFilter.trim(), fromDate, toDate, page, pageSize }, fetchOnMount, onUnauthorized, t.accessDenied
  );
  const logs = data?.items || [];
  const total = data?.total ?? null;
  const [detailSelection, setDetailSelection] = useState(null);
  const detailLog = detailSelection?.data === data ? detailSelection.record : null;
  const setDetailLog = (record) => setDetailSelection(record ? { record, data } : null);

  const handleFilterSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    handleReload();
  };

  const handleResetFilters = () => {
    setActionFilter('');
    setActorTypeFilter('');
    setActorIdFilter('');
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
    if (log.actorType === 'DELETED_USER') {
      return <span style={{ color: 'var(--lv-text-muted)', fontStyle: 'italic' }}>{t.actorDeleted}</span>;
    }
    if (log.actorType === 'UNKNOWN') return <span>{t.actorUnknown}</span>;
    return (
      <div>
        <div style={{ fontWeight: 600 }}>{log.actorName || t.actorUser}</div>
        {log.actorId && (
          <div className="lv-admin-code">
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
              {lang === 'vi' ? 'Thông tin nhật ký' : 'Audit log information'}
            </span>
            <span className="lv-admin-pending-badge">{t.pendingApiBadge}</span>
          </div>
          <p className="lv-admin-pending-banner-desc">{t.logsPendingNotice}</p>
          {fetchOnMount && <button type="button" className="lv-admin-btn lv-admin-btn-secondary" onClick={handleReload}>{t.retryBtn}</button>}
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
      <form className="lv-admin-toolbar lv-surface-card" onSubmit={handleFilterSubmit} role="search" aria-label={t.logsTitle}>
        <div className="lv-admin-toolbar-inputs">
          <label className="lv-admin-field">
            <span>{t.thAction}</span>
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
                {adminActionLabel(act, lang)}
              </option>
            ))}
          </select>
          </label>
          <label className="lv-admin-field">
            <span>{t.thActor}</span>
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
            <option value="DELETED_USER">{t.actorDeleted}</option>
            <option value="UNKNOWN">{t.actorUnknown}</option>
          </select>
          </label>
          <div className="lv-admin-field">
            <label htmlFor="log-actor-id">{t.logActorId}</label>
            <input id="log-actor-id" type="text" className="lv-admin-input" value={actorIdFilter}
              onChange={event => { setActorIdFilter(event.target.value); setPage(1); }} />
          </div>
          <div className="lv-admin-field">
            <label htmlFor="log-from-date">{t.fromDate}</label>
            <DatePicker
              id="log-from-date"
              lang={lang}
              value={fromDate}
              onChange={(value) => { setFromDate(value); setPage(1); }}
            />
          </div>

          <div className="lv-admin-field">
            <label htmlFor="log-to-date">{t.toDate}</label>
            <DatePicker
              id="log-to-date"
              lang={lang}
              value={toDate}
              onChange={(value) => { setToDate(value); setPage(1); }}
            />
          </div>

          <div className="lv-admin-filter-actions">
          <button type="submit" className="lv-admin-btn lv-admin-btn-primary">
            {lang === 'vi' ? 'Lọc nhật ký' : 'Filter Logs'}
          </button>

          {(actionFilter || actorTypeFilter || actorIdFilter || fromDate || toDate) && (
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

      {/* Audit Logs Table */}
      <div className="lv-admin-list-meta">
        <p>{lang === 'en' ? 'Recorded events' : 'Sự kiện đã ghi nhận'}{total !== null && !loading && <> <strong>({total})</strong></>}</p>
        <span className="lv-admin-scroll-hint">{lang === 'en' ? 'Scroll horizontally to see all columns' : 'Cuộn ngang để xem đầy đủ các cột'}</span>
      </div>
      <div className="lv-admin-table-frame lv-surface-card">
      <div className="lv-admin-table-container" tabIndex={0} role="region" aria-label={lang === 'en' ? 'Audit log table' : 'Bảng nhật ký'}>
        <table className="lv-admin-table" aria-label={t.logsTitle}>
          <thead>
            <tr>
              <th scope="col">{t.thTimestamp}</th>
              <th scope="col">{t.thActor}</th>

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
            ) : error || apiPending ? (
              <tr><td colSpan={7}>{t.notAvailable}</td></tr>
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
                  <td>{formatTimestamp(log.occurredAt)}</td>
                  <td>{renderActorLabel(log)}</td>
                  <td>
                    <span
                      style={{
                        fontWeight: 600,
                        color: log.action.includes('FAILED') ? 'var(--lv-status-error-text)' : 'var(--lv-brand-forest)',
                      }}
                    >
                      {adminActionLabel(log.action, lang)}
                    </span>
                    {adminActionLabel(log.action, lang) !== log.action && <span className="lv-admin-code">{log.action}</span>}
                  </td>
                  <td>
                    {log.entityType ? (
                      <span style={{ fontSize: 12 }}>
                        <strong>{log.entityType}</strong>
                        {log.vaultId && <div className="lv-admin-code">{t.logVaultId} {log.vaultId}</div>}
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

      {detailLog && <AuditDetail key={detailLog.id} event={detailLog} accessToken={accessToken} lang={lang}
        onClose={() => setDetailLog(null)} onUnauthorized={onUnauthorized} onDenied={deny} />}
    </div>
  );
}

const loadDetail = (token, { id, ...options }) => fetchAdminAuditDetail(token, id, options);
function CopyButton({ text, lang }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (!text) return;
    navigator.clipboard?.writeText(String(text));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      style={{
        marginLeft: '8px',
        padding: '2px 8px',
        fontSize: '11px',
        borderRadius: '4px',
        border: '1px solid #dce4dc',
        background: '#fff',
        cursor: 'pointer',
        color: '#164639',
      }}
      title={lang === 'en' ? 'Copy to clipboard' : 'Sao chép'}
    >
      {copied ? (lang === 'en' ? '✓ Copied' : '✓ Đã chép') : (lang === 'en' ? 'Copy' : 'Sao chép')}
    </button>
  );
}

function AuditDetail({ event, accessToken, lang, onClose, onUnauthorized, onDenied }) {
  const t = adminI18n[lang] || adminI18n.vi;
  const onFailure = (error) => { if (error.status === 403) onDenied(); };
  const { data, loading, error, apiPending } = useAdminQuery(loadDetail, accessToken, { id: event.id, lang }, true, onUnauthorized, t.accessDenied, onFailure);

  const formatFullTimestamp = (occurredAt) => {
    if (!occurredAt) return t.notAvailable;
    const local = formatAdminTimestamp(occurredAt, lang);
    try {
      const utcStr = new Date(occurredAt).toISOString().replace('.000Z', ' UTC').replace('T', ' ');
      return `${local} (${utcStr})`;
    } catch {
      return local;
    }
  };

  return <Modal isOpen onClose={onClose} title={t.logDetailTitle} closeLabel={t.closeModal}>
    {loading ? <p role="status">{t.loading}</p> : error ? <p role="alert">{error}</p> : apiPending ? <p role="status">{t.logsPendingNotice}</p> : data && (
      <div>
        {/* Primary Event Overview: Meaning, Actor, Time */}
        <section aria-label={lang === 'en' ? 'Event overview' : 'Thông tin sự kiện'} style={{ marginBottom: '18px' }}>
          <dl className="lv-admin-detail-list">
            <div>
              <dt>{t.logActionCode}</dt>
              <dd>
                <strong>{adminActionLabel(data.action, lang)}</strong>
                {adminActionLabel(data.action, lang) !== data.action && (
                  <span className="lv-admin-code" style={{ marginLeft: '8px' }}>{data.action}</span>
                )}
              </dd>
            </div>
            <div>
              <dt>{t.logEntityType}</dt>
              <dd>{data.entityType ?? t.notAvailable}</dd>
            </div>
            <div>
              <dt>{t.logActorType}</dt>
              <dd>{data.actorType ?? t.notAvailable}</dd>
            </div>
            <div>
              <dt>{t.logTimestamp}</dt>
              <dd>{formatFullTimestamp(data.occurredAt)}</dd>
            </div>
          </dl>
        </section>

        {/* Technical Reference Identifiers (Secondary & Copyable) */}
        <details open style={{ padding: '12px 14px', background: '#f8faf7', border: '1px solid #e2e8e2', borderRadius: '8px' }}>
          <summary style={{ fontWeight: 600, fontSize: '13px', color: '#164639', cursor: 'pointer' }}>
            {lang === 'en' ? 'Technical identifiers & trace' : 'Định danh kỹ thuật & nhật ký vết'}
          </summary>
          <dl className="lv-admin-detail-list" style={{ marginTop: '12px', marginBottom: 0 }}>
            <div>
              <dt>{t.logId}</dt>
              <dd>
                <code>{data.id ?? t.notAvailable}</code>
                {data.id && <CopyButton text={data.id} lang={lang} />}
              </dd>
            </div>
            <div>
              <dt>{t.logTraceId}</dt>
              <dd>
                <code>{data.traceId ?? t.notAvailable}</code>
                {data.traceId && <CopyButton text={data.traceId} lang={lang} />}
              </dd>
            </div>
            <div>
              <dt>{t.logActorId}</dt>
              <dd>
                <code>{data.actorId ?? t.notAvailable}</code>
                {data.actorId && <CopyButton text={data.actorId} lang={lang} />}
              </dd>
            </div>
            <div>
              <dt>{t.logVaultId}</dt>
              <dd>
                <code>{data.vaultId ?? t.notAvailable}</code>
                {data.vaultId && <CopyButton text={data.vaultId} lang={lang} />}
              </dd>
            </div>
          </dl>
        </details>
      </div>
    )}
  </Modal>;
}
