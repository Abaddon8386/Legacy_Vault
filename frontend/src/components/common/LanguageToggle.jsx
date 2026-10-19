import './LanguageToggle.css';

export default function LanguageToggle({ lang = 'vi', onToggleLang }) {
  return <div className="lv-shell-lang-toggle" role="group" aria-label="Ngôn ngữ / Language">
    {['vi', 'en'].map(value => <button key={value} type="button"
      className={`lv-lang-btn ${lang === value ? 'is-active' : ''}`}
      aria-pressed={lang === value} onClick={() => onToggleLang?.(value)}>
      {value.toUpperCase()}
    </button>)}
  </div>;
}
