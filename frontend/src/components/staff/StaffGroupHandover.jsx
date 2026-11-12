import {cloneElement,isValidElement,useEffect,useRef,useState} from 'react';
import {loadGroupHandover,saveGroupHandover} from '../../services/groupHandoverService.js';
import {fetchStaffCaseBeneficiaries} from '../../pages/staff/liveHandoverService.js';
import {workflowFailure} from '../../utils/workflowFeedback.js';
import './StaffGroupHandover.css';
export default function StaffGroupHandover(props){return <GroupScope key={JSON.stringify([props.caseId,props.sessionId,props.accessToken,props.lang])} {...props}/>;}
function GroupScope({caseId,sessionId,accessToken,lang='vi',children,onUnauthorized,layout,hideWhenAllowed=false}){
  const en=lang==='en',[result,setResult]=useState(null),[attempt,setAttempt]=useState(0),[error,setError]=useState(null),[busy,setBusy]=useState(false),[present,setPresent]=useState([]),[reason,setReason]=useState(''),[notice,setNotice]=useState('');
  const [editing,setEditing]=useState(false);
  const mutation=useRef(null),unsure=useRef(false),lock=useRef(false),retry=useRef(null),draftRevision=useRef(null),savedAttendance=useRef(null),auth=useRef(onUnauthorized);
  useEffect(()=>{auth.current=onUnauthorized;},[onUnauthorized]);
  useEffect(()=>{const c=new AbortController();Promise.all([loadGroupHandover(caseId,sessionId,{accessToken,lang,signal:c.signal}),fetchStaffCaseBeneficiaries(caseId,{accessToken,lang,signal:c.signal})]).then(([view,people])=>{if(!c.signal.aborted){setResult({attempt,view,people});setError(null);
    // The request may have reached the server although its reply was lost: trust the server state over the failure message.
    if(unsure.current){unsure.current=false;if(view.state.status==='AWAITING_LEGAL')setNotice(lang==='en'?'Reopening requested':'Đã gửi yêu cầu mở lại');}const draftScope=JSON.stringify([view.state.revision,view.snapshot]);if(draftRevision.current!==draftScope){
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
      // Everyone is present while the handover is suspended: one submit records attendance and sends the reopening request.
      const chain=action==='attendance'&&view.state.status==='SUSPENDED'&&allSelected;
      if(chain){try{await saveGroupHandover(caseId,sessionId,'reopen-requests',{expectedRevision:saved.state.revision,reason:reason.trim()},crypto.randomUUID(),{accessToken,lang,signal:c.signal});}
        catch(e2){if(!c.signal.aborted){retry.current=null;unsure.current=true;setEditing(false);setNotice(en?'Attendance saved, request not sent':'Đã lưu người có mặt, chưa gửi được yêu cầu');setError(e2);if(e2.status===401)auth.current?.();setAttempt(x=>x+1);}return;}}
      retry.current=null;setEditing(false);setNotice(action==='reopen-requests'||chain
        ?(en?'Reopening requested':'Đã gửi yêu cầu mở lại')
        :(en?'Attendance saved':'Đã lưu'));
      setAttempt(x=>x+1);window.dispatchEvent(new window.Event('lv-workflow-notifications-changed'));}}
    catch(e){if(!c.signal.aborted){setError(e);if(e.status===401)auth.current?.();if(e.status===409){retry.current=null;setAttempt(x=>x+1);}}}finally{if(!c.signal.aborted){lock.current=false;setBusy(false);}}
  }
  const freshAttendance=view?.state.snapshot===view?.snapshot;
  const everyoneRecorded=!!view?.state.allPresent&&freshAttendance;
  const allSelected=!!view&&view.requiredRecipientIds.every(id=>present.includes(id));
  const awaiting=view?.state.status==='AWAITING_LEGAL';
  const titles={UNCONFIRMED:en?'Record attendance':'Ghi nhận người có mặt',READY:en?'Attendance requirement satisfied':'Đã đủ điều kiện về người nhận',
    SUSPENDED:everyoneRecorded?(en?'Everyone present, send a reopening request':'Đã đủ người, gửi yêu cầu mở lại'):(en?'Handover is suspended':'Bàn giao đang tạm khóa'),
    AWAITING_LEGAL:everyoneRecorded?(en?'Request sent, waiting for Legal':'Đã gửi yêu cầu, chờ Ban Pháp lý'):(en?'Attendance must be confirmed again':'Cần xác nhận lại tình hình có mặt')};
  const suspended=['SUSPENDED','AWAITING_LEGAL'].includes(view?.state.status);
  // Legal's latest reopening decision and the pending request, read from the server view so Staff sees the outcome and the reason.
  const stamp=value=>value?new Date(value).toLocaleString(en?'en-GB':'vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
  const decision=view?.lastDecision,approved=decision?.result==='APPROVE',earlier=!!(view?.request&&decision&&new Date(decision.decidedAt)<new Date(view.request.requestedAt));
  const decisionCard=<>{view?.request&&<aside className="lv-group-handover__decision is-pending" role="status"><strong>{en?'Your reopening request is waiting for Legal':'Yêu cầu mở lại của bạn đang chờ Ban Pháp lý'}</strong>
      <span>{[view.request.requestedBy?.fullName,stamp(view.request.requestedAt)].filter(Boolean).join(' · ')}</span>{view.request.reason&&<p>{view.request.reason}</p>}</aside>}
    {decision&&<aside className={`lv-group-handover__decision ${approved?'is-approved':'is-rejected'}`} role="status"><strong>{earlier?(en?'Earlier Legal decision':'Quyết định trước đó của Ban Pháp lý'):(en?'Latest Legal decision':'Quyết định gần nhất của Ban Pháp lý')}: {approved?(en?'Reopening allowed':'Cho phép mở lại'):(en?'Reopening refused':'Từ chối mở lại')}</strong>
      <span>{[decision.decidedBy?.fullName,stamp(decision.decidedAt)].filter(Boolean).join(' · ')}</span>{decision.reason&&<p>{decision.reason}</p>}
      {!approved&&!earlier&&view.state.status==='SUSPENDED'&&<p>{en?'Legal refused. Check who is present, record attendance again and send a new request.':'Ban Pháp lý đã từ chối. Kiểm tra lại người có mặt, ghi nhận lại và gửi yêu cầu mới.'}</p>}</aside>}</>;
  const content=view?.deliveryAllowed&&!busy&&!error&&!editing?(typeof children==='function'?children(view,people):children):null;
  const attendance=<section className="lv-group-handover" aria-busy={busy||(!current&&!error)}><div className="lv-group-handover__head"><h2>{titles[view?.state.status]||(en?'Attendance at the counter':'Người nhận có mặt tại quầy')}</h2>
    <button type="button" className="lv-group-handover__reload" onClick={()=>setAttempt(x=>x+1)} disabled={busy}>{en?'Reload':'Tải lại'}</button></div>
    {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{workflowFailure(error,lang).description}</p>}
    {!current&&!error&&<p role="status">{en?'Loading current recipients…':'Đang tải danh sách người nhận hiện hành…'}</p>}
    {view&&<>
      {decisionCard}
      {(view.state.status==='READY'||awaiting)&&<button type="button" onClick={()=>{if(editing){setPresent(freshAttendance?(view.attendance?.presentRecipientIds|| (view.state.allPresent?view.requiredRecipientIds:[])).filter(id=>view.requiredRecipientIds.includes(id)):[]);setReason('');}setEditing(!editing);}} disabled={busy}>{editing?(en?'Cancel attendance edit':'Hủy chỉnh sửa có mặt'):(en?'Update who is present':'Thay đổi tình hình có mặt')}</button>}
      {(view.state.status!=='READY'||editing)&&<>{!namesReady?<p role="alert">{en?'Recipient identity information is incomplete. Reload before recording attendance.':'Chưa đủ thông tin định danh người nhận. Tải lại trước khi ghi nhận có mặt.'}</p>:<fieldset disabled={busy||(awaiting&&!editing)}><legend>{awaiting&&!editing?(en?'Saved attendance':'Tình hình có mặt đã lưu'):(en?'Recipients present now':'Người đang có mặt tại quầy')}<span key={view.requiredRecipientIds.filter(id=>present.includes(id)).length} className="lv-group-handover__count">{view.requiredRecipientIds.filter(id=>present.includes(id)).length}/{view.requiredRecipientIds.length}</span></legend>{view.requiredRecipientIds.map(id=><label key={id}><input type="checkbox" checked={present.includes(id)} onChange={e=>setPresent(previous=>e.target.checked?[...previous,id]:previous.filter(value=>value!==id))}/><span className="lv-group-handover__name">{people.find(p=>p.beneficiaryId===id).fullName}</span><span className={`lv-group-handover__chip${present.includes(id)?' is-present':''}`}>{present.includes(id)?(en?'Present':'Có mặt'):(en?'Absent':'Vắng mặt')}</span></label>)}</fieldset>}
      {(!awaiting||editing)&&<><label>{allSelected&&view.state.status==='SUSPENDED'?(en?'Reason for reopening request':'Lý do yêu cầu mở lại'):(en?'Counter record / reason':'Ghi nhận tại quầy / lý do')}<span className="lv-required-mark" aria-hidden="true">*</span><textarea required placeholder={allSelected&&view.state.status==='SUSPENDED'?(en?'Reason for Legal':'Lý do gửi Ban Pháp lý'):allSelected?(en?'Counter record':'Ghi nhận tại quầy'):(en?'Who is absent and why':'Ai vắng mặt và lý do')} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy}/></label>
      <div className="lv-group-handover__actions">{(!everyoneRecorded||!allSelected||editing)&&<button type="button" className={allSelected?'is-primary':'is-negative'} onClick={()=>save('attendance')} disabled={busy||!namesReady||!reason.trim()}>{allSelected?(view.state.status==='SUSPENDED'?(en?'Request reopening':'Gửi yêu cầu mở lại'):(en?'Confirm everyone is present':'Xác nhận đủ người')):(en?'Suspend handover':'Tạm khóa bàn giao')}</button>}
      {suspended&&view.state.status==='SUSPENDED'&&everyoneRecorded&&<button type="button" className="is-primary" onClick={()=>save('reopen-requests')} disabled={busy||!namesReady||!reason.trim()||!allSelected}>{en?'Request reopening':'Gửi yêu cầu mở lại'}</button>}</div></>}</>}</>}
  </section>;
  const delivery=isValidElement(content)?cloneElement(content,{key:'group-workflow'}):content;
  if(layout)return layout(attendance,delivery,view);
  return <>{hideWhenAllowed&&content?null:attendance}{delivery}</>;
}
