import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Check, CheckCheck, X } from 'lucide-react';
import { request } from '../../api/http.js';
import './WorkflowNotifications.css';
const labels={
 HANDOVER_GROUP_ATTENDANCE:['Đã ghi nhận người có mặt tại bàn giao','Handover attendance recorded'],
 HANDOVER_GROUP_REQUEST:['Staff yêu cầu mở lại bàn giao','Staff requested handover reopening'],
 HANDOVER_GROUP_APPROVE:['Legal đã chấp thuận mở lại bàn giao','Legal approved handover reopening'],
 HANDOVER_GROUP_REJECT:['Legal đã từ chối mở lại bàn giao','Legal rejected handover reopening'],
 DISTRIBUTION_DOCUMENTS_REQUESTED:['Legal đã yêu cầu giấy tờ phân chia','Legal requested distribution documents'],
 DISTRIBUTION_DOCUMENTS_APPROVED:['Căn cứ đã duyệt, Staff có thể lập phân bổ','Documents accepted; Staff can prepare allocations'],
 DISTRIBUTION_DOCUMENT_SUPPLEMENTATION_REQUESTED:['Legal yêu cầu bổ sung giấy tờ','Legal requested additional documents'],
 DISTRIBUTION_ALLOCATIONS_SUBMITTED:['Staff đã gửi phân bổ để kiểm tra','Staff submitted allocations for review'],
 DISTRIBUTION_ALLOCATIONS_APPROVED:['Legal đã chấp thuận phân bổ','Legal accepted the allocations'],
 DISTRIBUTION_ALLOCATION_CHANGES_REQUESTED:['Legal yêu cầu sửa phân bổ','Legal requested allocation corrections'],
 VERIFICATION_CASE_CLAIMED:['Nhân viên đã nhận xử lý hồ sơ','Staff assigned to the case'],
 DEATH_DOCUMENT_RECORDED:['Đã tiếp nhận giấy tờ khai tử','Death document received'], ORIGINAL_WILL_RECEIVED:['Đã tiếp nhận di chúc','Original will received'],
 INTAKE_ATTACHMENT_UPLOADED:['Có tệp giấy tờ mới','New document uploaded'], LEGAL_DEATH_DOCUMENT_DECIDED:['Đã có kết quả xác minh tử vong','Death verification updated'],
 WILL_COMPARISON_RECORDED:['Đã có kết quả đối chiếu di chúc','Will comparison updated'], LEGAL_BASIS_RECEIVED:['Đã tiếp nhận hồ sơ phân chia tài sản','Distribution documents received'],
 LEGAL_BASIS_FORWARDED:['Hồ sơ phân chia đã được chuyển thẩm định','Distribution documents forwarded'],LEGAL_BASIS_CLASSIFIED:['Đã tiếp nhận căn cứ pháp lý','Legal basis recorded'],
 LEGAL_BASIS_RECLASSIFIED:['Đã cập nhật căn cứ pháp lý','Legal basis updated'],COURT_DECISION_RECORDED:['Đã có kết luận kiểm tra giấy tờ','Document assessment recorded'],
 LEGAL_BASIS_HELD:['Hồ sơ cần tạm dừng xử lý','Case processing paused'],LEGAL_BASIS_REVIEW_REQUIRED:['Hồ sơ cần bổ sung hoặc thẩm định lại','Supplementation or reassessment needed'],
 LEGAL_BASIS_REVIEW_RECORDED:['Đã ghi nhận thẩm định giấy tờ phân chia','Distribution assessment recorded'],LEGAL_BASIS_DECIDED:['Đã có quyết định phê duyệt hồ sơ','Final decision recorded'],LEGAL_VAULT_UNLOCKED:['Kho đã được mở khóa để bàn giao','Vault unlocked for handover']};
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
const TOAST_VISIBLE_MS = 6000;
const TOAST_MOTION_MS = 240;
const RECENT_LIMIT = 50;
const READ_BATCH_SIZE = 4;
const dateFormatters = Object.fromEntries(['vi-VN', 'en-GB'].map(locale => [locale, {
 date: new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }),
 time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
}]));

function notificationTitle(action, en) {
 return Object.hasOwn(labels, action) ? labels[action][en ? 1 : 0]
   : en ? 'There is an update about the case' : 'Có cập nhật về hồ sơ';
}

export default function WorkflowNotifications({ session, role, lang='vi', onNavigate = url => window.location.assign(url) }) {
 const token=session?.accessToken,en=lang==='en';
 const [result,setResult]=useState(null),[attempt,setAttempt]=useState(0);
 const [readState, setReadState] = useState(null);
 const current=useRef(null), details=useRef(null), bell=useRef(null);
 const readOperation = useRef(null);
 const [expanded,setExpanded]=useState(false);
 const [toast, setToast] = useState(null);
 useEffect(() => {
  if (!toast || toast.hovered || toast.focused) return;
  const timeout = setTimeout(() => {
   const next = toast.closing ? null : { ...toast, closing: true };
   setToast(current => current === toast ? next : current);
  }, toast.closing ? TOAST_MOTION_MS : TOAST_VISIBLE_MS);
  return () => clearTimeout(timeout);
 }, [toast]);
 useEffect(()=>{if(!expanded)return;const close=event=>{if(event.type==='keydown'&&event.key!=='Escape')return;if(event.type==='pointerdown'&&details.current?.contains(event.target))return;details.current?.removeAttribute('open');if(event.type==='keydown')details.current?.querySelector('summary').focus();};document.addEventListener('pointerdown',close);document.addEventListener('keydown',close);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',close);};},[expanded]);
 useEffect(()=>{
  if(!token)return;
  const c=new AbortController();current.current=c;let timer,busy=false,unavailable=false;
  let previousIds = null;
  async function load(){if(busy||unavailable||document.hidden||c.signal.aborted)return;busy=true;
   try{const items=await request('/workflow-notifications?workspace='+role,{accessToken:token,signal:c.signal,expectedStatus:200,cache:'no-store'});
    if(!Array.isArray(items)||!items.every(x=>uuid(x.id)&&uuid(x.caseId)&&typeof x.caseNumber==='string'&&typeof x.action==='string'&&x.action.trim().length>0&&(x.reason==null||(typeof x.reason==='string'&&x.reason.length<=1000))&&typeof x.read==='boolean'&&Number.isFinite(Date.parse(x.occurredAt))))throw Error('Invalid notifications');
    if (c.signal.aborted) return;
    if (previousIds) {
     const arrivals = items.filter(item => !item.read && !previousIds.has(item.id));
     if (arrivals.length && !details.current?.open) {
      setToast(previous => previous?.token === token && previous.role === role && (previous.hovered || previous.focused)
       ? previous : { token, role, item: arrivals[0], count: arrivals.length });
     }
    }
    previousIds = new Set(items.map(item => item.id));
    setResult(previous => {
     // A GET started before a read receipt may still contain the older unread state.
     const confirmed = previous?.token === token && previous.role === role
      ? new Set(previous.items?.filter(item => item.read).map(item => item.id)) : new Set();
     return { token, role, items: items.map(item => confirmed.has(item.id) ? { ...item, read: true } : item) };
    });
   }catch(error){if(!c.signal.aborted){unavailable=[404,501].includes(error.status);setResult({token,role,error:true,unavailable});}}finally{busy=false;}}
  load();timer=setInterval(load,15000);document.addEventListener('visibilitychange',load);window.addEventListener('lv-workflow-notifications-changed',load);
  return()=>{c.abort();clearInterval(timer);document.removeEventListener('visibilitychange',load);window.removeEventListener('lv-workflow-notifications-changed',load);};
 },[token,role,attempt]);
 const visible=token&&result?.token===token&&result?.role===role?result:null;
 const unreadItems = visible?.items?.filter(item => !item.read) ?? [];
 const unreadCount = unreadItems.length;
 const activeRead = readState?.token === token && readState?.role === role ? readState : null;
 const dateFormat = dateFormatters[en ? 'en-GB' : 'vi-VN'];
 const notificationLabel = en ? 'Notifications' : 'Thông báo';
 const unreadLabel = en
   ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
   : `${unreadCount} thông báo chưa đọc`;
 const activeToast = !expanded && toast && toast.token === token && toast.role === role
   && visible?.items?.some(item => item.id === toast.item.id && !item.read) ? toast : null;
 const anchorToast = useCallback(card => {
  if (!card || !bell.current) return;
  const icon = bell.current.getBoundingClientRect();
  const slot = card.parentElement.getBoundingClientRect();
  const x = icon.left + icon.width / 2 - slot.left;
  const y = icon.top + icon.height / 2 - slot.top;
  card.style.transformOrigin = `${x}px ${y}px`;
 }, []);
 function setToastInteraction(field, value) {
  setToast(current => current && current.item.id === activeToast?.item.id && current[field] !== value
   ? { ...current, [field]: value, closing: false } : current);
 }
 function dismissToast(event) {
  if (document.activeElement === event.currentTarget) details.current?.querySelector('summary')?.focus();
  setToast(null);
 }
 if(!token)return null;
 async function markRead(items, onConfirmed) {
  const controller = current.current;
  if (!items.length || !controller || controller.signal.aborted || readOperation.current === controller) return;
  readOperation.current = controller;
  setReadState({ token, role, pending: true });
  let failed = false;
  try {
   for (let start = 0; start < items.length; start += READ_BATCH_SIZE) {
    const batch = items.slice(start, start + READ_BATCH_SIZE);
    const receipts = await Promise.allSettled(batch.map(async ({ id }) => {
     const receipt = await request(`/workflow-notifications/${id}/read?workspace=${role}`, {
      method: 'PUT', accessToken: token, lang, signal: controller.signal, expectedStatus: 200,
     });
     if (receipt?.id !== id || receipt.read !== true) throw Error('Read not confirmed');
     return id;
    }));
    if (controller.signal.aborted) return;
    if (receipts.some(receipt => receipt.status === 'rejected' && [401, 403, 404].includes(receipt.reason?.status))) {
     controller.abort();
     setReadState(null);
     setResult({ token, role, error: true });
     return;
    }
    const confirmed = new Set(receipts.filter(receipt => receipt.status === 'fulfilled').map(receipt => receipt.value));
    failed ||= confirmed.size !== batch.length;
    setResult(previous => previous?.token === token && previous.role === role && previous.items
     ? { ...previous, items: previous.items.map(item => confirmed.has(item.id) ? { ...item, read: true } : item) }
     : previous);
   }
   if (!failed) onConfirmed?.();
  } finally {
   if (readOperation.current === controller) readOperation.current = null;
   if (!controller.signal.aborted) setReadState({ token, role, failed });
  }
 }

 function open(item) {
  if (activeRead?.pending) return;
  if (item.read) navigateToNotice(item);
  else void markRead([item], () => navigateToNotice(item));
 }

 function navigateToNotice(item) {
   if (!Object.hasOwn(labels,item.action)) return;
   const intakeEvent=['VERIFICATION_CASE_CLAIMED','DEATH_DOCUMENT_RECORDED','ORIGINAL_WILL_RECEIVED','INTAKE_ATTACHMENT_UPLOADED','LEGAL_DEATH_DOCUMENT_DECIDED','WILL_COMPARISON_RECORDED'].includes(item.action);
   const tab=role==='STAFF'?(intakeEvent?'/staff/cases':'/staff/legal-documents'):item.action==='LEGAL_VAULT_UNLOCKED'?'/legal/controlled-unlock':item.action==='LEGAL_BASIS_DECIDED'?'/legal/approval-review':item.action==='VERIFICATION_CASE_CLAIMED'||item.action==='DEATH_DOCUMENT_RECORDED'||item.action==='INTAKE_ATTACHMENT_UPLOADED'?'/legal/death-verification':item.action==='ORIGINAL_WILL_RECEIVED'||item.action==='WILL_COMPARISON_RECORDED'?'/legal/will-document-verification':'/legal/basis-route-selection';
   const params=new URLSearchParams({caseId:item.caseId,lang});
   if(role==='STAFF'){
    if(['DISTRIBUTION_DOCUMENTS_APPROVED','DISTRIBUTION_ALLOCATIONS_SUBMITTED','DISTRIBUTION_ALLOCATIONS_APPROVED','DISTRIBUTION_ALLOCATION_CHANGES_REQUESTED','LEGAL_BASIS_REVIEW_RECORDED'].includes(item.action))params.set('tab','allocations');
    if(['ORIGINAL_WILL_RECEIVED','WILL_COMPARISON_RECORDED'].includes(item.action))params.set('tab','original-will-intakes');
    if(item.action.startsWith('HANDOVER_GROUP_'))params.set('tab','attendance');
   }
   const destination=item.action.startsWith('HANDOVER_GROUP_')?(role==='STAFF'?'/staff/handover':'/legal/controlled-unlock'):tab;
   onNavigate(destination+'?'+params);
 }
 return <div className="lv-workflow-notifications">
 <details ref={details} onToggle={event => {
  const isOpen = event.currentTarget.open;
  setExpanded(isOpen);
  if (isOpen) setToast(null);
 }}>
  <summary aria-label={unreadCount ? unreadLabel : notificationLabel}>
   <Bell
    key={activeToast?.item.id}
    ref={bell}
    className={activeToast ? 'lv-workflow-notifications__bell--ringing' : undefined}
    size={20}
    aria-hidden="true"
   />
   <span className="lv-workflow-notifications__label">{notificationLabel}</span>
   {unreadCount > 0 && <span className="lv-workflow-notifications__badge" aria-hidden="true">{unreadCount > 9 ? '9+' : unreadCount}</span>}
  </summary>
  {expanded && <section className="lv-workflow-notifications__panel" aria-label={en?'Recent notifications':'Thông báo gần đây'}>
   <div className="lv-workflow-notifications__panel-header">
    <div>
     <h2 tabIndex={-1}>{notificationLabel}</h2>
     {!!visible?.items?.length && <p role="status" className="lv-workflow-notifications__count">
      {activeRead?.pending ? (en ? 'Saving…' : 'Đang lưu…')
       : unreadCount ? (en ? `${unreadCount} unread` : `${unreadCount} chưa đọc`) : (en ? 'All caught up' : 'Đã đọc hết')}
     </p>}
    </div>
    {(unreadCount > 0 || activeRead?.pending) && <button type="button" className="lv-workflow-notifications__mark-all"
     aria-disabled={!!activeRead?.pending}
     aria-label={en ? 'Read all notifications' : 'Đọc tất cả thông báo'}
     onClick={event => {
      const action = event.currentTarget;
      void markRead(unreadItems, () => {
       if (document.activeElement === action) action.closest('section').querySelector('h2').focus();
      });
     }}>
     <CheckCheck size={17} aria-hidden="true" />
     {en ? 'Read all' : 'Đọc tất cả'}
    </button>}
   </div>
   {activeRead?.failed && !!visible?.items?.length && <p role="alert" className="lv-workflow-notifications__read-error">
    {en ? 'Some notifications could not be marked as read. Try again.' : 'Có thông báo chưa được đánh dấu đã đọc. Vui lòng thử lại.'}
   </p>}
   <div className="lv-workflow-notifications__panel-body">
   {!visible ? <p role="status" className="lv-workflow-notifications__panel-state">{en ? 'Loading…' : 'Đang tải…'}</p>
    : visible.error ? <div role="alert" className="lv-workflow-notifications__panel-state">
     <p>{visible.unavailable ? (en ? 'Notifications are not available yet.' : 'Thông báo hiện chưa khả dụng.') : (en ? 'Notifications could not be loaded.' : 'Chưa tải được thông báo.')}</p>
     <button type="button" className="lv-workflow-notifications__retry" onClick={() => { setReadState(null); setAttempt(x => x + 1); }}>{en ? 'Try again' : 'Thử lại'}</button>
    </div>
    : !visible.items.length ? <p className="lv-workflow-notifications__panel-state">{en ? 'No notifications yet.' : 'Chưa có thông báo.'}</p>
    :
    <ul>{visible.items.map(item => {
     const title = notificationTitle(item.action, en);
     const markLabel = en ? 'Mark as read' : 'Đánh dấu đã đọc';
     const occurredAt = new Date(item.occurredAt);
     return <li key={item.id} tabIndex={-1} className={item.read ? undefined : 'is-unread'}>
      <button type="button" className={`lv-workflow-notifications__item${item.read ? '' : ' is-unread'}`}
       disabled={!!activeRead?.pending} onClick={() => open(item)}>
       <strong>{title}</strong>
       {item.reason && <span className="lv-workflow-notifications__reason">{item.reason}</span>}
       <span className="lv-workflow-notifications__item-meta">
        <span>{item.caseNumber}</span>
        <span className="lv-workflow-notifications__item-status">{item.read ? (en ? 'Read' : 'Đã đọc') : (en ? 'Unread' : 'Chưa đọc')}</span>
        <time dateTime={item.occurredAt}>{dateFormat.time.format(occurredAt)}, {dateFormat.date.format(occurredAt)}</time>
       </span>
      </button>
      {!item.read && <button type="button" className="lv-workflow-notifications__mark-one"
       aria-label={`${markLabel}: ${title} (${item.caseNumber})`} title={markLabel}
       disabled={!!activeRead?.pending}
       onClick={event => {
        if (document.activeElement === event.currentTarget) event.currentTarget.parentElement.focus();
        void markRead([item]);
       }}><Check size={18} aria-hidden="true" /></button>}
     </li>;
    })}</ul>}
   </div>
   {visible?.items?.length >= RECENT_LIMIT && <p className="lv-workflow-notifications__panel-footer">
    {en ? '50 most recent notifications' : '50 thông báo gần nhất'}
   </p>}
  </section>}
 </details>
 <div role="status" className="lv-workflow-notifications__toast-slot">
  {activeToast && <div
   key={activeToast.item.id}
   ref={anchorToast}
   className={`lv-workflow-notifications__toast${activeToast.closing ? ' is-closing' : ''}`}
   style={{ '--lv-toast-motion': `${TOAST_MOTION_MS}ms` }}
   onPointerEnter={event => { if (event.pointerType !== 'touch') setToastInteraction('hovered', true); }}
   onPointerLeave={() => setToastInteraction('hovered', false)}
  >
   <Bell size={18} aria-hidden="true" />
   <div>
    <p>{en ? (activeToast.count === 1 ? 'New notification' : `${activeToast.count} new notifications`) : `${activeToast.count} thông báo mới`}</p>
    <strong>{notificationTitle(activeToast.item.action, en)}</strong>
    <p>{activeToast.item.caseNumber}</p>
   </div>
   <button type="button" className="lv-workflow-notifications__toast-close"
    aria-label={en ? 'Dismiss notification' : 'Đóng thông báo'}
    onFocus={() => setToastInteraction('focused', true)} onBlur={() => setToastInteraction('focused', false)}
    onClick={dismissToast}>
    <X size={18} aria-hidden="true" />
   </button>
  </div>}
 </div>
 </div>;
}
