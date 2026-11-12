import { useState, useLayoutEffect, useRef, useEffect } from 'react'
import FirstPasswordButton from '../auth/FirstPasswordButton.jsx'
import { AssetCredentialFields } from './AssetCredentialFields.jsx'
import { AssetImagePicker } from './AssetImagePicker.jsx'
import { AssetImageGallery } from './AssetImageGallery.jsx'
import AssetDocuments, { DocumentPicker } from './AssetDocuments.jsx'
import { assetService } from '../../services/assetService.js'
import { assetImageService } from '../../services/assetImageService.js'
import { assetDocumentService } from '../../services/assetDocumentService.js'
import { credentialPayload } from '../../utils/credentialPayload.js'
import { passwordSetupCancelledMessage } from '../../utils/passwordSetupFlow.js'
import { useModalFocus } from '../common/useModalFocus'
import { Button } from '../common/Button'
import { AlertCircle, KeyRound, FileText } from 'lucide-react'
import './AssetFormModal.css'

/**
 * Giá trị payload rỗng ban đầu (văn bản, tên đăng nhập, mật khẩu).
 */
const EMPTY_PAYLOAD = { text: '', username: '', password: '' }

/**
 * AssetEditModal — PS-6: Edit Asset (Contract Aligned).
 *
 * Flow:
 * - The form starts locked: the owner confirms their password once, which also reveals the current secret content.
 * - After unlocking, the order matches the view screen: name, description, secure content (prefilled and editable),
 * photos and documents (existing files can be deleted, new ones added).
 * - Saving reuses the verified password, so it is not requested a second time.
 * - The payload is only sent when the owner actually changed it.
 *
 * Modal sửa tài sản. Dùng trong {@code pages/assets/AssetManagementPage.jsx}; component cha truyền {@code onSubmit(assetId, patch, {signal})} để thực hiện lưu
 * (thường gọi {@code assetService.updateAsset} = {@code PATCH /vaults/{v}/assets/{a}}, cùng tải thêm ảnh/tài liệu qua {@code assetImageService} / {@code assetDocumentService}).
 *
 * Bước 1 {@code handleUnlock}: xác nhận mật khẩu bằng {@code assetService.revealAsset} ({@code POST .../reveal}) để lấy nội dung hiện tại; 404 nghĩa là tài sản không có nội dung bí mật.
 * Bước 2 {@code handleSubmit}: validate, chỉ gửi các trường thay đổi cùng {@code password} của phiên; lỗi một phần ({@code error.partial}) được ghi nhận để thử lại không tải trùng.
 *
 * Props: {@code isOpen}, {@code onClose}, {@code asset}, {@code onSubmit}, {@code t}, {@code isSubmitting}, {@code errorKey}, {@code authContext} (reset khi đổi phiên), {@code vaultId}, {@code accessToken}, {@code lang}.
 * State chính: {@code name}, {@code description}, {@code payload}/{@code credentials}, {@code unlocked}, {@code sessionPassword}, {@code images}/{@code documents} (tệp mới), {@code errors}, {@code saving}, {@code partial}.
 * Effect: tải số lượng ảnh/tài liệu hiện có để áp giới hạn 5 tệp; hủy request khi đóng/đổi tài sản.
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
  const [unlocked, setUnlocked] = useState(false)
  const [sessionPassword, setSessionPassword] = useState('')
  const [initialPayload, setInitialPayload] = useState(EMPTY_PAYLOAD)
  const [listVersion, setListVersion] = useState(0)
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
    setPrevious({ id: asset?.id, isOpen, authContext }); setPassword(''); setUnlocked(false); setSessionPassword(''); setSaving(false); setErrors({}); setPartial(null)
  }
  const busy = isSubmitting || saving
  const canSubmit = typeof onSubmit === 'function'

  /**
   * Kiểm tra form sửa: tên bắt buộc và <= 150 ký tự, mô tả <= 1000 ký tự. Ghi lỗi vào {@code errors}.
   * @returns {boolean} true nếu hợp lệ.
   */
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

  /**
   * Gửi form: nếu chưa mở khóa thì chuyển sang {@code handleUnlock}; ngược lại validate, so sánh với giá trị gốc để tạo {@code patchData} (name, description, payload nếu đổi, images, documents),
   * rồi gọi {@code onSubmit}. Xử lý lỗi PASSWORD_SETUP_CANCELLED, REAUTH_FAILED (khóa lại), TOO_MANY_ATTEMPTS và lỗi lưu từng phần.
   */
  async function handleSubmit(e) {
    e.preventDefault()
    if (!unlocked) { handleUnlock(); return }
    if (busy || pending.current || !validate()) return

    const isCredentialAsset = asset.assetType === 'CREDENTIAL'
    const payloadChanged = isCredentialAsset
      ? credentials.username !== initialPayload.username || credentials.password !== initialPayload.password
      : payload !== initialPayload.text
    if (payloadChanged && !replacementPayload.trim().length) { setErrors({ payload: 'payloadRequired' }); return }

    const patchData = {}
    if (name.trim() !== asset.name) patchData.name = name.trim()
    if (description.trim() !== (asset.description || '')) patchData.description = description.trim()
    if (payloadChanged) patchData.payload = replacementPayload
    if (images.length) patchData.images = images
    if (documents.length) patchData.documents = documents
    if (!Object.keys(patchData).length) {
      setErrors({ noChanges: true })
      return
    }

    if (!canSubmit) return
    pending.current = true; setSaving(true); setPartial(null)
    const controller = new AbortController(); submission.current = controller
    try {
      await onSubmit(asset.id, { ...patchData, password: sessionPassword }, { signal: controller.signal })
    } catch (error) {
      if (!controller.signal.aborted && submission.current === controller) {
        const done = error.partial
        if (done) {
          // Saved files leave the selection (and count as existing) so a retry cannot upload them twice; failed ones stay selected.
          setImages(current => current.filter(f => !done.savedImages.includes(f)))
          setDocuments(current => current.filter(f => !done.savedDocuments.includes(f)))
          setExistingImageCount(n => n + done.savedImages.length)
          setExistingDocumentCount(n => n + done.savedDocuments.length)
          if (done.savedImages.length || done.savedDocuments.length) setListVersion(v => v + 1)
          setPartial({ savedNames: [...(done.savedFields ? [name.trim()] : []), ...done.savedImages.map(f => f.name), ...done.savedDocuments.map(f => f.name)], failedNames: [...(done.failedFields ? [name.trim()] : []), ...done.failedImages.map(f => f.name), ...done.failedDocuments.map(f => f.name)] })
        }
        if (error.code === 'PASSWORD_SETUP_CANCELLED') setErrors({ passwordSetupCancelled: true })
        else if (error.code === 'REAUTH_FAILED') { setUnlocked(false); setSessionPassword(''); setErrors({ password: 'failed' }) }
        else setErrors(error.code === 'TOO_MANY_ATTEMPTS' ? { rateLimited: true } : { save: true })
      }
    } finally {
      if (submission.current === controller) {
        submission.current = null; pending.current = false
        if (!controller.signal.aborted) setSaving(false)
      }
    }
  }

  // Step 1: confirm the password once. It also reveals the current secret content for editing.
  /**
   * Bước 1: xác nhận mật khẩu và lấy nội dung bí mật hiện tại ({@code POST /vaults/{v}/assets/{a}/reveal}) để điền sẵn vào form; lưu mật khẩu phiên để lần lưu không phải hỏi lại.
   */
  async function handleUnlock() {
    if (busy || pending.current) return
    if (!password.trim()) { setErrors({ password: 'required' }); return }
    pending.current = true; setSaving(true); setErrors({})
    const controller = new AbortController(); submission.current = controller
    const submittedPassword = password
    setPassword('')
    const options = { lang, accessToken, signal: controller.signal }
    /**
     * Hoàn tất mở khóa: dựng ảnh chụp ban đầu của payload (văn bản hoặc username/password), điền vào form và đánh dấu {@code unlocked}.
     */
    const finishUnlock = (revealed) => {
      let snapshot = EMPTY_PAYLOAD
      if (revealed !== null) {
        if (asset.assetType === 'CREDENTIAL') {
          try {
            const parsed = JSON.parse(revealed)
            if (parsed && typeof parsed.username === 'string' && typeof parsed.password === 'string') snapshot = { text: '', username: parsed.username, password: parsed.password }
          } catch { /* keep the credential fields empty */ }
        } else {
          snapshot = { text: revealed, username: '', password: '' }
        }
      }
      setInitialPayload(snapshot)
      setPayload(snapshot.text)
      setCredentials({ username: snapshot.username, password: snapshot.password })
      setSessionPassword(submittedPassword)
      setUnlocked(true)
    }
    try {
      let revealed = null
      try {
        revealed = (await assetService.revealAsset(vaultId, asset.id, submittedPassword, options)).payload
      } catch (error) {
        // The server checks the password before reporting that there is no secret content, so 404 means "verified, nothing to show".
        if (asset.hasPayload || (error.code !== 'RESOURCE_NOT_FOUND' && error.status !== 404)) throw error
      }
      if (!controller.signal.aborted) finishUnlock(revealed)
    } catch (error) {
      if (!controller.signal.aborted && submission.current === controller) {
        if (error.code === 'PASSWORD_SETUP_CANCELLED') setErrors({ passwordSetupCancelled: true })
        else if (error.code === 'REAUTH_FAILED') setErrors({ password: 'failed' })
        else if (error.code === 'TOO_MANY_ATTEMPTS' || error.status === 429) setErrors({ rateLimited: true })
        else setErrors({ save: true })
      }
    } finally {
      if (submission.current === controller) {
        submission.current = null; pending.current = false
        if (!controller.signal.aborted) setSaving(false)
      }
    }
  }

  /**
   * Đóng modal và xóa mọi dữ liệu nhạy cảm/đang nhập (bị bỏ qua khi đang lưu).
   */
  function handleResetAndClose() {
    if (busy) return
    setPayload('')
    setPassword('')
    setSessionPassword('')
    setUnlocked(false)
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
          {errors.passwordSetupCancelled && <p role="status">{passwordSetupCancelledMessage(lang)}</p>}
          {partial && <div className="lv-form-error" role="alert" data-testid="edit-partial"><p>{t.assets.alerts.editPartial}</p>{!!partial.savedNames.length && <p>{t.assets.alerts.editSavedLabel}: {partial.savedNames.join(', ')}</p>}{!!partial.failedNames.length && <p>{t.assets.alerts.editFailedLabel}: {partial.failedNames.join(', ')}</p>}<p>{t.assets.alerts.editRetryHint}</p></div>}
          {errors.rateLimited && <p className="lv-form-error" role="alert">{t.assets.alerts.TOO_MANY_ATTEMPTS}</p>}
          {errors.noChanges && <p className="lv-form-error" role="alert">{t.assets.editModal.noChangesError}</p>}

          {!unlocked ? (
            <div className="lv-form-group">
              <p style={{ fontSize: '14px', margin: '0 0 12px' }}>{t.assets.editModal.unlockHint}</p>
              <label htmlFor="edit-confirm-password" className="lv-form-label">{t.assets.editModal.confirmPasswordLabel}</label>
              <FirstPasswordButton lang={lang} onReady={setPassword} disabled={busy} />
              <input id="edit-confirm-password" className="lv-form-input" type="password" autoComplete="current-password" maxLength={72}
                disabled={busy} value={password} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'edit-password-error' : undefined}
                onChange={event => { setPassword(event.target.value); setErrors(previous => ({ ...previous, password: undefined })) }} />
              {errors.password && <p id="edit-password-error" className="lv-form-error" role="alert">{errors.password === 'required' ? t.assets.editModal.passwordRequired : t.assets.editModal.passwordFailed}</p>}
            </div>
          ) : (
            <>
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

              {/* Secure content: current value, editable. Sits above photos and documents, like the view screen. */}
              <div className="lv-form-group">
                <label htmlFor={isCredential ? 'edit-credential-username' : 'edit-asset-payload'} className="lv-form-label">
                  {t.assets.editModal.secureContentLabel}
                </label>
                {isCredential ? (
                  <AssetCredentialFields idPrefix="edit-credential" {...credentials} labels={t.assets.addModal} lang={lang} disabled={busy}
                    onChange={(field, value) => { setCredentials(prev => ({ ...prev, [field]: value })); setErrors(prev => ({ ...prev, noChanges: false, payload: undefined })); }} />
                ) : (
                  <textarea
                    id="edit-asset-payload"
                    rows={3}
                    className="lv-form-textarea"
                    placeholder={t.assets.editModal.payloadPlaceholder}
                    value={payload}
                    onChange={(e) => { setPayload(e.target.value); if (errors.noChanges || errors.payload) setErrors(prev => ({ ...prev, noChanges: false, payload: undefined })) }}
                    disabled={busy}
                  />
                )}
                {errors.payload && <p className="lv-form-error" role="alert"><AlertCircle size={14} /> {t.assets.validation[errors.payload]}</p>}
              </div>

              {/* Photos: existing files (view / delete), then new uploads */}
              <AssetImageGallery key={'img-' + listVersion} vaultId={vaultId} assetId={asset.id} accessToken={accessToken} lang={lang}
                allowUpload={false} sessionPassword={sessionPassword} onCountChange={setExistingImageCount}>
                <AssetImagePicker files={images} onChange={setImages} existingCount={existingImageCount} disabled={busy} lang={lang} />
              </AssetImageGallery>

              {/* Documents: existing files (download / delete), then new uploads */}
              <AssetDocuments key={'doc-' + listVersion} vaultId={vaultId} assetId={asset.id} accessToken={accessToken} lang={lang}
                allowUpload={false} sessionPassword={sessionPassword} onCountChange={setExistingDocumentCount}>
                <DocumentPicker files={documents} onChange={setDocuments} existingCount={existingDocumentCount} disabled={busy} lang={lang} />
              </AssetDocuments>
              {attachmentError && <p className="lv-form-error" role="alert">{lang === 'en' ? 'Unable to check existing attachments. Please close and reopen this form.' : 'Không kiểm tra được tệp đính kèm hiện có. Vui lòng đóng và mở lại biểu mẫu.'}</p>}
            </>
          )}
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
            <Button variant="primary" type="submit" isLoading={busy} disabled={unlocked && !canSubmit}>
              {unlocked ? (busy ? t.assets.editModal.submittingBtn : t.assets.editModal.submitBtn) : t.assets.editModal.unlockBtn}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
