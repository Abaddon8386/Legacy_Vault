import { useState } from 'react'
import { useModalFocus } from '../common/useModalFocus'
import { Button } from '../common/Button'
import { AlertCircle, Lock } from 'lucide-react'
import './AssetFormModal.css'

/**
 * AssetFormModal — PS-5: Add asset only (Contract Aligned).
 * Fields: name, assetType (TEXT | CREDENTIAL), description, payload (write-only).
 * Validates required fields before submission. No sensitive data logged.
 */
export function AssetFormModal({
  isOpen,
  onClose,
  onSubmit,
  t,
  isSubmitting = false,
}) {
  const emptyForm = {
    name: '',
    assetType: '',
    description: '',
    payload: '',
  }

  const [formData, setFormData] = useState(emptyForm)
  const [errors, setErrors] = useState({})

  function validate() {
    const errs = {}
    const trimmedName = formData.name.trim()

    if (!trimmedName) {
      errs.name = 'nameRequired'
    } else if (trimmedName.length > 150) {
      errs.name = 'nameMax'
    }

    if (!formData.assetType || !['TEXT', 'CREDENTIAL'].includes(formData.assetType)) {
      errs.assetType = 'typeRequired'
    }

    if (formData.description && formData.description.length > 1000) {
      errs.description = 'descMax'
    }

    if (!formData.payload || !formData.payload.trim()) {
      errs.payload = 'payloadRequired'
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleChange(field, value) {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (isSubmitting || !validate()) return

    onSubmit({
      name: formData.name.trim(),
      assetType: formData.assetType,
      description: formData.description.trim(),
      payload: formData.payload,
    })
  }

  function handleResetAndClose() {
    if (isSubmitting) return
    setFormData(emptyForm)
    setErrors({})
    onClose()
  }

  const dialogRef = useModalFocus(isOpen, handleResetAndClose, isSubmitting)

  if (!isOpen) return null

  const assetTypes = [
    { value: 'TEXT', label: t.assets.types.TEXT },
    { value: 'CREDENTIAL', label: t.assets.types.CREDENTIAL },
  ]

  return (
    <div className="lv-modal-backdrop" onClick={handleResetAndClose} role="presentation">
      <div
        className="lv-modal lv-asset-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        ref={dialogRef}
        tabIndex={-1}
        aria-labelledby="asset-modal-title"
      >
        <div className="lv-modal__header">
          <div>
            <h2 id="asset-modal-title" className="lv-modal__title">
              {t.assets.addModal.title}
            </h2>
            <p className="lv-modal__desc">{t.assets.addModal.desc}</p>
          </div>
          <button
            type="button"
            className="lv-modal__close-btn"
            onClick={handleResetAndClose}
            aria-label={t.assets.closeBtn}
            disabled={isSubmitting}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="lv-modal__body" noValidate>
          {/* Asset Name */}
          <div className="lv-form-group">
            <label htmlFor="asset-name" className="lv-form-label">
              {t.assets.addModal.nameLabel} <span className="lv-required">*</span>
            </label>
            <input
              id="asset-name"
              type="text"
              maxLength={150}
              className={`lv-form-input ${errors.name ? 'lv-form-input--error' : ''}`}
              placeholder={t.assets.addModal.namePlaceholder}
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              disabled={isSubmitting}
            />
            {errors.name && (
              <p className="lv-form-error" role="alert">
                <AlertCircle size={14} /> {t.assets.validation[errors.name]}
              </p>
            )}
          </div>

          {/* Asset Type (TEXT | CREDENTIAL) */}
          <div className="lv-form-group">
            <label htmlFor="asset-type" className="lv-form-label">
              {t.assets.addModal.typeLabel} <span className="lv-required">*</span>
            </label>
            <select
              id="asset-type"
              className={`lv-form-select ${errors.assetType ? 'lv-form-input--error' : ''}`}
              value={formData.assetType}
              onChange={(e) => handleChange('assetType', e.target.value)}
              disabled={isSubmitting}
            >
              <option value="">{t.assets.addModal.typePlaceholder}</option>
              {assetTypes.map((tItem) => (
                <option key={tItem.value} value={tItem.value}>
                  {tItem.label}
                </option>
              ))}
            </select>
            {errors.assetType && (
              <p className="lv-form-error" role="alert">
                <AlertCircle size={14} /> {t.assets.validation[errors.assetType]}
              </p>
            )}
          </div>

          {/* Confidential Payload (Write-Only) */}
          <div className="lv-form-group">
            <label htmlFor="asset-payload" className="lv-form-label">
              {t.assets.addModal.payloadLabel} <span className="lv-required">*</span>
            </label>
            <textarea
              id="asset-payload"
              rows={4}
              className={`lv-form-textarea ${errors.payload ? 'lv-form-input--error' : ''}`}
              placeholder={t.assets.addModal.payloadPlaceholder}
              value={formData.payload}
              onChange={(e) => handleChange('payload', e.target.value)}
              disabled={isSubmitting}
            />
            {errors.payload ? (
              <p className="lv-form-error" role="alert">
                <AlertCircle size={14} /> {t.assets.validation[errors.payload]}
              </p>
            ) : (
              <span className="lv-form-hint">
                <Lock size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                {t.assets.addModal.payloadHint}
              </span>
            )}
          </div>

          {/* Description (Optional, max 1000) */}
          <div className="lv-form-group">
            <label htmlFor="asset-desc" className="lv-form-label">
              {t.assets.addModal.descriptionLabel}
            </label>
            <textarea
              id="asset-desc"
              rows={3}
              maxLength={1000}
              className={`lv-form-textarea ${errors.description ? 'lv-form-input--error' : ''}`}
              placeholder={t.assets.addModal.descriptionPlaceholder}
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              disabled={isSubmitting}
            />
            {errors.description && (
              <p className="lv-form-error" role="alert">
                <AlertCircle size={14} /> {t.assets.validation[errors.description]}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="lv-form-actions">
            <Button
              variant="secondary"
              type="button"
              onClick={handleResetAndClose}
              disabled={isSubmitting}
            >
              {t.assets.cancelBtn}
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting}>
              {isSubmitting ? t.assets.addModal.submittingBtn : t.assets.addModal.submitBtn}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
