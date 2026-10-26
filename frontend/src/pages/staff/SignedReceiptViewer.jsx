import { useEffect, useRef, useState } from 'react';
import EvidencePreviewModal from '../../components/common/EvidencePreviewModal.jsx';
export default function SignedReceiptViewer({ caseId, sessionId, confirmationId, accessToken, lang, onUnauthorized }) {
  const [preview,setPreview]=useState(null), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const controller=useRef(null), active=useRef(true), url=useRef(null);
  useEffect(()=>{active.current=true; return ()=>{active.current=false;controller.current?.abort();if(url.current) URL.revokeObjectURL(url.current);};},[]);
  async function open(){
    if(busy)return;
    const c=new AbortController();controller.current=c;setBusy(true);setError('');
    try {
      const response=await fetch(`/api/v1/staff/verification-cases/${caseId}/handover-sessions/${sessionId}/beneficiary-confirmations/${confirmationId}/file`,{headers:{Authorization:`Bearer ${accessToken}`},signal:c.signal});
      if(response.status===401){onUnauthorized?.();throw new Error();}
      if(!response.ok)throw new Error();
      const blob=await response.blob();
      if(!['application/pdf','image/jpeg','image/png'].includes(blob.type))throw new Error();
      if(!active.current||c.signal.aborted)return;
      const blobUrl=URL.createObjectURL(blob);url.current=blobUrl;setPreview({blobUrl,contentType:blob.type});
    }catch{if(active.current&&!c.signal.aborted)setError(lang==='en'?'Could not open the receipt.':'Không mở được biên nhận.');}
    finally{if(active.current&&!c.signal.aborted)setBusy(false);}
  }
  return <div><button type="button" className="lv-btn lv-btn--secondary" disabled={busy} onClick={open}>{lang==='en'?'View signed receipt':'Xem biên nhận đã ký'}</button>{error&&<p role="alert">{error}</p>}{preview&&<EvidencePreviewModal {...preview} fileName="signed-receipt" lang={lang} onClose={()=>{url.current=null;setPreview(null);}} />}</div>;
}
