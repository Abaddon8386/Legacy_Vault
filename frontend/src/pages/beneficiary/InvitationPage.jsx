import { useEffect, useRef, useState } from 'react';
import { readUser } from '../../api/contracts.js';
import { invitationErrorKey, invitationMessages } from '../../components/invitations/invitationMessages.js';
import '../../components/invitations/Invitations.css';

function InvitationForm({ user, initialCode = '', lang = 'vi', onToggleLang, onAuthenticate, onClearCode,
  onAcceptInvitation, onRefreshAccount, onConfirmed, onContinue }) {
  const t = invitationMessages[lang] || invitationMessages.vi;
  const [code, setCode] = useState(initialCode), [required, setRequired] = useState(false);
  const [phase, setPhase] = useState('idle'), [errorKey, setErrorKey] = useState(null);
  const [linkAccepted, setLinkAccepted] = useState(false);
  const accepted = useRef(false), pending = useRef(false), request = useRef(null), inputRef = useRef(null);
  const busy = phase === 'pending';
  const available = typeof onAcceptInvitation === 'function' && typeof onRefreshAccount === 'function';
  useEffect(() => { inputRef.current?.focus(); return () => request.current?.abort(); }, []);
  function authenticate(kind) {
    if (!code.trim()) { setRequired(true); inputRef.current?.focus(); return; }
    onAuthenticate?.(kind, code);
  }
  async function submit(event) {
    event.preventDefault();
    if (pending.current || !user || !available) return;
    if (!accepted.current && !code.trim()) { setRequired(true); inputRef.current?.focus(); return; }
    pending.current = true; setPhase('pending'); setErrorKey(null);
    const controller = new AbortController(); request.current = controller;
    try {
      if (!accepted.current) {
        // Ignore roles or other account data returned by an invitation operation.
        await onAcceptInvitation({ code }, { signal: controller.signal });
        if (controller.signal.aborted) return;
        accepted.current = true; setLinkAccepted(true); setCode(''); onClearCode?.();
      }
      const confirmedUser = readUser(await onRefreshAccount({ signal: controller.signal }));
      if (controller.signal.aborted) return;
      if (confirmedUser.id !== user.id || !confirmedUser.roles.includes('BENEFICIARY') ||
          !user.roles.every(role => confirmedUser.roles.includes(role))) throw Error('ROLE_NOT_CONFIRMED');
      await onConfirmed?.(confirmedUser, { signal: controller.signal });
      if (!controller.signal.aborted) setPhase('success');
    } catch (error) {
      if (!controller.signal.aborted) { setErrorKey(accepted.current ? 'rolePending' : invitationErrorKey(error)); setPhase('error'); }
    } finally { if (request.current === controller) { pending.current = false; request.current = null; } }
  }
  return <main className="lv-invitation-page">
    <section className="lv-invitation-card" aria-labelledby="invitation-title">
      <header><a href="/">LegacyVault</a><div role="group" aria-label={lang === 'en' ? 'Language' : 'Ngôn ngữ'}>
        {['vi', 'en'].map(value => <button key={value} type="button" aria-pressed={lang === value} onClick={() => onToggleLang?.(value)}>{value.toUpperCase()}</button>)}
      </div></header>
      <h1 id="invitation-title">{t.title}</h1>
      <p>{t.purpose}</p>
      {user && <p>{t.signedIn}: <strong>{user.fullName}</strong></p>}
      {phase === 'success' ? <>
        <p role="status">{t.success}</p><button type="button" onClick={onContinue}>{t.continue}</button>
      </> : <form onSubmit={submit} noValidate aria-busy={busy}>
        <label htmlFor="invitation-code">{t.code}</label>
        <input id="invitation-code" ref={inputRef} type="text" value={code} autoComplete="off" autoCapitalize="none" spellCheck={false}
          disabled={busy || linkAccepted} onChange={event => { setCode(event.target.value); setRequired(false); setErrorKey(null); }}
          aria-invalid={required} aria-describedby={required ? 'invitation-code-error' : undefined} />
        {required && <p id="invitation-code-error" className="lv-invitation-error" role="alert">{t.required}</p>}
        {!user ? <>
          <p>{t.signInFirst}</p>
          <button type="button" onClick={() => authenticate('login')}>{t.signIn}</button>
          <button type="button" onClick={() => authenticate('register')}>{t.register}</button>
        </> : <>
          {!available && <p className="lv-invitation-notice" role="note">{t.unavailable}</p>}
          {errorKey && <p className="lv-invitation-error" role="alert">{t[errorKey]}</p>}
          {busy && <p role="status">{t.pending}</p>}
          <button type="submit" disabled={!available || busy}>{busy ? t.pending : linkAccepted ? t.refresh : t.accept}</button>
        </>}
      </form>}
      <p className="lv-invitation-help">{t.staffHelp}</p>
      <a href="/">← {t.back}</a>
    </section>
  </main>;
}
export default function InvitationPage(props) {
  return <InvitationForm key={props.user?.id || 'anonymous'} {...props} />;
}
