import { useModalFocus } from './useModalFocus'
import { X } from 'lucide-react'
import './Modal.css'

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = '540px',
  closeLabel = 'Đóng',
  returnFocusRef = null,
}) {
  const modalRef = useModalFocus(isOpen, onClose, false, returnFocusRef)

  if (!isOpen) return null

  return (
    <div className="lv-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="lv-modal"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby="lv-modal-title"
        ref={modalRef}
      >
        <div className="lv-modal__header">
          <div>
            <h2 id="lv-modal-title" className="lv-modal__title">
              {title}
            </h2>
            {description && <p className="lv-modal__desc">{description}</p>}
          </div>
          <button
            type="button"
            className="lv-modal__close-btn"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <X size={18} />
          </button>
        </div>

        <div className="lv-modal__body">{children}</div>
      </div>
    </div>
  )
}
