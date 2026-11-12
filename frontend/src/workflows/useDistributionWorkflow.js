import { useEffect, useRef, useState } from 'react';
import { loadDistributionWorkflow, saveDistributionAction } from './distributionWorkflowService.js';

/**
 * Hook quản lý dữ liệu và thao tác của quy trình phân chia di sản cho một hồ sơ.
 *
 * Hành vi: (1) effect đầu tải quy trình bằng {@code loadDistributionWorkflow} (hủy bằng AbortController khi đổi tham số); (2) effect thứ hai làm mới mỗi 15 giây,
 * khi cửa sổ focus hoặc tab hiện lại, bỏ qua khi đang ghi; phát hiện thay đổi từ bên ngoài (so sánh chữ ký JSON) thì gọi {@code onExternalChange};
 * (3) {@code run(action, input)} gọi {@code saveDistributionAction}, khóa chống bấm đôi, sau khi thành công phát sự kiện window {@code lv-workflow-notifications-changed} và tải lại.
 * Lỗi 401 gọi {@code onUnauthorized}, 403 gọi {@code onDenied}, 409/CONFLICT thì tải lại.
 *
 * Dùng bởi các trang xử lý hồ sơ của Staff và Legal cùng {@code DistributionWorkflowOverview}.
 *
 * @param {object} params
 * @param {string} params.caseId Hồ sơ xác minh.
 * @param {('STAFF'|'LEGAL')} params.workspace Không gian làm việc.
 * @param {string} params.accessToken Bearer token.
 * @param {string} [params.lang='vi'] Ngôn ngữ.
 * @param {boolean} [params.enabled=true] Bật/tắt tải dữ liệu.
 * @param {Function} [params.onUnauthorized] Gọi khi 401.
 * @param {Function} [params.onDenied] Gọi khi 403.
 * @param {Function} [params.onExternalChange] Gọi khi dữ liệu đổi do người khác.
 * @param {Function} [params.isMutationPending] Cho biết có thao tác ghi khác đang chạy.
 * @returns {{data:(object|null), error:(ApiError|null), loading:boolean, pending:boolean, receipt:(object|null), failure:(ApiError|null), refresh:Function, run:Function}}
 */
export function useDistributionWorkflow({ caseId, workspace, accessToken, lang = 'vi', enabled = true, onUnauthorized, onDenied, onExternalChange, isMutationPending }) {
  const [state, setState] = useState(null), [attempt, setAttempt] = useState(0), [pending, setPending] = useState(null);
  const [receipt, setReceipt] = useState(null), [failure, setFailure] = useState(null);
  const active = useRef(null), write = useRef(null), lock = useRef(false);
  const callbacks = useRef({ onUnauthorized, onDenied, onExternalChange, isMutationPending });
  const previous = useRef(null), readBusy = useRef(false);
  useEffect(() => { callbacks.current = { onUnauthorized, onDenied, onExternalChange, isMutationPending }; }, [onUnauthorized, onDenied, onExternalChange, isMutationPending]);
  useEffect(() => {
    write.current?.abort(); lock.current = false;
    if (!enabled || !caseId || !accessToken) return;
    const controller = new AbortController(); active.current = controller; readBusy.current = true;
    const scope = { caseId, workspace, accessToken, attempt };
    loadDistributionWorkflow(caseId, workspace, { accessToken, lang, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted && !lock.current && !callbacks.current.isMutationPending?.()) {
        const key=JSON.stringify([caseId,workspace,accessToken]), signature=JSON.stringify(data);
        if(previous.current?.key===key && previous.current.signature!==signature) callbacks.current.onExternalChange?.();
        previous.current={key,signature};setState({ ...scope, data });
      } })
      .catch(error => { if (!controller.signal.aborted && !lock.current && !callbacks.current.isMutationPending?.()) {
        setState({ ...scope, error });
        if (error.status === 401) callbacks.current.onUnauthorized?.();
        if (error.status === 403) callbacks.current.onDenied?.(error);
      } }).finally(()=>{if(active.current===controller)readBusy.current=false;});
    return () => { controller.abort(); write.current?.abort(); lock.current = false; };
  }, [caseId, workspace, accessToken, enabled, attempt, lang]);
  useEffect(()=>{
    if(!enabled||!caseId||!accessToken)return;
    const c=new AbortController();let loading=false;
    async function update(){
      if(loading||lock.current||callbacks.current.isMutationPending?.()||readBusy.current||document.hidden)return;
      loading=true;
      try{const data=await loadDistributionWorkflow(caseId,workspace,{accessToken,lang,signal:c.signal});
        if(c.signal.aborted||lock.current||callbacks.current.isMutationPending?.())return;
        const key=JSON.stringify([caseId,workspace,accessToken]),signature=JSON.stringify(data);
        if(previous.current?.key===key&&previous.current.signature!==signature)callbacks.current.onExternalChange?.();
        previous.current={key,signature};setState({caseId,workspace,accessToken,attempt,data});
      }catch(error){if(!c.signal.aborted&&!lock.current&&!callbacks.current.isMutationPending?.()){setState({caseId,workspace,accessToken,attempt,error});if(error.status===401)callbacks.current.onUnauthorized?.();if(error.status===403)callbacks.current.onDenied?.(error);}}
      finally{loading=false;}
    }
    const timer=setInterval(update,15000);window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);
    return()=>{c.abort();clearInterval(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};
  },[caseId,workspace,accessToken,enabled,lang,attempt]);
  /**
   * Kiểm tra giá trị state thuộc đúng hồ sơ/không gian/token hiện tại (tránh hiển thị dữ liệu của hồ sơ cũ).
   */
  const matches = value => value?.caseId === caseId && value?.workspace === workspace && value?.accessToken === accessToken;
  const visible = matches(state) && state.attempt === attempt && enabled ? state : null;
  /**
   * Tăng bộ đếm {@code attempt} để effect tải lại dữ liệu.
   */
  const refresh = () => setAttempt(value => value + 1);
  /**
   * Thực hiện một action ghi: bỏ qua nếu đang khóa hoặc chưa có dữ liệu; đặt {@code pending}, gọi {@code saveDistributionAction}, lưu biên nhận hoặc lỗi và xử lý 401/403/409.
   * @returns {Promise<(object|null)>} Biên nhận hoặc null khi thất bại.
   */
  async function run(action, input) {
    if (lock.current || callbacks.current.isMutationPending?.() || !visible?.data) return null;
    lock.current = true; setPending({ caseId, workspace, accessToken }); setFailure(null); setReceipt(null);
    const controller = new AbortController(); write.current = controller;
    try {
      const saved = await saveDistributionAction(caseId, workspace, action, input, visible.data, { accessToken, lang, signal: controller.signal });
      if (controller.signal.aborted) return null;
      setReceipt({ caseId, workspace, accessToken, value: saved });
      window.dispatchEvent(new window.Event('lv-workflow-notifications-changed'));
      refresh();
      return saved;
    } catch (error) {
      if (!controller.signal.aborted) {
        setFailure({ caseId, workspace, accessToken, error });
        if (error.status === 401) { setState(null); callbacks.current.onUnauthorized?.(); }
        if (error.status === 403) { setState(null); callbacks.current.onDenied?.(error); }
        if (error.status === 409 || error.code === 'CONFLICT') refresh();
      }
      return null;
    } finally { if (write.current === controller) { lock.current = false; setPending(null); } }
  }
  return { data: visible?.data || null, error: visible?.error || null, loading: enabled && !!caseId && !!accessToken && !visible,
    pending: enabled && matches(pending), receipt: matches(receipt) ? receipt.value : null,
    failure: matches(failure) ? failure.error : null, refresh, run };
}
