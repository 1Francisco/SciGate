import { MiddlewareHandler } from 'hono';
import { RATE_LIMIT_RPM } from '../config.js';

/**
 * Simple sliding-window rate limiter keyed by IP (or x-user-id if present).
 * In-memory; swap for Redis/Upstash when deploying to multiple instances.
 */
const buckets = new Map<string, number[]>();

export function rateLimit(opts?: { rpm?: number }): MiddlewareHandler {
  const limit = opts?.rpm ?? RATE_LIMIT_RPM;
  const windowMs = 60_000;

  return async (c, next) => {
    const key =
      c.req.header('x-user-id') ||
      c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
      c.req.header('cf-connecting-ip') ||
      'anonymous';

    const now = Date.now();
    const timestamps = buckets.get(key) ?? [];
    // Drop timestamps outside the window
    const recent = timestamps.filter((t) => now - t < windowMs);

    if (recent.length >= limit) {
      return c.json(
        { error: 'Too Many Requests', retryAfterMs: windowMs - (now - recent[0]) },
        429,
        { 'Retry-After': String(Math.ceil(windowMs / 1000)) }
      );
    }

    recent.push(now);
    buckets.set(key, recent);
    return next();
  };
}
