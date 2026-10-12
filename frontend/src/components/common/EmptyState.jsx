import MagneticButton from './MagneticButton.jsx';
import './EmptyState.css';

export default function EmptyState({
  onCreateVault,
  onAction,
  title,
  description,
  actionLabel,
  badge,
  icon,
  showPillars = true,
  lang = 'vi',
}) {
  const content = {
    vi: {
      badge: 'BẮT ĐẦU HÀNH TRÌNH',
      title: 'Bạn chưa khởi tạo kho di sản số',
      desc: 'Kho di sản số là không gian riêng tư và an toàn giúp bạn lưu giữ tài sản số, tài liệu di chúc và gửi gắm chỉ dẫn cho thế hệ mai sau.',
      cta: 'Khởi tạo kho di sản số',
      pillar1Title: 'Bảo vệ riêng tư',
      pillar1Desc: 'Thiết kế an toàn, hướng tới kiểm soát truy cập và bảo vệ dữ liệu cá nhân.',
      pillar2Title: 'Quyền sở hữu duy nhất',
      pillar2Desc: 'Toàn quyền tự quyết và cấu hình kho di sản của chính bạn.',
      pillar3Title: 'Lưu truyền thế hệ',
      pillar3Desc: 'Chỉ dẫn bàn giao rõ ràng, an tâm gìn giữ giá trị di sản.',
    },
    en: {
      badge: 'BEGIN YOUR SANCTUARY',
      title: 'No heritage vault initialized yet',
      desc: 'Your digital heritage sanctuary is a calm, secure space to safeguard digital assets, wills, and transition directives for future generations.',
      cta: 'Initialize heritage vault',
      pillar1Title: 'Privacy Protection',
      pillar1Desc: 'Designed for privacy, focused on personal data and access protection.',
      pillar2Title: 'Autonomous Ownership',
      pillar2Desc: 'Sole control and configuration belong exclusively to you.',
      pillar3Title: 'Generational Legacy',
      pillar3Desc: 'Structured transition directives honoring your intentions.',
    },
  };

  const t = content[lang] || content.vi;
  const displayTitle = title || t.title;
  const displayDesc = description || t.desc;
  const displayCta = actionLabel || t.cta;
  const displayBadge = badge || (title ? (lang === 'en' ? 'VITALITY MONITOR' : 'CHƯA KÍCH HOẠT') : t.badge);
  const handleAction = onAction || onCreateVault;
  const shouldShowPillars = !title && showPillars;

  return (
    <section className="lv-empty-state" aria-label={displayTitle}>
      <div className="lv-empty-card">
        {/* Emblem Motif */}
        <div className="lv-empty-emblem" aria-hidden="true">
          {icon || (
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          )}
        </div>

        <span className="lv-empty-badge">{displayBadge}</span>
        <h2 className="lv-empty-heading">{displayTitle}</h2>
        <p className="lv-empty-desc">{displayDesc}</p>

        {handleAction && (
          <MagneticButton
            type="button"
            className="lv-empty-cta"
            onClick={handleAction}
            maxOffset={5}
          >
            <span>{displayCta}</span>
            <span className="lv-empty-arrow" aria-hidden="true">→</span>
          </MagneticButton>
        )}

        {/* Informative Value Pillars (for Vault default) */}
        {shouldShowPillars && (
          <div className="lv-empty-pillars">
            <div className="lv-empty-pillar">
              <span className="lv-pillar-icon" aria-hidden="true">🔒</span>
              <div className="lv-pillar-content">
                <strong>{t.pillar1Title}</strong>
                <p>{t.pillar1Desc}</p>
              </div>
            </div>
            <div className="lv-empty-pillar">
              <span className="lv-pillar-icon" aria-hidden="true">✦</span>
              <div className="lv-pillar-content">
                <strong>{t.pillar2Title}</strong>
                <p>{t.pillar2Desc}</p>
              </div>
            </div>
            <div className="lv-empty-pillar">
              <span className="lv-pillar-icon" aria-hidden="true">🕊</span>
              <div className="lv-pillar-content">
                <strong>{t.pillar3Title}</strong>
                <p>{t.pillar3Desc}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
