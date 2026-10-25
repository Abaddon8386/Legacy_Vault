import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Plus,
  Search,
  Filter,
  AlertTriangle,
  FolderOpen,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react'
import { assetService } from '../../services/assetService'
import { assetImageService } from '../../services/assetImageService.js'
import { assetDocumentService } from '../../services/assetDocumentService.js'
import { fetchSubscription, formatStorageBytes } from '../../utils/subscriptionService.js'
import { ApiError } from '../../api/http.js'
import { Button } from '../../components/common/Button'
import { Modal } from '../../components/common/Modal'
import { AssetListTable } from '../../components/assets/AssetListTable'
import { AssetFormModal } from '../../components/assets/AssetFormModal'
import { AssetSummaryCards } from '../../components/assets/AssetSummaryCards'
import './AssetManagementPage.css'
import { AssetDetailModal } from '../../components/assets/AssetDetailModal'
import { AssetEditModal } from '../../components/assets/AssetEditModal'
import { getAssetTranslations } from './assetI18n.js'

/**
 * AssetManagementPage — PS-5: Add asset + view asset list (Contract Aligned).
 * Loads assets on mount, shows loading/error/empty states.
 * Allows adding a new asset via a validated form modal with write-only payload.
 */
export function AssetManagementPage({
  t: externalT,
  lang = 'vi',
  vaultId,
  accessToken,
  onNavigateToLogin,
  onRefreshTrigger = 0,
  enforceQuota = false,
  onNavigateToSubscription,
}) {
  const t = getAssetTranslations(externalT, lang)
  const [query, setQuery] = useState({ page: 0, size: 10, sort: 'createdAt,desc' })
  const [totalElements, setTotalElements] = useState(0)
  const [retry, setRetry] = useState(0)
  const [quota, setQuota] = useState(null)
  const [quotaError, setQuotaError] = useState(null)
  const [quotaLoading, setQuotaLoading] = useState(enforceQuota)
  useEffect(() => {
    if (!enforceQuota) return
    const controller = new AbortController()
    let active = true
    Promise.resolve().then(async () => {
      if (!active) return
      setQuotaLoading(true); setQuotaError(null); setQuota(null)
      try {
        const current = await fetchSubscription({ accessToken, lang, signal: controller.signal })
        if (active) setQuota(current)
      } catch (error) {
        if (active && error.name !== 'AbortError') {
          setQuotaError(error)
          if (error.status === 401) onNavigateToLogin?.()
        }
      } finally { if (active) setQuotaLoading(false) }
    })
    return () => { active = false; controller.abort() }
  }, [enforceQuota, accessToken, lang, retry, onRefreshTrigger, onNavigateToLogin])
  const quotaFull = quota && (quota.assetsUsed >= quota.maxAssets || quota.storageUsedBytes >= quota.maxStorageBytes)
  const addUnavailable = enforceQuota && (quotaLoading || quotaError || !quota || quotaFull)
  const submittingRef = useRef(false)
  const createdAssetRef = useRef(null)
  // Edit steps already saved for one asset, so a retry only repeats what failed. files holds the File objects uploaded.
  const editProgressRef = useRef(null)
  const [assetSaved,setAssetSaved] = useState(false)
  const mutationRef = useRef(null)
  const selectionRef = useRef(null)
  const [selection, setSelection] = useState(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [editErrorKey, setEditErrorKey] = useState(null)
  const aliveRef = useRef(true)
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; mutationRef.current?.abort(); selectionRef.current?.abort() } }, [])
  const toastTimer = useRef(null)
  const requestContext = useRef(null)
  useEffect(() => { requestContext.current = { lang } }, [lang])

  const [assets, setAssets] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAssetType, setSelectedAssetType] = useState('ALL')

  // Add modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [addErrorKey, setAddErrorKey] = useState(null)
  const [toastMessage, setToastMessage] = useState(null)


  const showToast = useCallback((key, type = 'success') => {
    clearTimeout(toastTimer.current)
    setToastMessage({ key, type })
    toastTimer.current = setTimeout(() => setToastMessage(null), 3500)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    async function load() {
      await Promise.resolve()
      if (!active) return
      setIsLoading(true)
      setError(null)
      setAssets([])
      try {
        const data = await assetService.getAssets(vaultId, {
          ...query, lang: requestContext.current.lang, accessToken,
          signal: controller.signal,
        })
        if (!active) return
        if (query.page > 0 && data.content.length === 0) {
          setQuery(prev => ({ ...prev, page: 0 }))
          return
        }
        setAssets(data.content)
        setTotalElements(data.totalElements)
      } catch (error) {
        if (active && error.name !== 'AbortError') {
          if (error.status === 401) { onNavigateToLogin?.(); return }
          selectionRef.current?.abort(); setSelection(null); setIsAddModalOpen(false)
          setError(error.code || 'loadError')
        }
      } finally {
        if (active) setIsLoading(false)
      }
    }
    load()
    return () => { active = false; controller.abort() }
  }, [vaultId, accessToken, query, retry, onRefreshTrigger, onNavigateToLogin])

  const loadAssets = () => setRetry(value => value + 1)
  function openAddModal() {
    if (isLoading || error || addUnavailable) return
    setAddErrorKey(null)
    setIsAddModalOpen(true)
  }


  async function handleAddAsset(formData) {
    if (submittingRef.current) return
    submittingRef.current = true
    const controller = new AbortController(); mutationRef.current = controller
    setIsSubmitting(true)
    setAddErrorKey(null)
    try {
      const context = `${vaultId}:${accessToken}`
      let created = createdAssetRef.current?.context === context ? createdAssetRef.current.asset : null
      if (!created) {
        // Recheck before creating: another tab may have consumed the last slot.
        // The backend still enforces quota atomically with the write.
        if (enforceQuota) {
          const current = await fetchSubscription({ accessToken, lang, signal: controller.signal })
          if (controller.signal.aborted || !aliveRef.current) return
          setQuota(current)
          if (current.assetsUsed >= current.maxAssets) throw new ApiError('ASSET_QUOTA_EXCEEDED', 409)
          if (current.storageUsedBytes >= current.maxStorageBytes) throw new ApiError('STORAGE_QUOTA_EXCEEDED', 409)
        }
        created = await assetService.createAsset(vaultId, formData, { lang, accessToken, signal: controller.signal })
        if (controller.signal.aborted || !aliveRef.current) return
        createdAssetRef.current = {context,asset:created}; setAssetSaved(true)
      }
      if (formData.documents?.length) await assetDocumentService.upload(vaultId,created.id,formData.documents,{lang,accessToken,signal:controller.signal})
      if (!aliveRef.current || controller.signal.aborted) return
      createdAssetRef.current=null;setAssetSaved(false)
      setIsAddModalOpen(false)
      setSearchQuery('')
      setSelectedAssetType('ALL')
      setQuery(prev => ({ ...prev, page: 0, sort: 'createdAt,desc' }))
      showToast('addSuccess')
      loadAssets()
    } catch (error) {
      if (aliveRef.current && error.name !== 'AbortError') {
        if (error.status === 401) { setIsAddModalOpen(false); onNavigateToLogin?.(); return }
        if ([403,404].includes(error.status)) setIsAddModalOpen(false)
        if (['ASSET_QUOTA_EXCEEDED', 'STORAGE_QUOTA_EXCEEDED'].includes(error.code)) loadAssets()
        showToast(error.code || 'saveError', 'error')
        setAddErrorKey(error.code || 'saveError')
      }
    } finally {
      submittingRef.current = false
      if (aliveRef.current) setIsSubmitting(false)
    }
  }

  function closeSelection() {
    selectionRef.current?.abort(); setSelection(null); setEditErrorKey(null); editProgressRef.current = null
  }
  async function openAsset(asset, mode) {
    if (submittingRef.current) return
    selectionRef.current?.abort()
    const controller = new AbortController(); selectionRef.current = controller
    setSelection({ mode, loading: true }); setEditErrorKey(null)
    try {
      const fresh = await assetService.getAssetById(vaultId, asset.id, {lang, accessToken, signal:controller.signal})
      if (!controller.signal.aborted && aliveRef.current) setSelection({mode, asset:fresh})
    } catch (error) {
      if (controller.signal.aborted || !aliveRef.current) return
      setSelection(null)
      if (error.status === 401) { onNavigateToLogin?.(); return }
      if ([403,404].includes(error.status)) { setAssets([]); setTotalElements(0); setError(error.code) }
      showToast(error.code || 'loadError','error')
    }
  }
  async function handleUpdateAsset(assetId, patch, { signal } = {}) {
    if (submittingRef.current) return
    submittingRef.current = true
    const controller = new AbortController(); mutationRef.current = controller
    const cancel = () => controller.abort()
    signal?.addEventListener('abort', cancel, { once: true })
    if (signal?.aborted) controller.abort()
    setIsUpdating(true); setEditErrorKey(null)
    try {
      const { images = [], documents = [], ...assetPatch } = patch
      const { password, ...editableFields } = assetPatch
      const progress = editProgressRef.current?.assetId === assetId ? editProgressRef.current : (editProgressRef.current = { assetId, fieldsKey: null, files: new Set() })
      const options = { lang, accessToken, signal: controller.signal }
      const fieldsKey = Object.keys(editableFields).length ? JSON.stringify(editableFields) : null
      const todoImages = images.filter(f => !progress.files.has(f)), todoDocuments = documents.filter(f => !progress.files.has(f))
      const failed = { fields: false, images: [], documents: [] }
      let firstError = null
      const step = async (run, onFail) => {
        try { await run() } catch (error) { if (controller.signal.aborted) throw error; firstError ||= error; onFail() }
      }
      if (fieldsKey && progress.fieldsKey !== fieldsKey) {
        await step(async () => { await assetService.updateAsset(vaultId, assetId, { ...editableFields, password }, options); progress.fieldsKey = fieldsKey }, () => { failed.fields = true })
      }
      // A failed field save (e.g. wrong password) stops the save; images and documents use separate endpoints, so each is attempted and reported on its own.
      if (!failed.fields && todoImages.length) await step(async () => { await assetImageService.add(vaultId, assetId, todoImages, options); todoImages.forEach(f => progress.files.add(f)) }, () => { failed.images = todoImages })
      if (!failed.fields && todoDocuments.length) await step(async () => { await assetDocumentService.upload(vaultId, assetId, todoDocuments, options); todoDocuments.forEach(f => progress.files.add(f)) }, () => { failed.documents = todoDocuments })
      if (controller.signal.aborted || !aliveRef.current) return
      if (firstError) {
        const savedFiles = { images: images.filter(f => progress.files.has(f)), documents: documents.filter(f => progress.files.has(f)) }
        const savedFields = !!fieldsKey && progress.fieldsKey === fieldsKey
        if (savedFields || savedFiles.images.length || savedFiles.documents.length) {
          firstError.partial = { savedFields, failedFields: failed.fields, savedImages: savedFiles.images, savedDocuments: savedFiles.documents, failedImages: failed.images, failedDocuments: failed.documents }
          loadAssets()
        }
        throw firstError
      }
      editProgressRef.current = null
      closeSelection(); loadAssets(); showToast('editSuccess')
    } catch (error) {
      if (controller.signal.aborted || !aliveRef.current) return
      if (['REAUTH_FAILED', 'TOO_MANY_ATTEMPTS'].includes(error.code)) throw error
      if (error.status === 401) { closeSelection(); onNavigateToLogin?.(); return }
      if ([403,404].includes(error.status)) { closeSelection(); setAssets([]); setTotalElements(0); setError(error.code) }
      else setEditErrorKey(error.code || 'editError')
      showToast(error.code || 'editError','error')
      throw error
    } finally {
      signal?.removeEventListener('abort', cancel)
      if (mutationRef.current === controller) { mutationRef.current=null; submittingRef.current=false; if (aliveRef.current) setIsUpdating(false) }
    }
  }
  // Client-side filtering by assetType and searching by name/description
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const matchesType =
        selectedAssetType === 'ALL' || asset.assetType === selectedAssetType
      const query = searchQuery.toLowerCase().trim()
      const matchesQuery =
        !query ||
        (asset.name && asset.name.toLowerCase().includes(query)) ||
        (asset.description && asset.description.toLowerCase().includes(query))
      return matchesType && matchesQuery
    })
  }, [assets, selectedAssetType, searchQuery])

  const hasAnyAssets = totalElements > 0
  const isSearchNoResults = hasAnyAssets && filteredAssets.length === 0

  return (
    <div className="lv-asset-page">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`lv-toast lv-toast--${toastMessage.type}`}
          role="status"
          aria-live="polite"
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 size={16} />
          ) : (
            <AlertTriangle size={16} />
          )}
          <span>{t.assets.alerts[toastMessage.key] || t.assets.alerts.saveError}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="lv-page-header">
        <div className="lv-page-header__left">
          <div className="lv-page-title-row">
            <h1 className="lv-page-title">{t.assets.title}</h1>
          </div>
        </div>

        <Button
          variant="primary"
          onClick={openAddModal}
          className="lv-add-btn"
          aria-label={t.assets.addNewBtn}
          disabled={isLoading || Boolean(error) || Boolean(addUnavailable)}
        >
          <Plus size={16} />
          <span className="lv-add-btn__text">{t.assets.addNewBtn}</span>
        </Button>
      </div>

      {enforceQuota && (quotaFull || quotaError || quotaLoading) && (
        <div className="lv-asset-quota-notice" role="status">
          <div>
            <strong>{quotaLoading ? (lang === 'en' ? 'Checking plan limits…' : 'Đang kiểm tra hạn mức…') : quotaError
              ? (lang === 'en' ? 'Unable to check plan limits' : 'Chưa kiểm tra được hạn mức gói')
              : (lang === 'en' ? 'Your plan limit has been reached' : 'Đã đạt giới hạn gói sử dụng')}</strong>
            {quotaFull && <p>{quota.storageUsedBytes >= quota.maxStorageBytes
              ? (lang === 'en' ? `Storage used: ${formatStorageBytes(quota.storageUsedBytes)} / ${formatStorageBytes(quota.maxStorageBytes)}. Upgrade to add content.`
                : `Đã dùng ${formatStorageBytes(quota.storageUsedBytes)} / ${formatStorageBytes(quota.maxStorageBytes)}. Nâng gói để thêm nội dung.`)
              : lang === 'en'
              ? `${quota.assetsUsed}/${quota.maxAssets} slots used, including assets and will records. Existing items remain available to view and edit.`
              : `Đã dùng ${quota.assetsUsed}/${quota.maxAssets} chỗ, gồm tài sản và hồ sơ di chúc. Bạn vẫn có thể xem và chỉnh sửa dữ liệu hiện có.`}</p>}
          </div>
          {quotaError ? <Button variant="secondary" onClick={loadAssets}>{lang === 'en' ? 'Retry' : 'Thử lại'}</Button>
            : quotaFull && onNavigateToSubscription && <Button variant="primary" onClick={onNavigateToSubscription}>{lang === 'en' ? 'View plans' : 'Xem gói sử dụng'}</Button>}
        </div>
      )}

      {/* Summary Cards — reflect filtered data */}
      {!isLoading && !error && hasAnyAssets && (
        <AssetSummaryCards assets={filteredAssets} t={t} lang={lang} />
      )}

      {/* Filter and Search Bar */}
      <div className="lv-filter-bar">
        <div className="lv-search-box">
          <Search size={16} className="lv-search-icon" aria-hidden="true" />
          <input
            type="text"
            className="lv-search-input"
            placeholder={t.assets.searchPlaceholder}
            aria-label={t.assets.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="lv-category-filter">
          <Filter size={15} className="lv-filter-icon" aria-hidden="true" />
          <select
            className="lv-category-select"
            value={selectedAssetType}
            onChange={(e) => setSelectedAssetType(e.target.value)}
            aria-label={t.assets.filterAria}
          >
            <option value="ALL">{t.assets.filterAll}</option>
            <option value="TEXT">{t.assets.types.TEXT}</option>
            <option value="CREDENTIAL">{t.assets.types.CREDENTIAL}</option>
          </select>
        </div>
      </div>
      {/* Filters apply to the current server page; no global search contract exists. */}

      {/* Main Content Area */}
      {isLoading ? (
        <div className="lv-asset-skeleton" role="status" aria-live="polite">
          <div className="lv-asset-skeleton__summary">
            <div className="lv-asset-skeleton__stat">
              <div className="lv-asset-skeleton__stat-icon lv-skeleton-pulse" />
              <div className="lv-asset-skeleton__stat-text">
                <div className="lv-asset-skeleton__stat-label lv-skeleton-pulse" />
                <div className="lv-asset-skeleton__stat-val lv-skeleton-pulse" />
              </div>
            </div>
            <div className="lv-asset-skeleton__stat">
              <div className="lv-asset-skeleton__stat-icon lv-skeleton-pulse" />
              <div className="lv-asset-skeleton__stat-text">
                <div className="lv-asset-skeleton__stat-label lv-skeleton-pulse" />
                <div className="lv-asset-skeleton__stat-val lv-skeleton-pulse" />
              </div>
            </div>
            <div className="lv-asset-skeleton__stat">
              <div className="lv-asset-skeleton__stat-icon lv-skeleton-pulse" />
              <div className="lv-asset-skeleton__stat-text">
                <div className="lv-asset-skeleton__stat-label lv-skeleton-pulse" />
                <div className="lv-asset-skeleton__stat-pills">
                  <div className="lv-asset-skeleton__stat-pill lv-skeleton-pulse" />
                  <div className="lv-asset-skeleton__stat-pill lv-skeleton-pulse" />
                </div>
              </div>
            </div>
          </div>
          <div className="lv-asset-skeleton__toolbar lv-skeleton-pulse" />
          <div className="lv-asset-skeleton__table">
            <div className="lv-asset-skeleton__header lv-skeleton-pulse" />
            {[1, 2, 3, 4].map((idx) => (
              <div key={idx} className="lv-asset-skeleton__row">
                <div className="lv-asset-skeleton__cell lv-asset-skeleton__cell--name">
                  <div className="lv-asset-skeleton__line lv-asset-skeleton__line--title lv-skeleton-pulse" />
                  <div className="lv-asset-skeleton__line lv-asset-skeleton__line--sub lv-skeleton-pulse" />
                </div>
                <div className="lv-asset-skeleton__cell lv-asset-skeleton__cell--badge">
                  <div className="lv-asset-skeleton__badge lv-skeleton-pulse" />
                </div>
                <div className="lv-asset-skeleton__cell lv-asset-skeleton__cell--status">
                  <div className="lv-asset-skeleton__badge lv-skeleton-pulse" />
                </div>
                <div className="lv-asset-skeleton__cell lv-asset-skeleton__cell--date">
                  <div className="lv-asset-skeleton__line lv-asset-skeleton__line--date lv-skeleton-pulse" />
                </div>
                <div className="lv-asset-skeleton__cell lv-asset-skeleton__cell--actions">
                  <div className="lv-asset-skeleton__btn lv-skeleton-pulse" />
                  <div className="lv-asset-skeleton__btn lv-skeleton-pulse" />
                </div>
              </div>
            ))}
          </div>
          <p className="sr-only">{t.assets.loadingText}</p>
        </div>
      ) : error ? (
        <div className="lv-error-card" role="alert">
          <AlertTriangle size={32} className="lv-error-icon" />
          <h3>{t.assets.errorTitle}</h3>
          <p>{t.assets.alerts[error] || t.assets.alerts.loadError}</p>
          {error === 'UNAUTHENTICATED' && onNavigateToLogin && <Button onClick={onNavigateToLogin}>{t.assets.signIn}</Button>}
          <Button variant="secondary" onClick={loadAssets}>
            <RefreshCw size={14} />
            <span>{t.assets.alerts.retryBtn}</span>
          </Button>
        </div>
      ) : !hasAnyAssets ? (
        <div className="lv-empty-card">
          <div className="lv-empty-icon-wrap">
            <FolderOpen size={36} />
          </div>
          <h2 className="lv-empty-title">{t.assets.emptyTitle}</h2>
          <p className="lv-empty-desc">{t.assets.emptyDesc}</p>
          <Button variant="primary" onClick={openAddModal} disabled={Boolean(addUnavailable)}>
            <Plus size={16} />
            <span>{t.assets.emptyAction}</span>
          </Button>
        </div>
      ) : (
        <>
        {isSearchNoResults && (
        <div className="lv-empty-card">
          <div className="lv-empty-icon-wrap">
            <Search size={32} />
          </div>
          <h2 className="lv-empty-title">{t.assets.noMatchTitle}</h2>
          <p className="lv-empty-desc">{t.assets.noMatchDesc}</p>
          <div className="lv-empty-actions-row">
            <Button
              variant="secondary"
              onClick={() => {
                setSearchQuery('')
                setSelectedAssetType('ALL')
              }}
            >
              {t.assets.clearFilter}
            </Button>
            <Button variant="primary" onClick={openAddModal} disabled={Boolean(addUnavailable)}>
              <Plus size={16} />
              <span>{t.assets.emptyAction}</span>
            </Button>
          </div>
        </div>
        )}
        <AssetListTable assets={filteredAssets} t={t} lang={lang}
          query={query} totalElements={totalElements}
          onQueryChange={next => { closeSelection(); setIsLoading(true); setQuery(next) }}
          onViewAsset={asset => openAsset(asset,"detail")} onEditAsset={asset => openAsset(asset,"edit")} />
        </>
      )}

      {/* Floating Action Button for mobile */}
      <button
        type="button"
        className="lv-mobile-fab"
        style={{ visibility: isAddModalOpen ? 'hidden' : undefined }}
        onClick={openAddModal}
        aria-label={t.assets.addNewBtn}
        disabled={isLoading || Boolean(error) || Boolean(addUnavailable)}
      >
        <Plus size={24} />
      </button>


      {selection?.loading && <Modal isOpen onClose={closeSelection} title={t.assets.loadingText} closeLabel={t.assets.closeBtn}><p role="status">{t.assets.loadingText}</p></Modal>}
      {selection?.asset && selection.mode === 'detail' && (
        <AssetDetailModal
          isOpen
          asset={selection.asset}
          t={t}
          lang={lang}
          onClose={closeSelection}
          vaultId={vaultId}
          accessToken={accessToken}
          onNavigateToLogin={onNavigateToLogin}
        />
      )}
      {selection?.asset && selection.mode === 'edit' && <AssetEditModal key={selection.asset.id} isOpen asset={selection.asset} vaultId={vaultId} accessToken={accessToken} lang={lang} authContext={`${vaultId}:${accessToken}`} t={t} onClose={closeSelection} onSubmit={handleUpdateAsset} isSubmitting={isUpdating} errorKey={editErrorKey} />}
      {/* Add Asset Modal */}
      {isAddModalOpen && <AssetFormModal key={isAddModalOpen ? "open" : "closed"}
        isOpen={true}
        onClose={() => {setIsAddModalOpen(false);createdAssetRef.current=null;setAssetSaved(false);setRetry(v=>v+1)}}
        onSubmit={handleAddAsset}
        t={t}
        lang={lang}
        isSubmitting={isSubmitting}
        assetSaved={assetSaved}
        errorKey={addErrorKey}
      />}
    </div>
  )
}
