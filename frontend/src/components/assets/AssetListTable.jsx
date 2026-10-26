import {
  FileText,
  KeyRound,
  Lock,
  Calendar,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '../common/Button'
import './AssetListTable.css'
import { getAssetTranslations } from '../../pages/assets/assetI18n.js'

/**
 * AssetListTable — PS-5: List assets only (Contract Aligned).
 * Displays contract metadata: name, assetType (TEXT | CREDENTIAL), hasPayload, createdAt.
 * Supports sorting and pagination.
 */
export function AssetListTable({ assets, t: externalT, lang = 'vi', query, totalElements, onQueryChange, onViewAsset, onEditAsset }) {
  const t = getAssetTranslations(externalT, lang)
  const [sortField, sortOrder] = query.sort.split(',')
  const currentPage = query.page + 1
  const pageSize = query.size
  const totalItems = totalElements
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const startIndex = query.page * pageSize
  const paginatedAssets = assets
  function handleSort(field) {
    const order = sortField === field && sortOrder === 'asc' ? 'desc' : 'asc'
    onQueryChange({ ...query, page: 0, sort: `${field},${order}` })
  }

  function getTypeMeta(assetType) {
    if (assetType === 'CREDENTIAL') {
      return {
        icon: <KeyRound size={14} />,
        label: t.assets.types.CREDENTIAL,
        badgeClass: 'lv-badge--gold',
      }
    }
    return {
      icon: <FileText size={14} />,
      label: t.assets.types.TEXT,
      badgeClass: 'lv-badge--forest',
    }
  }

  function formatDate(isoString) {
    if (!isoString) return '—'
    return new Date(isoString).toLocaleDateString(lang === 'en' ? 'en-US' : 'vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  function renderSortIcon(field) {
    if (sortField !== field) {
      return <ArrowUpDown size={13} className="lv-sort-icon lv-sort-icon--idle" />
    }
    return sortOrder === 'asc' ? (
      <ArrowUp size={13} className="lv-sort-icon lv-sort-icon--active" />
    ) : (
      <ArrowDown size={13} className="lv-sort-icon lv-sort-icon--active" />
    )
  }

  return (
    <div className="lv-table-wrapper">
      {/* Desktop & Tablet Table View */}
      <div className="lv-table-container">
        <table className="lv-table" aria-label={t.assets.title}>
          <thead>
            <tr>
              <th scope="col" className="lv-th-sortable" tabIndex={0} aria-sort={sortField === 'name' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleSort('name') } }}
                onClick={() => handleSort('name')}>
                <div className="lv-th-content">
                  <span>{t.assets.colName}</span>
                  {renderSortIcon('name')}
                </div>
              </th>

              <th scope="col" className="lv-th-sortable" tabIndex={0} aria-sort={sortField === 'assetType' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleSort('assetType') } }}
                onClick={() => handleSort('assetType')}>
                <div className="lv-th-content">
                  <span>{t.assets.colType}</span>
                  {renderSortIcon('assetType')}
                </div>
              </th>

              <th scope="col" className="lv-th-center">
                {t.assets.colPayloadStatus}
              </th>

              <th
                scope="col"
                className="lv-col-tablet-hide lv-th-sortable"
                tabIndex={0} aria-sort={sortField === 'createdAt' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleSort('createdAt') } }}
                onClick={() => handleSort('createdAt')}
              >
                <div className="lv-th-content">
                  <span>{t.assets.colDate}</span>
                  {renderSortIcon('createdAt')}
                </div>
              </th>
              <th scope="col" className="lv-th-actions">{t.assets.colActions}</th>
            </tr>
          </thead>
          <tbody>
            {paginatedAssets.map((asset) => {
              const typeMeta = getTypeMeta(asset.assetType)

              return (
                <tr key={asset.id} className="lv-table-row lv-table-row--fixed">
                  <td className="lv-td-asset-name">
                    <span className="lv-asset-primary-title" title={asset.name}>
                      {asset.name}
                    </span>
                    {asset.description && (
                      <span className="lv-asset-subtext" title={asset.description}>
                        {asset.description}
                      </span>
                    )}
                    <div className="lv-tablet-meta-subline">
                      <span className="lv-tablet-subitem">
                        <Calendar size={12} />
                        {formatDate(asset.createdAt)}
                      </span>
                    </div>
                  </td>

                  <td>
                    <span className={`lv-category-badge ${typeMeta.badgeClass}`}>
                      {typeMeta.icon}
                      <span>{typeMeta.label}</span>
                    </span>
                  </td>

                  <td className="lv-td-center">
                    {asset.hasPayload ? (
                      <span className="lv-doc-badge" style={{ color: 'var(--lv-brand-forest)' }}>
                        <Lock size={13} />
                        <span>{t.assets.payloadSecured}</span>
                      </span>
                    ) : (
                      <span className="lv-text-muted" style={{ fontSize: 12 }}>
                        {t.assets.payloadEmpty}
                      </span>
                    )}
                  </td>

                  <td className="lv-col-tablet-hide">
                    <span className="lv-date-cell">
                      <Calendar size={13} />
                      {formatDate(asset.createdAt)}
                    </span>
                  </td>
                  <td className="lv-td-actions">
                    <div className="lv-table-actions-cell">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="lv-asset-action-btn"
                        onClick={() => onViewAsset(asset)}
                      >
                        {t.assets.actions.view}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="lv-asset-action-btn"
                        onClick={() => onEditAsset(asset)}
                      >
                        {t.assets.actions.edit}
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="lv-mobile-card-list">
        {paginatedAssets.map((asset) => {
          const typeMeta = getTypeMeta(asset.assetType)

          return (
            <div key={asset.id} className="lv-mobile-card">
              <div className="lv-mobile-card__header">
                <div className="lv-mobile-card__title-group">
                  <span className={`lv-category-badge ${typeMeta.badgeClass}`}>
                    {typeMeta.icon}
                    <span>{typeMeta.label}</span>
                  </span>
                  <span className="lv-mobile-card__name" title={asset.name}>
                    {asset.name}
                  </span>
                </div>
              </div>

              {asset.description && (
                <p className="lv-mobile-card__desc" title={asset.description}>
                  {asset.description}
                </p>
              )}

              <div className="lv-mobile-card__footer">
                <div className="lv-mobile-card__val-block">
                  <span className="lv-mobile-card__label">{t.assets.colPayloadStatus}</span>
                  <span className="lv-doc-badge" style={{ color: 'var(--lv-brand-forest)' }}>
                    <ShieldCheck size={13} />
                    <span>{asset.hasPayload ? t.assets.payloadSecured : t.assets.payloadEmpty}</span>
                  </span>
                </div>

                <div className="lv-mobile-card__doc-block">
                  <span className="lv-date-cell" style={{ fontSize: 12 }}>
                    <Calendar size={12} />
                    {formatDate(asset.createdAt)}
                  </span>
                </div>
              </div>

              <div className="lv-mobile-actions-row">
                <Button
                  variant="secondary"
                  size="sm"
                  className="lv-asset-mobile-btn"
                  onClick={() => onViewAsset(asset)}
                >
                  {t.assets.actions.view}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="lv-asset-mobile-btn"
                  onClick={() => onEditAsset(asset)}
                >
                  {t.assets.actions.edit}
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination Bar */}
      <div className="lv-pagination-bar">
        <div className="lv-pagination-info">
          <span>
            {t.assets.pagination.showing}{' '}
            <strong>
              {totalItems === 0 ? 0 : startIndex + 1}
              {t.assets.pagination.to}
              {Math.min(startIndex + pageSize, totalItems)}
            </strong>{' '}
            {t.assets.pagination.of} <strong>{totalItems}</strong>{' '}
            {t.assets.pagination.assets}
          </span>
        </div>

        <div className="lv-pagination-controls">
          <div className="lv-page-nav-btns">
            <Button
              variant="secondary"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => onQueryChange({ ...query, page: Math.max(0, query.page - 1) })}
            >
              <ChevronLeft size={15} />
              <span>{t.assets.pagination.prev}</span>
            </Button>
            <span className="lv-current-page-num">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => onQueryChange({ ...query, page: Math.min(totalPages - 1, query.page + 1) })}
            >
              <span>{t.assets.pagination.next}</span>
              <ChevronRight size={15} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
