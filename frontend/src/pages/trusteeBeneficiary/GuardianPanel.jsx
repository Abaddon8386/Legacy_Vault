import { useEffect, useRef, useState } from 'react';
import { guardianService } from '../../services/guardianService.js';
import '../../components/common/RelatedAttachments.css';

export default function GuardianPanel(props) {
  return <GuardianContent key={`${props.vaultId}:${props.beneficiaryId}:${props.accessToken}`} {...props} />;
}
function GuardianContent({vaultId,beneficiaryId,accessToken,lang,onUnauthorized}) {
  const en=lang==='en';
  const [expanded,setExpanded]=useState(false),[context,setContext]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null);
  const [draft,setDraft]=useState(null),[history,setHistory]=useState(null),[confirmRevoke,setConfirmRevoke]=useState(false);
  const controller=useRef(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  async function run(task) {
    if(controller.current) return;
    const c=new AbortController();controller.current=c;setBusy(true);setError(null);
    try { await task({accessToken,lang,signal:c.signal},c); }
    catch(err) { if(!c.signal.aborted) {setError(err);if(err.status===401)onUnauthorized?.();} }
    finally {if(!c.signal.aborted){controller.current=null;setBusy(false);}}
  }
  const load=()=>run(async(options,c)=>{const value=await guardianService.get(vaultId,beneficiaryId,options);if(!c.signal.aborted){setContext(value);setDraft(null);setHistory(null);setConfirmRevoke(false);}});
  const showHistory=page=>run(async(options,c)=>{const value=await guardianService.history(vaultId,beneficiaryId,page,options);if(!c.signal.aborted)setHistory(value);});
  return <section className="lv-tb-guardian">
    <button type="button" onClick={()=>{setExpanded(true);load();}} disabled={busy}>{en?'Guardian':'Người giám hộ'}</button>
    {expanded&&<>
      <p>{en?'Contact information only; this does not grant account or asset access.':'Chỉ lưu thông tin liên hệ; không cấp tài khoản hay quyền xem, nhận tài sản.'}</p>
      {busy&&<p role="status">{en?'Loading…':'Đang xử lý…'}</p>}
      {error&&<p role="alert">{error.code==='BENEFICIARY_GUARDIAN_STALE'?(en?'Information changed. Reload before saving again.':'Thông tin đã thay đổi. Tải lại trước khi lưu.'):(en?'Unable to complete. Retry or reload.':'Chưa thực hiện được. Vui lòng thử lại hoặc tải lại.')}</p>}
      <button type="button" disabled={busy} onClick={load}>{en?'Reload guardian':'Tải lại người giám hộ'}</button>
      {context&&<>
        {context.guardianRecommended&&<p role="status">{en?'A guardian is recommended for this minor.':'Nên bổ sung người giám hộ cho người thụ hưởng chưa thành niên.'}</p>}
        {context.guardian?<p>{context.guardian.fullName} · {context.guardian.relationship} · {context.guardian.email} · {context.guardian.phone}</p>:<p>{en?'No current guardian.':'Chưa có người giám hộ hiện hành.'}</p>}
        <button type="button" disabled={busy} onClick={()=>setDraft({fullName:context.guardian?.fullName||'',relationship:context.guardian?.relationship||'',email:context.guardian?.email||'',phone:context.guardian?.phone||''})}>{en?'Add / replace guardian':'Thêm / thay thế người giám hộ'}</button>
        {context.guardian&&<button type="button" disabled={busy} onClick={()=>setConfirmRevoke(true)}>{en?'Revoke guardian':'Thu hồi người giám hộ'}</button>}
        {confirmRevoke&&<div role="group"><p>{en?'Revoke this contact? History will be preserved.':'Thu hồi thông tin hiện hành? Lịch sử vẫn được giữ.'}</p><button type="button" disabled={busy} onClick={()=>run(async(options,c)=>{const value=await guardianService.revoke(vaultId,beneficiaryId,context.revision,options);if(!c.signal.aborted){setContext(value);setConfirmRevoke(false);setDraft(null);setHistory(null);}})}>{en?'Confirm revoke':'Xác nhận thu hồi'}</button><button type="button" disabled={busy} onClick={()=>setConfirmRevoke(false)}>{en?'Cancel':'Hủy'}</button></div>}
        {draft&&<form onSubmit={e=>{e.preventDefault();run(async(options,c)=>{const value=await guardianService.save(vaultId,beneficiaryId,{...draft,expectedRevision:context.revision},options);if(!c.signal.aborted){setContext(value);setDraft(null);setHistory(null);}});}}>
          {[['fullName',en?'Full name':'Họ tên','text',150],['relationship',en?'Relationship':'Quan hệ','text',100],['email','Email','email',254],['phone',en?'Phone':'Số điện thoại','tel',20]].map(([key,label,type,max])=><label key={key}>{label}<input type={type} maxLength={max} required={key==='fullName'||key==='relationship'} value={draft[key]} disabled={busy} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}
          <p>{en?'Provide an email or phone number.':'Cần ít nhất email hoặc số điện thoại.'}</p>
          <button type="submit" disabled={busy||error?.code==='BENEFICIARY_GUARDIAN_STALE'||(!draft.email.trim()&&!draft.phone.trim())}>{en?'Save guardian':'Lưu người giám hộ'}</button><button type="button" disabled={busy} onClick={()=>setDraft(null)}>{en?'Cancel':'Hủy'}</button>
        </form>}
        <button type="button" disabled={busy} onClick={()=>showHistory(0)}>{en?'Guardian history':'Lịch sử người giám hộ'}</button>
        {history&&<div><ul>{history.content.map(item=><li key={item.id}>{item.fullName} · {item.relationship} · {item.createdAt} · {item.endedAt|| (en?'Current':'Hiện hành')} · {item.endReason}</li>)}</ul><button disabled={busy||history.page===0} onClick={()=>showHistory(history.page-1)}>{en?'Previous':'Trước'}</button><button disabled={busy||history.page+1>=history.totalPages} onClick={()=>showHistory(history.page+1)}>{en?'Next':'Sau'}</button></div>}
      </>}
    </>}
  </section>;
}
