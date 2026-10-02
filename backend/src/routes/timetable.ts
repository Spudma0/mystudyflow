import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import {
  anthropic,
  CLAUDE_MODEL,
  ImageMediaType,
  cachedSystem,
  logCacheUsage,
  parseJsonFromResponse,
} from '../anthropic.js';

export const timetableRouter = Router();

// Matches the app's ClassEntry, minus fields the client fills in (id, color).
interface ExtractedClass {
  name: string;
  room: string;
  teacher: string;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
}

interface ExtractedDay {
  dayIndex: number;
  dayLabel: string;
  classes: ExtractedClass[];
}

interface TimetableResult {
  cycleType?: 5 | 10;
  days: (ExtractedDay & { classes?: ExtractedClass[] })[];
}

function labelsForCycle(cycle: 5 | 10): string[] {
  return cycle === 5
    ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    : Array.from({ length: 10 }, (_, i) => `Day ${i + 1}`);
}

/**
 * POST /api/timetable/transcribe
 * Body: { imageBase64 | fileBase64, mediaType, cycleType? }
 *   cycleType is an optional hint only — Claude detects the real cycle length.
 * Returns: { cycleType: 5 | 10, days: ExtractedDay[] }  (client assigns id + color)
 */
timetableRouter.post('/transcribe', async (req, res) => {
  try {
    const { imageBase64, fileBase64, mediaType } = req.body as {
      imageBase64?: string; // JPEG/PNG/etc. image data
      fileBase64?: string; // PDF data (mediaType 'application/pdf')
      mediaType?: ImageMediaType | 'application/pdf';
    };

    const data = imageBase64 || fileBase64;
    if (!data || !mediaType) {
      return res.status(400).json({ error: 'image/file data and mediaType are required.' });
    }

    // PDFs are sent to Claude as a document block; images as an image block.
    const sourceBlock: Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam =
      mediaType === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
        : { type: 'image', source: { type: 'base64', media_type: mediaType, data } };

    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: cachedSystem(CLAUDE_MODEL, TIMETABLE_INSTRUCTIONS, "timetable"),
      messages: [
        {
          role: 'user',
          content: [
            sourceBlock,
            {
              type: 'text',
              text: 'This is the timetable. Determine its cycle length, then extract every class.',
            },
          ],
        },
      ],
    });

    logCacheUsage('timetable/transcribe', message);
    const result = parseJsonFromResponse<TimetableResult>(message);

    const cycle: 5 | 10 = result.cycleType === 10 ? 10 : 5;
    const dayLabels = labelsForCycle(cycle);

    // Normalize by dayIndex: guarantee exactly `cycle` days, in order, labelled by us.
    const byIndex = new Map(result.days?.map((d) => [d.dayIndex, d]) ?? []);
    const days: ExtractedDay[] = dayLabels.map((dayLabel, dayIndex) => {
      const found = byIndex.get(dayIndex);
      return {
        dayIndex,
        dayLabel,
        classes: Array.isArray(found?.classes) ? found!.classes! : [],
      };
    });

    res.json({ cycleType: cycle, days });
  } catch (err) {
    console.error('[timetable/transcribe]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Transcription failed.' });
  }
});

/** How to read any timetable. Kept ahead of the image, for the reason in notes.ts. */
const TIMETABLE_INSTRUCTIONS = `You transcribe a student's class timetable from an image or PDF into structured JSON.

Deciding the cycle length ("cycleType"):
- Use 5 if it is a single-week timetable that repeats every week (typically Monday–Friday).
- Use 10 if it is a two-week / fortnightly cycle — for example days labelled "Day 1" through "Day 10", or a "Week A" and "Week B" (or "Week 1"/"Week 2") layout, or any timetable that clearly spans 10 distinct teaching days before repeating.
- If genuinely ambiguous, default to 5.

Return ONLY a JSON object in exactly this shape (no markdown, no commentary):
{
  "cycleType": 5,
  "days": [
    {
      "dayIndex": 0,
      "classes": [
        { "name": "Course name", "room": "Room", "teacher": "Teacher name", "startTime": "HH:mm", "endTime": "HH:mm" }
      ]
    }
  ]
}

Rules:
- "cycleType" must be exactly 5 or 10.
- "dayIndex" is 0-based in the natural chronological order of the timetable (first teaching day = 0). For a 10-day cycle, Day 1 = 0 … Day 10 = 9; for a Week A / Week B layout, Week A Monday = 0 … Week B Friday = 9.
- Include one entry in "days" for every day in the cycle (5 or 10 of them), even if a day has no classes (use an empty "classes" array).
- Use 24-hour "HH:mm" times (e.g. "08:00", "13:30").
- If a field is missing in the image, use an empty string "".
- Do not invent classes that are not visible in the image.`;
