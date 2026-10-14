import { Modal } from '../common/Modal'
import { Button } from '../common/Button'
import { FileText, KeyRound, Lock, Calendar, Clock, ShieldCheck } from 'lucide-react'
import './AssetListTable.css'

/**
 * AssetDetailModal — PS-6: View Asset Detail (Contract Aligned).
 *
 * Displays:
 * - name
 * - assetType (TEXT | CREDENTIAL)
 * - description
 * - hasPayload (status indicator)
 * - createdAt
 * - updatedAt
 *
 * SECURITY:
 * Never renders payload plaintext, internal DB IDs, or encryption metadata.
 */
export function AssetDetailModal({ isOpen, onClose, asset, t, lang = 'vi' }) {
  if (!isOpen || !asset) return null

  function formatDate(isoString) {
    if (!isoString) return '—'
    return new Date(isoString).toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const isCredential = asset.assetType === 'CREDENTIAL'
  const typeLabel = isCredential ? t.assets.types.CREDENTIAL : t.assets.types.TEXT
  const typeBadgeClass = isCredential ? 'lv-badge--gold' : 'lv-badge--forest'
  const TypeIcon = isCredential ? KeyRound : FileText

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t.assets.detailModal.title}
      closeLabel={t.assets.closeBtn}
    >
      <div className="lv-detail-container">
        {/* Asset Name */}
        <div className="lv-detail-group">
          <span className="lv-detail-label">{t.assets.detailModal.nameLabel}</span>
          <h3 className="lv-detail-title">{asset.name}</h3>
        </div>

        {/* Metadata Grid */}
        <div className="lv-detail-grid">
          {/* Asset Type */}
          <div className="lv-detail-group">
            <span className="lv-detail-label">{t.assets.detailModal.typeLabel}</span>
            <span className={`lv-category-badge ${typeBadgeClass}`}>
              <TypeIcon size={14} />
              <span>{typeLabel}</span>
            </span>
          </div>

          {/* Secret Content Status */}
          <div className="lv-detail-group">
            <span className="lv-detail-label">{t.assets.detailModal.payloadLabel}</span>
            <span
              className="lv-doc-badge"
              style={{
                color: asset.hasPayload ? 'var(--lv-brand-forest)' : 'var(--lv-text-muted)',
              }}
            >
              {asset.hasPayload ? <Lock size={13} /> : <ShieldCheck size={13} />}
              <span>
                {asset.hasPayload ? t.assets.payloadSecured : t.assets.payloadEmpty}
              </span>
            </span>
          </div>

          {/* Created At */}
          <div className="lv-detail-group">
            <span className="lv-detail-label">{t.assets.detailModal.createdAtLabel}</span>
            <span className="lv-date-cell">
              <Calendar size={13} />
              <span>{formatDate(asset.createdAt)}</span>
            </span>
          </div>

          {/* Updated At */}
          <div className="lv-detail-group">
            <span className="lv-detail-label">{t.assets.detailModal.updatedAtLabel}</span>
            <span className="lv-date-cell">
              <Clock size={13} />
              <span>{formatDate(asset.updatedAt || asset.createdAt)}</span>
            </span>
          </div>
        </div>

        {/* Description */}
        <div className="lv-detail-group">
          <span className="lv-detail-label">{t.assets.detailModal.descLabel}</span>
          <p className="lv-detail-desc">
            {asset.description || t.assets.noDescription}
          </p>
        </div>

        {/* Security Notice */}
        {asset.hasPayload && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: '#faf8f5',
              border: '1px solid var(--lv-border-subtle)',
              borderRadius: 'var(--lv-radius-control)',
              fontSize: '12.5px',
              color: 'var(--lv-text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Lock size={14} style={{ color: 'var(--lv-accent-gold)', flexShrink: 0 }} />
            <span>{t.assets.detailModal.payloadNotice}</span>
          </div>
        )}

        {/* Actions */}
        <div className="lv-modal-actions-right">
          <Button variant="primary" onClick={onClose}>
            {t.assets.closeBtn}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
