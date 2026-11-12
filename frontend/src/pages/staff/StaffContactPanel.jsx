import { useEffect, useRef, useState } from 'react';
import { Phone, Mail, Copy, Check, UserRound, UsersRound, ChevronDown, ClipboardPen, AlertTriangle, RefreshCw } from 'lucide-react';
import { CONTACT_CHANNELS, CONTACT_OUTCOMES, CONTACT_FALLBACKS, fetchCaseContacts, recordTrusteeContact } from './staffContactService.js';
import { workflowFailure } from '../../utils/workflowFeedback.js';
import './StaffContactPanel.css';

/** Nhãn (vi, en) của kênh liên hệ: điện thoại, email, trực tiếp, khác. */
const CHANNELS = { PHONE: ['Điện thoại', 'Phone'], EMAIL: ['Email', 'Email'], IN_PERSON: ['Trực tiếp', 'In person'], OTHER: ['Khác', 'Other'] };
/** Nhãn (vi, en) kết quả một lần liên hệ: đã liên hệ được, chưa phản hồi, sai số/email. */
const OUTCOMES = {
  CONTACTED: ['Đã liên hệ được', 'Reached'], NO_RESPONSE: ['Chưa phản hồi', 'No response'], INVALID_CONTACT: ['Sai số hoặc email', 'Invalid contact'],
};
/** Nhãn (vi, en) trạng thái phương án dự phòng khi không liên hệ được người thi hành. */
const FALLBACKS = {
  NOT_REQUIRED: ['Chưa cần phương án dự phòng', 'No fallback needed'], REQUIRED: ['Cần phương án dự phòng', 'Fallback required'],
  IN_PROGRESS: ['Đang thực hiện dự phòng', 'Fallback in progress'], COMPLETED: ['Đã xử lý dự phòng', 'Fallback completed'],
};
/** Nhãn (vi, en) và lớp CSS của trạng thái liên hệ tổng hợp của một người, suy ra từ lần liên hệ gần nhất. */
const STATUS = {
  NOT_CONTACTED: ['Chưa liên hệ', 'Not contacted', 'is-waiting'],
  CONTACTED: ['Đã liên hệ', 'Contacted', 'is-done'],
  NO_RESPONSE: ['Chưa phản hồi', 'No response', 'is-muted'],
  INVALID_CONTACT: ['Sai thông tin', 'Invalid contact', 'is-bad'],
};

/** Lấy chữ cái đầu của hai từ cuối trong họ tên để làm avatar. */
const initials = name => name.trim().split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase();
/** Định dạng thời điểm theo múi giờ Asia/Ho_Chi_Minh (ngày/tháng giờ:phút) theo ngôn ngữ vi hoặc en. */
const stamp = (value, en) => new Date(value).toLocaleString(en ? 'en-GB' : 'vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});
/** Giá trị khởi tạo của biểu mẫu ghi nhận một lần liên hệ (kênh điện thoại, kết quả đã liên hệ, không cần dự phòng). */
const blankDraft = { channel: 'PHONE', outcome: 'CONTACTED', fallbackStatus: 'NOT_REQUIRED', note: '' };
/** Trạng thái liên hệ hiện tại của một người: kết quả của lần liên hệ mới nhất hoặc `NOT_CONTACTED`. */
const statusOf = person => person.contacts[0]?.outcome || 'NOT_CONTACTED';

/**
 * Bảng liên hệ trước khi tiếp nhận hồ sơ: liệt kê những người Staff phải liên hệ trên hồ sơ đã được giao
 * (người thi hành được chỉ định trước, sau đó là người thụ hưởng), cùng nhật ký các lần liên hệ.
 * Dữ liệu đọc từ `GET /api/v1/staff/verification-cases/{caseId}/contacts` (`fetchCaseContacts`); chỉ tải khi
 * `assigned` khác true (hồ sơ chưa được nhận thì không đọc và không coi là lỗi). Với người thi hành (`canRecord`),
 * Staff mở biểu mẫu để ghi nhận kênh, kết quả, phương án dự phòng và ghi chú (tối đa 500 ký tự) qua
 * `POST /api/v1/staff/trustees/{trusteeId}/contact-outcomes` (`recordTrusteeContact`, lịch sử chỉ thêm, không sửa).
 * Nếu mọi người ghi nhận được đều đã thử liên hệ mà không ai phản hồi thì cảnh báo cần chọn phương án dự phòng.
 * Có nút sao chép số điện thoại/email và nút tải lại. Lỗi 401 gọi `onUnauthorized`. Được dùng trong `StaffLiveCase.jsx`.
 *
 * @param {object} props
 * @param {string} props.caseId id hồ sơ xác minh.
 * @param {string} props.accessToken JWT của staff.
 * @param {'vi'|'en'} [props.lang='vi'] ngôn ngữ.
 * @param {Function} [props.onUnauthorized] gọi khi API trả 401.
 * @param {boolean} [props.assigned=true] hồ sơ đã được giao cho Staff hiện tại hay chưa.
 * @returns {JSX.Element}
 */
export default function StaffContactPanel({ caseId, accessToken, lang = 'vi', onUnauthorized, assigned = true }) {
  const en = lang === 'en';
  const [people, setPeople] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [openId, setOpenId] = useState(null);
  const [copied, setCopied] = useState('');
  const [draft, setDraft] = useState(blankDraft);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const auth = useRef(onUnauthorized);
  const saveLock = useRef(false);
  useEffect(() => { auth.current = onUnauthorized; }, [onUnauthorized]);

  // The server shows contacts only on a case assigned to this Staff, so an unassigned case is not read (and not an error).
  useEffect(() => {
    if (assigned !== true) return undefined;
    const controller = new AbortController();
    fetchCaseContacts(caseId, { accessToken, lang, signal: controller.signal })
      .then(list => { if (!controller.signal.aborted) { setPeople(list); setError(null); } })
      .catch(failure => {
        if (controller.signal.aborted) return;
        setError(failure);
        if (failure.status === 401) auth.current?.();
      });
    return () => controller.abort();
  }, [caseId, accessToken, lang, attempt, assigned]);

  const pick = (map, key) => map[key]?.[en ? 1 : 0] ?? key;
  const recordable = (people || []).filter(person => person.canRecord);
  const reached = recordable.filter(person => statusOf(person) === 'CONTACTED').length;
  const attempted = recordable.filter(person => statusOf(person) !== 'NOT_CONTACTED').length;
  // Everyone who can be logged was tried and nobody answered: Staff must choose a fallback.
  const nobodyReached = recordable.length > 0 && attempted === recordable.length && reached === 0;

  /** Sao chép giá trị liên hệ vào clipboard và hiện nhãn "Đã chép" trong 1,6 giây. */
  async function copy(value, key) {
    try { await navigator.clipboard.writeText(value); setCopied(key); setTimeout(() => setCopied(current => (current === key ? '' : current)), 1600); } catch { setCopied(''); }
  }
  /** Mở/đóng biểu mẫu ghi nhận liên hệ của một người; luôn đặt lại bản nháp và lỗi lưu. */
  function toggle(id) { setOpenId(current => (current === id ? null : id)); setDraft(blankDraft); setSaveError(null); }
  /** Đổi kết quả liên hệ; tự gợi ý phương án dự phòng (đã liên hệ được thì không cần, ngược lại mặc định là cần). */
  function setOutcome(outcome) {
    setDraft(current => ({
      ...current, outcome,
      fallbackStatus: outcome === 'CONTACTED' ? 'NOT_REQUIRED' : current.fallbackStatus === 'NOT_REQUIRED' ? 'REQUIRED' : current.fallbackStatus,
    }));
  }
  /** Lưu một lần liên hệ với người thi hành (có khóa chống bấm trùng), đóng biểu mẫu và tải lại danh sách khi thành công. */
  async function save(person) {
    if (saveLock.current) return;
    saveLock.current = true; setSaving(true); setSaveError(null);
    try {
      await recordTrusteeContact(person.id, draft, { accessToken, lang });
      setOpenId(null); setDraft(blankDraft); setAttempt(value => value + 1);
    } catch (failure) {
      setSaveError(failure);
      if (failure.status === 401) auth.current?.();
    } finally { saveLock.current = false; setSaving(false); }
  }

  const failure = error ? workflowFailure(error, lang) : null;
  return <section className="lv-contact" aria-labelledby="contact-heading" aria-busy={!people && !error}>
    <div className="lv-contact__head">
      <h2 id="contact-heading">{en ? 'Contact before intake' : 'Liên hệ trước khi tiếp nhận'}</h2>
      {people && recordable.length > 0 && <span className={`lv-contact__summary${reached < recordable.length ? ' is-waiting' : ' is-done'}`}>
        {en ? `${reached}/${recordable.length} reached` : `${reached}/${recordable.length} đã liên hệ được`}</span>}
      <button type="button" className="lv-contact__reload" onClick={() => setAttempt(value => value + 1)} disabled={saving}>
        <RefreshCw size={16} aria-hidden="true" />{en ? 'Reload' : 'Tải lại'}</button>
    </div>
    {assigned === false && <p className="lv-contact__empty" role="status">
      {en ? 'Claim the case to see who to contact' : 'Nhận hồ sơ để xem thông tin liên hệ'}</p>}
    {assigned !== false && !people && !error && <p role="status">{en ? 'Loading contacts…' : 'Đang tải danh sách liên hệ…'}</p>}
    {error && <div className="lv-contact__alert" role="alert"><AlertTriangle size={22} aria-hidden="true" />
      <div><strong>{failure.title}</strong><span>{failure.description}</span></div></div>}
    {people && people.length === 0 && <p className="lv-contact__empty" role="status">
      {en ? 'This case has no executor or beneficiary yet' : 'Hồ sơ chưa có người thi hành hoặc người thụ hưởng'}</p>}
    {nobodyReached && <div className="lv-contact__alert" role="alert">
      <AlertTriangle size={22} aria-hidden="true" />
      <div><strong>{en ? 'No one could be reached' : 'Chưa liên hệ được ai'}</strong>
        <span>{en ? 'Choose a fallback for the case.' : 'Cần chọn phương án dự phòng cho hồ sơ.'}</span></div>
    </div>}
    {people && <ul className="lv-contact__list">
      {people.map(person => {
        const [statusVi, statusEn, tone] = STATUS[statusOf(person)];
        const Icon = person.kind === 'TRUSTEE' ? UserRound : UsersRound;
        const open = openId === person.id;
        const last = person.contacts[0];
        const channels = [['phone', person.phone, Phone, `tel:${(person.phone || '').replace(/\s/g, '')}`], ['email', person.email, Mail, `mailto:${person.email}`]].filter(item => item[1]);
        return <li key={`${person.kind}:${person.id}`} className="lv-contact__card">
          <div className="lv-contact__who">
            <span className="lv-contact__avatar" aria-hidden="true">{initials(person.fullName)}</span>
            <div>
              <strong>{person.fullName}</strong>
              <span className="lv-contact__role"><Icon size={16} aria-hidden="true" />{person.kind === 'TRUSTEE' ? (en ? 'Executor' : 'Người thi hành') : (en ? 'Beneficiary' : 'Người thụ hưởng')}{person.relationship ? ` · ${person.relationship}` : ''}</span>
            </div>
            {person.canRecord && <span className={`lv-contact__status ${tone}`}>{en ? statusEn : statusVi}</span>}
          </div>
          <div className="lv-contact__channels">
            {channels.length === 0 && <p className="lv-contact__none">{en ? 'No phone or email on file' : 'Chưa có số điện thoại hoặc email'}</p>}
            {channels.map(([kind, value, ChannelIcon, href]) => <div key={kind} className="lv-contact__channel">
              <ChannelIcon size={18} aria-hidden="true" />
              <a href={href}>{value}</a>
              <button type="button" className="lv-contact__copy" onClick={() => copy(value, `${person.id}:${kind}`)} aria-label={en ? `Copy ${value}` : `Sao chép ${value}`}>
                {copied === `${person.id}:${kind}` ? <><Check size={16} aria-hidden="true" />{en ? 'Copied' : 'Đã chép'}</> : <><Copy size={16} aria-hidden="true" />{en ? 'Copy' : 'Chép'}</>}
              </button>
            </div>)}
          </div>
          {person.canRecord && <div className="lv-contact__foot">
            {last && <p className="lv-contact__last">{stamp(last.occurredAt, en)} · {pick(CHANNELS, last.channel)} · {pick(OUTCOMES, last.outcome)}{last.note ? ` · ${last.note}` : ''}</p>}
            <button type="button" className="lv-contact__record" aria-expanded={open} onClick={() => toggle(person.id)}>
              <ClipboardPen size={16} aria-hidden="true" />{en ? 'Log a contact' : 'Ghi nhận liên hệ'}<ChevronDown size={16} className="lv-contact__chevron" aria-hidden="true" />
            </button>
          </div>}
          {open && <form className="lv-contact__form" onSubmit={event => { event.preventDefault(); save(person); }}>
            <label>{en ? 'Channel' : 'Kênh liên hệ'}
              <select value={draft.channel} onChange={event => setDraft({ ...draft, channel: event.target.value })} disabled={saving}>
                {CONTACT_CHANNELS.map(key => <option key={key} value={key}>{pick(CHANNELS, key)}</option>)}
              </select></label>
            <label>{en ? 'Result' : 'Kết quả'}
              <select value={draft.outcome} onChange={event => setOutcome(event.target.value)} disabled={saving}>
                {CONTACT_OUTCOMES.map(key => <option key={key} value={key}>{pick(OUTCOMES, key)}</option>)}
              </select></label>
            {draft.outcome !== 'CONTACTED' && <label className="lv-contact__wide">{en ? 'Fallback' : 'Phương án dự phòng'}
              <select value={draft.fallbackStatus} onChange={event => setDraft({ ...draft, fallbackStatus: event.target.value })} disabled={saving}>
                {CONTACT_FALLBACKS.map(key => <option key={key} value={key}>{pick(FALLBACKS, key)}</option>)}
              </select></label>}
            <label className="lv-contact__wide">{en ? 'Note' : 'Ghi chú'}
              <textarea maxLength={500} value={draft.note} placeholder={en ? 'What was agreed' : 'Nội dung đã trao đổi'} disabled={saving} onChange={event => setDraft({ ...draft, note: event.target.value })} /></label>
            {saveError && <p className="lv-contact__error lv-contact__wide" role="alert">{workflowFailure(saveError, lang).description}</p>}
            <div className="lv-contact__actions lv-contact__wide">
              <button type="submit" className="lv-contact__save" disabled={saving}>{en ? 'Save' : 'Lưu'}</button>
              <button type="button" onClick={() => toggle(person.id)} disabled={saving}>{en ? 'Cancel' : 'Hủy'}</button>
            </div>
          </form>}
          {person.contacts.length > 1 && <details className="lv-contact__history">
            <summary>{en ? `History (${person.contacts.length})` : `Lịch sử (${person.contacts.length})`}</summary>
            <ol>{person.contacts.map(item => <li key={item.id}><span>{stamp(item.occurredAt, en)}</span> · {pick(CHANNELS, item.channel)} · {pick(OUTCOMES, item.outcome)}{item.fallbackStatus && item.fallbackStatus !== 'NOT_REQUIRED' ? ` · ${pick(FALLBACKS, item.fallbackStatus)}` : ''}{item.note ? ` · ${item.note}` : ''}</li>)}</ol>
          </details>}
        </li>;
      })}
    </ul>}
  </section>;
}
