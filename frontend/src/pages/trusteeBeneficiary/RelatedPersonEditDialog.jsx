import { useEffect, useRef, useState } from 'react';
import { useModalFocus } from '../../components/common/useModalFocus.js';
import { beneficiaryAge } from '../../utils/beneficiaryAge.js';
import { validateTrustee } from '../../utils/trusteeValidation.js';
import { validateBeneficiary } from '../../utils/beneficiaryValidation.js';
import { updateTrustee, updateBeneficiary } from '../../utils/trusteeBeneficiaryService.js';

export default function RelatedPersonEditDialog({ person, kind, vaultId, accessToken, lang, labels, onClose, onUpdated, onUnauthorized }) {
 const isTrustee=kind==='trustee', en=lang==='en';
 const [form,setForm]=useState(()=>({fullName:person.fullName,relationship:person.relationship||'',phone:person.phone||'',email:person.email||'',dateOfBirth:person.dateOfBirth||'',note:person.note??null}));
 const age=beneficiaryAge(form.dateOfBirth);
 const needsGuardian=!isTrustee && age!==null && age<18;
 const guardianNotice=en?'A guardian is recommended. Save, then open Guardian to add the contact.':'Nên bổ sung người giám hộ. Lưu rồi mở mục Người giám hộ để thêm thông tin.';
 const [touched,setTouched]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 const request=useRef(null),pending=useRef(false);
 const dialog=useModalFocus(true,onClose);
 useEffect(()=>()=>{request.current?.abort();},[]);
 const errors=(isTrustee?validateTrustee:validateBeneficiary)(form,lang);
 const fields=[['fullName',labels.fullNameLabel,'text',150],['relationship',labels.relationshipLabel,'text',100],...(!isTrustee?[['dateOfBirth',labels.dobLabel,'date',undefined]]:[]),['phone',labels.phoneLabel,'tel',20],['email',labels.emailLabel,'email',254]];
 async function submit(event){
  event.preventDefault();if(pending.current)return;
  setTouched(Object.fromEntries(fields.map(([key])=>[key,true])));
  if(Object.keys(errors).length)return;
  pending.current=true;setBusy(true);setError(false);
  const controller=new AbortController();request.current=controller;
  try {
   const result=await (isTrustee?updateTrustee:updateBeneficiary)(vaultId,person.id,form,{accessToken,lang,signal:controller.signal});
   if(!controller.signal.aborted)onUpdated(result);
  }catch(err){if(controller.signal.aborted)return;if(err.status===401){onUnauthorized?.();onClose();return;}setError(true);}
  finally{pending.current=false;if(!controller.signal.aborted)setBusy(false);}
 }
 const title=en?(isTrustee?'Edit trustee':'Edit beneficiary'):(isTrustee?'Chỉnh sửa người thi hành bên ngoài':'Chỉnh sửa người thụ hưởng');
 return <div className="lv-tb-edit-backdrop" onClick={onClose}>
  <div ref={dialog} className="lv-tb-dialog" role="dialog" aria-modal="true" aria-labelledby="related-edit-title" tabIndex={-1} onClick={event=>event.stopPropagation()}>
   <div className="lv-tb-dialog-header"><h3 id="related-edit-title">{title}</h3><button type="button" className="lv-tb-btn-secondary" onClick={onClose}>{en?'Close':'Đóng'}</button></div>
   <form className="lv-tb-form" onSubmit={submit} noValidate>
    {error&&<p role="alert">{en?'Unable to update. Your changes have been kept; please try again.':'Không thể cập nhật. Nội dung đã nhập được giữ lại; vui lòng thử lại.'}</p>}
    <div className="lv-tb-form-grid">{fields.map(([key,label,type,maxLength])=><div className="lv-tb-field-group" key={key}>
     <label className="lv-tb-label" htmlFor={'related-edit-'+key}>{label}{key==='fullName'?' *':''}</label>
     <input id={'related-edit-'+key} className={`lv-tb-input ${touched[key]&&errors[key]?'has-error':''}`} type={type} maxLength={maxLength} disabled={busy} value={form[key]}
      max={type==='date'?new Date().toISOString().slice(0,10):undefined} aria-invalid={Boolean(touched[key]&&errors[key])} aria-describedby={[touched[key]&&errors[key]?'related-error-'+key:null,key==='dateOfBirth'&&needsGuardian?'related-guardian-notice':null].filter(Boolean).join(' ')||undefined}
      onBlur={()=>setTouched(prev=>({...prev,[key]:true}))} onChange={event=>{setForm(prev=>({...prev,[key]:event.target.value}));setError(false);}} />
     {key==='dateOfBirth' && needsGuardian && <p id="related-guardian-notice" className="lv-tb-age-warning" role="status">{guardianNotice}</p>}
     {touched[key]&&errors[key]&&<span id={'related-error-'+key} className="lv-tb-error-text" role="alert">{errors[key]}</span>}
    </div>)}</div>
    <div className="lv-tb-actions-row"><button type="button" className="lv-tb-btn-secondary" onClick={onClose}>{en?'Cancel':'Hủy'}</button><button type="submit" className="lv-tb-btn-primary" disabled={busy}>{busy?(en?'Saving…':'Đang lưu…'):(en?'Save changes':'Lưu thay đổi')}</button></div>
   </form>
  </div>
 </div>;
}
