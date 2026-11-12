import './LanguageToggle.css';

/**
 * Nút chuyển ngôn ngữ VI/EN. Gọi {@code onToggleLang(value)} với "vi" hoặc "en". Dùng trong {@code AppShell} và một số trang nhân viên/pháp lý ({@code BeneficiaryAccountPage}, {@code CounterHandoverPage}, {@code LegalApprovalReviewPage}).
 *
 * @param {{lang?:string, onToggleLang?:(lang:string)=>void}} props
 */
export default function LanguageToggle({ lang = 'vi', onToggleLang }) {
  return <div className="lv-shell-lang-toggle" role="group" aria-label="Ngôn ngữ / Language">
    {['vi', 'en'].map(value => <button key={value} type="button"
      className={`lv-lang-btn ${lang === value ? 'is-active' : ''}`}
      aria-pressed={lang === value} onClick={() => onToggleLang?.(value)}>
      {value.toUpperCase()}
    </button>)}
  </div>;
}
