import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { radii, spacing } from '../theme/theme';
import { useBaseTheme } from '../theme/useBaseTheme';
import { withAlpha } from '../store/useThemeStore';
import { ClassEntry } from '../types';
import { isSameDate } from '../lib/date';

/**
 * The week and month views of the timetable.
 *
 * Both only appear on a tablet: they need the width to put five days or a
 * whole month side by side without each column becoming unreadable. The day
 * view stays the only view on a phone.
 */

export type TimetableView = 'day' | 'week' | 'month';

export interface DayEntry {
  id: string;
  title: string;
  color: string;
  startMinutes: number;
  endMinutes: number;
  meta?: string;
  isReminder?: boolean;
}

const WEEK_HOUR_H = 76;
const GUTTER = 54;
/** Clamp the day so an 8am–3pm timetable isn't drawn over a 24 hour canvas. */
const DEFAULT_START = 8;
const DEFAULT_END = 16;

function label12(hour: number): string {
  const h = ((hour + 11) % 12) + 1;
  return `${h} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function toMinutes(time: string | undefined): number | null {
  const parts = (time ?? '').split(':');
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** A class turned into something both views can place on a time axis. */
export function entriesForClasses(classes: ClassEntry[]): DayEntry[] {
  const out: DayEntry[] = [];
  for (const c of classes) {
    const start = toMinutes(c.startTime);
    if (start === null) continue;
    const end = toMinutes(c.endTime) ?? start + 50;
    out.push({
      id: c.id,
      title: c.name || 'Untitled',
      color: c.color,
      startMinutes: start,
      endMinutes: Math.max(end, start + 20),
      meta: [c.room, c.teacher].filter(Boolean).join(' · '),
    });
  }
  return out.sort((a, b) => a.startMinutes - b.startMinutes);
}

// --- Week ------------------------------------------------------------------

interface Placed {
  entry: DayEntry;
  /** Which lane of its cluster this sits in, and how many lanes that cluster has. */
  lane: number;
  lanes: number;
  /** Minutes the block is drawn between, which may be snapped — see SNAP_MINUTES. */
  drawFrom: number;
  drawTo: number;
}

/**
 * A block starting within this of the one it clashes with is drawn level with
 * it. A reminder set for 9:00 against a lesson from 8:50 is the same slot as
 * far as the eye is concerned, and the ten-minute step reads as a mistake
 * rather than as detail. Anything further apart keeps its true position.
 */
const SNAP_MINUTES = 20;

/**
 * Splits a day's entries into side-by-side lanes so nothing covers anything.
 *
 * Entries are grouped into clusters of transitively overlapping items, and
 * each cluster is widened into as many lanes as it needs. Only the cluster
 * pays for the clash: a lone class either side of it still gets the full
 * column width.
 */
function placeEntries(entries: DayEntry[]): Placed[] {
  const sorted = [...entries].sort((a, b) => a.startMinutes - b.startMinutes);
  const out: Placed[] = [];

  let cluster: DayEntry[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    // Greedy lane assignment: reuse the first lane that has already finished.
    const laneEnds: number[] = [];
    const clusterStart = Math.min(...cluster.map((e) => e.startMinutes));
    // The entry that sets the cluster's start is what the snapped ones match.
    const anchorEnd = Math.max(
      ...cluster.filter((e) => e.startMinutes === clusterStart).map((e) => e.endMinutes)
    );
    const assigned = cluster.map((entry) => {
      let lane = laneEnds.findIndex((end) => end <= entry.startMinutes);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(entry.endMinutes);
      } else {
        laneEnds[lane] = entry.endMinutes;
      }
      // A block drawn level with the one it clashes with is drawn to the same
      // depth too. Half-height beside a full-height lesson leaves a hole in
      // the row that reads as missing content rather than as free time.
      const snapped = entry.startMinutes - clusterStart <= SNAP_MINUTES;
      return {
        entry,
        lane,
        drawFrom: snapped ? clusterStart : entry.startMinutes,
        drawTo: snapped ? Math.max(entry.endMinutes, anchorEnd) : entry.endMinutes,
      };
    });
    assigned.forEach(({ entry, lane, drawFrom, drawTo }) =>
      out.push({ entry, lane, lanes: laneEnds.length, drawFrom, drawTo })
    );
    cluster = [];
    clusterEnd = -1;
  };

  for (const entry of sorted) {
    if (cluster.length > 0 && entry.startMinutes >= clusterEnd) flush();
    cluster.push(entry);
    clusterEnd = Math.max(clusterEnd, entry.endMinutes);
  }
  flush();

  return out;
}

/**
 * Five weekdays beside one shared hour axis.
 *
 * A clash inside a day splits that stretch into lanes rather than letting one
 * block sit on top of another — a reminder due during a lesson is the common
 * case, and hiding the lesson behind it is the one thing the grid must not do.
 */
export function WeekGrid({
  dates,
  entriesFor,
  today,
  onPressDay,
}: {
  dates: Date[];
  entriesFor: (date: Date) => DayEntry[];
  today: Date;
  onPressDay?: (date: Date) => void;
}) {
  const t = useBaseTheme();

  const columns = useMemo(() => dates.map((d) => entriesFor(d)), [dates, entriesFor]);

  // The axis spans only the hours that actually hold something.
  const { startHour, endHour } = useMemo(() => {
    const all = columns.flat();
    if (all.length === 0) return { startHour: DEFAULT_START, endHour: DEFAULT_END };
    const first = Math.min(...all.map((e) => e.startMinutes)) / 60;
    const last = Math.max(...all.map((e) => e.endMinutes)) / 60;
    return { startHour: Math.max(0, Math.floor(first) - 1), endHour: Math.min(24, Math.ceil(last) + 1) };
  }, [columns]);

  const height = (endHour - startHour) * WEEK_HOUR_H;
  const yFor = (mins: number) => ((mins - startHour * 60) / 60) * WEEK_HOUR_H;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  return (
    <View style={styles.weekWrap}>
      {/* Day names stay pinned while the hours scroll under them. */}
      <View style={[styles.weekHeader, { borderBottomColor: t.cardBorder }]}>
        <View style={{ width: GUTTER }} />
        {dates.map((date) => {
          const isToday = isSameDate(date, today);
          return (
            <TouchableOpacity
              key={date.toISOString()}
              style={styles.weekHeaderCell}
              activeOpacity={0.7}
              onPress={() => onPressDay?.(date)}
            >
              <Text style={[styles.weekDayName, { color: isToday ? t.accentLight : t.muted }]}>
                {date.toLocaleDateString('en-US', { weekday: 'short' })}
              </Text>
              <View style={[styles.weekDayCircle, isToday && { backgroundColor: t.accent }]}>
                <Text
                  style={[styles.weekDayNumber, { color: isToday ? t.onAccent : t.text }]}
                >
                  {date.getDate()}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <View style={{ height: height + 8, flexDirection: 'row' }}>
          <View style={{ width: GUTTER }}>
            {hours.map((h) => (
              <Text
                key={h}
                style={[styles.hourLabel, { color: t.muted, top: (h - startHour) * WEEK_HOUR_H - 7 }]}
              >
                {label12(h)}
              </Text>
            ))}
          </View>

          {columns.map((entries, i) => (
            <View key={dates[i].toISOString()} style={styles.weekColumn}>
              {hours.map((h) => (
                <View
                  key={h}
                  style={[
                    styles.weekRule,
                    { top: (h - startHour) * WEEK_HOUR_H, backgroundColor: withAlpha(t.text, 0.08) },
                  ]}
                />
              ))}

              {placeEntries(entries).map(({ entry: e, lane, lanes, drawFrom, drawTo }) => {
                const top = yFor(drawFrom);
                const blockHeight = Math.max(26, yFor(drawTo) - top);
                // Long names wrap rather than being cut at the first word, and
                // are only cut once there is no second line to wrap onto.
                const titleLines = blockHeight >= 44 ? 2 : 1;
                const width = 100 / lanes;
                return (
                  <View
                    key={e.id}
                    style={[
                      styles.weekBlock,
                      {
                        top,
                        height: blockHeight,
                        left: `${lane * width}%`,
                        width: `${width}%`,
                        backgroundColor: withAlpha(e.color, t.isLight ? 0.28 : 0.34),
                        borderColor: withAlpha(e.color, 0.55),
                      },
                    ]}
                  >
                    <View style={[styles.weekBlockBar, { backgroundColor: e.color }]} />
                    <Text
                      style={[styles.weekBlockTitle, { color: t.text }]}
                      numberOfLines={titleLines}
                    >
                      {e.title}
                    </Text>
                    {blockHeight >= 66 && !!e.meta && (
                      <Text style={[styles.weekBlockMeta, { color: t.text }]} numberOfLines={1}>
                        {e.meta}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// --- Month -----------------------------------------------------------------

const WEEKDAY_HEADS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** More than this in a cell and the rest become a count. */
/** A row never shrinks past this; below it the grid scrolls instead. */
const MIN_ROW_HEIGHT = 104;
/** One chip plus the gap under it, used to work out how many fit in a cell. */
const CHIP_HEIGHT = 20;
/** The date line at the top of a cell, plus the cell's own padding. */
const CELL_DATE_HEIGHT = 30;

/** The weeks a month spans, Monday first, including the days either side. */
export function monthMatrix(month: Date): Date[][] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));

  const weeks: Date[][] = [];
  const cursor = new Date(start);
  for (let w = 0; w < 6; w += 1) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d += 1) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    // Stop once the month is covered rather than always drawing six rows.
    if (cursor.getMonth() !== month.getMonth() && cursor > first) break;
  }
  return weeks;
}

export function MonthGrid({
  month,
  entriesFor,
  today,
  onPressDay,
}: {
  month: Date;
  entriesFor: (date: Date) => DayEntry[];
  today: Date;
  onPressDay?: (date: Date) => void;
}) {
  const t = useBaseTheme();
  const weeks = useMemo(() => monthMatrix(month), [month]);

  // The grid is given the height it has rather than a fixed row height: a
  // month is four to six weeks, and on a tablet a fixed height left the
  // bottom third of the screen empty on the short ones. Rows share the space
  // and only start scrolling once they would be smaller than MIN_ROW_HEIGHT.
  const [available, setAvailable] = useState(0);
  const rowHeight = available
    ? Math.max(MIN_ROW_HEIGHT, (available - spacing.lg) / weeks.length)
    : MIN_ROW_HEIGHT;

  // A taller cell should show more of the day, not more empty space.
  const chipsPerCell = Math.max(
    2,
    Math.min(6, Math.floor((rowHeight - CELL_DATE_HEIGHT) / CHIP_HEIGHT))
  );

  return (
    <View style={styles.monthWrap}>
      <View style={styles.monthHeadRow}>
        {WEEKDAY_HEADS.map((d) => (
          <Text key={d} style={[styles.monthHead, { color: t.muted }]}>
            {d}
          </Text>
        ))}
      </View>

      <ScrollView
        onLayout={(e) => setAvailable(e.nativeEvent.layout.height)}
        contentContainerStyle={{ paddingBottom: spacing.lg }}
      >
        {weeks.map((week, wi) => (
          <View key={wi} style={[styles.monthRow, { height: rowHeight }]}>
            {week.map((date) => {
              const inMonth = date.getMonth() === month.getMonth();
              const isToday = isSameDate(date, today);
              const entries = entriesFor(date);
              const shown = entries.slice(0, chipsPerCell);
              return (
                <TouchableOpacity
                  key={date.toISOString()}
                  activeOpacity={0.8}
                  onPress={() => onPressDay?.(date)}
                  style={[
                    styles.monthCell,
                    {
                      borderColor: t.cardBorder,
                      backgroundColor: isToday ? withAlpha(t.accent, 0.1) : 'transparent',
                      // Days from the neighbouring months stay visible but
                      // recede, so the month's own shape is obvious.
                      opacity: inMonth ? 1 : 0.35,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.monthDate,
                      { color: isToday ? t.accentLight : t.text },
                    ]}
                  >
                    {date.getDate()}
                  </Text>

                  {shown.map((e) => (
                    <View
                      key={e.id}
                      style={[styles.monthChip, { backgroundColor: withAlpha(e.color, 0.3) }]}
                    >
                      <View style={[styles.monthChipDot, { backgroundColor: e.color }]} />
                      <Text style={[styles.monthChipText, { color: t.text }]} numberOfLines={1}>
                        {e.title}
                      </Text>
                    </View>
                  ))}

                  {entries.length > shown.length && (
                    <Text style={[styles.monthMore, { color: t.muted }]}>
                      +{entries.length - shown.length} more
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// --- The switcher ----------------------------------------------------------

export function ViewSwitcher({
  value,
  onChange,
}: {
  value: TimetableView;
  onChange: (next: TimetableView) => void;
}) {
  const t = useBaseTheme();
  const options: TimetableView[] = ['day', 'week', 'month'];

  return (
    <View style={[styles.switcher, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
      {options.map((option) => {
        const active = option === value;
        return (
          <TouchableOpacity
            key={option}
            onPress={() => onChange(option)}
            activeOpacity={0.8}
            style={[styles.switcherItem, active && { backgroundColor: t.accent }]}
          >
            <Text
              style={[
                styles.switcherLabel,
                { color: active ? t.onAccent : t.onCardSecondary },
              ]}
            >
              {option[0].toUpperCase() + option.slice(1)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // --- week ---
  weekWrap: { flex: 1 },
  weekHeader: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: spacing.sm },
  weekHeaderCell: { flex: 1, alignItems: 'center', gap: 4 },
  weekDayName: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  weekDayCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDayNumber: { fontSize: 15, fontWeight: '800' },
  weekColumn: { flex: 1, position: 'relative', paddingHorizontal: 3 },
  weekRule: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth },
  hourLabel: { position: 'absolute', right: 8, fontSize: 11, fontWeight: '600' },
  weekBlock: {
    position: 'absolute',
    // left and width come from the lane; the block keeps a hairline of air on
    // either side so neighbouring lanes read as separate.
    borderRadius: radii.sm,
    marginHorizontal: 1.5,
    borderWidth: 1,
    paddingVertical: 4,
    paddingLeft: 10,
    paddingRight: 6,
    overflow: 'hidden',
  },
  weekBlockBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  weekBlockTitle: { fontSize: 12, fontWeight: '800' },
  weekBlockMeta: { fontSize: 10, fontWeight: '600', marginTop: 1, opacity: 0.85 },

  // --- month ---
  monthWrap: { flex: 1 },
  monthHeadRow: { flexDirection: 'row', paddingBottom: spacing.sm },
  monthHead: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  monthRow: { flexDirection: 'row' },
  monthCell: {
    flex: 1,
    // Seven equal columns whatever is in them. Without the zero minimum a
    // cell is at least as wide as its widest chip, so one "Mathematical
    // Methods" widens its column and pushes the weekend off the screen.
    minWidth: 0,
    // The row sets the height now, so the cell only has to fill it.
    borderWidth: StyleSheet.hairlineWidth,
    padding: 5,
    gap: 3,
  },
  monthDate: { fontSize: 13, fontWeight: '800', marginBottom: 1 },
  monthChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 5,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  monthChipDot: { width: 5, height: 5, borderRadius: 3 },
  // minWidth again, so the title ellipsizes inside the chip rather than
  // setting the chip's width.
  monthChipText: { flex: 1, minWidth: 0, fontSize: 10, fontWeight: '700' },
  monthMore: { fontSize: 10, fontWeight: '700', marginTop: 1 },

  // --- switcher ---
  switcher: {
    flexDirection: 'row',
    borderRadius: radii.pill,
    borderWidth: 1,
    padding: 3,
    gap: 2,
  },
  switcherItem: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  switcherLabel: { fontSize: 13, fontWeight: '800' },
});
