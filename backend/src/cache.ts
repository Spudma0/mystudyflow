import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * A shared cache for generated content.
 *
 * Textbook contents and the teaching of a given topic are the same for every
 * student using that book, so generating them per user is money spent on an
 * answer we already have. Cached by content — not by user — so the first
 * student to open a textbook pays for it and everyone after them gets it free
 * and instantly.
 *
 * Backed by Postgres (the one behind Supabase) where it is configured, and by
 * files on disk where it isn't. The disk is the fallback rather than the store
 * because a deployed container's filesystem is thrown away on every redeploy:
 * ship a change and the whole cache is cold again, so the next student to open
 * a textbook pays for content that was already generated and paid for.
 *
 * The disk layer is still written even when Postgres is in use, as a local
 * read-through that costs nothing and answers instantly.
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

/** The shared table, created by the migration in db/content_cache.sql. */
const TABLE = 'content_cache';

let shared: SupabaseClient | null | undefined;

/**
 * The shared store, or null when it isn't configured.
 *
 * Built lazily and remembered — including the null — so a deployment without
 * Supabase credentials falls back to disk silently instead of trying to build
 * a client on every lookup.
 */
function sharedStore(): SupabaseClient | null {
  if (shared !== undefined) return shared;
  const url = process.env.SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  shared = url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;
  if (!shared) {
    console.warn('[cache] no SUPABASE_URL/SERVICE_ROLE_KEY — cache is local to this instance');
  }
  return shared;
}

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

  const local = await diskGet<T>(namespace, key);
  if (local !== null) {
    hits[namespace] = (hits[namespace] ?? 0) + 1;
    return local;
  }

  // Not on this container's disk, which after a redeploy means every entry.
  const remote = await postgresGet<T>(namespace, key);
  if (remote !== null) {
    hits[namespace] = (hits[namespace] ?? 0) + 1;
    // Pulled down so the next read on this instance doesn't leave the box.
    void diskSet(namespace, key, remote);
    return remote;
  }

  misses[namespace] = (misses[namespace] ?? 0) + 1;
  return null;
}

async function diskGet<T>(namespace: string, key: string): Promise<T | null> {
  try {
    const file = pathFor(namespace, key);
    const info = await stat(file);
    if (Date.now() - info.mtimeMs > MAX_AGE_MS) return null;
    const raw = await readFile(file, 'utf8');
    return (JSON.parse(raw) as Entry<T>).value;
  } catch {
    // Missing, unreadable or malformed all mean the same thing: look further.
    return null;
  }
}

async function postgresGet<T>(namespace: string, key: string): Promise<T | null> {
  const store = sharedStore();
  if (!store) return null;
  try {
    const { data, error } = await store
      .from(TABLE)
      .select('value, created_at')
      .eq('namespace', namespace)
      .eq('key', key)
      .maybeSingle();
    if (error || !data) return null;
    if (Date.now() - new Date(data.created_at as string).getTime() > MAX_AGE_MS) return null;
    return data.value as T;
  } catch (err) {
    // A cache that can't be reached is a slow cache, not a broken app: the
    // caller generates the content instead, exactly as it would on a miss.
    console.warn('[cache] shared read failed', namespace, key, err);
    return null;
  }
}

export async function cacheSet<T>(namespace: string, key: string, value: T): Promise<void> {
  if (!ENABLED) return;
  await Promise.all([diskSet(namespace, key, value), postgresSet(namespace, key, value)]);
}

async function postgresSet<T>(namespace: string, key: string, value: T): Promise<void> {
  const store = sharedStore();
  if (!store) return;
  try {
    // Upsert rather than insert: two instances can generate the same content at
    // the same moment, and the second one arriving is not an error.
    const { error } = await store
      .from(TABLE)
      .upsert({ namespace, key, value, created_at: new Date().toISOString() }, {
        onConflict: 'namespace,key',
      });
    if (error) console.warn('[cache] shared write failed', namespace, key, error.message);
  } catch (err) {
    console.warn('[cache] shared write failed', namespace, key, err);
  }
}

async function diskSet<T>(namespace: string, key: string, value: T): Promise<void> {
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
  // A class opening the same study plan in the same minute is the normal case,
  // not the rare one, and the cache alone does nothing for it: every one of
  // them looks, finds nothing, and generates, because the first has not written
  // its answer back yet. They share one generation instead, so thirty students
  // cost one call rather than thirty.
  //
  // The lookup belongs inside the shared work, not before it. Reading the cache
  // means a round trip to Postgres, and a request that starts during that round
  // trip would otherwise find no entry yet and no flight to join.
  const id = `${namespace}:${key}`;
  const joined = inFlight.get(id) as Promise<T> | undefined;
  if (joined) return { value: await joined, hit: true };

  let generated = false;
  const flight = (async () => {
    const existing = await cacheGet<T>(namespace, key);
    if (existing !== null) return existing;
    generated = true;
    const value = await onMiss();
    await cacheSet(namespace, key, value);
    return value;
  })();

  inFlight.set(id, flight);
  try {
    return { value: await flight, hit: !generated };
  } finally {
    // Cleared whatever happened: a failure must not be what every later
    // request waits on.
    inFlight.delete(id);
  }
}

/** Generations running right now, so identical requests share one of them. */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * How many entries the shared table holds, or null when it can't be read.
 *
 * The count rather than a yes/no, because a yes/no cannot tell the two
 * failures apart. Row level security is on with no policies, so a key that
 * isn't the service role reads zero rows and reports no error at all — a
 * misconfigured backend would look healthy while quietly caching nothing.
 * A number that matches what is actually stored can only come from a key with
 * the access to see it.
 */
async function sharedCount(): Promise<number | null> {
  const store = sharedStore();
  if (!store) return null;
  const { count, error } = await store.from(TABLE).select('*', { count: 'exact', head: true });
  return error ? null : count ?? 0;
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
  return {
    enabled: ENABLED,
    dir: CACHE_DIR,
    // Whether entries outlive this container, which is the difference between
    // paying for a lesson once and paying for it after every deploy.
    // Null means the shared table could not be read at all; a number is how
    // many entries survive a redeploy.
    sharedEntries: await sharedCount(),
    generating: inFlight.size,
    namespaces,
  };
}
