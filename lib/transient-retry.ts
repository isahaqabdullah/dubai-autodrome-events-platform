import "server-only";

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BASE_BACKOFF_MS = 250;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractStatusCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return null;
  }

  const candidate = (error as { status?: unknown; statusCode?: unknown }).statusCode ?? (error as { status?: unknown }).status;
  return typeof candidate === "number" ? candidate : null;
}

function extractMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const candidate = (error as { message?: unknown }).message;
    if (typeof candidate === "string") {
      return candidate;
    }
  }

  return "";
}

export function isRetryableUpstreamError(error: unknown) {
  const statusCode = extractStatusCode(error);

  if (statusCode === 408 || statusCode === 429) {
    return true;
  }

  if (statusCode !== null && statusCode >= 500) {
    return true;
  }

  const message = extractMessage(error).toLowerCase();

  return (
    message.includes("502 bad gateway") ||
    message.includes("503 service unavailable") ||
    message.includes("504 gateway timeout") ||
    message.includes("cloudflare") ||
    message.includes("fetch failed") ||
    message.includes("socket hang up") ||
    message.includes("etimedout") ||
    message.includes("econnreset")
  );
}

export async function withTransientRetry<T>(
  run: () => Promise<T>,
  options?: {
    attempts?: number;
    baseBackoffMs?: number;
    label?: string;
  }
) {
  const attempts = options?.attempts ?? DEFAULT_ATTEMPTS;
  const baseBackoffMs = options?.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
  const label = options?.label ?? "operation";

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await run();
    } catch (error) {
      lastError = error;

      if (!isRetryableUpstreamError(error) || attempt === attempts) {
        throw error;
      }

      console.warn(`[retry] transient upstream failure during ${label}; retrying`, {
        attempt,
        attempts,
        message: extractMessage(error),
        statusCode: extractStatusCode(error)
      });

      await sleep(baseBackoffMs * 2 ** (attempt - 1) + Math.random() * 150);
    }
  }

  throw lastError ?? new Error(`Retry loop for ${label} exited without returning.`);
}
