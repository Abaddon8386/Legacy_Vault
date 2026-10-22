import { useEffect, useRef, useState } from 'react';
import { fetchInvitationMailStatus } from './invitationMailService.js';

function MailStatus({ caseId, beneficiaryId, accessToken, lang, receipt, onError }) {
  const en=lang==='en';
  const [status,setStatus]=useState(receipt || null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(null);
  const pending=useRef(null);
  useEffect(()=>()=>pending.current?.abort(),[]);
  async function refresh() {
    if(pending.current)return;
    const controller=new AbortController();pending.current=controller;setBusy(true);setError(null);
    try {
      const result=await fetchInvitationMailStatus(caseId,beneficiaryId,{accessToken,lang,signal:controller.signal});
      if(!controller.signal.aborted)setStatus(result);
    }catch(failure){if(!controller.signal.aborted){setStatus(null);setError(failure.status===404?'missing':'error');if([401,403].includes(failure.status))onError?.(failure);}}
    finally{if(pending.current===controller){pending.current=null;if(!controller.signal.aborted)setBusy(false);}}
  }
  const labels={
    QUEUED:en?'Invitation email queued; not yet accepted by the provider.':'Email lời mời đã xếp hàng; dịch vụ gửi chưa tiếp nhận.',
    CLAIMED:en?'Preparing invitation email.':'Đang chuẩn bị email lời mời.',
    SENDING:en?'Submitting invitation email to the provider.':'Đang chuyển email lời mời tới dịch vụ gửi.',
    ACCEPTED:en?'Email provider accepted the invitation. Inbox delivery is not confirmed; ask the recipient to check spam too.':'Dịch vụ gửi đã tiếp nhận lời mời. Chưa xác nhận đã vào hộp thư; nhắc người nhận kiểm tra cả thư rác.',
    FAILED:en?'Email submission failed. Check the mail service configuration; repeated clicks do not resend this invitation.':'Gửi email thất bại. Cần kiểm tra cấu hình dịch vụ; bấm lặp không gửi lại lời mời này.',
    UNKNOWN:en?'The send result is unknown. Check the provider before resending to avoid duplicate mail.':'Chưa xác định kết quả gửi. Cần kiểm tra dịch vụ trước khi gửi lại để tránh thư trùng.',
    SKIPPED:en?'Email was not sent because the invitation or sending conditions are no longer valid.':'Email không được gửi vì lời mời hoặc điều kiện gửi không còn hợp lệ.',
  };
  return <div className="lv-invitation-mail-status">
    {status && <p role="status">{status.transportStatus==='DISABLED' && status.queueStatus==='QUEUED'
      ?(en?'Invitation is queued, but email delivery is disabled.':'Lời mời đã xếp hàng nhưng chức năng gửi email đang tắt.') :labels[status.queueStatus]}</p>}
    {error && <p role="alert">{error==='missing'?(en?'No email request was found for the current invitation.':'Chưa có yêu cầu gửi email cho lời mời hiện tại.'):(en?'Unable to check email status. Please retry.':'Không thể kiểm tra trạng thái email. Vui lòng thử lại.')}</p>}
    <button type="button" onClick={refresh} disabled={busy}>{busy?(en?'Checking…':'Đang kiểm tra…'):(en?'Check email status':'Kiểm tra trạng thái email')}</button>
  </div>;
}

export default function InvitationMailStatus(props) {
  return <MailStatus key={JSON.stringify([props.accessToken,props.caseId,props.beneficiaryId,props.receipt?.outboxId])} {...props} />;
}
