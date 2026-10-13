import {
  Layers,
  FileText,
  KeyRound,
  ShieldCheck,
} from 'lucide-react'
import './AssetSummaryCards.css'
import { getAssetTranslations } from '../../pages/assets/assetI18n.js'

export function AssetSummaryCards({ assets, t: externalT, lang = 'vi' }) {
  const t = getAssetTranslations(externalT, lang)
  const totalAssets = assets.length

  const textCount = assets.filter((a) => a.assetType === 'TEXT').length
  const credentialCount = assets.filter((a) => a.assetType === 'CREDENTIAL').length
  const encryptedPayloadCount = assets.filter((a) => Boolean(a.hasPayload)).length

  return (
    <div className="lv-summary-cards-grid">
      {/* Card 1: Total Count */}
      <div className="lv-stat-card">
        <div className="lv-stat-card__icon lv-stat-card__icon--forest">
          <Layers size={20} />
        </div>
        <div className="lv-stat-card__content">
          <span className="lv-stat-card__label">{t.assets.stats.totalCount}</span>
          <div className="lv-stat-card__count-row">
            <span className="lv-stat-card__value lv-tabular-num">{totalAssets}</span>
            <span className="lv-stat-card__unit">{t.assets.stats.items}</span>
          </div>
        </div>
      </div>

      {/* Card 2: Security & Payload Protection */}
      <div className="lv-stat-card">
        <div className="lv-stat-card__icon lv-stat-card__icon--gold">
          <ShieldCheck size={20} />
        </div>
        <div className="lv-stat-card__content">
          <span className="lv-stat-card__label">{t.assets.stats.securityStatus}</span>
          <div className="lv-stat-card__count-row">
            <span className="lv-stat-card__value lv-tabular-num">{encryptedPayloadCount}</span>
            <span className="lv-stat-card__unit">
              / {totalAssets} {t.assets.stats.items}
            </span>
          </div>
        </div>
      </div>

      {/* Card 3: Distribution by Asset Type (TEXT & CREDENTIAL) */}
      <div className="lv-stat-card lv-stat-card--distribution">
        <div className="lv-stat-card__content lv-distribution-content">
          <span className="lv-stat-card__label">{t.assets.stats.distribution}</span>

          {totalAssets === 0 ? (
            <span className="lv-dist-empty">—</span>
          ) : (
            <div className="lv-dist-pills-row">
              <div
                className="lv-dist-pill"
                title={`${t.assets.types.TEXT}: ${textCount}`}
              >
                <span className="lv-dist-pill__icon">
                  <FileText size={14} />
                </span>
                <span className="lv-dist-pill__name">{t.assets.types.TEXT}</span>
                <span className="lv-dist-pill__count lv-tabular-num">{textCount}</span>
              </div>

              <div
                className="lv-dist-pill"
                title={`${t.assets.types.CREDENTIAL}: ${credentialCount}`}
              >
                <span className="lv-dist-pill__icon">
                  <KeyRound size={14} />
                </span>
                <span className="lv-dist-pill__name">{t.assets.types.CREDENTIAL}</span>
                <span className="lv-dist-pill__count lv-tabular-num">{credentialCount}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
