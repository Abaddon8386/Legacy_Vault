import { invitationMessages } from './invitationMessages.js';
import './Invitations.css';

export default function InvitationEntry({ lang = 'vi', onNavigate, invitationMode = false, onCancel, registration = false, disabled = false }) {
  const t = invitationMessages[lang] || invitationMessages.vi;
  const link = label => <a href={`/invitations?lang=${lang}`} onClick={event => {
    if (!onNavigate || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); onNavigate(`/invitations?lang=${lang}`);
  }}>{label}</a>;
  return <div className="lv-invitation-entry">
    {invitationMode ? <>
      <p role="note">{registration ? t.registrationUnavailable : t.authNotice}</p>
      <p>{t.googleNotice}</p>
      {link(t.backToInvitation)}{' '}
      <button type="button" disabled={disabled} onClick={onCancel}>{t.cancelIntent}</button>
    </> : link(t.entry)}
  </div>;
}
