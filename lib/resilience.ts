type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

function retryable(error: unknown) {
  if (error instanceof DOMException && error.name === "TimeoutError") return true;
  if (!(error instanceof Error)) return true;

  const status = Number((error as Error & { status?: number }).status);
  return !Number.isFinite(status) || status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function retryExternalOperation<T>(operation: () => Promise<T>, options: RetryOptions = {}) {
  const attempts = Math.max(1, Math.min(options.attempts ?? 3, 4));
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 250);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 1_500);
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !retryable(error)) throw error;
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jitter = baseDelayMs ? Math.floor(Math.random() * Math.max(1, baseDelayMs / 2)) : 0;
      await wait(backoff + jitter);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("External operation failed");
}
