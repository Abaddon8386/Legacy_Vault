import { useState, useLayoutEffect, useRef, useEffect } from 'react'
import { AssetCredentialFields } from './AssetCredentialFields.jsx'
import { AssetImagePicker } from './AssetImagePicker.jsx'
import { DocumentPicker } from './AssetDocuments.jsx'
import { assetImageService } from '../../services/assetImageService.js'
import { assetDocumentService } from '../../services/assetDocumentService.js'
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
  vaultId,
  accessToken,
  lang = 'vi',
}) {
  const [name, setName] = useState(asset?.name || '')
  const [description, setDescription] = useState(asset?.description || '')
  const [payload, setPayload] = useState('')
  const [credentials, setCredentials] = useState({ username: '', password: '' })
  const [images, setImages] = useState([])
  const [documents, setDocuments] = useState([])
  const [existingImageCount, setExistingImageCount] = useState(0)
  const [existingDocumentCount, setExistingDocumentCount] = useState(0)
  const [attachmentError, setAttachmentError] = useState(false)
  const replacementPayload = asset?.assetType === 'CREDENTIAL' ? credentialPayload(credentials.username, credentials.password) : payload
  const [errors, setErrors] = useState({})
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [partial, setPartial] = useState(null)
  const submission = useRef(null), pending = useRef(false)
  useLayoutEffect(() => () => { submission.current?.abort(); submission.current = null; pending.current = false }, [asset?.id, isOpen, authContext])
  useEffect(() => {
    if (!isOpen || !vaultId || !asset?.id) return
    const controller = new AbortController()
    Promise.all([
      assetImageService.list(vaultId, asset.id, { accessToken, lang, signal: controller.signal }),
      assetDocumentService.list(vaultId, asset.id, { accessToken, lang, signal: controller.signal }),
    ]).then(([imagesResult, documentsResult]) => {
      if (controller.signal.aborted) return
      setExistingImageCount(imagesResult.length)
      setExistingDocumentCount(documentsResult.length)
    }).catch(error => {
      if (!controller.signal.aborted && error.name !== 'AbortError') setAttachmentError(true)
    })
    return () => controller.abort()
  }, [isOpen, vaultId, asset?.id, accessToken, lang])
  const [previous, setPrevious] = useState({ id: asset?.id, isOpen, authContext })
  if (previous.id !== asset?.id || previous.isOpen !== isOpen || previous.authContext !== authContext) {
    if (previous.id !== asset?.id || previous.isOpen !== isOpen) {
      setName(asset?.name || ''); setDescription(asset?.description || ''); setPayload(''); setCredentials({ username: '', password: '' })
      setImages([]); setDocuments([])
    }
    setPrevious({ id: asset?.id, isOpen, authContext }); setPassword(''); setSaving(false); setErrors({}); setPartial(null)
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
    if (images.length) patchData.images = images
    if (documents.length) patchData.documents = documents
    if (!Object.keys(patchData).length) {
      setErrors({ noChanges: true })
      return
    }

    if (!canSubmit) return
    if (!password.trim()) { setErrors({ password: 'required' }); return }
    pending.current = true; setSaving(true); setPartial(null)
    const controller = new AbortController(); submission.current = controller
    const submittedPassword = password
    setPassword('')
    try {
      await onSubmit(asset.id, { ...patchData, password: submittedPassword }, { signal: controller.signal })
    } catch (error) {
      if (!controller.signal.aborted && submission.current === controller) {
        const done = error.partial
        if (done) {
          // Saved files leave the selection (and count as existing) so a retry cannot upload them twice; failed ones stay selected.
          setImages(current => current.filter(f => !done.savedImages.includes(f)))
          setDocuments(current => current.filter(f => !done.savedDocuments.includes(f)))
          setExistingImageCount(n => n + done.savedImages.length)
          setExistingDocumentCount(n => n + done.savedDocuments.length)
          setPartial({ savedNames: [...(done.savedFields ? [name.trim()] : []), ...done.savedImages.map(f => f.name), ...done.savedDocuments.map(f => f.name)], failedNames: [...(done.failedFields ? [name.trim()] : []), ...done.failedImages.map(f => f.name), ...done.failedDocuments.map(f => f.name)] })
        }
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
    setImages([]); setDocuments([])
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
          {errors.save && !partial && <p className="lv-form-error" role="alert">{t.assets.alerts.editError}</p>}
          {partial && <div className="lv-form-error" role="alert" data-testid="edit-partial"><p>{t.assets.alerts.editPartial}</p>{!!partial.savedNames.length && <p>{t.assets.alerts.editSavedLabel}: {partial.savedNames.join(', ')}</p>}{!!partial.failedNames.length && <p>{t.assets.alerts.editFailedLabel}: {partial.failedNames.join(', ')}</p>}<p>{t.assets.alerts.editRetryHint}</p></div>}
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

          <AssetImagePicker files={images} onChange={setImages} existingCount={existingImageCount} disabled={busy} lang={lang} />
          <DocumentPicker files={documents} onChange={setDocuments} existingCount={existingDocumentCount} disabled={busy} lang={lang} />
          {attachmentError && <p className="lv-form-error" role="alert">{lang === 'en' ? 'Unable to check existing attachments. Please close and reopen this form.' : 'Không kiểm tra được tệp đính kèm hiện có. Vui lòng đóng và mở lại biểu mẫu.'}</p>}

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
