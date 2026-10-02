import Anthropic from '@anthropic-ai/sdk';

const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
  throw new Error(
    'ANTHROPIC_API_KEY is missing. Paste your key into backend/.env before starting the server.'
  );
}

export const anthropic = new Anthropic({ apiKey });

// Model is configurable via .env. Defaults to the most capable model.
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-opus-4-8';

/**
 * Model for the research routes (textbook scanning, lesson maps).
 *
 * Kept separate from CLAUDE_MODEL so the cheap model that's fine for reading a
 * photo of someone's notes doesn't get pointed at open-ended web research.
 * This one has to support adaptive thinking and the 2026 web tools, which the
 * Haiku line does not — so it defaults to Opus regardless of CLAUDE_MODEL.
 */
export const RESEARCH_MODEL = process.env.RESEARCH_MODEL || 'claude-opus-4-8';

// Supported image media types for Claude vision.
export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

/**
 * Instructions that don't change between calls, marked so the model re-reads
 * them from cache instead of re-processing them.
 *
 * Caching works on a *prefix*, and the request is assembled as tools → system
 * → messages. So the only way repeated calls can share anything is for the
 * unchanging part to sit here in `system`, with the per-call details left in
 * the user message. Instructions written after the variable part — which is
 * the natural way to write a prompt — cache nothing at all, because the prefix
 * differs before the breakpoint is ever reached.
 *
 * The breakpoint is always placed. A prefix shorter than the model's minimum
 * — 1,024 tokens for Sonnet 5 and Opus 4.8, 4,096 for Haiku 4.5 — is simply
 * processed uncached, with no error and no charge, so marking every static
 * prefix is safe and keeps working if a prompt grows or the model changes.
 * What is not safe is a breakpoint on a block that varies: it writes an entry
 * nothing can ever read. That is why per-call details stay out of here.
 *
 * Whether a given prompt clears its floor is not worth guessing at from the
 * text length — the prefix is tools + system, and a server-tool definition can
 * be larger than the instructions it precedes. `logCacheUsage` reports what
 * the API actually did instead.
 */
export function cachedSystem(
  _model: string,
  text: string,
  _label?: string
): Anthropic.TextBlockParam[] {
  return [{ type: 'text', text, cache_control: { type: 'ephemeral' as const } }];
}

/** Log what caching actually saved, so the setting can be checked rather than assumed. */
export function logCacheUsage(label: string, message: Anthropic.Message): void {
  const u = message.usage;
  const read = u.cache_read_input_tokens ?? 0;
  const written = u.cache_creation_input_tokens ?? 0;
  if (!read && !written) return;
  console.log(
    `[cache] ${label}: ${read} read, ${written} written, ${u.input_tokens} fresh`
  );
}

/**
 * Pull the first text block out of a Claude response and parse it as JSON.
 * We ask Claude to emit ONLY JSON, but models sometimes wrap it in prose or a
 * ```json fence, so we defensively extract the outermost JSON object.
 */
export function parseJsonFromResponse<T>(message: Anthropic.Message): T {
  // Walk the text blocks newest-first. With server tools in play the reply
  // opens with narration ("I'll search the web…") and the answer only arrives
  // in a later block, so taking the first text block finds the preamble rather
  // than the JSON.
  const texts = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text);

  for (let i = texts.length - 1; i >= 0; i -= 1) {
    const raw = texts[i];
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) continue;
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as T;
    } catch {
      // Not this block — keep looking further back.
    }
  }

  throw new Error(
    `Claude did not return valid JSON. Raw response:\n${texts.join('\n---\n') || '(no text blocks)'}`
  );
}

/**
 * Model for writing lesson content.
 *
 * Separate again from RESEARCH_MODEL: this is bulk generation from a named
 * topic with no web access, where the top-tier model costs several times more
 * without a matching gain. A plan of 7 lessons is 7 of these calls.
 */
export const LESSON_MODEL = process.env.LESSON_MODEL || 'claude-sonnet-5';
