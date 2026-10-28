import { useState, useEffect } from 'react';
import { describeUnlock, fetchControlledUnlock } from './controlledUnlockService.js';
import { trackOwnerSurface } from '../../components/layout/ownerSurfaceMotion.js';
import '../../components/layout/OwnerSurfaces.css';
import './ControlledUnlockPage.css';
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
