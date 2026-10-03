import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import {
  anthropic,
  RESEARCH_MODEL,
  LESSON_MODEL,
  cachedSystem,
  logCacheUsage,
  parseJsonFromResponse,
} from '../anthropic.js';
import { cached, cacheKey, cacheStats } from '../cache.js';

export const subjectRouter = Router();

/**
 * Subject profiling: find the student's textbook on the open web, work out what
 * the course actually covers from it, and turn that into an ordered lesson map
 * aimed at their next test.
 *
 * Claude does the searching itself through the server-side `web_search` and
 * `web_fetch` tools — they run on Anthropic's infrastructure, so there is no
 * client-side tool loop here; the final message already contains the answer.
 */

// Server tool versions paired with Opus 4.8. Older models only accept the
// basic `web_search_20250305` variant and have no web fetch at all, which is
// why RESEARCH_MODEL is deliberately separate from CLAUDE_MODEL.
// Measured against the 2026 tool on the same book: this one is both cheaper and
// faster for the same answer, and two searches is enough to find a contents
// listing. Going from five 2026-tool searches to two of these, plus caching and
// no thinking, took one scan from ~$3.00 and 78-240s to $0.19 and 36s with
// identical output (19 correctly-named chapters, high confidence).
const WEB_SEARCH_TOOL: Anthropic.WebSearchTool20250305 = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 2,
};

const WEB_FETCH_TOOL: Anthropic.WebFetchTool20260209 = {
  type: 'web_fetch_20260209',
  name: 'web_fetch',
  max_uses: 2,
  // Note this cap does NOT apply to binary content such as PDFs — a whole
  // textbook PDF comes in regardless of what is set here, which is exactly
  // what made hard-to-find titles hang. See the staging note below.
  max_content_tokens: 15000,
};

/**
 * Budgets for the two research stages.
 *
 * Open-ended web research has no natural bound, so each stage gets a deadline:
 * the failure is then a clear message instead of a dead connection.
 */
const SEARCH_TIMEOUT_MS = 170000;
const FETCH_TIMEOUT_MS = 90000;

/**
 * Run a research prompt with web access, in two stages.
 *
 * Search and fetch both run on Anthropic's side, so each reply is already a
 * finished answer — there's no tool loop to drive from here.
 *
 * Stage one is search only, which settles in well under a minute. Fetch is
 * held back for books search alone couldn't pin down, because fetch is what
 * makes this slow: asked to find a textbook it will happily pull down a whole
 * book PDF, and `max_content_tokens` does not apply to binary content, so
 * nothing caps it. Measured on one hard-to-find title: 25s search-only versus
 * still running at 170s with fetch enabled.
 */
async function researchWithWeb(
  instructions: string,
  prompt: string,
  maxTokens: number,
  /** Decides whether stage one's answer was good enough to stop at. */
  isGoodEnough: (message: Anthropic.Message) => boolean
): Promise<Anthropic.Message> {
  // Deliberately no `thinking` here. Identifying a book and transcribing its
  // contents from search results is structured extraction, not reasoning, and
  // adaptive thinking made it pathologically slow: measured on one hard title,
  // search-only ran past 240s with thinking on (both Opus 4.8 and Sonnet 5)
  // and finished in 123s with it off, for the same answer.
  // The breakpoint sits on the instructions, not on the book being looked up.
  // A breakpoint only ever writes one entry — a hash of everything up to and
  // including it — so marking a block that names the book wrote an entry that
  // the next student, searching for a different book, could never read. Moving
  // it to the system prefix makes the entry shared: within a scan the model's
  // own tool-loop turns read it back, and so does the next scan of any book.
  const base = {
    model: RESEARCH_MODEL,
    max_tokens: maxTokens,
    system: cachedSystem(RESEARCH_MODEL, instructions, "textbook-scan"),
    messages: [{ role: 'user' as const, content: prompt }],
  };

  const searched = await anthropic.messages.create(
    { ...base, tools: [WEB_SEARCH_TOOL] },
    { timeout: SEARCH_TIMEOUT_MS, maxRetries: 0 }
  );
  logCacheUsage('research/search', searched);

  if (isGoodEnough(searched)) return searched;

  // Search wasn't enough — let it open pages, but say plainly not to download
  // the book itself, and keep the result from stage one as the fallback.
  console.warn('[subject] search alone was thin; retrying with web_fetch');
  try {
    // Note this stage cannot read stage one's cache however it is written:
    // the prefix runs tools → system → messages, and changing the tools array
    // invalidates everything after it. Only the instructions being in `system`
    // keeps stage two's own tool-loop turns cheap.
    const fetched = await anthropic.messages.create(
      {
        ...base,
        messages: [
          {
            role: 'user' as const,
            content: `${prompt}

A previous search-only attempt did not find enough. You may now open pages directly. Open contents, index or syllabus pages only — do NOT download a full copy of the book itself (PDF or otherwise); those are far too large to work with and are not needed to list what the book covers.`,
          },
        ],
        tools: [WEB_SEARCH_TOOL, WEB_FETCH_TOOL],
      },
      { timeout: FETCH_TIMEOUT_MS, maxRetries: 0 }
    );
    logCacheUsage('research/fetch', fetched);
    return fetched;
  } catch (err) {
    console.warn('[subject] fetch stage failed, using the search-only result:', err);
    return searched;
  }
}

/** Turn SDK failures into something a student can act on. */
function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/timed? ?out|aborted/i.test(msg)) {
    return "That book took too long to track down. Try adding the author or edition, or use the book's exact title.";
  }
  if (/credit|billing|quota|insufficient/i.test(msg)) {
    return 'The AI account is out of credit. Top it up and try again.';
  }
  if (/rate.?limit|429/i.test(msg)) {
    return 'Too many requests just now — give it a minute and try again.';
  }
  return msg;
}

/** Pages Claude actually consulted, so the app can show its working. */
function collectSources(message: Anthropic.Message): { title: string; url: string }[] {
  const out: { title: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const block of message.content as any[]) {
    // Search results arrive as tool results; fetches carry the page they read.
    const results =
      block?.type === 'web_search_tool_result' && Array.isArray(block.content)
        ? block.content
        : [];
    for (const r of results) {
      if (r?.url && !seen.has(r.url)) {
        seen.add(r.url);
        out.push({ title: r.title || r.url, url: r.url });
      }
    }
    if (block?.type === 'web_fetch_tool_result' && block.content?.url && !seen.has(block.content.url)) {
      seen.add(block.content.url);
      out.push({ title: block.content.retrieved_at ?? block.content.url, url: block.content.url });
    }
  }
  return out.slice(0, 12);
}

interface Unit {
  title: string;
  summary: string;
  topics: string[];
}

interface TextbookScan {
  book: {
    title: string;
    authors: string;
    edition: string;
    publisher: string;
    year: string;
    /** How sure Claude is that this is the right book: 'high' | 'medium' | 'low'. */
    confidence: string;
    /** One or two sentences on what the book covers overall. */
    overview: string;
  };
  units: Unit[];
  /** Anything the student should confirm, e.g. an ambiguous edition. */
  notes: string;
}

/**
 * POST /api/subject/textbook-scan
 * Body: { subjectName, textbookTitle, author?, edition?, yearLevel? }
 */
subjectRouter.post('/textbook-scan', async (req, res) => {
  try {
    const { textbookTitle, author, edition, yearLevel } = req.body as {
      textbookTitle?: string;
      author?: string;
      edition?: string;
      yearLevel?: string;
    };

    if (!textbookTitle?.trim()) {
      return res.status(400).json({ error: 'A textbook title is required.' });
    }

    const descriptor = [
      textbookTitle.trim(),
      author?.trim() ? `by ${author.trim()}` : '',
      edition?.trim() ? `(${edition.trim()})` : '',
    ]
      .filter(Boolean)
      .join(' ');

    // Keyed on the book, not the student. Two people with the same textbook get
    // the same contents, so the second one costs nothing and returns instantly.
    // The subject's name is deliberately not part of this: a book's contents
    // don't change based on what a student calls the class, and including it
    // both split the cache and confused the model into commenting on the
    // mismatch.
    const key = cacheKey('textbook', textbookTitle, author, edition, yearLevel);

    const { value: result, hit } = await cached('textbook-scan', key, async () => {
      const message = await researchWithWeb(
        TEXTBOOK_SCAN_INSTRUCTIONS,
        `A student${yearLevel ? ` at ${yearLevel} level` : ''} is using this textbook: ${descriptor}.

Identify this exact book and work out what its course covers.`,
        8000,
        // Good enough to skip the slower fetch stage: a confident identification
        // with a real set of units behind it.
        (m) => {
          try {
            const draft = parseJsonFromResponse<TextbookScan>(m);
            return draft.units?.length >= 5 && draft.book?.confidence !== 'low';
          } catch {
            return false;
          }
        }
      );
      const parsed = parseJsonFromResponse<TextbookScan>(message);
      return { ...parsed, sources: collectSources(message) };
    });

    res.json({ ...result, cached: hit });
  } catch (err) {
    console.error('[subject/textbook-scan]', err);
    res.status(500).json({ error: friendlyError(err) });
  }
});

/** How to research any textbook — everything except which one. */
const TEXTBOOK_SCAN_INSTRUCTIONS = `You identify school and university textbooks on the open web and report what each one covers.

Search the web to identify the exact book you are given and work out what its course actually covers. Useful things to look for, in rough order of usefulness:
- the publisher's page for the book, and its table of contents
- a contents listing or index from a bookseller or library catalogue
- any openly available copy of the book (including PDFs) whose contents page you can read
- the syllabus or curriculum the book is written for, if it is a recognised course

Then return ONLY a JSON object in exactly this shape (no markdown, no commentary):
{
  "book": {
    "title": "the book's full title as published",
    "authors": "author names, comma separated",
    "edition": "edition or empty string",
    "publisher": "publisher or empty string",
    "year": "publication year or empty string",
    "confidence": "high | medium | low",
    "overview": "1-2 sentences on what this book covers"
  },
  "units": [
    {
      "title": "Chapter or unit name as the book names it",
      "summary": "One sentence on what this unit teaches",
      "topics": ["specific topic", "specific topic"]
    }
  ],
  "notes": "Anything the student should double-check, or an empty string"
}

Rules:
- Report the book's structure — chapter and topic names — as factual information. Do NOT reproduce the book's actual teaching text, worked examples, exercises or any substantial passage from it; only name what each part covers.
- Give 6-14 units covering the whole book, in the order the book presents them.
- Give 3-8 specific topics per unit. Be concrete ("Integration by parts", not "More techniques").
- Set confidence to "low" and say so in notes if you could not find this specific book; in that case base the units on the standard course this title describes and make that clear.
- Never invent a publisher, year or edition you did not find.`;

interface Lesson {
  title: string;
  focus: string;
  objectives: string[];
  durationMin: number;
  unitTitle: string;
  /**
   * The textbook topic this lesson teaches, copied verbatim from the scanned
   * unit's topic list. Model-invented lesson titles vary run to run, so they
   * can't identify anything; this comes from the cached scan, is identical for
   * every student with this book, and is what makes the lesson body cacheable.
   */
  topic: string;
}

interface LessonMapResult {
  title: string;
  summary: string;
  lessons: Lesson[];
}

/**
 * POST /api/subject/lesson-map
 * Body: { subjectName, book, units, exam: { topicArea, fromTextbook, daysUntil } }
 */
subjectRouter.post('/lesson-map', async (req, res) => {
  try {
    const { subjectName, book, units, exam, mode } = req.body as {
      subjectName?: string;
      book?: { title?: string; authors?: string };
      units?: Unit[];
      exam?: { topicArea?: string; fromTextbook?: boolean; daysUntil?: number | null };
      mode?: 'exam' | 'focus' | 'survey';
    };

    if (!units?.length) {
      return res.status(400).json({ error: 'The subject needs a scanned textbook first.' });
    }

    const unitList = units
      .map((u) => `- ${u.title}: ${u.topics.join(', ')}`)
      .join('\n');

    const area = exam?.topicArea?.trim();
    const sourceLine =
      exam?.fromTextbook === false
        ? 'The material does NOT come from the textbook, so treat the book as background and lean on the standard treatment of these topics.'
        : "The material comes from the textbook, so follow the book's own structure and terminology.";

    /**
     * What the plan is for. A deep dive is not a shortened exam plan: there is
     * no deadline to cut against, so it goes further into one area rather than
     * covering more of the course.
     */
    const examLine = !area
      ? 'The student has no test and no chosen area, so build a plan that works steadily through the course from the start.'
      : mode === 'focus'
      ? `The student has no test coming up. They want to go deep on one area and genuinely understand it: ${area}.

Build an intensive plan on that area alone. There is no deadline, so depth beats coverage: go further into the why, take the harder cases the course would skip, and build from the foundations of this area up to the parts students find hardest. Do not pad the plan with other units. ${sourceLine}`
      : `The student has a test coming up on: ${area}.${
          exam?.daysUntil != null ? ` It is in ${exam.daysUntil} day(s).` : ''
        } ${sourceLine}`;

    const message = await anthropic.messages.create({
      model: RESEARCH_MODEL,
      max_tokens: 6000,
      thinking: { type: 'adaptive' as const },
      system: cachedSystem(RESEARCH_MODEL, LESSON_MAP_INSTRUCTIONS, "lesson-map"),
      messages: [
        {
          role: 'user',
          content: `Build a study plan for a student taking "${subjectName || 'this subject'}", using the textbook "${
            book?.title || 'their textbook'
          }"${book?.authors ? ` by ${book.authors}` : ''}.

${examLine}

The book covers these units:
${unitList}`,
        },
      ],
    });

    logCacheUsage('lesson-map', message);
    const result = parseJsonFromResponse<LessonMapResult>(message);
    res.json(result);
  } catch (err) {
    console.error('[subject/lesson-map]', err);
    res.status(500).json({ error: friendlyError(err) });
  }
});

/** The plan's shape and rules, which are the same whatever subject it is for. */
const LESSON_MAP_INSTRUCTIONS = `You build ordered study plans for school students from the contents of their textbook.

Return ONLY a JSON object in exactly this shape (no markdown, no commentary):
{
  "title": "A short name for this plan, e.g. 'Sequences and Series sprint'",
  "summary": "One sentence on what finishing this plan will get them",
  "lessons": [
    {
      "title": "Short lesson name",
      "focus": "One sentence on what this lesson covers",
      "objectives": ["what they'll be able to do", "..."],
      "durationMin": 30,
      "unitTitle": "The unit from the student's list this lesson draws on",
      "topic": "The single topic from that unit's list that this lesson teaches"
    }
  ]
}

Rules:
- Order the lessons so each one builds on the one before it. The first lesson must assume no prior work on this topic.
- Produce 5-10 lessons. If there is a test, every lesson must earn its place against that test, and if a number of days is given the whole plan must fit inside it.
- Put revision and mixed practice at the end, not the start.
- durationMin between 20 and 60, realistic for the content.
- 2-4 objectives per lesson, each starting with a verb.
- unitTitle must be copied exactly from one of the units the student listed.
- topic must be copied exactly, character for character, from that unit's topic list. Pick the one topic the lesson is really about. Never reword it and never invent one.
- Two lessons may not share the same topic.`;

interface LessonQuestion {
  prompt: string;
  /** Multiple choice options, or null for a written answer. */
  choices: string[] | null;
  answer: string;
  explanation: string;
  /** 1 (warm-up) to 5 (hardest), ascending through the set. */
  difficulty: number;
  /** Needs a calculator or CAS rather than pen and paper. */
  technologyActive?: boolean;
  /** A function of x worth plotting beside the question, or null. */
  graph?: string | null;
}

interface LessonContentResult {
  coreTerms: string[];
  commonMistakes: string[];
  keyFormulas: string[];
  sections: { heading: string; body: string; keyPoints: string[] }[];
  worked: { problem: string; steps: string[]; answer: string }[];
  tips: string[];
  examTips: string[];
  questions: LessonQuestion[];
  /** Functions of x worth drawing for this topic. */
  graphs?: string[];
}

/**
 * POST /api/subject/lesson-content
 * Body: { subjectName, bookTitle, unitTitle, lesson: { title, focus, objectives }, examTopic }
 *
 * The lesson itself: the teaching, worked examples, things worth remembering,
 * and a graded question set. No web tools — this is the model teaching from a
 * named topic, so it runs on the cheaper LESSON_MODEL and stays fast.
 */
subjectRouter.post('/lesson-content', async (req, res) => {
  try {
    const { bookTitle, unitTitle, topic } = req.body as {
      bookTitle?: string;
      unitTitle?: string;
      topic?: string;
    };

    if (!topic?.trim()) {
      return res.status(400).json({ error: 'A topic is required.' });
    }

    // Keyed on the book and the topic, with nothing about the student in it.
    //
    // Which topics someone studies and in what order is personal, and that
    // lives in the lesson map. How the chain rule is taught is not — it is the
    // same explanation for everyone working from this book, so it is written
    // once and shared. This is what takes the marginal cost of a plan to
    // roughly nothing.
    const key = cacheKey('lesson', bookTitle, unitTitle, topic);

    const { value: result, hit } = await cached('lesson-content', key, async () => {
      const message = await anthropic.messages.create(
      {
        model: LESSON_MODEL,
        // A full lesson plus twelve questions runs well past 8k; being cut off
        // mid-JSON reads as a parse failure rather than as the limit it is.
        max_tokens: 20000,
        system: cachedSystem(LESSON_MODEL, LESSON_INSTRUCTIONS, "lesson-content"),
        messages: [
          {
            role: 'user',
            content: `Write one self-contained lesson teaching this topic${
              bookTitle ? `, for a student working from the textbook "${bookTitle}"` : ''
            }.

Topic: ${topic}
${unitTitle ? `It belongs to the unit: ${unitTitle}` : ''}`,
          },
        ],
      },
      { timeout: 120000, maxRetries: 1 }
    );

      logCacheUsage('lesson-content', message);
      if (message.stop_reason === 'max_tokens') {
        throw new Error('The lesson came back longer than the space allowed for it.');
      }
      return parseJsonFromResponse<LessonContentResult>(message);
    });

    res.json({ ...result, cached: hit });
  } catch (err) {
    console.error('[subject/lesson-content]', err);
    res.status(500).json({ error: friendlyError(err) });
  }
});

/**
 * Everything about writing a lesson that doesn't depend on which lesson it is.
 *
 * Held apart from the topic deliberately. Building a plan is 5-10 of these
 * calls in a burst, and they differ only in the two lines naming the topic —
 * so with the instructions in the cached system prefix, the first call pays
 * for them and the rest read them back at a tenth of the price.
 */
const LESSON_INSTRUCTIONS = `You write single, self-contained lessons for a school student, from a named topic.

Return ONLY a JSON object in exactly this shape (no markdown, no commentary):
{
  "sections": [
    { "heading": "", "body": "", "keyPoints": ["", ""] }
  ],
  "worked": [
    { "problem": "", "steps": ["", ""], "answer": "" }
  ],
  "coreTerms": [""],
  "commonMistakes": [""],
  "keyFormulas": [""],
  "structures": [{ "smiles": "", "caption": "" }],
  "tips": [""],
  "examTips": [""],
  "graphs": [""],
  "questions": [
    { "prompt": "", "choices": ["A", "B", "C", "D"], "answer": "A", "explanation": "", "difficulty": 1, "technologyActive": false, "graph": null }
  ]
}

How to write maths:
- The app typesets this for display, so write maths in plain ASCII and it will be shown the way it looks on paper.
- Indices with ^ and a bracket when the index is more than one character: x^2, e^(kt), 3^(x-1).
- Subscripts with _: A_0, x_1.
- Fractions with a slash, bracketing anything longer than one term: (a+b)/(c-d), 3/4, dy/dx.
- Roots as sqrt(...): sqrt(x^2+1).
- Write pi, theta, infinity, <=, >=, !=, -> and "in R" as words or ASCII; they are converted to the proper symbols.
- Never use LaTeX commands, markdown, or Unicode superscript characters.

Rules for the three named blocks:
- "coreTerms": 4-6 entries. The vocabulary and definitions the rest of the lesson depends on, each stated precisely enough to be worth memorising.
- "commonMistakes": 4-6 entries. What actually trips students up on this topic and how to avoid it — not generic study advice.
- "structures": only for organic chemistry and only where seeing the skeletal structure is what makes the point — a functional group, an isomer pair, a reaction's product. 0-4 entries, each a valid SMILES string with a short caption naming the molecule. Plain SMILES only, no reaction arrows and no names in the smiles field. Leave it empty for every other subject and for chemistry topics that are not about structure.
- "keyFormulas": only for topics that genuinely have formulas — maths, physics, chemistry, economics and the like. 2-6 entries, each a formula on its own and nothing else: "A = A_0 b^(kt)", not "the formula is A = A_0 b^(kt) where A is the amount". No trailing words, no leading words. For a topic with no formulas — an English text, a history period, a language, the qualitative parts of biology — return an empty array. Never invent a formula, and never pad the block with definitions or word equations written as if they were formulas.

Rules for the teaching:
- 3-5 sections that actually teach the idea, in the order it should be learned. Each body is 2-4 short paragraphs of real explanation — define the terms, say why it works, not just what to do. Separate paragraphs with \n\n.
- 2-4 keyPoints per section: the things to remember, stated precisely.
- 2-3 worked examples with the steps spelled out, so the method is visible.
- 4-6 tips: the things that actually trip students up here, and how to avoid them.
- 4-6 examTips: how this topic gets tested and how to pick up the marks — common question forms, what examiners look for, where marks get dropped.
- Put any formula worth displaying on a line of its own inside the body, with a blank line either side, rather than inside a sentence. The app sets those as displayed maths.
- Write it in plain, direct language, as a good teacher would. Do not reproduce text from the textbook; teach the topic yourself.

Rules for the questions:
- Exactly 12 questions, ordered from easiest to hardest, with difficulty rising 1 → 5 across the set.
- Start with recall and one-step questions; finish with multi-step problems that combine ideas from the lesson.
- Every question is multiple choice with exactly 4 options in "choices". Never null, never fewer — the app marks every question, so a question with nothing to choose from cannot be answered at all.
- "answer" must be exactly one of the four option strings, character for character.
- Make the three wrong options plausible: the results of the mistakes students actually make here, not obviously silly numbers.
- Every explanation says why the answer is right, in one or two sentences.
- "technologyActive": true only when the question genuinely needs a calculator or CAS — a decimal answer to a stated accuracy, a numerical solve, a value that cannot be found exactly by hand. A question doable with pen and paper is false. Most questions are false.

Graphs:
- "graphs" at the top level: 0-3 functions from the lesson that are worth seeing drawn, e.g. ["y = x^2 - 4x + 3"]. Leave it empty for topics with nothing to plot.
- "graph" on a question: the one function the question is about, or null. Set it wherever the shape of the curve is part of what is being asked — gradients at a point, maxima, intercepts, and every applied question (a height over time, a profit against quantity). Leave it null for questions that are pure technique, such as "differentiate ..." or "integrate ...", where the curve shows nothing about the method.
- A function of a variable other than x is fine and often better: write it as it is stated, "h(t) = 40 - 5t^2".
- Both must be a single function of x written as "y = ..." — the app plots them. Anything with another unknown in it, an inequality, or a relation that is not a function cannot be drawn, so leave it out rather than writing it.`;

/**
 * GET /api/subject/cache-stats
 * What the shared cache is saving: entries held and hit rate per namespace.
 */
subjectRouter.get('/cache-stats', async (_req, res) => {
  res.json(await cacheStats());
});
