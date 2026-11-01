import {cloneElement,isValidElement,useEffect,useRef,useState} from 'react';
import {loadGroupHandover,saveGroupHandover} from '../../services/groupHandoverService.js';
import {fetchStaffCaseBeneficiaries} from '../../pages/staff/liveHandoverService.js';
import {workflowFailure} from '../../utils/workflowFeedback.js';
import './StaffGroupHandover.css';
export default function StaffGroupHandover(props){return <GroupScope key={JSON.stringify([props.caseId,props.sessionId,props.accessToken,props.lang])} {...props}/>;}
function GroupScope({caseId,sessionId,accessToken,lang='vi',children,onUnauthorized}){
  const en=lang==='en',[result,setResult]=useState(null),[attempt,setAttempt]=useState(0),[error,setError]=useState(null),[busy,setBusy]=useState(false),[present,setPresent]=useState([]),[reason,setReason]=useState(''),[notice,setNotice]=useState('');
  const [editing,setEditing]=useState(false);
  const mutation=useRef(null),lock=useRef(false),retry=useRef(null),draftRevision=useRef(null),auth=useRef(onUnauthorized);
  useEffect(()=>{auth.current=onUnauthorized;},[onUnauthorized]);
  useEffect(()=>{const c=new AbortController();Promise.all([loadGroupHandover(caseId,sessionId,{accessToken,lang,signal:c.signal}),fetchStaffCaseBeneficiaries(caseId,{accessToken,lang,signal:c.signal})]).then(([view,people])=>{if(!c.signal.aborted){setResult({attempt,view,people});setError(null);if(draftRevision.current!==view.state.revision){setPresent([]);setReason('');draftRevision.current=view.state.revision;}}}).catch(e=>{if(!c.signal.aborted){setResult(null);setError(e);if(e.status===401)auth.current?.();}});return()=>c.abort();},[caseId,sessionId,accessToken,lang,attempt]);
  useEffect(()=>()=>mutation.current?.abort(),[]);
  useEffect(()=>{const focus=()=>{if(!lock.current)setAttempt(x=>x+1);};window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[]);
  const current=result?.attempt===attempt?result:null,view=current?.view,people=current?.people||[];
  const namesReady=view?.requiredRecipientIds.every(id=>people.some(person=>person.beneficiaryId===id&&person.fullName?.trim()));
  async function save(action){if(lock.current||!view||!reason.trim()||!namesReady)return;lock.current=true;setBusy(true);setError(null);setNotice('');const c=new AbortController();mutation.current=c;const body={expectedRevision:view.state.revision,reason:reason.trim(),...(action==='attendance'?{presentRecipientIds:present}: {})};const fingerprint=JSON.stringify([action,body]);if(retry.current?.fingerprint!==fingerprint)retry.current={fingerprint,key:crypto.randomUUID()};
    try{await saveGroupHandover(caseId,sessionId,action,body,retry.current.key,{accessToken,lang,signal:c.signal});if(!c.signal.aborted){retry.current=null;setEditing(false);setNotice(en?'Recorded. Latest server status is shown below.':'Đã ghi nhận. Trạng thái máy chủ mới nhất được hiển thị bên dưới.');setAttempt(x=>x+1);window.dispatchEvent(new window.Event('lv-workflow-notifications-changed'));}}
    catch(e){if(!c.signal.aborted){setError(e);if(e.status===401)auth.current?.();if(e.status===409){retry.current=null;setAttempt(x=>x+1);}}}finally{if(!c.signal.aborted){lock.current=false;setBusy(false);}}
  }
  const titles={UNCONFIRMED:en?'Staff must record attendance':'Staff cần ghi nhận người có mặt',READY:en?'Attendance requirement satisfied':'Đã đủ điều kiện về người nhận',SUSPENDED:en?'The whole handover is suspended':'Toàn bộ quy trình bàn giao đang tạm khóa',AWAITING_LEGAL:en?'Awaiting Legal reopening decision':'Đang chờ Legal xét yêu cầu mở lại'};
  const suspended=['SUSPENDED','AWAITING_LEGAL'].includes(view?.state.status);
  const content=view?.deliveryAllowed&&!busy&&!error&&!editing?(typeof children==='function'?children(view):children):null;
  return <><section className="lv-group-handover" aria-busy={busy||(!current&&!error)}><h2>{titles[view?.state.status]||(en?'Attendance at the counter':'Người nhận có mặt tại quầy')}</h2>
    <p>{en?'All approved recipients must attend before any delivery. Missing anyone suspends the whole handover immediately. Only Legal can allow reopening after Staff requests it.':'Phải có đầy đủ người nhận đã được duyệt trước khi giao tài sản. Thiếu một người sẽ tạm khóa toàn bộ ngay. Staff gửi yêu cầu mở lại khi đã đủ người; Legal xem xét cho phép.'}</p>
    {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{workflowFailure(error,lang).description}</p>}
    <button type="button" onClick={()=>setAttempt(x=>x+1)} disabled={busy}>{en?'Refresh attendance status':'Cập nhật tình hình bàn giao'}</button>
    {!current&&!error&&<p role="status">{en?'Loading current recipients…':'Đang tải danh sách người nhận hiện hành…'}</p>}
    {view&&<><p role="status">{view.deliveryAllowed?(en?'The server permits delivery under the current attendance record.':'Máy chủ xác nhận điều kiện người nhận hiện hành cho phép bàn giao.'):(en?'Delivery is not permitted yet.':'Hiện chưa được phép bàn giao.')}</p>
      {view.state.status==='READY'&&<button type="button" onClick={()=>setEditing(value=>!value)} disabled={busy}>{editing?(en?'Cancel attendance edit':'Hủy chỉnh sửa có mặt'):(en?'Update who is present':'Thay đổi tình hình có mặt')}</button>}
      {(view.state.status!=='READY'||editing)&&<>{!namesReady?<p role="alert">{en?'Recipient identity information is incomplete. Reload before recording attendance.':'Chưa đủ thông tin định danh người nhận. Tải lại trước khi ghi nhận có mặt.'}</p>:<fieldset disabled={busy}><legend>{en?'Select recipients physically present now':'Chọn những người đang có mặt trực tiếp'}</legend>{view.requiredRecipientIds.map(id=><label key={id}><input type="checkbox" checked={present.includes(id)} onChange={e=>setPresent(previous=>e.target.checked?[...previous,id]:previous.filter(value=>value!==id))}/>{people.find(p=>p.beneficiaryId===id).fullName}</label>)}</fieldset>}
      <label>{en?'Counter record / reason':'Ghi nhận thực tế / lý do'}<textarea maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy}/></label>
      <div className="lv-group-handover__actions"><button type="button" className={present.length===view.requiredRecipientIds.length?'is-primary':'is-negative'} onClick={()=>save('attendance')} disabled={busy||!namesReady||!reason.trim()}>{present.length===view.requiredRecipientIds.length?(en?'Record everyone present':'Ghi nhận đã có đủ người'):(en?'Record absence and suspend all delivery':'Ghi nhận thiếu người và tạm khóa toàn bộ')}</button>
      {suspended&&view.state.status==='SUSPENDED'&&view.state.allPresent&&view.state.snapshot===view.snapshot&&<button type="button" className="is-primary" onClick={()=>save('reopen-requests')} disabled={busy||!namesReady||!reason.trim()}>{en?'Request Legal reopening':'Gửi Legal yêu cầu mở lại'}</button>}</div></>}</>}
  </section>{isValidElement(content)?cloneElement(content,{key:'group-workflow'}):content}</>;
}
