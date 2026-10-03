/**
 * Copies this machine's local content cache into the shared one.
 *
 * The cache was local to a container before it was shared, so everything
 * generated up to that point exists only on whichever disk produced it —
 * lessons and textbook scans that were paid for once and would otherwise be
 * paid for again the first time a student asks for them in production.
 *
 * Safe to run more than once: rows are upserted on (namespace, key), and the
 * content for a given key is the same whoever generated it.
 *
 * Run from the project root:
 *   npx tsx scripts/backfill-cache.ts            # copy them up
 *   npx tsx scripts/backfill-cache.ts --dry-run  # just say what would go
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const CACHE_DIR = join(__dirname, '..', 'backend', '.cache');
const TABLE = 'content_cache';
/** Rows per request: lessons run to ~16KB each, so these stay well clear of limits. */
const CHUNK = 10;

interface Row {
  namespace: string;
  key: string;
  value: unknown;
  created_at: string;
}

function env(): { url: string; key: string } {
  const raw = readFileSync(join(__dirname, '..', 'backend', '.env'), 'utf8');
  const read = (name: string) =>
    raw.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
  const url = read('SUPABASE_URL');
  const key = read('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('backend/.env needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  return { url, key };
}

/** Every entry on disk, as the rows the shared table holds. */
function localEntries(): Row[] {
  const rows: Row[] = [];
  for (const namespace of readdirSync(CACHE_DIR)) {
    const dir = join(CACHE_DIR, namespace);
    if (!statSync(dir).isDirectory()) continue;

    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const entry = JSON.parse(readFileSync(join(dir, file), 'utf8'));
        if (!entry?.key || entry.value === undefined) continue;
        rows.push({
          namespace,
          key: entry.key,
          value: entry.value,
          // The age it actually is, not the age of this copy — a lesson
          // generated two months ago should expire on its own schedule.
          created_at: new Date(entry.createdAt ?? Date.now()).toISOString(),
        });
      } catch {
        // A half-written or hand-edited file is one entry to skip, not a
        // reason to abandon the rest.
        console.warn('skipped unreadable entry', namespace, file);
      }
    }
  }
  return rows;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const rows = localEntries();

  const byNamespace = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.namespace] = (acc[r.namespace] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `found ${rows.length} local entries —`,
    Object.entries(byNamespace).map(([n, c]) => `${n}: ${c}`).join(', ')
  );
  if (dryRun || !rows.length) return;

  const { url, key } = env();
  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await admin.from(TABLE).upsert(chunk, { onConflict: 'namespace,key' });
    if (error) throw error;
    written += chunk.length;
    console.log(`  ${written}/${rows.length}`);
  }

  const { count } = await admin.from(TABLE).select('*', { count: 'exact', head: true });
  console.log(`done — shared cache now holds ${count} entries`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
