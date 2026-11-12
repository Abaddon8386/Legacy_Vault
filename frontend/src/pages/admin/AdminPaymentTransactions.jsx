import { useEffect, useRef, useState } from 'react';
import DateTimePicker from '../../components/common/DateTimePicker.jsx';
import { fetchAdminPayments, fetchAdminPayment, paymentStatuses } from '../../utils/adminPaymentService.js';
import { adminSubscriptionErrorMessage, formatBytes } from '../../utils/adminSubscriptionService.js';
import { useModalFocus } from '../../components/common/useModalFocus.js';
import './AdminPaymentTransactions.css';

/**
 * Tab "Giao dịch thanh toán" trong trang quản lý gói (ROLE_ADMIN). Bọc `Transactions` với `key` theo accessToken để
 * state được reset khi đổi phiên đăng nhập. Được `AdminSubscriptionPage` render ở tab giao dịch.
 *
 * @param {object} props Gồm `accessToken`, `lang` ('vi'|'en') và `onUnauthorized` (callback khi 401).
 */
export default function AdminPaymentTransactions(props) {
  return <Transactions key={props.accessToken || 'anonymous'} {...props} />;
}

/**
 * Danh sách giao dịch thanh toán gói đăng ký có lọc và phân trang.
 *
 * Cách hoạt động: effect gọi `fetchAdminPayments(filters)` -> `GET /api/v1/admin/subscriptions/transactions`
 * (tham số query/status/from/to/page/size) và lưu kết quả theo `key` (bộ lọc + revision + ngôn ngữ) để bỏ kết quả cũ.
 * Nút "Xem" gọi `fetchAdminPayment(id)` -> `GET /api/v1/admin/subscriptions/transactions/{id}` rồi mở dialog chi tiết
 * (có khóa focus qua `useModalFocus`). Lỗi 401 gọi `onUnauthorized`; 401/403 ở chi tiết đóng dialog và hiện lỗi ở danh sách.
 *
 * State: `draft` (giá trị form chưa áp dụng), `filters` (bộ lọc đang dùng + page/size), `revision` (ép tải lại),
 * `result`, `detail`, `formError` (khoảng thời gian không hợp lệ).
 */
function Transactions({accessToken,lang='vi',onUnauthorized}) {
  const en=lang==='en';
  const empty={query:'',status:'',from:'',to:''};
  const [draft,setDraft]=useState(empty);
  const [filters,setFilters]=useState({page:0,size:20});
  const [revision,setRevision]=useState(0);
  const [result,setResult]=useState(null);
  const [detail,setDetail]=useState(null);
  const [formError,setFormError]=useState(false);
  const detailController=useRef(null);
  const auth=useRef(onUnauthorized);
  useEffect(()=>{auth.current=onUnauthorized;},[onUnauthorized]);
  const key=JSON.stringify([filters,revision,lang]);
  const current=result?.key===key?result:null;
  const selected=detail?.key===key?detail:null;
  const close=()=>{detailController.current?.abort();detailController.current=null;setDetail(null);};
  const modal=useModalFocus(Boolean(selected),close);
  useEffect(()=>{
    const c=new AbortController();
    let active=true;
    fetchAdminPayments(filters,{accessToken,lang,signal:c.signal}).then(data=>{
      if(active && !c.signal.aborted) setResult({key,data});
    }).catch(error=>{
      if(!active || c.signal.aborted) return;
      setResult({key,error});
      if(error.status===401) auth.current?.();
    });
    return ()=>{active=false;c.abort();detailController.current?.abort();};
  },[filters,key,accessToken,lang]);
  /**
   * Áp dụng bộ lọc/trang mới: đóng dialog chi tiết đang mở và xóa lỗi form.
   */
  const change=(next)=>{close();setFilters(next);setFormError(false);};
  /**
   * Submit form tra cứu: chuyển mốc thời gian sang chuỗi UTC (`...:00Z`), báo lỗi nếu "Từ" không trước "Đến",
   * ngược lại đặt bộ lọc, về trang 0 và tăng `revision` để tải lại.
   */
  const submit=e=>{
    e.preventDefault();
    const from=draft.from?`${draft.from}:00Z`:'';
    const to=draft.to?`${draft.to}:00Z`:'';
    if(from && to && Date.parse(from)>=Date.parse(to)){setFormError(true);return;}
    change({...draft,from,to,page:0,size:filters.size});
    setRevision(n=>n+1);
  };
  /**
   * Mở chi tiết một giao dịch: hủy request chi tiết trước đó, gọi `GET /api/v1/admin/subscriptions/transactions/{id}`
   * và lưu kết quả/lỗi vào state `detail`.
   */
  const view=async id=>{
    detailController.current?.abort();
    const c=new AbortController();detailController.current=c;
    setDetail({key,id});
    try{
      const data=await fetchAdminPayment(id,{accessToken,lang,signal:c.signal});
      if(!c.signal.aborted) setDetail({key,id,data});
    }catch(error){
      if(c.signal.aborted) return;
      if([401,403].includes(error.status)){
        setDetail(null);setResult({key,error});
        if(error.status===401) auth.current?.();
      }else setDetail({key,id,error});
    }
  };
  /**
   * Nhãn trạng thái giao dịch (PENDING, EXPIRED, SUCCEEDED, FAILED) theo ngôn ngữ.
   */
  const textStatus=status=>({PENDING:en?'Pending':'Đang chờ',EXPIRED:en?'Expired':'Hết hạn',
    SUCCEEDED:en?'Succeeded':'Thành công',FAILED:en?'Failed':'Thất bại'})[status];
  /**
   * Chuyển lỗi API thành thông báo: 400 là bộ lọc sai, INVALID_RESPONSE là dữ liệu không hợp lệ, còn lại dùng `adminSubscriptionErrorMessage`.
   */
  const errorText=error=>error.status===400?(en?'Invalid search filters.':'Bộ lọc tra cứu không hợp lệ.'):
    error.code==='INVALID_RESPONSE'?(en?'Invalid transaction data. Please reload.':'Dữ liệu giao dịch không hợp lệ. Vui lòng tải lại.'):
    adminSubscriptionErrorMessage(error,lang);
  /**
   * Định dạng số tiền VND theo locale.
   */
  const money=n=>new Intl.NumberFormat(en?'en-US':'vi-VN').format(n)+' VND';
  /**
   * Định dạng thời điểm theo UTC kèm hậu tố " UTC"; rỗng thì trả "—".
   */
  const date=value=>value?new Date(value).toLocaleString(en?'en-GB':'vi-VN',{timeZone:'UTC'})+' UTC':'—';
  return <section className="lv-payments" aria-label={en?'Payment transactions':'Giao dịch thanh toán'}>
    <form className="lv-payment-filters lv-surface-card" onSubmit={submit}>
      <label>{en?'Account email or reference':'Email tài khoản hoặc mã tham chiếu'}
        <input value={draft.query} maxLength={254} onChange={e=>setDraft({...draft,query:e.target.value})}/></label>
      <label>{en?'Status':'Trạng thái'}<select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})}>
        <option value="">{en?'All':'Tất cả'}</option>{paymentStatuses.map(s=><option key={s} value={s}>{textStatus(s)}</option>)}
      </select></label>
      <label>{en?'From (UTC)':'Từ (UTC)'}<DateTimePicker lang={lang} value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/></label>
      <label>{en?'To (UTC, exclusive)':'Đến (UTC, không gồm mốc cuối)'}<DateTimePicker lang={lang} value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></label>
      <button type="submit" className="lv-admin-sub-btn lv-admin-sub-btn--primary">{en?'Search':'Tra cứu'}</button>
      <button type="button" className="lv-admin-sub-btn" onClick={()=>{close();setRevision(n=>n+1);}}>{en?'Reload':'Tải lại'}</button>
    </form>
    {formError&&<p role="alert">{en?'From must precede To.':'Mốc bắt đầu phải trước mốc kết thúc.'}</p>}
    {!current&&<p role="status">{en?'Loading transactions…':'Đang tải giao dịch…'}</p>}
    {current?.error&&<p role="alert">{errorText(current.error)}</p>}
    {current?.data&&<>
      <p role="status">{en?'Results':'Kết quả'}: {current.data.totalElements}</p>
      {current.data.content.length===0?<p className="lv-payment-empty">{en?'No matching transactions.':'Không có giao dịch phù hợp.'}</p>:
        <div className="lv-payment-table-frame lv-surface-card"><div className="lv-payment-table-wrap" tabIndex={0} role="region" aria-label={en?'Payment transaction table':'Bảng giao dịch thanh toán'}><table className="lv-admin-sub-table">
          <thead><tr>{[en?'Created (UTC)':'Tạo lúc (UTC)',en?'Account':'Tài khoản',en?'Plan / version':'Gói / phiên bản',en?'Amount':'Số tiền',en?'Status':'Trạng thái',en?'Details':'Chi tiết'].map(h=><th key={h}>{h}</th>)}</tr></thead>
          <tbody>{current.data.content.map(x=><tr key={x.paymentId}>
            <td>{date(x.createdAt)}</td><td>{x.accountEmail}</td><td>{x.planCode} / v{x.catalogVersion}</td>
            <td>{money(x.amountVnd)}</td><td>{textStatus(x.status)}</td>
            <td><button type="button" onClick={()=>view(x.paymentId)} aria-label={(en?'View transaction ':'Xem giao dịch ')+x.checkoutReference}>{en?'View':'Xem'}</button></td>
          </tr>)}</tbody></table></div></div>}
      <div className="lv-payment-pagination">
        <button type="button" disabled={filters.page===0} onClick={()=>change({...filters,page:filters.page-1})}>{en?'Previous':'Trước'}</button>
        <span>{current.data.totalPages===0?0:filters.page+1} / {current.data.totalPages}</span>
        <button type="button" disabled={filters.page+1>=current.data.totalPages} onClick={()=>change({...filters,page:filters.page+1})}>{en?'Next':'Sau'}</button>
        <label>{en?'Rows':'Số dòng'}<select value={filters.size} onChange={e=>change({...filters,page:0,size:Number(e.target.value)})}>{[20,50,100].map(n=><option key={n}>{n}</option>)}</select></label>
      </div>
    </>}
    {selected&&<div className="lv-payment-overlay"><section role="dialog" aria-modal="true" aria-labelledby="payment-detail-title" className="lv-payment-detail" ref={modal} tabIndex={-1}>
      <h2 id="payment-detail-title">{en?'Transaction details':'Chi tiết giao dịch'}</h2>
      <button type="button" onClick={close}>{en?'Close':'Đóng'}</button>
      {!selected.data&&!selected.error&&<p role="status">{en?'Loading…':'Đang tải…'}</p>}
      {selected.error&&<p role="alert">{errorText(selected.error)}</p>}
      {selected.data&&<dl>{[
        [en?'Payment ID':'Mã giao dịch',selected.data.paymentId],
        [en?'Account':'Tài khoản',selected.data.accountEmail],
        [en?'Account ID':'Mã tài khoản',selected.data.accountId],
        [en?'Plan / version':'Gói / phiên bản',`${selected.data.planCode} / v${selected.data.catalogVersion}`],
        [en?'Amount':'Số tiền',money(selected.data.amountVnd)],
        [en?'Billing':'Thanh toán',en?'One-time / lifetime':'Một lần / trọn đời'],
        [en?'Status':'Trạng thái',textStatus(selected.data.status)],
        [en?'Created':'Khởi tạo',date(selected.data.createdAt)],
        [en?'Expires':'Hết hạn',date(selected.data.expiresAt)],
        [en?'Completed':'Hoàn tất',date(selected.data.completedAt)],
        [en?'Checkout reference':'Mã tham chiếu',selected.data.checkoutReference],
        [en?'Gateway reference':'Mã cổng thanh toán',selected.data.gatewayReference||'—'],
        [en?'Asset limit':'Hạn mức tài sản',selected.data.limits.assetCount],
        [en?'Storage limit':'Hạn mức dung lượng',formatBytes(selected.data.limits.storageBytes)],
        [en?'File limit':'Giới hạn tệp',formatBytes(selected.data.limits.fileBytes)],
      ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
    </section></div>}
  </section>;
}
