import './LoadingState.css';

export default function LoadingState({ lang = 'vi' }) {
  const message =
    lang === 'en'
      ? 'Loading heritage vault records…'
      : 'Đang tải thông tin kho di sản…';

  return (
    <div className="lv-loading-state" role="status" aria-live="polite">
      <div className="lv-loading-spinner-wrap">
        <div className="lv-loading-spinner" />
        <span className="lv-loading-center-dot" />
      </div>
      <p className="lv-loading-text">{message}</p>
    </div>
  );
}
