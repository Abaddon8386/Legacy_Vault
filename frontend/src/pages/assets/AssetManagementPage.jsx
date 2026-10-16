import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Plus,
  Search,
  Filter,
  Info,
  AlertTriangle,
  FolderOpen,
  RefreshCw,
  CheckCircle2,
  X,
} from 'lucide-react'
import { assetService } from '../../services/assetService'
import { Button } from '../../components/common/Button'
import { Modal } from '../../components/common/Modal'
import { AssetListTable } from '../../components/assets/AssetListTable'
import { AssetFormModal } from '../../components/assets/AssetFormModal'
import { AssetSummaryCards } from '../../components/assets/AssetSummaryCards'
import './AssetManagementPage.css'
import { AssetDetailModal } from '../../components/assets/AssetDetailModal'
import { AssetEditModal } from '../../components/assets/AssetEditModal'
import { getAssetTranslations, LEGAL_DISMISSED_KEY } from './assetI18n.js'

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
}) {
  const t = getAssetTranslations(externalT, lang)
  const [query, setQuery] = useState({ page: 0, size: 10, sort: 'createdAt,desc' })
  const [totalElements, setTotalElements] = useState(0)
  const [retry, setRetry] = useState(0)
  const submittingRef = useRef(false)
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
  const [toastMessage, setToastMessage] = useState(null)

  // Legal Notice collapsible behavior
  const [isLegalDismissed, setIsLegalDismissed] = useState(() => {
    try {
      return localStorage.getItem(LEGAL_DISMISSED_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [showLegalInfoModal, setShowLegalInfoModal] = useState(false)

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

  function handleDismissLegalNotice() {
    setIsLegalDismissed(true)
    try {
      localStorage.setItem(LEGAL_DISMISSED_KEY, 'true')
    } catch {
      // Ignore
    }
  }

  async function handleAddAsset(formData) {
    if (submittingRef.current) return
    submittingRef.current = true
    const controller = new AbortController(); mutationRef.current = controller
    setIsSubmitting(true)
    try {
      await assetService.createAsset(vaultId, formData, { lang, accessToken, signal: controller.signal })
      if (!aliveRef.current) return
      setIsAddModalOpen(false)
      setSearchQuery('')
      setSelectedAssetType('ALL')
      setQuery(prev => ({ ...prev, page: 0, sort: 'createdAt,desc' }))
      showToast('addSuccess')
    } catch (error) {
      if (aliveRef.current && error.name !== 'AbortError') {
        if (error.status === 401) { setIsAddModalOpen(false); onNavigateToLogin?.(); return }
        if ([403,404].includes(error.status)) setIsAddModalOpen(false)
        showToast(error.code || 'saveError', 'error')
      }
    } finally {
      submittingRef.current = false
      if (aliveRef.current) setIsSubmitting(false)
    }
  }

  function closeSelection() {
    selectionRef.current?.abort(); setSelection(null); setEditErrorKey(null)
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
  async function handleUpdateAsset(assetId, patch) {
    if (submittingRef.current) return
    submittingRef.current = true
    const controller = new AbortController(); mutationRef.current = controller
    setIsUpdating(true); setEditErrorKey(null)
    try {
      await assetService.updateAsset(vaultId,assetId,patch,{lang,accessToken,signal:controller.signal})
      if (controller.signal.aborted || !aliveRef.current) return
      closeSelection(); loadAssets(); showToast('editSuccess')
    } catch (error) {
      if (controller.signal.aborted || !aliveRef.current) return
      if (error.status === 401) { closeSelection(); onNavigateToLogin?.(); return }
      if ([403,404].includes(error.status)) { closeSelection(); setAssets([]); setTotalElements(0); setError(error.code) }
      else setEditErrorKey(error.code || 'editError')
      showToast(error.code || 'editError','error')
    } finally { submittingRef.current=false; if (aliveRef.current) setIsUpdating(false) }
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
            {isLegalDismissed && (
              <button
                type="button"
                className="lv-info-pill-btn"
                onClick={() => setShowLegalInfoModal(true)}
                title={t.assets.noticeInfoTooltip}
                aria-label={t.assets.noticeInfoTooltip}
              >
                <Info size={16} />
              </button>
            )}
          </div>
          <p className="lv-page-subtitle">{t.assets.subtitle}</p>
        </div>

        <Button
          variant="primary"
          onClick={() => setIsAddModalOpen(true)}
          className="lv-add-btn"
          aria-label={t.assets.addNewBtn}
          disabled={isLoading || Boolean(error)}
        >
          <Plus size={18} />
          <span className="lv-add-btn__text">{t.assets.addNewBtn}</span>
        </Button>
      </div>

      {/* Collapsible Legal Notice */}
      {!isLegalDismissed && (
        <div className="lv-legal-notice-banner">
          <div className="lv-legal-notice-banner__content">
            <Info size={18} className="lv-notice-icon" />
            <p>{t.assets.notice}</p>
          </div>
          <button
            type="button"
            className="lv-legal-dismiss-btn"
            onClick={handleDismissLegalNotice}
          >
            <span>{t.assets.noticeDismiss}</span>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Summary Cards — reflect filtered data */}
      {!isLoading && !error && hasAnyAssets && (
        <AssetSummaryCards assets={filteredAssets} t={t} lang={lang} />
      )}

      {/* Filters apply to the current server page; no global search contract exists. */}
      {!isLoading && !error && hasAnyAssets && <p className="lv-filter-scope">{t.assets.pageScope}</p>}
      {/* Filter and Search Bar */}
      <div className="lv-filter-bar">
        <div className="lv-search-box">
          <Search size={16} className="lv-search-icon" />
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
          <Filter size={15} className="lv-filter-icon" />
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

      {/* Main Content Area */}
      {isLoading ? (
        <div className="lv-loading-card" role="status" aria-live="polite">
          <div className="lv-skeleton-spinner" />
          <p>{t.assets.loadingText}</p>
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
          <Button variant="primary" onClick={() => setIsAddModalOpen(true)}>
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
            <Button variant="primary" onClick={() => setIsAddModalOpen(true)}>
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
        onClick={() => setIsAddModalOpen(true)}
        aria-label={t.assets.addNewBtn}
        disabled={isLoading || Boolean(error)}
      >
        <Plus size={24} />
      </button>

      {/* Legal Notice Info Modal */}
      <Modal
        isOpen={showLegalInfoModal}
        onClose={() => setShowLegalInfoModal(false)}
        title={t.assets.legalNoticeModalTitle}
        closeLabel={t.assets.closeBtn}
      >
        <div className="lv-legal-modal-body">
          <Info size={28} className="lv-notice-icon" />
          <p>{t.assets.notice}</p>
        </div>
        <div className="lv-modal-actions-right">
          <Button variant="primary" onClick={() => setShowLegalInfoModal(false)}>
            {t.assets.noticeDismiss}
          </Button>
        </div>
      </Modal>

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
      {selection?.asset && selection.mode === 'edit' && <AssetEditModal key={selection.asset.id} isOpen asset={selection.asset} t={t} onClose={closeSelection} onSubmit={handleUpdateAsset} isSubmitting={isUpdating} errorKey={editErrorKey} />}
      {/* Add Asset Modal */}
      {isAddModalOpen && <AssetFormModal key={isAddModalOpen ? "open" : "closed"}
        isOpen={true}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleAddAsset}
        t={t}
        lang={lang}
        isSubmitting={isSubmitting}
      />}
    </div>
  )
}
