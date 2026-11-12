import { useEffect, useRef, useState } from 'react';
import FirstPasswordButton from '../auth/FirstPasswordButton.jsx';
import { assetDocumentService, validateDocuments } from '../../services/assetDocumentService.js';
import { passwordSetupCancelledMessage } from '../../utils/passwordSetupFlow.js';
import '../common/RelatedAttachments.css';
import './AssetImages.css';
import './AssetFilePicker.css';
import './AssetAttachmentTable.css';
export function DocumentPicker({files,onChange,disabled,lang='vi',existingCount=0}) {
  const [error,setError]=useState(false);const en=lang==='en';
  return <fieldset className="lv-asset-images" disabled={disabled}><legend>{en?'Documents (optional)':'Tài liệu (tùy chọn)'}</legend><p>{en?'Maximum 5 files, 10 MB each. Documents can only be downloaded.':'Tối đa 5 tệp, mỗi tệp 10 MB. Tài liệu chỉ tải xuống được.'}</p><label className="lv-asset-file-picker"><strong>{en?'Add documents (PDF, Word)':'Thêm tài liệu (PDF, Word)'}</strong><input aria-label={en?'Add documents (PDF, Word)':'Thêm tài liệu (PDF, Word)'} type="file" multiple accept=".pdf,.doc,.docx" disabled={disabled} onChange={e=>{const list=Array.from(e.target.files||[]);if(!list.length){onChange([]);setError(false);return;}try{validateDocuments(list,existingCount);onChange(list);setError(false);}catch{setError(true);onChange([]);e.target.value='';}}}/></label>{error&&<p role="alert">{en?'Select valid PDF, DOC or DOCX files within the limits.':'Chọn PDF, DOC hoặc DOCX hợp lệ trong giới hạn.'}</p>}{files.length>0&&<table className="lv-asset-table"><thead><tr><th scope="col">{en?'File name':'Tên tệp'}</th><th scope="col" className="lv-asset-table__size">{en?'Size':'Dung lượng'}</th><th scope="col">{en?'Action':'Thao tác'}</th></tr></thead><tbody>{files.map((f,i)=><tr key={i}><td>{f.name}</td><td className="lv-asset-table__size">{formatSize(f.size)}</td><td><button type="button" disabled={disabled} onClick={()=>onChange(files.filter((_,index)=>index!==i))}>{en?'Remove':'Bỏ tài liệu'}</button></td></tr>)}</tbody></table>}</fieldset>;
}
export default function AssetDocuments(props){return <Documents key={`${props.vaultId}:${props.assetId}:${props.accessToken}`} {...props}/>;}
function formatSize(bytes){return bytes>=1048576?`${(bytes/1048576).toFixed(2)} MB`:`${Math.max(1,Math.round(bytes/1024))} KB`;}
/**
 * Asset documents as a 3-column table: file name | size | download (plus delete when editable).
 * The list loads on mount; `sessionPassword` is a password already verified in the parent modal.
 */
function Documents({vaultId,assetId,accessToken,lang,onUnauthorized,readOnly=false,allowUpload=!readOnly,sessionPassword='',onUnlocked,onCountChange,children}) {
  const en=lang==='en';const [items,setItems]=useState(null),[files,setFiles]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(null),[target,setTarget]=useState(null),[password,setPassword]=useState(''),[removeTarget,setRemoveTarget]=useState(null);
  const controller=useRef(null);
  async function run(task){if(controller.current)return;const c=new AbortController();controller.current=c;setBusy(true);setError(null);try{await task({accessToken,lang,signal:c.signal},c);}catch(err){if(!c.signal.aborted){setError(err);if(err.status===401)onUnauthorized?.();if([401,403,404].includes(err.status)&&err.code!=='REAUTH_FAILED'){setItems(null);setTarget(null);}}}finally{if(!c.signal.aborted){controller.current=null;setBusy(false);}}}
  useEffect(()=>{
    const c=new AbortController();
    assetDocumentService.list(vaultId,assetId,{accessToken,lang,signal:c.signal}).then(value=>{if(!c.signal.aborted)setItems(value);}).catch(err=>{if(c.signal.aborted)return;setError(err);if(err.status===401)onUnauthorized?.();});
    return()=>{c.abort();controller.current?.abort();controller.current=null;};
  },[vaultId,assetId,accessToken,lang,onUnauthorized]);
  useEffect(()=>{if(items)onCountChange?.(items.length);},[items,onCountChange]);
  const downloadWith=(item,pwd)=>run(async(o,c)=>{const blob=await assetDocumentService.download(vaultId,assetId,item,pwd,o);if(c.signal.aborted)return;const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=Array.from(item.fileName, ch=>ch.charCodeAt(0)<32||ch==='/'||ch===String.fromCharCode(92)?'_':ch).join('');link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setTarget(null);onUnlocked?.(pwd);});
  const startDownload=item=>{if(sessionPassword){downloadWith(item,sessionPassword);return;}setTarget(item);setPassword('');};
  return <section className="lv-asset-documents"><h3>{en?'PDF / Word documents':'Tài liệu PDF / Word'}</h3>
    {busy&&<p role="status">{en?'Processing…':'Đang xử lý…'}</p>}
    {error?.code==='PASSWORD_SETUP_CANCELLED' && <p role="status">{passwordSetupCancelledMessage(lang)}</p>}
    {error&&error.code!=='PASSWORD_SETUP_CANCELLED'&&<p role="alert">{error.code==='REAUTH_FAILED'?(en?'Incorrect password. Try again.':'Mật khẩu không đúng. Vui lòng thử lại.'):error.status===429?(en?'Too many attempts. Try later.':'Quá nhiều lần thử. Vui lòng thử lại sau.'):(en?'Unable to complete. Reload before retrying.':'Chưa thực hiện được. Tải lại để kiểm tra trước khi thử lại.')}</p>}
    {items&&<>
      {items.length>0&&<table className="lv-asset-table">
        <thead><tr><th scope="col">{en?'File name':'Tên tệp'}</th><th scope="col" className="lv-asset-table__size">{en?'Size':'Dung lượng'}</th><th scope="col">{en?'Action':'Thao tác'}</th></tr></thead>
        <tbody>{items.map(item=><tr key={item.id}>
          <td>{item.fileName}</td>
          <td className="lv-asset-table__size">{formatSize(item.sizeBytes)}</td>
          <td><button type="button" disabled={busy} onClick={()=>startDownload(item)}>{en?'Download':'Tải xuống'}</button>{!readOnly&&<button type="button" disabled={busy} onClick={()=>setRemoveTarget(item)}>{en?'Delete':'Xóa'}</button>}</td>
        </tr>)}</tbody>
      </table>}
      {!items.length&&<p>{en?'No documents attached.':'Chưa có tài liệu đính kèm.'}</p>}
      {allowUpload&&<><DocumentPicker files={files} onChange={setFiles} disabled={busy} lang={lang} existingCount={items.length}/><button type="button" disabled={busy||!files.length} onClick={()=>run(async(o,c)=>{validateDocuments(files,items.length);await assetDocumentService.upload(vaultId,assetId,files,o);if(c.signal.aborted)return;setFiles([]);setItems(null);const value=await assetDocumentService.list(vaultId,assetId,o);if(!c.signal.aborted)setItems(value);})}>{en?'Upload documents':'Tải tài liệu lên'}</button></>}
    </>}
    {!readOnly&&removeTarget&&<div role="group"><p>{en?'Delete this document?':'Xóa tài liệu này?'}</p><button type="button" disabled={busy} onClick={()=>run(async(o,c)=>{await assetDocumentService.remove(vaultId,assetId,removeTarget.id,o);if(c.signal.aborted)return;setRemoveTarget(null);setItems(null);const value=await assetDocumentService.list(vaultId,assetId,o);if(!c.signal.aborted)setItems(value);})}>{en?'Confirm delete':'Xác nhận xóa'}</button><button type="button" disabled={busy} onClick={()=>setRemoveTarget(null)}>{en?'Cancel':'Hủy'}</button></div>}
    {target&&<form onSubmit={e=>{e.preventDefault();const pwd=password;setPassword('');downloadWith(target,pwd);}}><FirstPasswordButton lang={lang} onReady={setPassword} disabled={busy}/><label>{en?'Current login password':'Mật khẩu đăng nhập hiện tại'}<input type="password" maxLength={72} value={password} autoComplete="current-password" disabled={busy} onChange={e=>setPassword(e.target.value)}/></label><button type="submit" disabled={busy||!password.trim()}>{en?'Download document':'Tải tài liệu'}</button><button type="button" disabled={busy} onClick={()=>{setPassword('');setTarget(null);}}>{en?'Cancel':'Hủy'}</button></form>}
    {children}
  </section>;
}
