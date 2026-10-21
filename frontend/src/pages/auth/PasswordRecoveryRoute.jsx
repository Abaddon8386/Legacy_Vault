import { useLayoutEffect, useState } from 'react';
import PasswordRecoveryPage from './PasswordRecoveryPage.jsx';
import { readRecoveryCredential, requestPasswordRecovery, resetRecoveredPassword } from '../../utils/passwordRecoveryService.js';

export default function PasswordRecoveryRoute({ mode, onComplete, ...props }) {
  const [credential] = useState(() => mode === 'reset' ? readRecoveryCredential(window.location.hash) : null);
  useLayoutEffect(() => {
    if (mode === 'reset') window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  }, [mode]);
  return <PasswordRecoveryPage {...props} mode={mode} onRequestRecovery={requestPasswordRecovery}
    onResetPassword={credential ? async (data, options) => {
      await resetRecoveredPassword(credential, data, options);
      if (!options.signal.aborted) onComplete(options.lang);
    } : undefined} />;
}
