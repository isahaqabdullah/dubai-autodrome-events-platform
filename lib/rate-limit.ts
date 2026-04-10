import "server-only";

interface RateLimitState {
  count: number;
  resetAt: number;
}

const bucket = new Map<string, RateLimitState>();

export function checkRateLimit(key: string, windowSeconds: number, maxRequests: number) {
  const now = Date.now();
  const current = bucket.get(key);

  if (!current || now > current.resetAt) {
    bucket.set(key, {
      count: 1,
      resetAt: now + windowSeconds * 1000
    });

    return {
      allowed: true,
      remaining: maxRequests - 1
    };
  }

  current.count += 1;
  bucket.set(key, current);

  return {
    allowed: current.count <= maxRequests,
    remaining: Math.max(maxRequests - current.count, 0)
  };
}
