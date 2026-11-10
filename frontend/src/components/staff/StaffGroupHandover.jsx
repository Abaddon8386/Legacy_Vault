import {cloneElement,isValidElement,useEffect,useRef,useState} from 'react';
import {loadGroupHandover,saveGroupHandover} from '../../services/groupHandoverService.js';
import {fetchStaffCaseBeneficiaries} from '../../pages/staff/liveHandoverService.js';
import {workflowFailure} from '../../utils/workflowFeedback.js';
import './StaffGroupHandover.css';
export default function StaffGroupHandover(props){return <GroupScope key={JSON.stringify([props.caseId,props.sessionId,props.accessToken,props.lang])} {...props}/>;}
function GroupScope({caseId,sessionId,accessToken,lang='vi',children,onUnauthorized,layout,hideWhenAllowed=false}){
  const en=lang==='en',[result,setResult]=useState(null),[attempt,setAttempt]=useState(0),[error,setError]=useState(null),[busy,setBusy]=useState(false),[present,setPresent]=useState([]),[reason,setReason]=useState(''),[notice,setNotice]=useState('');
  const [editing,setEditing]=useState(false);
  const mutation=useRef(null),lock=useRef(false),retry=useRef(null),draftRevision=useRef(null),savedAttendance=useRef(null),auth=useRef(onUnauthorized);
  useEffect(()=>{auth.current=onUnauthorized;},[onUnauthorized]);
  useEffect(()=>{const c=new AbortController();Promise.all([loadGroupHandover(caseId,sessionId,{accessToken,lang,signal:c.signal}),fetchStaffCaseBeneficiaries(caseId,{accessToken,lang,signal:c.signal})]).then(([view,people])=>{if(!c.signal.aborted){setResult({attempt,view,people});setError(null);const draftScope=JSON.stringify([view.state.revision,view.snapshot]);if(draftRevision.current!==draftScope){
    const fresh=view.state.snapshot===view.snapshot;
    const acknowledged=savedAttendance.current?.revision===view.state.revision?savedAttendance.current.ids:[];
    const recorded=view.attendance?.presentRecipientIds || (view.state.allPresent?view.requiredRecipientIds:acknowledged);
    setPresent(fresh?recorded.filter(id=>view.requiredRecipientIds.includes(id)):[]);setReason('');draftRevision.current=draftScope;
  }}}).catch(e=>{if(!c.signal.aborted){setResult(null);setError(e);if(e.status===401)auth.current?.();}});return()=>c.abort();},[caseId,sessionId,accessToken,lang,attempt]);
  useEffect(()=>()=>mutation.current?.abort(),[]);
  useEffect(()=>{const focus=()=>{if(!lock.current)setAttempt(x=>x+1);};window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[]);
  const current=result?.attempt===attempt?result:null,view=current?.view,people=current?.people||[];
  const namesReady=view?.requiredRecipientIds.every(id=>people.some(person=>person.beneficiaryId===id&&person.fullName?.trim()));
  async function save(action){if(lock.current||!view||!reason.trim()||!namesReady)return;if(action==='reopen-requests'&&(!view.state.allPresent||view.state.snapshot!==view.snapshot||!view.requiredRecipientIds.every(id=>present.includes(id))))return;lock.current=true;setBusy(true);setError(null);setNotice('');const c=new AbortController();mutation.current=c;const body={expectedRevision:view.state.revision,reason:reason.trim(),...(action==='attendance'?{presentRecipientIds:present}: {})};const fingerprint=JSON.stringify([action,body]);if(retry.current?.fingerprint!==fingerprint)retry.current={fingerprint,key:crypto.randomUUID()};
    try{const saved=await saveGroupHandover(caseId,sessionId,action,body,retry.current.key,{accessToken,lang,signal:c.signal});if(!c.signal.aborted){
      if(action==='attendance')savedAttendance.current={revision:saved.state.revision,ids:[...present]};
      retry.current=null;setEditing(false);setNotice(action==='reopen-requests'
        ?(en?'Reopening requested. Await Legal’s decision.':'Đã gửi yêu cầu mở lại. Chờ Ban Pháp lý xét duyệt.')
        :(en?'Attendance saved. The recorded selections are retained below.':'Đã lưu tình hình có mặt. Danh sách đã ghi nhận được giữ lại bên dưới.'));
      setAttempt(x=>x+1);window.dispatchEvent(new window.Event('lv-workflow-notifications-changed'));}}
    catch(e){if(!c.signal.aborted){setError(e);if(e.status===401)auth.current?.();if(e.status===409){retry.current=null;setAttempt(x=>x+1);}}}finally{if(!c.signal.aborted){lock.current=false;setBusy(false);}}
  }
  const freshAttendance=view?.state.snapshot===view?.snapshot;
  const everyoneRecorded=!!view?.state.allPresent&&freshAttendance;
  const allSelected=!!view&&view.requiredRecipientIds.every(id=>present.includes(id));
  const awaiting=view?.state.status==='AWAITING_LEGAL';
  const titles={UNCONFIRMED:en?'Record attendance':'Ghi nhận người có mặt',READY:en?'Attendance requirement satisfied':'Đã đủ điều kiện về người nhận',
    SUSPENDED:everyoneRecorded?(en?'Everyone present — request reopening':'Đã đủ người — cần gửi yêu cầu mở lại'):(en?'The whole handover is suspended':'Toàn bộ quy trình bàn giao đang tạm khóa'),
    AWAITING_LEGAL:everyoneRecorded?(en?'Everyone present — awaiting Legal reopening decision':'Đã đủ người — đang chờ Ban Pháp lý cho mở lại'):(en?'Attendance must be confirmed again':'Cần xác nhận lại tình hình có mặt')};
  const suspended=['SUSPENDED','AWAITING_LEGAL'].includes(view?.state.status);
  // Legal's latest reopening decision and the pending request, read from the server view so Staff sees the outcome and the reason.
  const stamp=value=>value?new Date(value).toLocaleString(en?'en-GB':'vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
  const decision=view?.lastDecision,approved=decision?.result==='APPROVE',earlier=!!(view?.request&&decision&&new Date(decision.decidedAt)<new Date(view.request.requestedAt));
  const decisionCard=<>{view?.request&&<aside className="lv-group-handover__decision is-pending" role="status"><strong>{en?'Your reopening request is waiting for Legal':'Yêu cầu mở lại của bạn đang chờ Ban Pháp lý'}</strong>
      <span>{[view.request.requestedBy?.fullName,stamp(view.request.requestedAt)].filter(Boolean).join(' · ')}</span>{view.request.reason&&<p>{view.request.reason}</p>}</aside>}
    {decision&&<aside className={`lv-group-handover__decision ${approved?'is-approved':'is-rejected'}`} role="status"><strong>{earlier?(en?'Earlier Legal decision':'Quyết định trước đó của Ban Pháp lý'):(en?'Latest Legal decision':'Quyết định gần nhất của Ban Pháp lý')}: {approved?(en?'Reopening allowed':'Cho phép mở lại'):(en?'Reopening refused':'Từ chối mở lại')}</strong>
      <span>{[decision.decidedBy?.fullName,stamp(decision.decidedAt)].filter(Boolean).join(' · ')}</span>{decision.reason&&<p>{decision.reason}</p>}
      {!approved&&!earlier&&view.state.status==='SUSPENDED'&&<p>{en?'Legal refused. Check who is present, record attendance again and send a new request.':'Ban Pháp lý đã từ chối. Kiểm tra lại người có mặt, ghi nhận lại và gửi yêu cầu mới.'}</p>}</aside>}</>;
  const content=view?.deliveryAllowed&&!busy&&!error&&!editing?(typeof children==='function'?children(view):children):null;
  const attendance=<section className="lv-group-handover" aria-busy={busy||(!current&&!error)}><h2>{titles[view?.state.status]||(en?'Attendance at the counter':'Người nhận có mặt tại quầy')}</h2>
    <p>{en?'All approved recipients must attend before any delivery. Missing anyone suspends the whole handover immediately. Only Legal can allow reopening after Staff requests it.':'Phải có đầy đủ người nhận đã được duyệt trước khi giao tài sản. Thiếu một người sẽ tạm khóa toàn bộ ngay. Nhân viên gửi yêu cầu mở lại khi đã đủ người; Ban Pháp lý xem xét cho phép.'}</p>
    {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{workflowFailure(error,lang).description}</p>}
    <button type="button" onClick={()=>setAttempt(x=>x+1)} disabled={busy}>{en?'Reload attendance':'Tải lại danh sách có mặt'}</button>
    {!current&&!error&&<p role="status">{en?'Loading current recipients…':'Đang tải danh sách người nhận hiện hành…'}</p>}
    {view&&<><p role="status" className={`lv-group-handover__state-note${view.deliveryAllowed?' is-ready':''}`}>{view.deliveryAllowed?(en?'The server permits delivery under the current attendance record.':'Đã đủ điều kiện về người nhận để tiếp tục bàn giao.')
      :everyoneRecorded&&suspended?(awaiting?(en?'Request sent. Do not record attendance again unless it changes; wait for Legal approval.':'Yêu cầu đã gửi. Chờ Ban Pháp lý cho phép mở lại; chỉ ghi nhận lại nếu tình hình có mặt thay đổi.'):(en?'Everyone is recorded as present. Delivery stays suspended until you request reopening and Legal approves it.':'Đã ghi nhận đủ người. Bàn giao vẫn tạm khóa cho đến khi bạn gửi yêu cầu mở lại và Ban Pháp lý chấp thuận.'))
      :(en?'Delivery is not permitted yet. Confirm the current attendance below.':'Hiện chưa được phép bàn giao. Kiểm tra và ghi nhận tình hình có mặt bên dưới.')}</p>
      {decisionCard}
      {(view.state.status==='READY'||awaiting)&&<button type="button" onClick={()=>{if(editing){setPresent(freshAttendance?(view.attendance?.presentRecipientIds|| (view.state.allPresent?view.requiredRecipientIds:[])).filter(id=>view.requiredRecipientIds.includes(id)):[]);setReason('');}setEditing(!editing);}} disabled={busy}>{editing?(en?'Cancel attendance edit':'Hủy chỉnh sửa có mặt'):(en?'Update who is present':'Thay đổi tình hình có mặt')}</button>}
      {(view.state.status!=='READY'||editing)&&<>{!namesReady?<p role="alert">{en?'Recipient identity information is incomplete. Reload before recording attendance.':'Chưa đủ thông tin định danh người nhận. Tải lại trước khi ghi nhận có mặt.'}</p>:<fieldset disabled={busy||(awaiting&&!editing)}><legend>{awaiting&&!editing?(en?'Saved attendance':'Tình hình có mặt đã lưu'):(en?'Select recipients physically present now':'Chọn những người đang có mặt trực tiếp')}</legend>{view.requiredRecipientIds.map(id=><label key={id}><input type="checkbox" checked={present.includes(id)} onChange={e=>setPresent(previous=>e.target.checked?[...previous,id]:previous.filter(value=>value!==id))}/>{people.find(p=>p.beneficiaryId===id).fullName}</label>)}</fieldset>}
      {(!awaiting||editing)&&<><label>{everyoneRecorded&&allSelected&&view.state.status==='SUSPENDED'?(en?'Reason for reopening request':'Lý do yêu cầu mở lại'):(en?'Counter record / reason':'Ghi nhận thực tế / lý do')}<textarea maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy}/></label>
      <div className="lv-group-handover__actions">{(!everyoneRecorded||!allSelected||editing)&&<button type="button" className={allSelected?'is-primary':'is-negative'} onClick={()=>save('attendance')} disabled={busy||!namesReady||!reason.trim()}>{allSelected?(en?'Record everyone present':'Ghi nhận đã có đủ người'):(en?'Record absence and suspend all delivery':'Ghi nhận thiếu người và tạm khóa toàn bộ')}</button>}
      {suspended&&view.state.status==='SUSPENDED'&&everyoneRecorded&&<button type="button" className="is-primary" onClick={()=>save('reopen-requests')} disabled={busy||!namesReady||!reason.trim()||!allSelected}>{en?'Request Legal reopening':'Gửi Ban Pháp lý yêu cầu mở lại'}</button>}</div></>}</>}</>}
  </section>;
  const delivery=isValidElement(content)?cloneElement(content,{key:'group-workflow'}):content;
  if(layout)return layout(attendance,delivery,view);
  return <>{hideWhenAllowed&&content?null:attendance}{delivery}</>;
}
