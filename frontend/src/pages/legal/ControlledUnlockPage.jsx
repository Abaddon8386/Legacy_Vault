import { useState, useEffect } from 'react';
import { describeUnlock, fetchControlledUnlock } from './controlledUnlockService.js';
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
  return <main className="lv-controlled-unlock"><header><h1>{en ? 'Controlled vault unlock' : 'Trạng thái mở khóa kho di sản'}</h1><button onClick={() => onToggleLang?.(en ? 'vi' : 'en')}>{en ? 'Tiếng Việt' : 'English'}</button></header>
    {isDevPreview && !accessToken && <section><p>{en ? 'DEV preview — synthetic data; no live Backend confirmation.' : 'Xem trước DEV — dữ liệu mô phỏng, chưa có xác nhận Backend thật.'}</p><label>{en ? 'Preview scenario' : 'Kịch bản xem trước'}<select value={scenario} onChange={event => setScenario(event.target.value)}><option value="locked">{en ? 'Locked' : 'Đang khóa'}</option><option value="unlocked">{en ? 'Simulated unlocked' : 'Mở khóa mô phỏng'}</option></select></label></section>}
    <section><h2>{en ? 'Vault status' : 'Trạng thái kho'}</h2>{!current ? <p role="status">{en ? 'Loading…' : 'Đang tải…'}</p> : current.error ? <p role="alert">{en ? 'Backend service is not ready. Unlock status is unavailable.' : 'Dịch vụ Backend chưa sẵn sàng. Chưa xác định được trạng thái mở khóa.'}</p> : <><p role="status">{model.status === 'UNLOCKED' ? (en ? 'UNLOCKED (Simulated)' : 'ĐÃ MỞ KHÓA (Mô phỏng)') : (en ? 'LOCKED' : 'ĐANG KHÓA')}</p><p>{en ? 'Confirmation source: ' : 'Nguồn xác nhận: '}{model.source ? (en ? 'Synthetic preview data' : 'Dữ liệu xem trước mô phỏng') : (en ? 'Awaiting Backend confirmation' : 'Chờ Backend xác nhận')}</p></>}
    <p>{en ? 'Only a valid Legal approval permits unlock. DMS timeout or a death document alone is insufficient.' : 'Chỉ phê duyệt pháp lý hợp lệ mới cho phép mở khóa. DMS timeout hoặc chứng từ tử vong riêng lẻ không đủ điều kiện.'}</p></section></main>;
}
