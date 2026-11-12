import { Component } from 'react';
import { Button } from './Button.jsx';
import './ErrorBoundary.css';

// Contains a render error to its own area. Resets when `resetKey` changes (route change).
/**
 * Error boundary giữ lỗi render trong phạm vi vùng của nó (không làm sập cả ứng dụng); hiển thị thông báo lỗi kèm nút "Thử lại" và "Về trang chính".
 * Tự đặt lại khi {@code resetKey} đổi (ví dụ khi chuyển trang). Dùng trong {@code App.jsx} bao quanh nội dung từng màn hình.
 *
 * Props: {@code resetKey}, {@code lang}, {@code children}.
 */
export default class ErrorBoundary extends Component {
  state = { failed: false, resetKey: this.props.resetKey };

  /**
   * Đánh dấu trạng thái lỗi khi một component con ném lỗi trong lúc render.
   */
  static getDerivedStateFromError() {
    return { failed: true };
  }

  /**
   * Reset trạng thái lỗi khi {@code resetKey} thay đổi.
   */
  static getDerivedStateFromProps(props, state) {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey };
  }

  /**
   * Ghi lỗi ra console ở chế độ phát triển (DEV).
   */
  componentDidCatch(error) {
    if (import.meta.env?.DEV) console.error('ErrorBoundary caught a render error', error);
  }

  /**
   * Hiển thị con bình thường, hoặc thông báo lỗi song ngữ khi đã lỗi.
   */
  render() {
    if (!this.state.failed) return this.props.children;
    const en = this.props.lang === 'en';
    return (
      <section className="lv-boundary" role="alert">
        <h2 className="lv-boundary__title">{en ? 'Something went wrong on this page' : 'Trang này gặp sự cố'}</h2>
        <p className="lv-boundary__text">{en ? 'The rest of the app still works. Try again or go back to the home page.' : 'Phần còn lại của ứng dụng vẫn hoạt động. Hãy thử lại hoặc quay về trang chính.'}</p>
        <div className="lv-boundary__actions">
          <Button type="button" onClick={() => this.setState({ failed: false })}>{en ? 'Try again' : 'Thử lại'}</Button>
          <Button type="button" variant="secondary" onClick={() => { window.location.href = en ? '/?lang=en' : '/?lang=vi'; }}>{en ? 'Back to home' : 'Về trang chính'}</Button>
        </div>
      </section>
    );
  }
}
