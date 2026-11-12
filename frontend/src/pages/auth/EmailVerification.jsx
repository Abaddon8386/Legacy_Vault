import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {CheckCircle2, AlertCircle} from 'lucide-react';
import {loadEmailVerification, sendEmailVerification, confirmEmailVerification, readEmailCredential, emailVerificationMessage} from '../../services/emailVerificationService.js';
import './EmailVerification.css';

/**
 * Khối trạng thái xác minh email của tài khoản đang đăng nhập (dùng trong `AccountProfilePage` và `VerifyEmailPage`).
 * Bọc `EmailStatus` với `key` theo user/token/email/ngôn ngữ để state được reset khi đổi phiên.
 *
 * @param {object} props
 * @param {object} props.session Phiên hiện tại ({accessToken, user}).
 * @param {'vi'|'en'} [props.lang='vi'] Ngôn ngữ.
 */
export function EmailVerificationPanel({session, lang = 'vi'}) {
  return <EmailStatus key={JSON.stringify([session?.user?.id,session?.accessToken,session?.user?.email,lang])} session={session} lang={lang} />;
}
/**
 * Nội dung khối xác minh email. Effect tải trạng thái qua `loadEmailVerification` -> `GET /api/v1/auth/email-verification`;
 * nút "Gửi lại email xác minh" gọi `sendEmailVerification` -> `POST /api/v1/auth/email-verification/requests` (202, trạng thái QUEUED),
 * có bộ đếm cooldown giữa các lần gửi và chặn gọi trùng bằng `lock`. Nút "Kiểm tra lại" tăng `attempt` để tải lại trạng thái.
 * Request ghi bị hủy khi component gỡ.
 *
 * @param {object} props `session` và `lang`.
 */
function EmailStatus({session,lang}) {
  const en=lang==='en', [data,setData]=useState(null),[error,setError]=useState(null),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false),[queued,setQueued]=useState(false),[cooldown,setCooldown]=useState(0);
  const write=useRef(null),lock=useRef(false);
  useEffect(()=>{const c=new AbortController(); if(!session?.accessToken)return;loadEmailVerification({accessToken:session.accessToken,lang,signal:c.signal}).then(value=>{if(!c.signal.aborted){setData(value);setError(null);}}).catch(e=>{if(!c.signal.aborted)setError(e);});return()=>c.abort();},[session?.accessToken,lang,attempt]);
  useEffect(()=>()=>write.current?.abort(),[]);
  useEffect(()=>{if(!cooldown)return;const id=setTimeout(()=>setCooldown(value=>value-1),1000);return()=>clearTimeout(id);},[cooldown]);
  /**
   * Gửi yêu cầu email xác minh (`POST /api/v1/auth/email-verification/requests`), bật cooldown và cờ `queued`; lỗi được hiển thị qua `emailVerificationMessage`.
   */
  async function send(){if(lock.current||cooldown||!data?.requestAvailable)return;lock.current=true;setBusy(true);setError(null);const c=new AbortController();write.current=c;try{await sendEmailVerification({accessToken:session.accessToken,lang,signal:c.signal});if(!c.signal.aborted){setQueued(true);setCooldown(60);setAttempt(x=>x+1);}}catch(e){if(!c.signal.aborted){setError(e);if(e.status===429)setCooldown(900);}}finally{if(!c.signal.aborted){lock.current=false;setBusy(false);}}}
  return <section className="lv-email-verification" aria-busy={busy}><h2>{en?'Email verification':'Xác minh email'}</h2><p>{session?.user?.email}</p>
    {data && <p role="status" className={`lv-email-status-badge ${data.verified ? 'is-verified' : 'is-unverified'}`}>
      {data.verified ? <CheckCircle2 size={16} className="is-verified" aria-hidden="true" /> : <AlertCircle size={16} className="is-unverified" aria-hidden="true" />}
      <span>{data.verified ? (en ? 'Email verified' : 'Email đã xác minh') : (en ? 'Email not verified' : 'Email chưa xác minh')}</span>
    </p>}
    {queued && <p role="status">{en?'Request queued. Check your inbox when the message arrives; queuing does not verify your email.':'Yêu cầu đã được xếp hàng. Kiểm tra hộp thư khi nhận được email; gửi yêu cầu chưa có nghĩa email đã xác minh.'}</p>}
    {error && <p role="alert">{emailVerificationMessage(error,en)}</p>}
    {!data && !error && <p role="status">{en?'Loading status…':'Đang tải trạng thái…'}</p>}
    {data && !data.verified && !data.requestAvailable && <p>{en?'Sending is unavailable for this account or email service.':'Tài khoản hoặc dịch vụ hiện chưa cho phép gửi email xác minh.'}</p>}
    <div className="lv-email-actions">
      <button type="button" className="lv-btn-ghost lv-btn-recheck" onClick={()=>setAttempt(x=>x+1)} disabled={busy}>
        {en ? (data?.verified ? 'Check status again' : 'Refresh status') : 'Kiểm tra lại trạng thái'}
      </button>
      {data && !data.verified && (
        <button type="button" className="is-primary lv-btn-verify-now" disabled={busy||cooldown>0||!data.requestAvailable} onClick={send}>
          {cooldown ? `${en ? 'Retry in' : 'Thử lại sau'} ${cooldown}s` : (en ? 'Resend verification email' : 'Gửi lại email xác minh')}
        </button>
      )}
    </div>
  </section>;
}
/**
 * Trang công khai `/verify-email` mở từ liên kết trong email. Đọc mã xác minh từ URL fragment (`readEmailCredential`) rồi xóa fragment khỏi lịch sử
 * bằng `history.replaceState` để mã không bị lộ. Người dùng bấm xác nhận sẽ gọi `confirmEmailVerification` -> `POST /api/v1/auth/email-verification/confirm`
 * (body `{credential}`, không dùng Bearer). Thành công thì hiện thông báo và, nếu đang đăng nhập, hiển thị `EmailVerificationPanel`.
 * Được `App.jsx` render khi path là `/verify-email`.
 *
 * @param {object} props
 * @param {object|null} props.session Phiên hiện tại hoặc null.
 * @param {'vi'|'en'} [props.lang='vi'] Ngôn ngữ.
 */
export default function VerifyEmailPage({session,lang='vi'}) {
  const en=lang==='en',[credential,setCredential]=useState(()=>readEmailCredential(window.location.hash)),[status,setStatus]=useState('ready'),[error,setError]=useState(null);
  const controller=useRef(null),lock=useRef(false);
  useLayoutEffect(()=>{window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);},[]);
  useEffect(()=>()=>controller.current?.abort(),[]);
  /**
   * Xác nhận email bằng mã trong liên kết (`POST /api/v1/auth/email-verification/confirm`); chặn gọi trùng bằng `lock`, hủy được bằng AbortController.
   */
  async function confirm(){if(lock.current||!credential)return;lock.current=true;setStatus('pending');setError(null);const c=new AbortController();controller.current=c;try{await confirmEmailVerification(credential,{lang,signal:c.signal});if(!c.signal.aborted){setCredential(null);setStatus('done');}}catch(e){if(!c.signal.aborted){setError(e);setStatus('ready');}}finally{if(!c.signal.aborted)lock.current=false;}}
  return <main className="lv-email-page"><section className="lv-email-verification"><h1>{en?'Verify your email':'Xác minh email của bạn'}</h1>
    {status==='done'?<p role="status">{en?'Your email has been verified. You can return to your account.':'Email đã được xác minh. Bạn có thể quay lại tài khoản.'}</p>:<><p>{credential?(en?'Confirm this link to verify the email address it was issued for.':'Xác nhận liên kết để xác minh địa chỉ email đã nhận thư.'):(en?'The link is missing or invalid. Request a new link from your profile.':'Liên kết thiếu hoặc không hợp lệ. Hãy yêu cầu liên kết mới từ trang tài khoản.')}</p><button type="button" className="is-primary" onClick={confirm} disabled={!credential||status==='pending'}>{en?'Confirm email':'Xác nhận email'}</button></>}
    {error && <p role="alert">{emailVerificationMessage(error,en)}</p>}<div><a href={session?'/account/profile':'/login'}>{en?'Return to account':'Quay lại tài khoản'}</a></div>
  </section>{status==='done'&&session?.accessToken&&<EmailVerificationPanel session={session} lang={lang}/>}</main>;
}
