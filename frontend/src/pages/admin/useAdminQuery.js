import { useEffect, useMemo, useState, useRef } from 'react';
import { ApiError } from '../../api/http.js';

// A successful result belongs to one token, filter set and reload attempt.
// Pending contract mode never performs requests, including manual retries.
export function useAdminQuery(fetchData, accessToken, params, enabled, onUnauthorized, accessDenied, onFailure) {
  const failureHandler = useRef(onFailure);
  useEffect(() => { failureHandler.current = onFailure; }, [onFailure]);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const query = JSON.stringify(params);
  const scope = useMemo(() => ({ accessToken, query, attempt, enabled }), [accessToken, query, attempt, enabled]);
  const current = enabled && accessToken && result?.scope === scope ? result : null;

  useEffect(() => {
    if (!enabled || !accessToken) return;
    let active = true;
    const controller = new AbortController();
    const fail = (error) => {
      if (!active) return;
      active = false;
      clearTimeout(timeout);
      setResult({ scope, error });
      failureHandler.current?.(error);
      if (error.status === 401) onUnauthorized?.();
    };
    const timeout = setTimeout(() => {
      fail(new ApiError('REQUEST_TIMEOUT'));
      controller.abort();
    }, 20000);
    Promise.resolve().then(() => {
      if (!active) return;
      return fetchData(accessToken, { ...JSON.parse(query), signal: controller.signal });
    }).then((data) => {
      if (active) {
        active = false;
        clearTimeout(timeout);
        setResult({ scope, data });
      }
    }).catch((error) => {
      if (!active || error.name === 'AbortError') return;
      fail(error);
    });
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [accessToken, enabled, fetchData, onUnauthorized, query, scope]);

  const failure = current?.error;
  const apiPending = !enabled || [404, 501].includes(failure?.status) ||
    failure?.code === 'API_NOT_AVAILABLE' || (failure?.code === 'BACKEND_NOT_READY' && !(failure.status >= 500));
  return {
    data: current?.data ?? null,
    deny: () => setResult({ scope, error: { status: 403, message: accessDenied } }),
    loading: Boolean(enabled && accessToken && !current),
    apiPending,
    error: failure && !apiPending ? (failure.status === 403 ? accessDenied
      : failure.code === 'REQUEST_TIMEOUT' ? (params.lang === 'en' ? 'The server took too long to respond. Please retry.' : 'Máy chủ phản hồi quá lâu. Vui lòng thử lại.')
      : (params.lang === 'en' ? 'Unable to load information. Please retry.' : 'Không thể tải thông tin. Vui lòng thử lại.')) : null,
    reload: () => { if (enabled && accessToken) setAttempt((value) => value + 1); },
  };
}
