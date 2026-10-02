import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * A shared cache for generated content.
 *
 * Textbook contents and the teaching of a given topic are the same for every
 * student using that book, so generating them per user is money spent on an
 * answer we already have. Cached by content — not by user — so the first
 * student to open a textbook pays for it and everyone after them gets it free
 * and instantly.
 *
 * Backed by files on disk: it survives restarts and needs no extra service. If
 * this ever runs on more than one instance, swap `read`/`write` below for a
 * shared store (the Postgres behind Supabase would do); nothing else changes.
 */

const CACHE_DIR = process.env.CACHE_DIR || join(process.cwd(), '.cache');

/** Off switch, for debugging a suspect entry without deleting the whole cache. */
const ENABLED = process.env.CONTENT_CACHE !== 'off';

/** Entries older than this are re-generated — textbooks get new editions. */
const MAX_AGE_MS = Number(process.env.CACHE_MAX_AGE_DAYS || 90) * 24 * 60 * 60 * 1000;

interface Entry<T> {
  key: string;
  createdAt: number;
  value: T;
}

const hits: Record<string, number> = {};
const misses: Record<string, number> = {};

/**
 * Build a stable key from its parts.
 *
 * Case and surrounding whitespace are normalised so "Campbell Biology" and
 * "campbell biology " are one entry rather than two; inner spacing is squashed
 * for the same reason.
 */
export function cacheKey(...parts: (string | undefined | null)[]): string {
  const normalised = parts
    .map((p) => (p ?? '').trim().toLowerCase().replace(/\s+/g, ' '))
    .join('\u0000');
  return createHash('sha256').update(normalised).digest('hex').slice(0, 32);
}

function pathFor(namespace: string, key: string): string {
  return join(CACHE_DIR, namespace, `${key}.json`);
}

export async function cacheGet<T>(namespace: string, key: string): Promise<T | null> {
  if (!ENABLED) return null;
  try {
    const file = pathFor(namespace, key);
    const info = await stat(file);
    if (Date.now() - info.mtimeMs > MAX_AGE_MS) {
      misses[namespace] = (misses[namespace] ?? 0) + 1;
      return null;
    }
    const raw = await readFile(file, 'utf8');
    const entry = JSON.parse(raw) as Entry<T>;
    hits[namespace] = (hits[namespace] ?? 0) + 1;
    return entry.value;
  } catch {
    // Missing, unreadable or malformed all mean the same thing: generate it.
    misses[namespace] = (misses[namespace] ?? 0) + 1;
    return null;
  }
}

export async function cacheSet<T>(namespace: string, key: string, value: T): Promise<void> {
  if (!ENABLED) return;
  try {
    const dir = join(CACHE_DIR, namespace);
    await mkdir(dir, { recursive: true });
    const entry: Entry<T> = { key, createdAt: Date.now(), value };
    // Written to a temporary name and moved into place, so a crash mid-write
    // can't leave a half-written file that later reads as a corrupt hit.
    const tmp = join(dir, `${key}.${process.pid}.tmp`);
    await writeFile(tmp, JSON.stringify(entry), 'utf8');
    await rename(tmp, pathFor(namespace, key));
  } catch (err) {
    // A cache that can't write is a slow cache, not a broken app.
    console.warn('[cache] could not write', namespace, key, err);
  }
}

/**
 * Return the cached value, or produce it and cache it.
 *
 * `onMiss` only runs when there's nothing to reuse, so callers read as if the
 * cache weren't there.
 */
export async function cached<T>(
  namespace: string,
  key: string,
  onMiss: () => Promise<T>
): Promise<{ value: T; hit: boolean }> {
  const existing = await cacheGet<T>(namespace, key);
  if (existing !== null) return { value: existing, hit: true };
  const value = await onMiss();
  await cacheSet(namespace, key, value);
  return { value, hit: false };
}

/** Hit rate and size per namespace — what the cache is actually saving. */
export async function cacheStats(): Promise<Record<string, unknown>> {
  const namespaces: Record<string, unknown> = {};
  try {
    const dirs = await readdir(CACHE_DIR, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const files = await readdir(join(CACHE_DIR, d.name));
      const h = hits[d.name] ?? 0;
      const m = misses[d.name] ?? 0;
      namespaces[d.name] = {
        entries: files.filter((f) => f.endsWith('.json')).length,
        hits: h,
        misses: m,
        hitRate: h + m > 0 ? `${Math.round((h / (h + m)) * 100)}%` : 'n/a',
      };
    }
  } catch {
    // No cache directory yet — nothing has been generated.
  }
  return { enabled: ENABLED, dir: CACHE_DIR, namespaces };
}
