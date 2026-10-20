export const SHARED_LIBRARY_POLL_INTERVAL_MS = 5_000;
export const SHARED_LIBRARY_RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000] as const;

export function getSharedLibraryRefreshDelay(consecutiveFailures: number) {
  if (consecutiveFailures <= 0) return SHARED_LIBRARY_POLL_INTERVAL_MS;
  return SHARED_LIBRARY_RETRY_DELAYS_MS[
    Math.min(consecutiveFailures - 1, SHARED_LIBRARY_RETRY_DELAYS_MS.length - 1)
  ];
}
