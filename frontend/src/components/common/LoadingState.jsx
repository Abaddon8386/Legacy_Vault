import './LoadingState.css';

/**
 * Trạng thái đang tải (spinner + thông điệp) dùng chung.
 *
 * @param {object} props
 * @param {string} [props.lang='vi']
 * @param {string} [props.message] Thông điệp thay thế mặc định.
 * @param {boolean} [props.compact=false] Kiểu gọn.
 */
export default function LoadingState({ lang = 'vi', message: customMessage, compact = false }) {
  const message = customMessage || (
    lang === 'en'
      ? 'Loading heritage vault records…'
      : 'Đang tải thông tin kho di sản…');

  return (
    <div className={`lv-loading-state${compact ? ' lv-loading-state--compact' : ''}`} role="status" aria-live="polite">
      <div className="lv-loading-spinner-wrap" aria-hidden="true">
        <div className="lv-loading-spinner" />
        <span className="lv-loading-center-dot" />
      </div>
      <p className="lv-loading-text">{message}</p>
    </div>
  );
}
