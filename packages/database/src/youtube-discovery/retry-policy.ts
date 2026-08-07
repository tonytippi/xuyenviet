const maxRetryDelayMinutes = 1_440;

export function getYoutubeDiscoveryRetryDelayMinutes(retryDelayMinutes: number, attemptCount: number) {
  return Math.min(retryDelayMinutes * 2 ** (attemptCount - 1), maxRetryDelayMinutes);
}

export function isYoutubeDiscoveryRetryExhausted(attemptCount: number, maxRetryAttempts: number) {
  return attemptCount > maxRetryAttempts;
}
