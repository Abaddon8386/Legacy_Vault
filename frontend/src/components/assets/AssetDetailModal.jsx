import { AssetImageGallery } from './AssetImageGallery.jsx'
import FirstPasswordButton from '../auth/FirstPasswordButton.jsx'
import AssetDocuments from './AssetDocuments.jsx'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Modal } from '../common/Modal'
import { Button } from '../common/Button'
import { FileText, KeyRound, Lock, Calendar, Clock, ShieldCheck, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { assetService } from '../../services/assetService'
import { passwordSetupCancelledMessage } from '../../utils/passwordSetupFlow.js'
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
 *
 * Modal xem chi tiết tài sản (đọc thông tin, hiện nội dung bí mật sau khi nhập lại mật khẩu, xem ảnh và tải tài liệu).
 * Được dùng bởi {@code pages/assets/AssetManagementPage.jsx} (trang quản lý tài sản của chủ hầm VAULT_OWNER).
 *
 * Luồng: người dùng bấm "hiện nội dung" -> nhập mật khẩu (hoặc dùng {@code sessionPassword} đã xác minh) -> {@code revealWith} gọi
 * {@code assetService.revealAsset} = {@code POST /vaults/{vaultId}/assets/{assetId}/reveal}. Lỗi được ánh xạ sang khóa thông báo (REAUTH_FAILED, ACCESS_DENIED, TOO_MANY_ATTEMPTS,
 * 409 VAULT_NOT_EDITABLE, 404 RESOURCE_NOT_FOUND). 401 thì reset và gọi {@code onNavigateToLogin}. Khi đã mở khóa, hiển thị {@code AssetImageGallery} và {@code AssetDocuments} (chỉ đọc).
 *
 * Props: {@code isOpen}, {@code onClose}, {@code asset} (metadata tài sản), {@code t} (chuỗi dịch), {@code lang}, {@code vaultId}, {@code accessToken}, {@code onNavigateToLogin}.
 * State: {@code isReauthOpen}, {@code password}, {@code showPassword}, {@code isRevealing}, {@code revealedPayload}, {@code revealErrorKey}, {@code sessionPassword}.
 * Ref: {@code abortRef}, {@code pendingRef} (chống gửi đôi), {@code activeContextRef} (bỏ kết quả của tài sản/phiên cũ).
 * Effect: ghi nhận ngữ cảnh hiện tại và dọn mật khẩu/nội dung khi đổi tài sản, phiên hoặc unmount.
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
  // Password verified once for this modal session; reused to unlock payload, photos and documents.
  const [sessionPassword, setSessionPassword] = useState('')

  const abortRef = useRef(null)
  const pendingRef = useRef(false)
  const activeContextRef = useRef({ assetId: asset?.id, vaultId, accessToken })

  /**
   * Hủy request đang chạy và xóa toàn bộ trạng thái nhạy cảm (mật khẩu, nội dung đã giải mã, mật khẩu phiên).
   */
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
    setSessionPassword('')
  }, [])

  useEffect(() => {
    activeContextRef.current = { assetId: asset?.id, vaultId, accessToken }
    return () => {
      resetRevealState()
    }
  }, [asset?.id, vaultId, accessToken, resetRevealState])

  /**
   * Đóng modal: dọn trạng thái nhạy cảm rồi gọi {@code onClose}.
   */
  const handleClose = () => {
    resetRevealState()
    onClose()
  }

  /**
   * Xử lý submit form nhập mật khẩu: chặn submit mặc định rồi gọi {@code revealWith(password)}.
   */
  const handleRevealSubmit = (e) => {
    e?.preventDefault()
    return revealWith(password)
  }

  /**
   * Gọi {@code assetService.revealAsset} với mật khẩu đã cho (chống gửi đôi bằng {@code pendingRef}). Thành công và còn đúng ngữ cảnh thì lưu payload và mật khẩu phiên; thất bại thì xóa mật khẩu và đặt khóa lỗi tương ứng.
   */
  const revealWith = async (submittedPassword) => {
    if (pendingRef.current || isRevealing) return
    if (!submittedPassword) {
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
      const res = await assetService.revealAsset(vaultId, asset.id, submittedPassword, {
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
        setSessionPassword(submittedPassword)
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
      setSessionPassword('')
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

  // Called by photos/documents once the user has entered the password there: unlock everything else.
  /**
   * Được ảnh/tài liệu gọi khi người dùng đã nhập đúng mật khẩu ở đó: lưu mật khẩu phiên và tự hiện nội dung bí mật nếu tài sản có payload.
   */
  const handleUnlocked = (verifiedPassword) => {
    if (!verifiedPassword) return
    setSessionPassword(verifiedPassword)
    if (asset?.hasPayload && revealedPayload === null) revealWith(verifiedPassword)
  }

  if (!isOpen || !asset) return null

  /**
   * Định dạng thời điểm ISO thành chuỗi ngày giờ theo ngôn ngữ (vi-VN hoặc en-US); trả "—" nếu rỗng.
   */
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

  // Photos, documents and secret content stay hidden until the owner unlocks them with their password.
  // Assets without a secret payload have nothing to unlock with, so they keep per-item password prompts.
  const contentUnlocked = !asset.hasPayload || revealedPayload !== null
  const isCredential = asset.assetType === 'CREDENTIAL'
  const credential = isCredential ? readCredentialPayload(revealedPayload) : null
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
        {asset.description && asset.description.trim() ? (
          <div className="lv-detail-group">
            <span className="lv-detail-label">{t.assets.detailModal.descLabel}</span>
            <p className="lv-detail-desc">
              {asset.description.trim()}
            </p>
          </div>
        ) : null}

        {/* Reveal / Secret Payload Section */}
        {asset.hasPayload && (
          <div
            style={{
              padding: '18px 20px',
              backgroundColor: '#faf8f5',
              border: '1px solid var(--lv-border-subtle, #eae5dc)',
              borderRadius: 'var(--lv-radius-control, 10px)',
              fontSize: '14px',
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
                    onClick={() => { setRevealedPayload(null); setSessionPassword('') }}
                    style={{
                      background: 'none',
                      border: '1px solid var(--lv-border-subtle, #eae5dc)',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '14px',
                      color: 'var(--lv-text-muted, #68736b)',
                      cursor: 'pointer',
                    }}
                  >
                    {t.assets.detailModal.hideBtn}
                  </button>
                </div>
                <div
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #dce2da',
                    borderRadius: '8px',
                    padding: '12px',
                    fontSize: '14px',
                    margin: 0,
                    maxHeight: '200px',
                    overflowY: 'auto',
                    color: '#164639',
                  }}
                >
                  {credential ? (
                    <div style={{ display: 'grid', gap: '10px', fontFamily: 'inherit' }}>
                      <div><strong>{lang === 'en' ? 'Username' : 'Tên đăng nhập'}</strong><div>{credential.username || '—'}</div></div>
                      <div><strong>{lang === 'en' ? 'Password' : 'Mật khẩu'}</strong><div style={{ overflowWrap: 'anywhere' }}>{credential.password || '—'}</div></div>
                    </div>
                  ) : <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, fontFamily: 'monospace', color: 'inherit' }}>{revealedPayload}</pre>}
                </div>
              </div>
            ) : isReauthOpen ? (
              /* Case 2: Reauth password input form */
              <form onSubmit={handleRevealSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <FirstPasswordButton lang={lang} onReady={setPassword} disabled={isRevealing} />
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
                        fontSize: '14px',
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
                    disabled={isRevealing || !password}
                    style={{ padding: '9px 16px', fontSize: '14px' }}
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
                    style={{ padding: '9px 14px', fontSize: '14px' }}
                  >
                    {t.assets.detailModal.cancelBtn}
                  </Button>
                </div>

                {revealErrorKey && (
                  <p
                    role={revealErrorKey === 'PASSWORD_SETUP_CANCELLED' ? 'status' : 'alert'}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      color: '#a03832',
                      fontSize: '14px',
                      margin: '2px 0 0',
                    }}
                  >
                    <AlertCircle size={14} />
                    <span>
                      {revealErrorKey === 'PASSWORD_SETUP_CANCELLED' ? passwordSetupCancelledMessage(lang) :
                        t.assets.alerts[revealErrorKey] ||
                        (revealErrorKey === 'passwordRequired'
                          ? t.assets.validation.payloadRequired
                          : t.assets.alerts.loadError)}
                    </span>
                  </p>
                )}
              </form>
            ) : (
              /* Case 3: Initial state: Reveal button */
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                }}
              >
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => (sessionPassword ? revealWith(sessionPassword) : setIsReauthOpen(true))}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '14px',
                    minHeight: '44px',
                    padding: '8px 18px',
                  }}
                >
                  <Eye size={16} />
                  <span>{t.assets.detailModal.revealBtn}</span>
                </Button>
              </div>
            )}
          </div>
        )}

        {contentUnlocked && <AssetImageGallery key={[vaultId, asset.id, accessToken, lang].join(':')} vaultId={vaultId} assetId={asset.id}
          accessToken={accessToken} lang={lang} onUnauthorized={onNavigateToLogin} readOnly
          sessionPassword={sessionPassword} onUnlocked={handleUnlocked} />}

        {/* Actions */}
        {asset && contentUnlocked && <AssetDocuments vaultId={vaultId} assetId={asset.id} accessToken={accessToken} lang={lang} onUnauthorized={onNavigateToLogin} readOnly sessionPassword={sessionPassword} onUnlocked={handleUnlocked} />}
        <div className="lv-modal-actions-right">
          <Button variant="primary" onClick={handleClose}>
            {t.assets.closeBtn}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Phân tích payload của tài sản CREDENTIAL (chuỗi JSON {@code {username,password}}).
 * @param {*} value Payload đã giải mã.
 * @returns {({username:string,password:string}|null)} Null nếu không phải JSON hợp lệ dạng credential (khi đó hiển thị dạng văn bản thô).
 */
function readCredentialPayload(value) {
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object' ||
        typeof parsed.username !== 'string' || typeof parsed.password !== 'string') return null
    return { username: parsed.username, password: parsed.password }
  } catch {
    return null
  }
}
