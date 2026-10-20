import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../../components/common/Modal.jsx';
import { readReceivedPage, readReceivedDetail, readReceivedContent, receivedActions, receivedPreviewAllowed } from './receivedAssetsModel.js';
import { PREVIEW_SUBJECT, previewReceivedActions } from './receivedAssetsPreview.js';
import './ReceivedAssets.css';

function errorMessage(error, en) {
  if (error?.status === 401) return en ? 'Your session expired. Sign in again.' : 'Phiên đã hết hạn. Vui lòng đăng nhập lại.';
  if ([403, 404].includes(error?.status)) return en ? 'This received item is unavailable or you no longer have access.' : 'Tài sản đã nhận không khả dụng hoặc bạn không còn quyền xem.';
  return en ? 'Unable to load information. Please retry.' : 'Chưa tải được thông tin. Vui lòng thử lại.';
}
function ReceivedImage({ itemId, image, actions, options, lang, onError }) {
  const en = lang === 'en';
  const [state, setState] = useState({ busy: false, url: null, error: null });
  const control = useRef(null);
  const objectUrl = useRef(null);
  const locked = useRef(false);
  useEffect(() => () => { control.current?.abort(); if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);
  const hide = () => {
    control.current?.abort(); if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null; locked.current = false; setState({ busy: false, url: null, error: null });
  };
  async function load() {
    if (locked.current) return;
    locked.current = true; const c = new AbortController(); control.current = c;
    setState({ busy: true, url: null, error: null });
    try {
      const blob = await actions.image(itemId, image.imageId, { ...options, signal: c.signal });
      if (c.signal.aborted) return;
      if (!(blob instanceof Blob) || !['image/png', 'image/jpeg'].includes(blob.type) || blob.size === 0) throw new Error('INVALID_RESPONSE');
      const url = URL.createObjectURL(blob); objectUrl.current = url;
      setState({ busy: false, url, error: null });
    } catch (error) { if (!c.signal.aborted) { setState({ busy: false, url: null, error }); onError(error); } }
    finally { if (!c.signal.aborted) locked.current = false; }
  }
  return <div className="lv-received-image">
    <p>{image.label}</p>
    {state.error && <p role="alert">{errorMessage(state.error, en)}</p>}
    {state.busy && <p role="status">{en ? 'Loading image…' : 'Đang tải ảnh…'}</p>}
    {state.url && <img src={state.url} alt={image.label} />}
    <button onClick={load} disabled={state.busy || Boolean(state.url)}>{en ? 'View image' : 'Xem ảnh'}</button>
    {(state.url || state.busy) && <button onClick={hide}>{en ? 'Hide image' : 'Ẩn ảnh'}</button>}
  </div>;
}
function ItemDetail({ itemId, subjectId, actions, accessToken, lang, onClose, onError }) {
  const en = lang === 'en';
  const [result, setResult] = useState({ loading: true, data: null, error: null });
  const [content, setContent] = useState({ busy: false, text: null, error: null });
  const [retry, setRetry] = useState(0);
  const contentControl = useRef(null);
  const locked = useRef(false);
  const errorRef = useRef(onError);
  useEffect(() => { errorRef.current = onError; }, [onError]);
  useEffect(() => {
    const c = new AbortController();
    actions.detail(itemId, { accessToken, signal: c.signal }).then(raw => {
      if (!c.signal.aborted) setResult({ loading: false, data: readReceivedDetail(raw, subjectId, itemId), error: null });
    }).catch(error => { if (!c.signal.aborted) { setResult({ loading: false, data: null, error }); errorRef.current(error); } });
    return () => { c.abort(); contentControl.current?.abort(); };
  }, [itemId, subjectId, actions, accessToken, retry]);
  async function showContent() {
    if (locked.current || !result.data) return;
    locked.current = true; const c = new AbortController(); contentControl.current = c;
    setContent({ busy: true, text: null, error: null });
    try {
      const raw = await actions.content(itemId, { accessToken, lang, signal: c.signal });
      if (!c.signal.aborted) setContent({ busy: false, text: readReceivedContent(raw, subjectId, itemId), error: null });
    } catch (error) { if (!c.signal.aborted) { setContent({ busy: false, text: null, error }); errorRef.current(error); } }
    finally { if (!c.signal.aborted) locked.current = false; }
  }
  const item = result.data;
  return <Modal isOpen onClose={onClose} closeLabel={en ? 'Close received asset' : 'Đóng tài sản đã nhận'} title={item?.title || (en ? 'Received asset' : 'Tài sản đã nhận')} maxWidth="760px">
    <div className="lv-received-detail">
      {result.loading && <p role="status">{en ? 'Loading details…' : 'Đang tải chi tiết…'}</p>}
      {result.error && <><p role="alert">{errorMessage(result.error, en)}</p><button onClick={() => { setResult({ loading: true, data: null, error: null }); setRetry(v => v + 1); }}>{en ? 'Retry' : 'Thử lại'}</button></>}
      {item && <>
        <p>{item.sourceLabel}</p><p>{en ? 'Handed over at' : 'Bàn giao lúc'}: {item.deliveredAt}</p>
        {(item.vaultStatus === 'ARCHIVED' || item.caseStatus === 'CLOSED' || item.sessionStatus === 'COMPLETED') && <p className="lv-received-archive">{en ? 'The handover record is completed or archived. You can still view this received asset.' : 'Phiên/hồ sơ đã hoàn tất hoặc lưu trữ. Bạn vẫn xem lại được tài sản đã nhận này.'}</p>}
        <p>{en ? 'Read only — this item was handed over to you.' : 'Chỉ xem — tài sản này đã được bàn giao cho bạn.'}</p>
        <button disabled={content.busy} onClick={showContent}>{en ? 'View received content' : 'Xem nội dung đã nhận'}</button>
        {content.busy && <p role="status">{en ? 'Loading content…' : 'Đang tải nội dung…'}</p>}
        {content.error && <p role="alert">{errorMessage(content.error, en)}</p>}
        {content.text !== null && <><pre className="lv-received-content">{content.text || (en ? 'Empty content' : 'Nội dung trống')}</pre><button onClick={() => setContent({ busy: false, text: null, error: null })}>{en ? 'Hide content' : 'Ẩn nội dung'}</button></>}
        <h3>{en ? 'Received images' : 'Ảnh tài sản đã nhận'}</h3>
        {item.images.length === 0 && <p>{en ? 'No images attached to this received item.' : 'Tài sản đã nhận này không có ảnh đính kèm.'}</p>}
        {item.images.map(image => <ReceivedImage key={image.imageId} itemId={itemId} image={image} actions={actions} options={{ accessToken, lang }} lang={lang} onError={onError} />)}
      </>}
    </div>
  </Modal>;
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
  const stages = en ? { UNLINKED: 'Your beneficiary record is not linked yet.', AWAITING_HANDOVER: 'No assets have been handed over to you yet.', PARTIAL: 'Part of the handover has been recorded. Only received items are shown.', RECEIVED: 'Assets handed over to you.' } : { UNLINKED: 'Hồ sơ người thụ hưởng chưa được liên kết.', AWAITING_HANDOVER: 'Chưa có tài sản được bàn giao cho bạn.', PARTIAL: 'Đã bàn giao một phần. Chỉ hiển thị các tài sản bạn đã nhận.', RECEIVED: 'Các tài sản đã được bàn giao cho bạn.' };
  return <>
    {state.loading && <p role="status">{en ? 'Loading received assets…' : 'Đang tải tài sản đã nhận…'}</p>}
    {state.error && <><p role="alert">{errorMessage(state.error, en)}</p><button onClick={() => { setState({ loading: true, data: null, error: null }); setRetry(v => v + 1); }}>{en ? 'Retry received assets' : 'Thử tải lại tài sản'}</button></>}
    {data && <>
      <p role="status">{stages[data.accountState]}</p>
      <ul className="lv-received-list">{data.items.map(item => <li key={item.itemId}>
        <div><h3>{item.title}</h3><p>{item.sourceLabel}</p><p>{en ? 'Handed over' : 'Đã bàn giao'}: {item.deliveredAt}</p>
          {item.vaultStatus === 'ARCHIVED' && <span className="lv-received-archive">{en ? 'Archived — available to view' : 'Đã lưu trữ — vẫn được xem'}</span>}</div>
        <button onClick={() => setSelected(item.itemId)}>{en ? 'View received asset' : 'Xem tài sản đã nhận'}</button>
      </li>)}</ul>
      {data.total > 0 && <nav aria-label={en ? 'Received assets pagination' : 'Phân trang tài sản đã nhận'}>
        <button disabled={page === 0} onClick={() => onPage(page - 1)}>{en ? 'Previous' : 'Trước'}</button>
        <span>{page + 1}/{Math.max(1, Math.ceil(data.total / size))}</span>
        <button disabled={(page + 1) * size >= data.total} onClick={() => onPage(page + 1)}>{en ? 'Next' : 'Sau'}</button>
      </nav>}
    </>}
    {selected && <ItemDetail key={selected} itemId={selected} subjectId={subjectId} actions={actions} accessToken={accessToken} lang={lang} onError={handleDetailError} onClose={() => setSelected(null)} />}
  </>;
}

export default function ReceivedAssets(props) {
  return <ReceivedAssetsContent key={`${props.userId || 'preview'}:${props.accessToken || 'anonymous'}`} {...props} />;
}
function ReceivedAssetsContent({ actions, userId, accessToken, lang = 'vi', isDevPreview = false, scenario = 'received', onUnauthorized, refreshKey = 0 }) {
  const en = lang === 'en';
  const [page, setPage] = useState(0);
  const preview = receivedPreviewAllowed({ accessToken, isDevPreview });
  const previewActions = useMemo(() => previewReceivedActions(scenario), [scenario]);
  const source = receivedActions(actions, { accessToken, isDevPreview, previewActions });
  const [revision, setRevision] = useState(0);
  const subjectId = preview ? PREVIEW_SUBJECT : userId;
  return <section className="lv-received" aria-labelledby="received-assets-title">
    <header><div><h2 id="received-assets-title">{en ? 'Your received assets' : 'Tài sản bạn đã nhận'}</h2><p>{en ? 'Invitation codes do not grant access to assets. Only handed-over items can be viewed, including after archiving.' : 'Mã mời không cấp quyền xem tài sản. Chỉ xem tài sản đã được bàn giao, kể cả sau khi lưu trữ.'}</p></div>
      {source && <button onClick={() => { setPage(0); setRevision(v => v + 1); }}>{en ? 'Reload received assets' : 'Tải lại tài sản đã nhận'}</button>}
    </header>
    {preview && <p className="lv-received-demo" role="note">{en ? 'Demo data — not saved to the server' : 'Dữ liệu minh họa — chưa lưu lên máy chủ'}</p>}
    {!source ? <div className="lv-received-pending" role="status"><h3>{en ? 'Received asset information is not available yet' : 'Thông tin tài sản đã nhận chưa khả dụng'}</h3><p>{en ? 'The received-assets service has not been connected yet. This does not mean that you have no received assets.' : 'Dịch vụ tra cứu tài sản đã nhận chưa được kết nối. Điều này không có nghĩa là bạn chưa nhận tài sản.'}</p></div>
      : <AssetPage key={`${subjectId}:${accessToken || 'demo'}:${page}:${revision}:${refreshKey}:${scenario}`} actions={source} subjectId={subjectId} accessToken={accessToken} lang={lang} page={page} size={5} onPage={setPage} onError={error => { if (error?.status === 401) onUnauthorized?.(); }} />}
  </section>;
}
