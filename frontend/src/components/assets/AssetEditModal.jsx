import { useState, useLayoutEffect, useRef } from 'react'
import { AssetCredentialFields } from './AssetCredentialFields.jsx'
import { credentialPayload } from '../../utils/credentialPayload.js'
import { useModalFocus } from '../common/useModalFocus'
import { Button } from '../common/Button'
import { AlertCircle, Lock, KeyRound, FileText } from 'lucide-react'
import './AssetFormModal.css'

/**
 * AssetEditModal — PS-6: Edit Asset (Contract Aligned).
 *
 * Editable: name, description, payload (write-only).
 * Read-only: id, vaultId, assetType, hasPayload, createdAt, updatedAt.
 *
 * Payload rules:
 * - Starts empty. Never prefill previous value.
 * - If left blank: omitted from patchData (preserves existing secret).
 * - If filled: included in patchData (overwrites secret).
 */
export function AssetEditModal({
  isOpen,
  onClose,
  asset,
  onSubmit,
  t,
  isSubmitting = false,
  errorKey,
  authContext,
}) {
  const [name, setName] = useState(asset?.name || '')
  const [description, setDescription] = useState(asset?.description || '')
  const [payload, setPayload] = useState('')
  const [credentials, setCredentials] = useState({ username: '', password: '' })
  const replacementPayload = asset?.assetType === 'CREDENTIAL' ? credentialPayload(credentials.username, credentials.password) : payload
  const [errors, setErrors] = useState({})
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const submission = useRef(null), pending = useRef(false)
  useLayoutEffect(() => () => { submission.current?.abort(); submission.current = null; pending.current = false }, [asset?.id, isOpen, authContext])
  const [previous, setPrevious] = useState({ id: asset?.id, isOpen, authContext })
  if (previous.id !== asset?.id || previous.isOpen !== isOpen || previous.authContext !== authContext) {
    if (previous.id !== asset?.id || previous.isOpen !== isOpen) {
      setName(asset?.name || ''); setDescription(asset?.description || ''); setPayload(''); setCredentials({ username: '', password: '' })
    }
    setPrevious({ id: asset?.id, isOpen, authContext }); setPassword(''); setSaving(false); setErrors({})
  }
  const busy = isSubmitting || saving
  const canSubmit = typeof onSubmit === 'function'

  function validate() {
    const errs = {}
    const trimmedName = name.trim()

    if (!trimmedName) {
      errs.name = 'nameRequired'
    } else if (trimmedName.length > 150) {
      errs.name = 'nameMax'
    }

    if (description && description.length > 1000) {
      errs.description = 'descMax'
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (busy || pending.current || !validate()) return

    const patchData = {}
    if (name.trim() !== asset.name) patchData.name = name.trim()
    if (description.trim() !== (asset.description || '')) patchData.description = description.trim()
    if (replacementPayload.length) patchData.payload = replacementPayload
    if (!Object.keys(patchData).length) {
      setErrors({ noChanges: true })
      return
    }

    if (!canSubmit) return
    if (!password.trim()) { setErrors({ password: 'required' }); return }
    pending.current = true; setSaving(true)
    const controller = new AbortController(); submission.current = controller
    const submittedPassword = password
    setPassword('')
    try {
      await onSubmit(asset.id, { ...patchData, password: submittedPassword }, { signal: controller.signal })
    } catch (error) {
      if (!controller.signal.aborted && submission.current === controller) {
        setErrors(error.code === 'REAUTH_FAILED' ? { password: 'failed' } : error.code === 'TOO_MANY_ATTEMPTS' ? { rateLimited: true } : { save: true })
      }
    } finally {
      if (submission.current === controller) {
        submission.current = null; pending.current = false
        if (!controller.signal.aborted) setSaving(false)
      }
    }
  }

  function handleResetAndClose() {
    if (busy) return
    setPayload('')
    setPassword('')
    setCredentials({ username: '', password: '' })
    setErrors({})
    onClose()
  }

  const dialogRef = useModalFocus(isOpen, handleResetAndClose, busy)

  if (!isOpen || !asset) return null

  const isCredential = asset.assetType === 'CREDENTIAL'
  const TypeIcon = isCredential ? KeyRound : FileText
  const typeLabel = isCredential ? t.assets.types.CREDENTIAL : t.assets.types.TEXT

  return (
    <div className="lv-modal-backdrop" onClick={handleResetAndClose} role="presentation">
      <div
        className="lv-modal lv-asset-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        ref={dialogRef}
        aria-labelledby="asset-edit-modal-title"
      >
        <div className="lv-modal__header">
          <div>
            <h2 id="asset-edit-modal-title" className="lv-modal__title">
              {t.assets.editModal.title}
            </h2>
            <p className="lv-modal__desc">{t.assets.editModal.desc}</p>
          </div>
          <button
            type="button"
            className="lv-modal__close-btn"
            onClick={handleResetAndClose}
            aria-label={t.assets.closeBtn}
            disabled={busy}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="lv-modal__body lv-asset-form" noValidate>
          <div className="lv-asset-form__scroll">
          {errorKey && <p className="lv-form-error" role="alert">{t.assets.alerts[errorKey] || t.assets.alerts.editError}</p>}
          {errors.save && <p className="lv-form-error" role="alert">{t.assets.alerts.editError}</p>}
          {errors.rateLimited && <p className="lv-form-error" role="alert">{t.assets.alerts.TOO_MANY_ATTEMPTS}</p>}
          {errors.noChanges && <p className="lv-form-error" role="alert">{t.assets.editModal.noChangesError}</p>}
          {/* Read-only Asset Type */}
          <div className="lv-form-group">
            <label className="lv-form-label">
              {t.assets.editModal.typeLabel}
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                backgroundColor: '#f5f3ee',
                borderRadius: 'var(--lv-radius-control)',
                border: '1px solid var(--lv-border-subtle)',
                color: 'var(--lv-text-ink)',
                fontSize: '14px',
              }}
            >
              <TypeIcon size={16} style={{ color: 'var(--lv-brand-forest)' }} />
              <span style={{ fontWeight: 600 }}>{typeLabel}</span>
            </div>
            <span className="lv-form-hint">
              {t.assets.editModal.typeImmutableHint}
            </span>
          </div>

          {/* Asset Name (Editable, prefilled) */}
          <div className="lv-form-group">
            <label htmlFor="edit-asset-name" className="lv-form-label">
              {t.assets.editModal.nameLabel} <span className="lv-required">*</span>
            </label>
            <input
              id="edit-asset-name"
              type="text"
              maxLength={150}
              className={`lv-form-input ${errors.name ? 'lv-form-input--error' : ''}`}
              placeholder={t.assets.addModal.namePlaceholder}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (errors.name || errors.noChanges) setErrors((prev) => ({ ...prev, name: undefined, noChanges: false }))
              }}
              disabled={busy}
            />
            {errors.name && (
              <p className="lv-form-error" role="alert">
                <AlertCircle size={14} /> {t.assets.validation[errors.name]}
              </p>
            )}
          </div>

          {/* Confidential Payload (Write-Only, starts empty) */}
          <div className="lv-form-group">
            <label htmlFor={isCredential ? 'edit-credential-username' : 'edit-asset-payload'} className="lv-form-label">
              {t.assets.editModal.payloadLabel}
            </label>
            {isCredential ? (
              <AssetCredentialFields idPrefix="edit-credential" {...credentials} labels={t.assets.addModal} disabled={busy}
                onChange={(field, value) => { setCredentials(prev => ({ ...prev, [field]: value })); setErrors(prev => ({ ...prev, noChanges: false })); }} />
            ) : (
            <textarea
              id="edit-asset-payload"
              rows={3}
              className="lv-form-textarea"
              placeholder={t.assets.editModal.payloadPlaceholder}
              value={payload}
              onChange={(e) => { setPayload(e.target.value); if (errors.noChanges) setErrors(prev => ({ ...prev, noChanges: false })) }}
              disabled={busy}
            />
            )}
            <span className="lv-form-hint">
              <Lock size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              {t.assets.editModal.payloadHint}
            </span>
          </div>

          {/* Description (Editable, prefilled, max 1000) */}
          <div className="lv-form-group">
            <label htmlFor="edit-asset-desc" className="lv-form-label">
              {t.assets.editModal.descriptionLabel}
            </label>
            <textarea
              id="edit-asset-desc"
              rows={3}
              maxLength={1000}
              className={`lv-form-textarea ${errors.description ? 'lv-form-input--error' : ''}`}
              placeholder={t.assets.editModal.descriptionPlaceholder}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value)
                if (errors.description || errors.noChanges) setErrors((prev) => ({ ...prev, description: undefined, noChanges: false }))
              }}
              disabled={busy}
            />
            {errors.description && (
              <p className="lv-form-error" role="alert">
                <AlertCircle size={14} /> {t.assets.validation[errors.description]}
              </p>
            )}
          </div>

          <div className="lv-form-group">
            <label htmlFor="edit-confirm-password" className="lv-form-label">{t.assets.editModal.confirmPasswordLabel}</label>
            <input id="edit-confirm-password" className="lv-form-input" type="password" autoComplete="current-password" maxLength={72}
              disabled={busy} value={password} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'edit-password-error' : undefined}
              onChange={event => { setPassword(event.target.value); setErrors(previous => ({ ...previous, password: undefined })) }} />
            {errors.password && <p id="edit-password-error" className="lv-form-error" role="alert">{errors.password === 'required' ? t.assets.editModal.passwordRequired : t.assets.editModal.passwordFailed}</p>}
          </div>
          {/* Actions */}
          </div>
          <div className="lv-form-actions">
            <Button
              variant="secondary"
              type="button"
              onClick={handleResetAndClose}
              disabled={busy}
            >
              {t.assets.editModal.cancelBtn}
            </Button>
            <Button variant="primary" type="submit" isLoading={busy} disabled={!canSubmit}>
              {busy ? t.assets.editModal.submittingBtn : t.assets.editModal.submitBtn}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
