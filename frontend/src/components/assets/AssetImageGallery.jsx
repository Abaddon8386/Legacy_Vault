import { Fragment, useEffect, useRef, useState } from 'react';
import FirstPasswordButton from '../auth/FirstPasswordButton.jsx';
import { assetImageService } from '../../services/assetImageService.js';
import { passwordSetupCancelledMessage } from '../../utils/passwordSetupFlow.js';
import { AssetImagePicker } from './AssetImagePicker.jsx';
import ZoomableImage from '../common/ZoomableImage.jsx';
import './AssetAttachmentTable.css';

/**
 * Asset photos as a 2-column table: file name | view/collapse button (plus delete when editable).
 * `sessionPassword` is a password already verified in the parent modal, so no extra prompt is needed.
 */
export function AssetImageGallery({ vaultId, assetId, accessToken, lang = 'vi', onUnauthorized, readOnly = false, allowUpload = !readOnly, sessionPassword = '', onUnlocked, onCountChange, children }) {
  const en=lang==='en';
  const [images,setImages]=useState([]), [files,setFiles]=useState([]), [error,setError]=useState('');
  const [busy,setBusy]=useState(false), [password,setPassword]=useState(''), [selected,setSelected]=useState(null);
  const [opened,setOpened]=useState({});
  const urls=useRef([]), pending=useRef(false);
  const controller=useRef(null);
  useEffect(() => {
    const abort=new AbortController(); controller.current=abort;
    assetImageService.list(vaultId,assetId,{accessToken,lang,signal:abort.signal}).then(setImages).catch(e=> {
      if (abort.signal.aborted) return;
      if(e.status===401) onUnauthorized?.();
      setError(en?'Unable to load photos.':'Không tải được ảnh tài sản.');
    });
    return ()=>{ abort.abort(); urls.current.forEach(URL.revokeObjectURL); urls.current=[]; };
  },[vaultId,assetId,accessToken,lang,en,onUnauthorized]);
  useEffect(()=>{ onCountChange?.(images.length); },[images.length,onCountChange]);
  const run=async(action)=>{
    if(pending.current) return; pending.current=true; setBusy(true); setError('');
    const signal=controller.current?.signal;
    try { await action({accessToken,lang,signal}); }
    catch(e){
      if(!signal?.aborted) {
        if(e.status===401) onUnauthorized?.();
        setError(e.code === 'PASSWORD_SETUP_CANCELLED' ? e.code :
          (en?'Unable to complete. Check your password, photo limits and vault status, then retry.':'Không thực hiện được. Kiểm tra mật khẩu, giới hạn ảnh và trạng thái kho rồi thử lại.'));
      }
    }
    finally {pending.current=false; if(!signal?.aborted)setBusy(false);}
  };
  const openImage=(image,secret)=>run(async opts=>{const blob=await assetImageService.open(vaultId,assetId,image,secret,opts);if(opts.signal?.aborted)return;
    const src=URL.createObjectURL(blob);urls.current.push(src);setOpened(prev=>({...prev,[image.id]:src}));setSelected(null);onUnlocked?.(secret);});
  const toggleImage=image=>{
    if(opened[image.id]){setOpened(prev=>({...prev,[image.id]:null}));return;}
    if(sessionPassword){openImage(image,sessionPassword);return;}
    setSelected(image);setPassword('');
  };
  const removeImage=image=>{
    if(!window.confirm(en?'Delete this photo?':'Xóa ảnh này?')) return;
    run(async opts=>{await assetImageService.remove(vaultId,assetId,image.id,opts); if(opts.signal?.aborted)return;
      setImages(prev=>prev.filter(i=>i.id!==image.id)); setOpened(prev=>({...prev,[image.id]:null}));});
  };
  return <section className="lv-asset-images" aria-label={en?'Asset photos':'Ảnh tài sản'}>
    <h3>{en?'Asset photos':'Ảnh tài sản'} ({images.length}/5)</h3>
    {error && (error === 'PASSWORD_SETUP_CANCELLED'
      ? <p role="status">{passwordSetupCancelledMessage(lang)}</p>
      : <p role="alert">{error}</p>)}
    {images.length>0 && <table className="lv-asset-table">
      <thead><tr><th scope="col">{en?'File name':'Tên tệp'}</th><th scope="col">{en?'Action':'Thao tác'}</th></tr></thead>
      <tbody>{images.map(image=><Fragment key={image.id}>
        <tr>
          <td>{image.fileName}</td>
          <td>
            <button type="button" disabled={busy} onClick={()=>toggleImage(image)}>{opened[image.id]?(en?'Collapse photo':'Thu gọn ảnh'):(en?'View photo':'Xem ảnh')}</button>
            {!readOnly && <button type="button" disabled={busy} onClick={()=>removeImage(image)}>{en?'Delete':'Xóa'}</button>}
          </td>
        </tr>
        {opened[image.id] && <tr className="lv-asset-table__preview"><td colSpan={2}><ZoomableImage src={opened[image.id]} alt={image.fileName} lang={lang}/></td></tr>}
      </Fragment>)}</tbody>
    </table>}
    {selected&&<form onSubmit={e=>{e.preventDefault();const secret=password;setPassword('');openImage(selected,secret);}}>
      <FirstPasswordButton lang={lang} onReady={setPassword} disabled={busy} />
      <label><span>{en?'Confirm your current password to view the photo':'Xác nhận mật khẩu hiện tại để xem ảnh'}<span className="lv-required-mark" aria-hidden="true">*</span></span>
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required maxLength={72} autoComplete="current-password" disabled={busy}/>
      </label>
      <button disabled={busy} type="submit">{en?'View':'Xem'}</button>
      <button type="button" disabled={busy} onClick={()=>{setSelected(null);setPassword('');}}>{en?'Cancel':'Hủy'}</button>
    </form>}
    {allowUpload && images.length<5&&<>
      <AssetImagePicker files={files} onChange={setFiles} existingCount={images.length} disabled={busy} lang={lang}/>
      <button type="button" disabled={busy||!files.length} onClick={()=>run(async opts=>{
        const result=await assetImageService.add(vaultId,assetId,files,opts); if(opts.signal?.aborted)return;setImages(result);setFiles([]);
      })}>{en?'Upload photos':'Tải ảnh lên'}</button>
    </>}
    {children}
  </section>;
}
