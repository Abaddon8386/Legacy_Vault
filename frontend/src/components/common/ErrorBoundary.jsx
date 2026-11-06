import { Component } from 'react';
import { Button } from './Button.jsx';
import './ErrorBoundary.css';

// Contains a render error to its own area. Resets when `resetKey` changes (route change).
export default class ErrorBoundary extends Component {
  state = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(props, state) {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey };
  }

  componentDidCatch(error) {
    if (import.meta.env?.DEV) console.error('ErrorBoundary caught a render error', error);
  }

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
