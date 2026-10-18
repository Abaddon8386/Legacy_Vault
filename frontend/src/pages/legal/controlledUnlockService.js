export function describeUnlock(data, { isSimulation = false } = {}) {
  const confirmed = data?.vaultStatus === 'UNLOCKED' && Boolean(data?.unlockConfirmation?.source);
  return { status: confirmed ? 'UNLOCKED' : data?.vaultStatus === 'LOCKED' ? 'LOCKED' : 'UNKNOWN', isSimulation, source: confirmed ? data.unlockConfirmation.source : null };
}
export async function fetchControlledUnlock({ isDevPreview = false, accessToken, scenario = 'locked', production = false } = {}) {
  if (import.meta.env?.PROD || production || accessToken || !isDevPreview) {
    const error = new Error('Backend not ready'); error.code = 'BACKEND_NOT_READY'; error.status = 503; throw error;
  }
  return { vaultStatus: scenario === 'unlocked' ? 'UNLOCKED' : 'LOCKED', unlockConfirmation: scenario === 'unlocked' ? { source: 'SYNTHETIC_PREVIEW_SIMULATION' } : null };
}
