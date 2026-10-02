import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme/theme';
import { useBaseTheme } from '../theme/useBaseTheme';
import { useTimetableStore } from '../store/useTimetableStore';
import { formatTimeLabel } from '../lib/date';
import { SegmentRing } from './SegmentRing';
import { TimerDigits } from './TimerDigits';
import { ClassEntry } from '../types';

const MINUTE = 60 * 1000;
/** How much of the wait the ring covers when nothing precedes the lesson. */
const DEFAULT_WINDOW = 60 * MINUTE;
const MIN_WINDOW = 5 * MINUTE;
const MAX_WINDOW = 120 * MINUTE;

function atTime(day: Date, hhmm: string): Date | null {
  // Timetable slots can be left blank, so both halves have to be present and
  // numeric — `"".split(':')` yields one part and would otherwise build an
  // invalid date that poisons every countdown downstream.
  const parts = (hhmm ?? '').split(':');
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
}

interface NextLesson {
  entry: ClassEntry;
  start: number;
  /** End of whatever lesson runs immediately before it, if that's already past. */
  prevEnd: number | null;
}

/** Walks forward through the cycle until it finds a lesson that hasn't started. */
function findNextLesson(
  getClassesForDate: (d: Date) => ClassEntry[],
  now: number
): NextLesson | null {
  for (let offset = 0; offset < 14; offset += 1) {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    const sorted = [...getClassesForDate(day)]
      .map((c) => ({ c, start: atTime(day, c.startTime) }))
      .filter((x): x is { c: ClassEntry; start: Date } => x.start !== null)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    for (let i = 0; i < sorted.length; i += 1) {
      const { c, start } = sorted[i];
      if (start.getTime() <= now) continue;
      const before = sorted[i - 1];
      const beforeEnd = before ? atTime(day, before.c.endTime) : null;
      return {
        entry: c,
        start: start.getTime(),
        prevEnd: beforeEnd && beforeEnd.getTime() <= now ? beforeEnd.getTime() : null,
      };
    }
  }
  return null;
}

/** Always hours:minutes:seconds, so "51:40" can't be misread as 51 hours. */
function countdownText(remainingMs: number): string {
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/**
 * Full-width widget counting down to the next scheduled lesson, with a ring of
 * lamps that go out as the wait shortens.
 */
export function NextLessonWidget() {
  const t = useBaseTheme();
  const timetable = useTimetableStore((s) => s.timetable);
  const getClassesForDate = useTimetableStore((s) => s.getClassesForDate);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Re-resolved once a minute rather than every tick — the answer only changes
  // when a lesson starts, and the scan walks up to a fortnight of the cycle.
  const minuteKey = Math.floor(now / MINUTE);
  const lesson = useMemo(
    () => (timetable ? findNextLesson(getClassesForDate, Date.now()) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timetable, getClassesForDate, minuteKey]
  );

  const remaining = lesson ? Math.max(0, lesson.start - now) : 0;
  const soon = Boolean(lesson) && remaining < 5 * MINUTE;
  const tint = soon ? colors.amber : t.onTile;

  const window = lesson
    ? Math.min(MAX_WINDOW, Math.max(MIN_WINDOW, lesson.start - (lesson.prevEnd ?? lesson.start - DEFAULT_WINDOW)))
    : DEFAULT_WINDOW;
  const progress = lesson ? remaining / window : 0;

  return (
    <View style={[styles.card, { backgroundColor: t.cardScrim }]}>
      <SegmentRing size={92} progress={progress} color={tint} />

      <View style={styles.body}>
        {lesson ? (
          <>
            <TimerDigits text={countdownText(remaining)} height={38} color={tint} />
            <Text style={[styles.title, { color: t.onTile }]} numberOfLines={1}>
              {lesson.entry.name || 'Untitled Class'}
            </Text>
            <Text style={[styles.meta, { color: t.onTileMuted }]} numberOfLines={1}>
              starts {formatTimeLabel(lesson.entry.startTime)}
              {lesson.entry.room ? ` · ${lesson.entry.room}` : ''}
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.empty, { color: t.onTile }]}>No lessons planned</Text>
            <Text style={[styles.meta, { color: t.onTileMuted }]}>
              {timetable ? 'Nothing scheduled for the next fortnight' : 'Build a timetable to start the clock'}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    padding: spacing.lg,
    gap: spacing.lg,
    minHeight: 118,
  },
  body: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800', marginTop: spacing.sm },
  meta: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  empty: { fontSize: 20, fontWeight: '800', letterSpacing: 0.2 },
});
