import { useEffect, useMemo, useRef, useState } from 'react';
import { readReceivedPage, receivedActions, receivedPreviewAllowed, readReceivedDetail, readReceivedContent, formatDeliveredDate } from './receivedAssetsModel.js';
import { PREVIEW_SUBJECT, previewReceivedActions } from './receivedAssetsPreview.js';
import { Modal } from '../../components/common/Modal.jsx';
import './ReceivedAssets.css';

function errorMessage(error, en) {
  if (error?.status === 401) return en ? 'Your session has expired. Please sign in again.' : 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  if (error?.status === 403) return en ? 'You are not authorized to view this received asset.' : 'Bạn không có quyền xem tài sản đã nhận này.';
  if (error?.status === 404) return en ? 'Received asset not found.' : 'Không tìm thấy tài sản đã nhận.';
  return en ? 'Could not load data. Please retry.' : 'Không thể tải dữ liệu. Vui lòng thử lại.';
}

function ReceivedImage({ itemId, image, actions, options, lang, onError }) {
  const en = lang === 'en';
  const [state, setState] = useState({ busy: false, blobUrl: null, error: null });
  const blobRef = useRef(null);
  const controller = useRef(null);
  const errorRef = useRef(onError);
  useEffect(() => { errorRef.current = onError; }, [onError]);
  useEffect(() => () => { controller.current?.abort(); }, []);
  useEffect(() => () => {
    controller.current?.abort();
    if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null; }
  }, []);
  const toggle = async () => {
    if (state.blobUrl) {
      URL.revokeObjectURL(state.blobUrl);
      blobRef.current = null;
      setState({ busy: false, blobUrl: null, error: null });
      return;
    }
    const c = new AbortController();
    controller.current = c;
    setState({ busy: true, blobUrl: null, error: null });
    try {
      const blob = await actions.image(itemId, image.imageId, { ...options, signal: c.signal });
      if (!c.signal.aborted) {
        const url = URL.createObjectURL(blob);
        blobRef.current = url;
        setState({ busy: false, blobUrl: url, error: null });
      }
    } catch (error) {
      if (!c.signal.aborted) {
        setState({ busy: false, blobUrl: null, error });
        errorRef.current(error);
      }
    }
  };
  return (
    <div className="lv-received-image">
      <div className="lv-received-image__header">
        <span className="lv-received-image__label">{image.label}</span>
        <button type="button" className="lv-received-detail__btn" disabled={state.busy} onClick={toggle}>
          {state.blobUrl ? (en ? 'Hide image' : 'Ẩn ảnh') : (state.busy ? (en ? 'Loading…' : 'Đang tải…') : (en ? 'View image' : 'Xem ảnh'))}
        </button>
      </div>
      {state.error && <p role="alert" className="lv-received-detail__error">{errorMessage(state.error, en)}</p>}
      {state.blobUrl && <img src={state.blobUrl} alt={image.label} className="lv-received-image__img" />}
    </div>
  );
}

function ItemDetail({ itemId, subjectId, actions, accessToken, lang, onError, onClose }) {
  const en = lang === 'en';
  const [result, setResult] = useState({ loading: true, data: null, error: null });
  const [content, setContent] = useState({ busy: false, text: null, error: null });
  const [retry, setRetry] = useState(0);
  const controller = useRef(null);
  const locked = useRef(false);
  const errorRef = useRef(onError);
  useEffect(() => { errorRef.current = onError; }, [onError]);
  useEffect(() => () => { controller.current?.abort(); }, []);
  useEffect(() => {
    const c = new AbortController();
    actions.detail(itemId, { accessToken, lang, signal: c.signal }).then(data => {
      if (!c.signal.aborted) setResult({ loading: false, data: readReceivedDetail(data, subjectId, itemId), error: null });
    }).catch(error => { if (!c.signal.aborted) { setResult({ loading: false, data: null, error }); errorRef.current(error); } });
    return () => {
      c.abort();
      controller.current?.abort();
    };
  }, [actions, subjectId, itemId, accessToken, lang, retry]);
  const showContent = async () => {
    if (locked.current) return;
    locked.current = true;
    const c = new AbortController();
    controller.current = c;
    setContent({ busy: true, text: null, error: null });
    try {
      const res = await actions.content(itemId, { accessToken, lang, signal: c.signal });
      if (!c.signal.aborted) setContent({ busy: false, text: readReceivedContent(res, subjectId, itemId), error: null });
    } catch (error) { if (!c.signal.aborted) { setContent({ busy: false, text: null, error }); errorRef.current(error); } }
    finally { if (!c.signal.aborted) locked.current = false; }
  };
  const item = result.data;
  return (
    <Modal
      isOpen
      onClose={onClose}
      closeLabel={en ? 'Close' : 'Đóng'}
      title={item?.title || (en ? 'Received asset' : 'Tài sản đã nhận')}
      maxWidth="680px"
    >
      <div className="lv-received-detail">
        {result.loading && <p role="status">{en ? 'Loading details…' : 'Đang tải chi tiết…'}</p>}
        {result.error && (
          <div className="lv-received-error-box">
            <p role="alert">{errorMessage(result.error, en)}</p>
            <button
              type="button"
              className="lv-received-retry-btn"
              onClick={() => { setResult({ loading: true, data: null, error: null }); setRetry(v => v + 1); }}
            >
              {en ? 'Retry' : 'Thử lại'}
            </button>
          </div>
        )}
        {item && (
          <>
            <div className="lv-received-detail__meta">
              <div className="lv-received-detail__meta-row">
                <span className="lv-received-detail__label">{en ? 'Source' : 'Nguồn'}:</span>
                <span>{item.sourceLabel}</span>
              </div>
              <div className="lv-received-detail__meta-row">
                <span className="lv-received-detail__label">{en ? 'Received date' : 'Ngày nhận'}:</span>
                <span>{formatDeliveredDate(item.deliveredAt, lang)}</span>
              </div>
            </div>

            <div className="lv-received-detail__section">
              {content.text === null && (
                <button
                  type="button"
                  className="lv-received-detail__btn"
                  disabled={content.busy}
                  onClick={showContent}
                >
                  {content.busy ? (en ? 'Loading…' : 'Đang tải…') : (en ? 'View content' : 'Xem nội dung')}
                </button>
              )}
              {content.error && <p role="alert" className="lv-received-detail__error">{errorMessage(content.error, en)}</p>}
              {content.text !== null && (
                <div className="lv-received-detail__content-wrap">
                  <pre className="lv-received-content">{content.text || (en ? 'Empty content' : 'Nội dung trống')}</pre>
                  <button
                    type="button"
                    className="lv-received-detail__btn"
                    onClick={() => setContent({ busy: false, text: null, error: null })}
                  >
                    {en ? 'Hide content' : 'Ẩn nội dung'}
                  </button>
                </div>
              )}
            </div>

            <div className="lv-received-detail__section">
              <h3 className="lv-received-detail__subheading">{en ? 'Received images' : 'Ảnh tài sản đã nhận'}</h3>
              {item.images.length === 0 && (
                <p className="lv-received-detail__empty-images">{en ? 'No images attached to this received item.' : 'Tài sản đã nhận này không có ảnh đính kèm.'}</p>
              )}
              {item.images.map(image => (
                <ReceivedImage
                  key={image.imageId}
                  itemId={itemId}
                  image={image}
                  actions={actions}
                  options={{ accessToken, lang }}
                  lang={lang}
                  onError={onError}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function AssetPage({ actions, subjectId, accessToken, lang, page, size, onPage, onError }) {
  const en = lang === 'en';
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [selected, setSelected] = useState(null);
  const [retry, setRetry] = useState(0);
  const errorRef = useRef(onError);
  useEffect(() => { errorRef.current = onError; }, [onError]);
  useEffect(() => {
    const c = new AbortController();
    actions.list({ page, size, accessToken, signal: c.signal }).then(raw => {
      if (!c.signal.aborted) setState({ loading: false, data: readReceivedPage(raw, subjectId, page, size), error: null });
    }).catch(error => { if (!c.signal.aborted) { setState({ loading: false, data: null, error }); errorRef.current(error); } });
    return () => c.abort();
  }, [actions, subjectId, accessToken, page, size, retry]);
  const data = state.data;
  const handleDetailError = error => {
    if ([401, 403, 404].includes(error?.status)) {
      setSelected(null);
      setState({ loading: false, data: null, error });
    }
    errorRef.current(error);
  };
  const stages = en ? {
    UNLINKED: 'Account not linked yet.',
    AWAITING_HANDOVER: 'No assets handed over to you yet.',
    PARTIAL: 'Partially received',
    RECEIVED: ''
  } : {
    UNLINKED: 'Hồ sơ chưa được liên kết.',
    AWAITING_HANDOVER: 'Chưa có tài sản được bàn giao cho bạn.',
    PARTIAL: 'Đã nhận một phần',
    RECEIVED: ''
  };
  const totalPages = data ? Math.ceil(data.total / size) : 0;
  return <>
    {state.loading && <p role="status">{en ? 'Loading…' : 'Đang tải…'}</p>}
    {state.error && (
      <div className="lv-received-error-box">
        <p role="alert">{errorMessage(state.error, en)}</p>
        <button
          type="button"
          className="lv-received-retry-btn"
          onClick={() => { setState({ loading: true, data: null, error: null }); setRetry(v => v + 1); }}
        >
          {en ? 'Retry' : 'Thử lại'}
        </button>
      </div>
    )}
    {data && <>
      {stages[data.accountState] && <p role="status" className="lv-received-status">{stages[data.accountState]}</p>}
      <ul className="lv-received-list">
        {data.items.map(item => (
          <li key={item.itemId} className="lv-received-item">
            <div className="lv-received-item__info">
              <h3 className="lv-received-item__title">{item.title}</h3>
              <div className="lv-received-item__meta">
                <span className="lv-received-item__source">{item.sourceLabel}</span>
                <span className="lv-received-item__dot">·</span>
                <span className="lv-received-item__date">{en ? 'Received: ' : 'Đã nhận: '}{formatDeliveredDate(item.deliveredAt, lang)}</span>
              </div>
            </div>
            <button
              type="button"
              className="lv-received-item__btn"
              onClick={() => setSelected(item.itemId)}
            >
              {en ? 'View details' : 'Xem chi tiết'}
            </button>
          </li>
        ))}
      </ul>
      {totalPages > 1 && (
        <nav aria-label={en ? 'Received assets pagination' : 'Phân trang tài sản đã nhận'} className="lv-received-pagination">
          <button type="button" disabled={page === 0} onClick={() => onPage(page - 1)}>{en ? 'Previous' : 'Trước'}</button>
          <span>{page + 1}/{totalPages}</span>
          <button type="button" disabled={(page + 1) * size >= data.total} onClick={() => onPage(page + 1)}>{en ? 'Next' : 'Sau'}</button>
        </nav>
      )}
    </>}
    {selected && <ItemDetail key={selected} itemId={selected} subjectId={subjectId} actions={actions} accessToken={accessToken} lang={lang} onError={handleDetailError} onClose={() => setSelected(null)} />}
  </>;
}

export default function ReceivedAssets(props) {
  return <ReceivedAssetsContent key={`${props.userId || 'preview'}:${props.accessToken || 'anonymous'}`} {...props} />;
}

function ReceivedAssetsContent({ actions, userId, accessToken, lang = 'vi', isDevPreview = false, scenario = 'unlinked', onUnauthorized, refreshKey = 0, hideTitle = false }) {
  const en = lang === 'en';
  const [page, setPage] = useState(0);
  const preview = receivedPreviewAllowed({ accessToken, isDevPreview });
  const previewActions = useMemo(() => previewReceivedActions(scenario, lang), [scenario, lang]);
  const source = receivedActions(actions, { accessToken, isDevPreview, previewActions });
  const [revision, setRevision] = useState(0);
  const subjectId = preview ? PREVIEW_SUBJECT : userId;
  return (
    <section className="lv-received" aria-labelledby="received-assets-title">
      <header className={`lv-received__header ${hideTitle ? 'lv-received__header--concise' : ''}`}>
        {hideTitle ? (
          <h2 id="received-assets-title" className="lv-sr-only">{en ? 'Received assets' : 'Tài sản bạn đã nhận'}</h2>
        ) : (
          <div>
            <h2 id="received-assets-title">{en ? 'Received assets' : 'Tài sản bạn đã nhận'}</h2>
          </div>
        )}
        <div className="lv-received__header-actions">
          {preview && <span className="lv-received-demo" role="note">{en ? 'Demo data' : 'Dữ liệu minh họa'}</span>}
          {source && (
            <button
              type="button"
              className="lv-received__reload-btn"
              onClick={() => { setPage(0); setRevision(v => v + 1); }}
            >
              {en ? 'Reload' : 'Tải lại'}
            </button>
          )}
        </div>
      </header>
      {!source ? (
        <div className="lv-received-pending" role="status">
          <h3>{en ? 'Received asset information is not available yet' : 'Thông tin tài sản đã nhận chưa khả dụng'}</h3>
          <p>{en ? 'The received-assets service has not been connected yet.' : 'Dịch vụ tra cứu tài sản đã nhận chưa được kết nối.'}</p>
        </div>
      ) : (
        <AssetPage
          key={`${subjectId}:${accessToken || 'demo'}:${page}:${revision}:${refreshKey}:${scenario}`}
          actions={source}
          subjectId={subjectId}
          accessToken={accessToken}
          lang={lang}
          page={page}
          size={5}
          onPage={setPage}
          onError={error => { if (error?.status === 401) onUnauthorized?.(); }}
        />
      )}
    </section>
  );
}
