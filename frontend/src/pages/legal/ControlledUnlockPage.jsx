import { useState, useEffect } from 'react';
import { describeUnlock, fetchControlledUnlock } from './controlledUnlockService.js';
import { trackOwnerSurface } from '../../components/layout/ownerSurfaceMotion.js';
import '../../components/layout/OwnerSurfaces.css';
import './ControlledUnlockPage.css';
/**
 * Trang "Trạng thái mở khóa kho di sản" (Controlled unlock) dành cho vai trò Legal/Staff, được App.jsx render khi ở chế độ xem trước (preview) hoặc đã đăng nhập.
 * Cách hoạt động: mỗi khi đổi kịch bản/accessToken, gọi fetchControlledUnlock() trong useEffect (có cờ active để bỏ kết quả cũ),
 * rồi describeUnlock() chuyển dữ liệu thành mô hình hiển thị (LOCKED / UNLOCKED / UNKNOWN, có phải mô phỏng hay không).
 * Hiện chưa gọi API backend thật (fetchControlledUnlock luôn báo BACKEND_NOT_READY ngoài chế độ dev preview).
 *
 * @param {object} props
 * @param {boolean} [props.isDevPreview=false] Bật chế độ xem trước với dữ liệu mẫu.
 * @param {string} [props.accessToken] JWT của phiên đăng nhập; nếu có thì không dùng dữ liệu mẫu.
 * @param {'vi'|'en'} [props.lang='vi'] Ngôn ngữ giao diện.
 * @param {(lang: string) => void} [props.onToggleLang] Callback đổi ngôn ngữ.
 * @returns {JSX.Element} Thẻ main hiển thị trạng thái khóa/mở khóa của kho.
 */
export default function ControlledUnlockPage({ isDevPreview = false, accessToken, lang = 'vi', onToggleLang }) {
  const en = lang === 'en';
  const [scenario, setScenario] = useState('locked');
  const [state, setState] = useState(null);
  const key = `${scenario}|${accessToken || ''}|${isDevPreview}`;
  const current = state?.key === key ? state : null;
  useEffect(() => {
    let active = true;
    fetchControlledUnlock({ isDevPreview, accessToken, scenario }).then(data => { if (active) setState({ key, data }); }).catch(() => { if (active) setState({ key, error: true }); });
    return () => { active = false; };
  }, [key, isDevPreview, accessToken, scenario]);
  const model = describeUnlock(current?.data, { isSimulation: isDevPreview && !accessToken });
  return <main className="lv-controlled-unlock lv-legal-surfaces" onPointerMove={trackOwnerSurface}><header><h1>{en ? 'Controlled vault unlock' : 'Trạng thái mở khóa kho di sản'}</h1><button onClick={() => onToggleLang?.(en ? 'vi' : 'en')}>{en ? 'Tiếng Việt' : 'English'}</button></header>
    {isDevPreview && !accessToken && <section><p>{en ? 'Sample view — the vault status shown here is for demonstration.' : 'Bản minh họa — trạng thái kho hiển thị ở đây là dữ liệu mẫu.'}</p><label>{en ? 'Preview scenario' : 'Kịch bản xem trước'}<select value={scenario} onChange={event => setScenario(event.target.value)}><option value="locked">{en ? 'Locked' : 'Đang khóa'}</option><option value="unlocked">{en ? 'Simulated unlocked' : 'Mở khóa mô phỏng'}</option></select></label></section>}
    <section className="lv-surface-card"><h2>{en ? 'Vault status' : 'Trạng thái kho'}</h2>{!current ? <p role="status">{en ? 'Loading…' : 'Đang tải…'}</p> : current.error ? <p role="alert">{en ? 'The vault status could not be loaded. Please try again later.' : 'Chưa tải được trạng thái kho. Vui lòng thử lại sau.'}</p> : <><p role="status">{model.status === 'UNLOCKED' ? (en ? 'Unlocked (sample)' : 'Đã mở khóa (minh họa)') : (en ? 'Locked' : 'Đang khóa')}</p><p>{en ? 'Confirmation source: ' : 'Nguồn xác nhận: '}{model.source ? (en ? 'Synthetic preview data' : 'Dữ liệu xem trước mô phỏng') : (en ? 'Awaiting confirmation' : 'Chờ xác nhận')}</p></>}
    <p>{en ? 'Unlocking requires a valid legal approval. An unanswered activity check or a death document alone is not enough.' : 'Chỉ phê duyệt pháp lý còn hiệu lực mới cho phép mở khóa. Việc chủ kho chưa phản hồi hoặc chỉ có giấy tờ khai tử chưa đủ điều kiện.'}</p></section></main>;
}
