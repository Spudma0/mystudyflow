/**
 * Creates and fills the App Store review demo account.
 *
 * Apple's reviewers cannot get past a sign-in screen without credentials, and
 * an account with nothing in it tells them nothing about the app — so this
 * builds the same term of student data the in-app showcase seeder builds, and
 * writes it straight into the account's rows.
 *
 * It writes the five payloads the app's sync layer reads back (see
 * src/lib/sync.ts), in exactly the shape that layer expects, plus the profile
 * row that carries the colour theme.
 *
 * Deliberately not seeded: subject profiles and their generated study plans.
 * Those cost real money to produce and are the one part of the app that needs
 * the AI pipeline; the demo account gets everything else.
 *
 * Run from the project root:
 *   npx tsx scripts/seed-demo-account.ts
 *
 * Credentials come from backend/.env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
 * and never from arguments, so they stay out of the shell history.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  DEMO_SUBJECTS,
  SHOWCASE_THEME,
  SHOWCASE_WIDGETS,
  buildReminders,
  buildStudyHistory,
  buildTimetable,
  thisMonday,
} from '../src/dev/showcaseData';

const DEMO_EMAIL = 'mystudyflowbusiness@gmail.com';
const DEMO_NAME = 'Alex Mercer';
const DEMO_SCHOOL = 'Riverwood Secondary College';
const DEMO_YEAR = 11;

/**
 * Builds the data as though today were some other day.
 *
 * Everything in showcaseData is relative to now — the study streak runs up to
 * today, the reminders are so many days out — so a demo seeded on a Saturday
 * shows an empty schedule and a broken streak if it is then looked at on the
 * Monday. Set DEMO_AS_OF to the day the demo should look alive on.
 *
 * Only the generation sees the shifted clock; it is put back before anything
 * is written, so the timestamps stored are ordinary absolute ones.
 */
function withToday<T>(asOf: Date, build: () => T): T {
  const Real = Date;
  const offset = asOf.getTime() - Real.now();
  function Shifted(this: unknown, ...args: unknown[]) {
    // @ts-expect-error — standing in for the real constructor
    return args.length ? new Real(...args) : new Real(Real.now() + offset);
  }
  Shifted.prototype = Real.prototype;
  Shifted.now = () => Real.now() + offset;
  Shifted.parse = Real.parse;
  Shifted.UTC = Real.UTC;
  (globalThis as { Date: unknown }).Date = Shifted;
  try {
    return build();
  } finally {
    (globalThis as { Date: unknown }).Date = Real;
  }
}

/** Read without a dotenv dependency — this script runs outside the backend. */
function env(): { url: string; key: string } {
  const raw = readFileSync(join(__dirname, '..', 'backend', '.env'), 'utf8');
  const read = (name: string) =>
    raw.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
  const url = read('SUPABASE_URL');
  const key = read('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('backend/.env needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  return { url, key };
}

async function main() {
  const password = process.env.DEMO_PASSWORD;
  if (!password) {
    throw new Error('Set DEMO_PASSWORD in the environment before running this.');
  }

  const { url, key } = env();
  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // --- The account --------------------------------------------------------
  // Reused if it already exists, so re-running this refills the same account
  // rather than failing or quietly making a second one.
  let userId = '';
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password,
    // No inbox is watched for this address, and a reviewer must not be stopped
    // by a confirmation link.
    email_confirm: true,
  });

  if (created?.user) {
    userId = created.user.id;
    console.log('created account', DEMO_EMAIL);
  } else {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users.find((u) => u.email?.toLowerCase() === DEMO_EMAIL.toLowerCase());
    if (!existing) throw createError ?? new Error('could not create or find the demo account');
    userId = existing.id;
    // The password is reset on every run, so what is written in App Store
    // Connect is always what the account actually has.
    await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
    console.log('reused existing account', DEMO_EMAIL);
  }

  // --- The profile --------------------------------------------------------
  const { error: profileError } = await admin.from('profiles').upsert(
    {
      id: userId,
      full_name: DEMO_NAME,
      school: DEMO_SCHOOL,
      year_level: DEMO_YEAR,
      accent_color: SHOWCASE_THEME.accent,
      base_color: SHOWCASE_THEME.base,
      card_color: SHOWCASE_THEME.card,
    },
    { onConflict: 'id' }
  );
  if (profileError) throw profileError;

  // --- The data -----------------------------------------------------------
  const asOf = process.env.DEMO_AS_OF ? new Date(process.env.DEMO_AS_OF) : new Date();
  if (Number.isNaN(asOf.getTime())) throw new Error('DEMO_AS_OF is not a date');
  if (process.env.DEMO_AS_OF) console.log('building as of', asOf.toString());

  const { timetable, bySubject, reminders, cycleStart } = withToday(asOf, () => ({
    timetable: { days: buildTimetable(DEMO_SUBJECTS), cycleType: 10 },
    bySubject: buildStudyHistory(DEMO_SUBJECTS),
    reminders: buildReminders(DEMO_SUBJECTS),
    cycleStart: thisMonday(),
  }));

  const payloads: { store_key: string; payload: Record<string, unknown> }[] = [
    { store_key: 'timetable', payload: { timetable, cycleStartDate: cycleStart } },
    { store_key: 'reminders', payload: { reminders } },
    { store_key: 'subject-data', payload: { bySubject } },
    { store_key: 'study-topics', payload: { topics: [] } },
    // Empty on purpose: a study plan is generated, and the demo account has none.
    { store_key: 'subject-profiles', payload: { bySubject: {} } },
    // The home strip, so the reviewer sees the widgets rather than the defaults.
    { store_key: 'widgets', payload: { widgets: SHOWCASE_WIDGETS, pinnedExamId: null } },
  ];

  for (const row of payloads) {
    const { error } = await admin
      .from('user_data')
      .upsert({ user_id: userId, ...row }, { onConflict: 'user_id,store_key' });
    if (error) throw error;
  }

  const sessions = Object.values(bySubject).reduce((n, d) => n + d.studySessions.length, 0);
  const hours = Object.values(bySubject).reduce(
    (n, d) => n + d.studySessions.reduce((m, s) => m + s.durationSec, 0),
    0
  );
  console.log(
    `seeded ${DEMO_SUBJECTS.length} subjects · ${sessions} study sessions · ` +
      `${Math.round(hours / 3600)}h logged · ${reminders.length} reminders`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
