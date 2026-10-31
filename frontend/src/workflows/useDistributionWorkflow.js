import { useEffect, useRef, useState } from 'react';
import { loadDistributionWorkflow, saveDistributionAction } from './distributionWorkflowService.js';

export function useDistributionWorkflow({ caseId, workspace, accessToken, lang = 'vi', enabled = true, onUnauthorized, onDenied, onExternalChange }) {
  const [state, setState] = useState(null), [attempt, setAttempt] = useState(0), [pending, setPending] = useState(null);
  const [receipt, setReceipt] = useState(null), [failure, setFailure] = useState(null);
  const active = useRef(null), write = useRef(null), lock = useRef(false);
  const callbacks = useRef({ onUnauthorized, onDenied, onExternalChange });
  const previous = useRef(null), readBusy = useRef(false);
  useEffect(() => { callbacks.current = { onUnauthorized, onDenied, onExternalChange }; }, [onUnauthorized, onDenied, onExternalChange]);
  useEffect(() => {
    write.current?.abort(); lock.current = false;
    if (!enabled || !caseId || !accessToken) return;
    const controller = new AbortController(); active.current = controller; readBusy.current = true;
    const scope = { caseId, workspace, accessToken, attempt };
    loadDistributionWorkflow(caseId, workspace, { accessToken, lang, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) {
        const key=JSON.stringify([caseId,workspace,accessToken]), signature=JSON.stringify(data);
        if(previous.current?.key===key && previous.current.signature!==signature) callbacks.current.onExternalChange?.();
        previous.current={key,signature};setState({ ...scope, data });
      } })
      .catch(error => { if (!controller.signal.aborted) {
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
      if(loading||lock.current||readBusy.current||document.hidden)return;
      loading=true;
      try{const data=await loadDistributionWorkflow(caseId,workspace,{accessToken,lang,signal:c.signal});
        if(c.signal.aborted||lock.current)return;
        const key=JSON.stringify([caseId,workspace,accessToken]),signature=JSON.stringify(data);
        if(previous.current?.key===key&&previous.current.signature!==signature)callbacks.current.onExternalChange?.();
        previous.current={key,signature};setState({caseId,workspace,accessToken,attempt,data});
      }catch(error){if(!c.signal.aborted&&!lock.current){setState({caseId,workspace,accessToken,attempt,error});if(error.status===401)callbacks.current.onUnauthorized?.();if(error.status===403)callbacks.current.onDenied?.(error);}}
      finally{loading=false;}
    }
    const timer=setInterval(update,15000);window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);
    return()=>{c.abort();clearInterval(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};
  },[caseId,workspace,accessToken,enabled,lang,attempt]);
  const matches = value => value?.caseId === caseId && value?.workspace === workspace && value?.accessToken === accessToken;
  const visible = matches(state) && state.attempt === attempt && enabled ? state : null;
  const refresh = () => setAttempt(value => value + 1);
  async function run(action, input) {
    if (lock.current || !visible?.data) return null;
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
