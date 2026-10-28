import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { request } from '../../api/http.js';
import './WorkflowNotifications.css';
const labels={
 VERIFICATION_CASE_CLAIMED:['Nhân viên đã nhận xử lý hồ sơ','Staff assigned to the case'],
 DEATH_DOCUMENT_RECORDED:['Đã tiếp nhận giấy tờ khai tử','Death document received'], ORIGINAL_WILL_RECEIVED:['Đã tiếp nhận di chúc','Original will received'],
 INTAKE_ATTACHMENT_UPLOADED:['Có tệp giấy tờ mới','New document uploaded'], LEGAL_DEATH_DOCUMENT_DECIDED:['Đã có kết quả xác minh tử vong','Death verification updated'],
 WILL_COMPARISON_RECORDED:['Đã có kết quả đối chiếu di chúc','Will comparison updated'], LEGAL_BASIS_RECEIVED:['Đã tiếp nhận hồ sơ phân chia tài sản','Distribution documents received'],
 LEGAL_BASIS_FORWARDED:['Hồ sơ phân chia đã được chuyển thẩm định','Distribution documents forwarded'],LEGAL_BASIS_CLASSIFIED:['Đã tiếp nhận căn cứ pháp lý','Legal basis recorded'],
 LEGAL_BASIS_RECLASSIFIED:['Đã cập nhật căn cứ pháp lý','Legal basis updated'],COURT_DECISION_RECORDED:['Đã có kết luận kiểm tra giấy tờ','Document assessment recorded'],
 LEGAL_BASIS_HELD:['Hồ sơ cần tạm dừng xử lý','Case processing paused'],LEGAL_BASIS_REVIEW_REQUIRED:['Hồ sơ cần bổ sung hoặc thẩm định lại','Supplementation or reassessment needed'],
 LEGAL_BASIS_REVIEW_RECORDED:['Đã ghi nhận thẩm định giấy tờ phân chia','Distribution assessment recorded'],LEGAL_BASIS_DECIDED:['Đã có quyết định phê duyệt hồ sơ','Final decision recorded'],LEGAL_VAULT_UNLOCKED:['Kho đã được mở khóa để bàn giao','Vault unlocked for handover']};
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
export default function WorkflowNotifications({ session, role, lang='vi', onNavigate = url => window.location.assign(url) }) {
 const token=session?.accessToken,en=lang==='en';
 const [result,setResult]=useState(null),[attempt,setAttempt]=useState(0),[opening,setOpening]=useState(null);
 const current=useRef(null), details=useRef(null);
 const [expanded,setExpanded]=useState(false);
 useEffect(()=>{if(!expanded)return;const close=event=>{if(event.type==='keydown'&&event.key!=='Escape')return;if(event.type==='pointerdown'&&details.current?.contains(event.target))return;details.current?.removeAttribute('open');if(event.type==='keydown')details.current?.querySelector('summary').focus();};document.addEventListener('pointerdown',close);document.addEventListener('keydown',close);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',close);};},[expanded]);
 useEffect(()=>{
  if(!token)return;
  const c=new AbortController();current.current=c;let timer,busy=false;
  async function load(){if(busy||document.hidden)return;busy=true;
   try{const items=await request('/workflow-notifications?workspace='+role,{accessToken:token,signal:c.signal,expectedStatus:200});
    if(!Array.isArray(items)||!items.every(x=>uuid(x.id)&&uuid(x.caseId)&&typeof x.caseNumber==='string'&&Object.hasOwn(labels,x.action)&&(x.reason==null||(typeof x.reason==='string'&&x.reason.length<=1000))&&typeof x.read==='boolean'&&Number.isFinite(Date.parse(x.occurredAt))))throw Error('Invalid notifications');
    if(!c.signal.aborted)setResult({token,role,items});
   }catch{if(!c.signal.aborted)setResult({token,role,error:true});}finally{busy=false;}}
  load();timer=setInterval(load,15000);document.addEventListener('visibilitychange',load);window.addEventListener('lv-workflow-notifications-changed',load);
  return()=>{c.abort();clearInterval(timer);document.removeEventListener('visibilitychange',load);window.removeEventListener('lv-workflow-notifications-changed',load);};
 },[token,role,attempt]);
 const visible=token&&result?.token===token&&result?.role===role?result:null;
 if(!token)return null;
 async function open(item){if(opening)return;setOpening(item.id);const c=current.current;
  try{const receipt=await request('/workflow-notifications/'+item.id+'/read?workspace='+role,{method:'PUT',accessToken:token,signal:c?.signal,expectedStatus:200});if(receipt?.id!==item.id||receipt.read!==true)throw Error('Read not confirmed');
   if(c?.signal.aborted)return;
   const intakeEvent=['VERIFICATION_CASE_CLAIMED','DEATH_DOCUMENT_RECORDED','ORIGINAL_WILL_RECEIVED','INTAKE_ATTACHMENT_UPLOADED','LEGAL_DEATH_DOCUMENT_DECIDED','WILL_COMPARISON_RECORDED'].includes(item.action);
   const tab=role==='STAFF'?(intakeEvent?'/staff/cases':'/staff/legal-documents'):item.action==='LEGAL_VAULT_UNLOCKED'?'/legal/controlled-unlock':item.action==='LEGAL_BASIS_DECIDED'?'/legal/approval-review':item.action==='VERIFICATION_CASE_CLAIMED'||item.action==='DEATH_DOCUMENT_RECORDED'||item.action==='INTAKE_ATTACHMENT_UPLOADED'?'/legal/death-verification':item.action==='ORIGINAL_WILL_RECEIVED'||item.action==='WILL_COMPARISON_RECORDED'?'/legal/will-document-verification':'/legal/basis-route-selection';
   onNavigate(tab+'?'+new URLSearchParams({caseId:item.caseId,lang}));
  }catch{if(!c?.signal.aborted)setResult({token,role,error:true});}finally{if(!c?.signal.aborted)setOpening(null);}}
 return <details ref={details} onToggle={event=>setExpanded(event.currentTarget.open)} className="lv-workflow-notifications"><summary aria-label={en?'Notifications':'Thông báo'}><Bell size={20} aria-hidden="true"/><span>{en?'Notifications':'Thông báo'}</span>{visible?.items?.some(x=>!x.read)&&<span className="lv-workflow-notifications__dot" aria-label={en?'Unread notifications':'Có thông báo chưa đọc'}/>}</summary>
  {expanded && <section className="lv-workflow-notifications__panel" aria-label={en?'Recent notifications':'Thông báo gần đây'}><h2>{en?'Recent notifications':'Thông báo gần đây'}</h2>
   {!visible?<p role="status">{en?'Loading…':'Đang tải…'}</p>:visible.error?<div role="alert"><p>{en?'Notifications could not be loaded.':'Chưa tải được thông báo.'}</p><button type="button" onClick={()=>setAttempt(x=>x+1)}>{en?'Try again':'Thử lại'}</button></div>:!visible.items.length?<p>{en?'No notifications yet.':'Chưa có thông báo.'}</p>:<ul>{visible.items.map(item=><li key={item.id}><button type="button" disabled={!!opening} className={item.read?'':'is-unread'} onClick={()=>open(item)}><strong>{labels[item.action][en?1:0]}</strong><span>{item.caseNumber}{!item.read&&(en?' · Unread':' · Chưa đọc')}</span>{item.reason && <span>{item.reason}</span>}<time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString(en?'en-GB':'vi-VN')}</time></button></li>)}</ul>}
  </section>}</details>;
}
