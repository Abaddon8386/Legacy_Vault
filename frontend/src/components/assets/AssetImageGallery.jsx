import { useEffect, useRef, useState } from 'react';
import { assetImageService } from '../../services/assetImageService.js';
import { AssetImagePicker } from './AssetImagePicker.jsx';

export function AssetImageGallery({ vaultId, assetId, accessToken, lang = 'vi', onUnauthorized, readOnly = false }) {
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
  const run=async(action)=>{
    if(pending.current) return; pending.current=true; setBusy(true); setError('');
    const signal=controller.current?.signal;
    try { await action({accessToken,lang,signal}); }
    catch(e){ if(!signal?.aborted) { if(e.status===401) onUnauthorized?.(); setError(en?'Unable to complete. Check your password, photo limits and vault status, then retry.':'Không thực hiện được. Kiểm tra mật khẩu, giới hạn ảnh và trạng thái kho rồi thử lại.'); } }
    finally {pending.current=false; if(!signal?.aborted)setBusy(false);}
  };
  return <section className="lv-asset-images" aria-label={en?'Asset photos':'Ảnh tài sản'}>
    <h3>{en?'Asset photos':'Ảnh tài sản'} ({images.length}/5)</h3>
    {error&&<p role="alert">{error}</p>}
    <div className="lv-asset-image-grid">{images.map(image=><figure key={image.id}>
      {opened[image.id]&&<img src={opened[image.id]} alt={image.fileName}/>}
      <figcaption>{image.fileName}</figcaption>
      <button type="button" disabled={busy} onClick={()=>{setSelected(image);setPassword('');}}>{en?'View photo':'Xem ảnh'}</button>
      {!readOnly && <button type="button" disabled={busy} onClick={()=> {
        if(!window.confirm(en?'Delete this photo?':'Xóa ảnh này?')) return;
        run(async opts=>{await assetImageService.remove(vaultId,assetId,image.id,opts); if(opts.signal?.aborted)return;
          setImages(prev=>prev.filter(i=>i.id!==image.id)); setOpened(prev=>({...prev,[image.id]:null}));});
      }}>{en?'Delete':'Xóa'}</button>}
    </figure>)}</div>
    {selected&&<form onSubmit={e=>{e.preventDefault();const secret=password;setPassword('');const image=selected;
      run(async opts=>{const blob=await assetImageService.open(vaultId,assetId,image,secret,opts);if(opts.signal?.aborted)return;
        const src=URL.createObjectURL(blob);urls.current.push(src);setOpened(prev=>({...prev,[image.id]:src}));setSelected(null);});}}>
      <label>{en?'Confirm your current password to view the photo':'Xác nhận mật khẩu hiện tại để xem ảnh'}
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required maxLength={72} autoComplete="current-password" disabled={busy}/>
      </label>
      <button disabled={busy} type="submit">{en?'View':'Xem'}</button>
      <button type="button" disabled={busy} onClick={()=>{setSelected(null);setPassword('');}}>{en?'Cancel':'Hủy'}</button>
    </form>}
    {!readOnly && images.length<5&&<>
      <AssetImagePicker files={files} onChange={setFiles} existingCount={images.length} disabled={busy} lang={lang}/>
      <button type="button" disabled={busy||!files.length} onClick={()=>run(async opts=>{
        const result=await assetImageService.add(vaultId,assetId,files,opts); if(opts.signal?.aborted)return;setImages(result);setFiles([]);
      })}>{en?'Upload photos':'Tải ảnh lên'}</button>
    </>}
  </section>;
}
