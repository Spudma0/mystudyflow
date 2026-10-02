import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

/**
 * Account deletion.
 *
 * Apple requires any app that can create an account to be able to delete one
 * from inside the app (App Store Review Guideline 5.1.1(v)). Deleting an auth
 * user needs the service role key, which must never reach the client, so the
 * work happens here.
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the backend environment.
 * The service role key bypasses row level security entirely — it belongs only
 * on the server, never in the app bundle or an EXPO_PUBLIC_ variable.
 */

export const accountRouter = Router();

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/** Everything the account owns, in the order it has to go. */
const USER_TABLES = ['user_data', 'profiles'];

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * DELETE /api/account
 *
 * Authorisation: the caller's own access token. The token identifies who is
 * being deleted — the client never names the account, so one user can't delete
 * another by passing someone else's id.
 */
accountRouter.delete('/', async (req, res) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Account deletion is not configured on the server.' });
    return;
  }

  const header = req.header('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }

  const admin = adminClient();

  // Resolve the token to a user rather than trusting anything in the body.
  const { data: userResult, error: lookupError } = await admin.auth.getUser(token);
  const user = userResult?.user;
  if (lookupError || !user) {
    res.status(401).json({ error: 'That session is no longer valid. Sign in again and retry.' });
    return;
  }

  try {
    // Their data first. If the auth user went first and this failed, the rows
    // would be left behind with no account able to reach or remove them.
    for (const table of USER_TABLES) {
      const { error } = await admin.from(table).delete().eq(
        table === 'profiles' ? 'id' : 'user_id',
        user.id
      );
      if (error) throw new Error(`${table}: ${error.message}`);
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw new Error(deleteError.message);

    res.json({ ok: true });
  } catch (err) {
    console.error('[account/delete]', err);
    res.status(500).json({
      error: 'Could not finish deleting the account. Nothing has been partially removed from your sign-in.',
    });
  }
});
