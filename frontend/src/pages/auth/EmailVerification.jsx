import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {loadEmailVerification, sendEmailVerification, confirmEmailVerification, readEmailCredential, emailVerificationMessage} from '../../services/emailVerificationService.js';
import './EmailVerification.css';

export function EmailVerificationPanel({session, lang = 'vi'}) {
  return <EmailStatus key={JSON.stringify([session?.user?.id,session?.accessToken,session?.user?.email,lang])} session={session} lang={lang} />;
}
function EmailStatus({session,lang}) {
  const en=lang==='en', [data,setData]=useState(null),[error,setError]=useState(null),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false),[queued,setQueued]=useState(false),[cooldown,setCooldown]=useState(0);
  const write=useRef(null),lock=useRef(false);
  useEffect(()=>{const c=new AbortController(); if(!session?.accessToken)return;loadEmailVerification({accessToken:session.accessToken,lang,signal:c.signal}).then(value=>{if(!c.signal.aborted){setData(value);setError(null);}}).catch(e=>{if(!c.signal.aborted)setError(e);});return()=>c.abort();},[session?.accessToken,lang,attempt]);
  useEffect(()=>()=>write.current?.abort(),[]);
  useEffect(()=>{if(!cooldown)return;const id=setTimeout(()=>setCooldown(value=>value-1),1000);return()=>clearTimeout(id);},[cooldown]);
  async function send(){if(lock.current||cooldown||!data?.requestAvailable)return;lock.current=true;setBusy(true);setError(null);const c=new AbortController();write.current=c;try{await sendEmailVerification({accessToken:session.accessToken,lang,signal:c.signal});if(!c.signal.aborted){setQueued(true);setCooldown(60);setAttempt(x=>x+1);}}catch(e){if(!c.signal.aborted){setError(e);if(e.status===429)setCooldown(900);}}finally{if(!c.signal.aborted){lock.current=false;setBusy(false);}}}
  return <section className="lv-email-verification" aria-busy={busy}><h2>{en?'Email verification':'Xác minh email'}</h2><p>{session?.user?.email}</p>
    {data && <p role="status">{data.verified?(en?'Email verified':'Email đã xác minh'):(en?'Email not verified':'Email chưa xác minh')}</p>}
    {queued && <p role="status">{en?'Request queued. Check your inbox when the message arrives; queuing does not verify your email.':'Yêu cầu đã được xếp hàng. Kiểm tra hộp thư khi nhận được email; gửi yêu cầu chưa có nghĩa email đã xác minh.'}</p>}
    {error && <p role="alert">{emailVerificationMessage(error,en)}</p>}
    {!data && !error && <p role="status">{en?'Loading status…':'Đang tải trạng thái…'}</p>}
    {data && !data.verified && !data.requestAvailable && <p>{en?'Sending is unavailable for this account or email service.':'Tài khoản hoặc dịch vụ hiện chưa cho phép gửi email xác minh.'}</p>}
    <div><button type="button" onClick={()=>setAttempt(x=>x+1)} disabled={busy}>{en?'Refresh status':'Cập nhật trạng thái'}</button>{data && !data.verified && <button type="button" className="is-primary" disabled={busy||cooldown>0||!data.requestAvailable} onClick={send}>{cooldown?`${en?'Retry in':'Thử lại sau'} ${cooldown}s`:(en?'Send verification email':'Gửi email xác minh')}</button>}</div>
  </section>;
}
export default function VerifyEmailPage({session,lang='vi'}) {
  const en=lang==='en',[credential,setCredential]=useState(()=>readEmailCredential(window.location.hash)),[status,setStatus]=useState('ready'),[error,setError]=useState(null);
  const controller=useRef(null),lock=useRef(false);
  useLayoutEffect(()=>{window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);},[]);
  useEffect(()=>()=>controller.current?.abort(),[]);
  async function confirm(){if(lock.current||!credential)return;lock.current=true;setStatus('pending');setError(null);const c=new AbortController();controller.current=c;try{await confirmEmailVerification(credential,{lang,signal:c.signal});if(!c.signal.aborted){setCredential(null);setStatus('done');}}catch(e){if(!c.signal.aborted){setError(e);setStatus('ready');}}finally{if(!c.signal.aborted)lock.current=false;}}
  return <main className="lv-email-page"><section className="lv-email-verification"><h1>{en?'Verify your email':'Xác minh email của bạn'}</h1>
    {status==='done'?<p role="status">{en?'Your email has been verified. You can return to your account.':'Email đã được xác minh. Bạn có thể quay lại tài khoản.'}</p>:<><p>{credential?(en?'Confirm this link to verify the email address it was issued for.':'Xác nhận liên kết để xác minh địa chỉ email đã nhận thư.'):(en?'The link is missing or invalid. Request a new link from your profile.':'Liên kết thiếu hoặc không hợp lệ. Hãy yêu cầu liên kết mới từ trang tài khoản.')}</p><button type="button" className="is-primary" onClick={confirm} disabled={!credential||status==='pending'}>{en?'Confirm email':'Xác nhận email'}</button></>}
    {error && <p role="alert">{emailVerificationMessage(error,en)}</p>}<div><a href={session?'/account/profile':'/login'}>{en?'Return to account':'Quay lại tài khoản'}</a></div>
  </section>{status==='done'&&session?.accessToken&&<EmailVerificationPanel session={session} lang={lang}/>}</main>;
}
