import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import {
  ClassEntry,
  CycleType,
  DaySchedule,
  Lesson,
  LessonContent,
  LessonMap,
  Textbook,
  TextbookScan,
  TextbookUnit,
} from '../types';
import { classColors } from '../theme/theme';

// Base URL of the MyStudyFlow backend (see /backend).
// Set EXPO_PUBLIC_API_URL in an .env / app config for real devices.
//  - Web / iOS simulator: http://localhost:3000
//  - Android emulator:     http://10.0.2.2:3000
//  - Physical device:      http://<your-computer-LAN-IP>:3000
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

// Shapes returned by the backend (see backend/src/routes).
interface ExtractedClass {
  name: string;
  room: string;
  teacher: string;
  startTime: string;
  endTime: string;
}
interface ExtractedDay {
  dayIndex: number;
  dayLabel: string;
  classes: ExtractedClass[];
}

/**
 * Read any local file URI as raw base64 (no format conversion). Used for PDFs.
 * Works on native and web in Expo.
 */
async function uriToRawBase64(uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
  return dataUrl.split(',')[1] ?? '';
}

/**
 * Convert an image (any format the OS can open, including iPhone HEIC) into a
 * JPEG and return its base64. Claude vision only accepts jpeg/png/gif/webp, so
 * normalizing to JPEG avoids "Could not process image" errors. Also downsizes
 * large photos to keep the upload small.
 */
async function imageUriToJpegBase64(uri: string): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: 1600 });
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.7,
    base64: true,
  });
  return result.base64 ?? '';
}

function isPdf(mimeType: string | undefined, uri: string): boolean {
  return mimeType === 'application/pdf' || uri.toLowerCase().endsWith('.pdf');
}

export async function transcribeTimetableFromFile(
  fileUri: string,
  mimeType?: string
): Promise<{ cycleType: CycleType; days: DaySchedule[] }> {
  // PDFs go to Claude as a document; everything else is normalized to JPEG.
  // The cycle length (5 vs 10 day) is detected by Claude from the timetable itself.
  const pdf = isPdf(mimeType, fileUri);
  const body = pdf
    ? { fileBase64: await uriToRawBase64(fileUri), mediaType: 'application/pdf' }
    : { imageBase64: await imageUriToJpegBase64(fileUri), mediaType: 'image/jpeg' };

  const res = await fetch(`${API_URL}/api/timetable/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Timetable import failed (${res.status}).`);
  }

  const data = (await res.json()) as { cycleType: CycleType; days: ExtractedDay[] };

  // Assign one distinct color per unique subject across the whole timetable, so
  // the same subject is always the same color and each subject differs.
  const colorBySubject = new Map<string, string>();
  const colorForSubject = (name: string): string => {
    const key = name.trim().toLowerCase();
    if (!key) return classColors[0];
    let color = colorBySubject.get(key);
    if (!color) {
      color = classColors[colorBySubject.size % classColors.length];
      colorBySubject.set(key, color);
    }
    return color;
  };

  // Add the id + color the app's ClassEntry needs (backend leaves these out).
  const days: DaySchedule[] = data.days.map((day) => ({
    dayIndex: day.dayIndex,
    dayLabel: day.dayLabel,
    classes: day.classes.map(
      (c, i): ClassEntry => ({
        ...c,
        id: `${day.dayIndex}-${i}-${Date.now()}`,
        color: colorForSubject(c.name),
      })
    ),
  }));

  return { cycleType: data.cycleType === 10 ? 10 : 5, days };
}

/**
 * POST JSON with a deadline and errors a student can act on.
 *
 * A bare fetch has no timeout, so a request that stalls surfaces as the browser
 * or OS giving up with "Failed to fetch" — which says nothing about what went
 * wrong or what to do. The research endpoints are slow by nature, so they get a
 * generous budget and an explicit message when it runs out.
 */
async function postJson<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new Error('That took too long. Check your connection and try again.');
    }
    // Anything else here means the request never reached the server at all.
    throw new Error(
      `Can't reach MyStudyFlow's server at ${API_URL}. Make sure the backend is running and that this device is on the same network.`
    );
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status}).`);
  }
  return (await res.json()) as T;
}

/**
 * Ask the backend to find a textbook on the web and work out what course it
 * teaches. Claude does the searching itself, so this can take a while — the
 * caller should show progress rather than a spinner that looks stuck.
 */
export async function scanTextbook(input: {
  subjectName: string;
  textbookTitle: string;
  author?: string;
  edition?: string;
  yearLevel?: string;
}): Promise<TextbookScan> {
  // The server's own budget is 170s search + up to 90s fetch; stay above it so
  // its specific message wins over a generic client timeout.
  const data = await postJson<TextbookScan>('/api/subject/textbook-scan', input, 280000);
  return {
    book: data.book,
    units: Array.isArray(data.units) ? data.units : [],
    notes: data.notes ?? '',
    sources: Array.isArray(data.sources) ? data.sources : [],
  };
}

/** Turn a scanned textbook plus an upcoming test into an ordered lesson map. */
export async function generateLessonMap(input: {
  subjectName: string;
  book: Textbook;
  units: TextbookUnit[];
  exam: { topicArea: string; fromTextbook: boolean; daysUntil: number | null };
  /**
   * What the plan is aimed at. 'exam' builds towards a test; 'focus' is a
   * deep dive into one area with no deadline; 'survey' works through the
   * course from the start.
   */
  mode?: 'exam' | 'focus' | 'survey';
}): Promise<LessonMap> {
  const data = await postJson<{ title: string; summary: string; lessons: Omit<Lesson, 'id'>[] }>(
    '/api/subject/lesson-map',
    input,
    120000
  );
  return {
    title: data.title || `${input.subjectName} study plan`,
    summary: data.summary ?? '',
    // Ids are assigned here so completion can be tracked without depending on
    // the model returning stable ones.
    lessons: (data.lessons ?? []).map((l, i) => ({ ...l, id: `lesson-${i + 1}` })),
    generatedAt: Date.now(),
  };
}

/**
 * Fetch one lesson: the teaching, worked examples, what to remember, and a
 * graded question set.
 *
 * Shared across everyone using the same textbook, so this usually returns a
 * cached lesson immediately and only occasionally writes a new one.
 */
export async function generateLessonContent(input: {
  bookTitle: string;
  unitTitle: string;
  /** Copied from the scanned textbook — the cache is keyed on it. */
  topic: string;
}): Promise<LessonContent> {
  const data = await postJson<LessonContent>('/api/subject/lesson-content', input, 150000);
  return {
    sections: data.sections ?? [],
    worked: data.worked ?? [],
    tips: data.tips ?? [],
    examTips: data.examTips ?? [],
    coreTerms: data.coreTerms ?? [],
    commonMistakes: data.commonMistakes ?? [],
    keyFormulas: data.keyFormulas ?? [],
    questions: (data.questions ?? []).map((q) => ({
      ...q,
      // A model that returns an empty options array means "written answer".
      choices: q.choices && q.choices.length ? q.choices : null,
    })),
  };
}
