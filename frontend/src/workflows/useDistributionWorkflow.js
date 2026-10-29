import { useEffect, useRef, useState } from 'react';
import { loadDistributionWorkflow, saveDistributionAction } from './distributionWorkflowService.js';

export function useDistributionWorkflow({ caseId, workspace, accessToken, lang = 'vi', enabled = true, onUnauthorized, onDenied }) {
  const [state, setState] = useState(null), [attempt, setAttempt] = useState(0), [pending, setPending] = useState(null);
  const [receipt, setReceipt] = useState(null), [failure, setFailure] = useState(null);
  const active = useRef(null), write = useRef(null), lock = useRef(false);
  const callbacks = useRef({ onUnauthorized, onDenied });
  useEffect(() => { callbacks.current = { onUnauthorized, onDenied }; }, [onUnauthorized, onDenied]);
  useEffect(() => {
    write.current?.abort(); lock.current = false;
    if (!enabled || !caseId || !accessToken) return;
    const controller = new AbortController(); active.current = controller;
    const scope = { caseId, workspace, accessToken, attempt };
    loadDistributionWorkflow(caseId, workspace, { accessToken, lang, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setState({ ...scope, data }); })
      .catch(error => { if (!controller.signal.aborted) {
        setState({ ...scope, error });
        if (error.status === 401) callbacks.current.onUnauthorized?.();
        if (error.status === 403) callbacks.current.onDenied?.(error);
      } });
    return () => { controller.abort(); write.current?.abort(); lock.current = false; };
  }, [caseId, workspace, accessToken, enabled, attempt, lang]);
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
