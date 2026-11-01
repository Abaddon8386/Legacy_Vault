import {useEffect,useState} from 'react';
import {readBeneficiaryHandover} from '../../utils/beneficiaryHandoverModel.js';
import './BeneficiaryHandoverStatus.css';
export default function BeneficiaryHandoverStatus(props){return <StatusScope key={JSON.stringify([props.userId,props.accessToken,props.lang])} {...props}/>;}
function StatusScope({userId,accessToken,lang='vi',loadStatus,preview=false,previewState='SUSPENDED'}){
  const en=lang==='en',[result,setResult]=useState(null),[attempt,setAttempt]=useState(0),[error,setError]=useState(null);
  const mock=Boolean(import.meta.env.DEV&&preview&&!accessToken);
  useEffect(()=>{if(typeof loadStatus!=='function'&&!mock)return;const c=new AbortController();Promise.resolve().then(()=>mock?{subjectId:userId,cases:[{caseId:'preview-case',caseNumber:'HS-2026-000099',status:previewState,totalAssets:2,deliveredAssets:0}]}:loadStatus({userId,accessToken,lang,signal:c.signal})).then(value=>{if(!c.signal.aborted)setResult({attempt,cases:readBeneficiaryHandover(value,userId)});}).catch(()=>{if(!c.signal.aborted)setError({attempt});});return()=>c.abort();},[userId,accessToken,lang,loadStatus,mock,previewState,attempt]);
  useEffect(()=>{const refresh=()=>setAttempt(x=>x+1);window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[]);
  const current=result?.attempt===attempt?result.cases:null, failure=error?.attempt===attempt;
  const names={UNCONFIRMED:en?'Waiting for attendance check':'Chờ Staff ghi nhận đủ người',SUSPENDED:en?'Whole handover temporarily suspended':'Toàn bộ bàn giao đang tạm khóa',AWAITING_LEGAL:en?'Staff requested reopening; awaiting Legal':'Staff đã yêu cầu mở lại, chờ Legal xét',READY:en?'Attendance ready; delivery still required':'Đã đủ điều kiện về người nhận, chờ bàn giao'};
  const available=typeof loadStatus==='function'||mock;
  return <section className="lv-beneficiary-handover"><h2>{en?'Handover status':'Tình hình bàn giao'}</h2>{mock&&<p role="note">{en?'Preview — synthetic test data':'Bản xem thử — dữ liệu mô phỏng'}</p>}
    {!available?<p>{en?'Handover status is not available yet. Assets already delivered remain accessible below.':'Chưa có thông tin tình hình buổi bàn giao. Bạn vẫn có thể xem tài sản đã được bàn giao bên dưới.'}</p>:<>
      {failure?<p role="alert">{en?'Unable to load handover status. Please retry.':'Không tải được tình hình bàn giao. Vui lòng thử lại.'}</p>:!current?<p role="status">{en?'Loading handover status…':'Đang tải tình hình bàn giao…'}</p>:current.length===0?<p>{en?'No shared handover information is available for this account.':'Tài khoản chưa có thông tin buổi bàn giao được chia sẻ.'}</p>:<ul>{current.map(item=><li key={item.caseId}><h3>{item.caseNumber}</h3><p role="status">{names[item.status]}</p><p>{en?'Your delivered assets':'Tài sản của bạn đã được bàn giao'}: {item.deliveredAssets}/{item.totalAssets}</p>{['SUSPENDED','AWAITING_LEGAL'].includes(item.status)&&<p>{en?'Everyone must be present. Staff requests reopening and Legal reviews it. This does not remove your entitlement.':'Cần có đầy đủ người nhận. Staff ghi nhận và yêu cầu mở lại để Legal xét. Tạm khóa không làm mất quyền nhận của bạn.'}</p>}</li>)}</ul>}
      <button type="button" onClick={()=>setAttempt(x=>x+1)}>{en?'Refresh handover status':'Cập nhật tình hình bàn giao'}</button></>}
  </section>;
}
