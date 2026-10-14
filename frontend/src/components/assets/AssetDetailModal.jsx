import { useState, useEffect, useRef, useCallback } from 'react'
import { Modal } from '../common/Modal'
import { Button } from '../common/Button'
import { FileText, KeyRound, Lock, Calendar, Clock, ShieldCheck, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { assetService } from '../../services/assetService'
import './AssetListTable.css'

/**
 * AssetDetailModal — PS-6: View Asset Detail & Reveal Secret Payload (Contract Aligned).
 *
 * Displays:
 * - name
 * - assetType (TEXT | CREDENTIAL) -> "Dạng nội dung"
 * - description
 * - hasPayload (status indicator)
 * - createdAt, updatedAt
 * - Reveal confidential payload via password re-authentication (D-API-32).
 *
 * SECURITY:
 * - Password and revealed payload are cleared upon modal close, asset switch, session switch, or unmount.
 * - Password is immediately cleared from state after submit attempt.
 * - No payload or password stored in browser storage.
 * - Anti double-submit via pendingRef and disabled states.
 */
export function AssetDetailModal({
  isOpen,
  onClose,
  asset,
  t,
  lang = 'vi',
  vaultId,
  accessToken,
  onNavigateToLogin,
}) {
  const [isReauthOpen, setIsReauthOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isRevealing, setIsRevealing] = useState(false)
  const [revealedPayload, setRevealedPayload] = useState(null)
  const [revealErrorKey, setRevealErrorKey] = useState(null)

  const abortRef = useRef(null)
  const pendingRef = useRef(false)
  const activeContextRef = useRef({ assetId: asset?.id, vaultId, accessToken })

  const resetRevealState = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    pendingRef.current = false
    setIsReauthOpen(false)
    setPassword('')
    setShowPassword(false)
    setIsRevealing(false)
    setRevealedPayload(null)
    setRevealErrorKey(null)
  }, [])

  useEffect(() => {
    activeContextRef.current = { assetId: asset?.id, vaultId, accessToken }
    return () => {
      resetRevealState()
    }
  }, [asset?.id, vaultId, accessToken, resetRevealState])

  const handleClose = () => {
    resetRevealState()
    onClose()
  }

  const handleRevealSubmit = async (e) => {
    e?.preventDefault()
    if (pendingRef.current || isRevealing) return
    const trimmed = password.trim()
    if (!trimmed) {
      setRevealErrorKey('passwordRequired')
      return
    }
    pendingRef.current = true
    setIsRevealing(true)
    setRevealErrorKey(null)
    const controller = new AbortController()
    abortRef.current = controller
    const requestContext = { assetId: asset?.id, vaultId, accessToken }

    try {
      const res = await assetService.revealAsset(vaultId, asset.id, trimmed, {
        lang,
        accessToken,
        signal: controller.signal,
      })

      const isCurrent =
        !controller.signal.aborted &&
        activeContextRef.current.assetId === requestContext.assetId &&
        activeContextRef.current.vaultId === requestContext.vaultId &&
        activeContextRef.current.accessToken === requestContext.accessToken

      if (isCurrent) {
        setRevealedPayload(res.payload)
        setIsReauthOpen(false)
        setPassword('')
      }
    } catch (err) {
      const isCurrent =
        !controller.signal.aborted &&
        activeContextRef.current.assetId === requestContext.assetId &&
        activeContextRef.current.vaultId === requestContext.vaultId &&
        activeContextRef.current.accessToken === requestContext.accessToken

      if (!isCurrent) return
      setPassword('')
      if (err.status === 401) {
        resetRevealState()
        onNavigateToLogin?.()
        return
      }
      if (err.code === 'REAUTH_FAILED') {
        setRevealErrorKey('REAUTH_FAILED')
      } else if (err.code === 'ACCESS_DENIED' || (err.status === 403 && err.code !== 'REAUTH_FAILED')) {
        setRevealErrorKey('ACCESS_DENIED')
      } else if (err.code === 'TOO_MANY_ATTEMPTS' || err.status === 429) {
        setRevealErrorKey('TOO_MANY_ATTEMPTS')
      } else if (err.status === 409) {
        setRevealErrorKey('VAULT_NOT_EDITABLE')
      } else if (err.status === 404) {
        setRevealErrorKey('RESOURCE_NOT_FOUND')
      } else {
        setRevealErrorKey(err.code || 'loadError')
      }
    } finally {
      pendingRef.current = false
      setIsRevealing(false)
      abortRef.current = null
    }
  }

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
      onClose={handleClose}
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
          {/* Asset Type / Content Format */}
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

        {/* Reveal / Secret Payload Section */}
        {asset.hasPayload && (
          <div
            style={{
              padding: '14px 16px',
              backgroundColor: '#faf8f5',
              border: '1px solid var(--lv-border-subtle, #eae5dc)',
              borderRadius: 'var(--lv-radius-control, 10px)',
              fontSize: '13px',
              color: 'var(--lv-text-ink, #243c32)',
              marginTop: '4px',
            }}
          >
            {/* Case 1: Payload is revealed */}
            {revealedPayload !== null ? (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px',
                  }}
                >
                  <strong style={{ color: 'var(--lv-brand-forest, #164639)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Lock size={14} style={{ color: 'var(--lv-accent-gold, #c5a059)' }} />
                    {t.assets.detailModal.revealedTitle}
                  </strong>
                  <button
                    type="button"
                    onClick={() => setRevealedPayload(null)}
                    style={{
                      background: 'none',
                      border: '1px solid var(--lv-border-subtle, #eae5dc)',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '12px',
                      color: 'var(--lv-text-muted, #68736b)',
                      cursor: 'pointer',
                    }}
                  >
                    {t.assets.detailModal.hideBtn}
                  </button>
                </div>
                <pre
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #dce2da',
                    borderRadius: '8px',
                    padding: '12px',
                    fontSize: '13px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    margin: 0,
                    maxHeight: '200px',
                    overflowY: 'auto',
                    fontFamily: 'monospace',
                    color: '#164639',
                  }}
                >
                  {revealedPayload}
                </pre>
              </div>
            ) : isReauthOpen ? (
              /* Case 2: Reauth password input form */
              <form onSubmit={handleRevealSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--lv-brand-forest, #164639)', fontWeight: 600 }}>
                  <Lock size={14} style={{ color: 'var(--lv-accent-gold, #c5a059)' }} />
                  <span>{t.assets.detailModal.passwordPrompt}</span>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      maxLength={72}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        if (revealErrorKey) setRevealErrorKey(null)
                      }}
                      placeholder={t.assets.detailModal.passwordPlaceholder}
                      disabled={isRevealing}
                      autoFocus
                      aria-label={t.assets.detailModal.passwordLabel}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '10px 36px 10px 12px',
                        border: '1px solid #dce2da',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontFamily: 'inherit',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      tabIndex={-1}
                      aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--lv-text-muted, #68736b)',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isRevealing || !password.trim()}
                    style={{ padding: '9px 16px', fontSize: '13px' }}
                  >
                    {isRevealing ? t.assets.detailModal.revealingBtn : t.assets.detailModal.confirmBtn}
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isRevealing}
                    onClick={() => {
                      setIsReauthOpen(false)
                      setPassword('')
                      setRevealErrorKey(null)
                    }}
                    style={{ padding: '9px 14px', fontSize: '13px' }}
                  >
                    {t.assets.detailModal.cancelBtn}
                  </Button>
                </div>

                {revealErrorKey && (
                  <p
                    role="alert"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      color: '#a03832',
                      fontSize: '12.5px',
                      margin: '2px 0 0',
                    }}
                  >
                    <AlertCircle size={14} />
                    <span>
                      {t.assets.alerts[revealErrorKey] ||
                        (revealErrorKey === 'passwordRequired'
                          ? t.assets.validation.payloadRequired
                          : t.assets.alerts.loadError)}
                    </span>
                  </p>
                )}
              </form>
            ) : (
              /* Case 3: Initial state: Protected notice with Reveal button */
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Lock size={14} style={{ color: 'var(--lv-accent-gold, #c5a059)', flexShrink: 0 }} />
                  <span style={{ color: 'var(--lv-text-muted, #68736b)' }}>
                    {t.assets.detailModal.payloadNotice}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsReauthOpen(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12.5px',
                    padding: '6px 14px',
                  }}
                >
                  <Eye size={14} />
                  <span>{t.assets.detailModal.revealBtn}</span>
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="lv-modal-actions-right">
          <Button variant="primary" onClick={handleClose}>
            {t.assets.closeBtn}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
