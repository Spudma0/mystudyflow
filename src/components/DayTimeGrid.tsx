import React, { useEffect, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radii, spacing } from '../theme/theme';
import { useBaseTheme } from '../theme/useBaseTheme';
import { useIsTablet } from '../lib/useIsTablet';
import { darken, lighten, withAlpha } from '../store/useThemeStore';
import { ClassEntry } from '../types';

const GUTTER = 52; // width of the hour-label column
const MIN_BLOCK_H = 26;
/** The "now" marker is red on every theme — it reads as a clock, not as chrome. */
const NOW_RED = '#FF3B30';
const NOW_PILL_H = 18;

/** "HH:MM" → minutes past midnight, or null when the time is missing/!valid. */
function toMinutes(time: string | undefined): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function label12(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return 'Noon';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

function formatAt(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

/** Bare clock face for the now-pill, e.g. "9:41" — no suffix, as on iOS. */
function formatClock(mins: number): string {
  const h = Math.floor(mins / 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mins % 60).padStart(2, '0')}`;
}

function formatRange(start: number, end: number): string {
  const fmt = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const suffix = h < 12 ? 'am' : 'pm';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

/** A reminder falling on the day being shown, placed at its due time. */
export interface GridReminder {
  id: string;
  title: string;
  /** Category colour, matching the reminder accents used elsewhere. */
  color: string;
  /** Due time as minutes past midnight. */
  minutes: number;
  meta?: string;
}

/** Anything the grid can draw: a class or a reminder, laid out the same way. */
interface GridItem {
  id: string;
  title: string;
  color: string;
  meta: string;
  isReminder: boolean;
  entry?: ClassEntry;
}

interface Positioned {
  item: GridItem;
  start: number;
  end: number;
  /** Which of the overlapping columns this block sits in, and how many there are. */
  column: number;
  columns: number;
}

/**
 * Lays overlapping classes out side by side, the way a calendar does: classes
 * that share any minute form a cluster, and each takes the first free column in
 * that cluster so nothing is ever hidden behind anything else.
 */
function positionAll(items: { item: GridItem; start: number; end: number }[]): Positioned[] {
  if (!items.length) return [];

  // 1. Group into clusters of items that overlap, in time order.
  const byTime = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const clusters: (typeof byTime)[] = [];
  let current: typeof byTime = [];
  let reach = -Infinity;
  for (const it of byTime) {
    if (current.length && it.start >= reach) {
      clusters.push(current);
      current = [];
      reach = -Infinity;
    }
    current.push(it);
    reach = Math.max(reach, it.end);
  }
  if (current.length) clusters.push(current);

  // 2. Within each cluster, place classes before reminders — a class always
  //    keeps the left-hand column and an overlapping reminder is pushed right.
  const out: Positioned[] = [];
  for (const group of clusters) {
    const ordered = [...group].sort(
      (a, b) =>
        Number(a.item.isReminder) - Number(b.item.isReminder) || a.start - b.start || a.end - b.end
    );
    const placed: Positioned[] = [];
    for (const it of ordered) {
      const lastEndByColumn: number[] = [];
      placed.forEach((p) => {
        lastEndByColumn[p.column] = Math.max(lastEndByColumn[p.column] ?? -Infinity, p.end);
      });
      let column = 0;
      while ((lastEndByColumn[column] ?? -Infinity) > it.start) column += 1;
      placed.push({ ...it, column, columns: 1 });
    }
    const width = placed.reduce((max, p) => Math.max(max, p.column + 1), 0);
    placed.forEach((p) => (p.columns = width));
    out.push(...placed);
  }
  return out;
}

export function DayTimeGrid({
  classes,
  reminders = [],
  isToday,
  onPressClass,
  onPressReminder,
}: {
  classes: ClassEntry[];
  reminders?: GridReminder[];
  isToday: boolean;
  onPressClass?: (entry: ClassEntry) => void;
  onPressReminder?: (id: string) => void;
}) {
  const t = useBaseTheme();
  const tablet = useIsTablet();
  const scrollRef = useRef<ScrollView>(null);

  // Pixels per hour. A 50-minute class has to be tall enough to carry its
  // title, time and room without the block looking like a sliver, and a tablet
  // has the height to give it more.
  const HOUR_H = tablet ? 120 : 92;

  // Classes and reminders go through one layout pass, so a reminder that lands
  // inside a period automatically splits that row rather than covering it.
  const timed = useMemo(() => {
    const rows: { item: GridItem; start: number; end: number }[] = [];
    for (const entry of classes) {
      const start = toMinutes(entry.startTime);
      let end = toMinutes(entry.endTime);
      if (start === null) continue;
      // A missing or backwards end time still deserves a readable block.
      if (end === null || end <= start) end = start + 45;
      rows.push({
        item: {
          id: entry.id,
          title: entry.name || 'Untitled Class',
          color: entry.color,
          meta: [entry.room, entry.teacher].filter(Boolean).join(' · '),
          isReminder: false,
          entry,
        },
        start,
        end,
      });
    }
    for (const r of reminders) {
      rows.push({
        item: {
          id: r.id,
          title: r.title,
          color: r.color,
          meta: r.meta ?? '',
          isReminder: true,
        },
        start: r.minutes,
        // A reminder is a moment, not a span — it's drawn as a one-hour block.
        end: r.minutes + 60,
      });
    }
    return positionAll(rows);
  }, [classes, reminders]);

  const untimed = useMemo(
    () => classes.filter((c) => toMinutes(c.startTime) === null),
    [classes]
  );

  // The grid always covers the full day, midnight to midnight, so anything can
  // be scheduled at any hour. It opens scrolled to wherever the action is.
  const startHour = 0;
  const endHour = 24;

  const hours = useMemo(
    () => Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i),
    [startHour, endHour]
  );
  const gridHeight = (endHour - startHour) * HOUR_H;

  const yFor = (mins: number) => ((mins - startHour * 60) / 60) * HOUR_H;

  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const showNow = isToday && nowMins >= startHour * 60 && nowMins <= endHour * 60;

  // Open near the action: the current time today, otherwise the first class.
  // Over a full 24-hour grid that target is a long way down, so the scroll is
  // deferred until the content has actually been measured — scrolling before
  // then silently clamps to the top.
  const openAtY = Math.max(
    0,
    yFor(showNow ? nowMins : timed.length ? timed[0].start : 8 * 60) - HOUR_H
  );
  const openAtRef = useRef(openAtY);
  openAtRef.current = openAtY;
  // A scroll aimed at the grid before its parent has constrained it — which is
  // the normal state for a tab that hasn't been opened yet — is silently
  // dropped, and the measurement callbacks don't reliably fire again once it
  // has. So the scroll is retried until it actually takes, then left alone.
  useEffect(() => {
    let attempts = 0;
    const id = setInterval(() => {
      attempts += 1;
      const view = scrollRef.current as (ScrollView & { getScrollableNode?: () => unknown }) | null;
      view?.scrollTo({ y: openAtRef.current, animated: false });
      const node = view?.getScrollableNode?.() as { scrollTop?: number } | undefined;
      // `scrollTop` only exists on web; elsewhere one call is always enough.
      const settled = typeof node?.scrollTop !== 'number' || node.scrollTop > 0;
      if (settled || openAtRef.current === 0 || attempts >= 12) clearInterval(id);
    }, 120);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, reminders]);

  // Subject colours are mid-tones; nudging them toward the text end of the
  // theme makes the title read as a heading rather than fading into the wash.
  const titleColor = (c: string) => (t.isLight ? darken(c, 0.28) : lighten(c, 0.3));

  const hairline = withAlpha(t.text, t.isLight ? 0.14 : 0.13);
  const halfHairline = withAlpha(t.text, t.isLight ? 0.07 : 0.065);

  return (
    <View style={styles.root}>
      {untimed.length > 0 && (
        <View style={[styles.allDay, { borderBottomColor: hairline }]}>
          <Text style={[styles.allDayLabel, { color: t.muted }]}>No time</Text>
          <View style={styles.allDayItems}>
            {untimed.map((c) => (
              <TouchableOpacity
                key={c.id}
                activeOpacity={0.85}
                onPress={() => onPressClass?.(c)}
                style={[styles.allDayChip, { backgroundColor: withAlpha(c.color, 0.18) }]}
              >
                <Text style={[styles.allDayChipText, { color: c.color }]} numberOfLines={1}>
                  {c.name || 'Untitled'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={{ height: gridHeight + 12 }}>
          {/* Hour rules + labels */}
          {hours.map((h) => {
            const y = (h - startHour) * HOUR_H;
            return (
              <View key={h} pointerEvents="none">
                <Text style={[styles.hourLabel, { top: y - 7, color: t.muted }]}>{label12(h)}</Text>
                <View style={[styles.rule, { top: y, left: GUTTER, backgroundColor: hairline }]} />
                {h < endHour && (
                  <View
                    style={[styles.rule, { top: y + HOUR_H / 2, left: GUTTER, backgroundColor: halfHairline }]}
                  />
                )}
              </View>
            );
          })}

          {/* Classes live in their own layer inset from the hour gutter, so the
              per-column percentages resolve against the usable width only. */}
          <View style={styles.blocksLayer}>
            {timed.map(({ item, start, end, column, columns }) => {
              const top = yFor(start);
              const height = Math.max(MIN_BLOCK_H, yFor(end) - top);
              const pct = 100 / columns;
              // Room and teacher belong in the label, so they get their own line
              // when the block is tall and share the time line when it isn't.
              const roomy = height >= 60;
              const compact = height >= 34;
              return (
                <View
                  key={item.id}
                  style={{ position: 'absolute', top, height, left: `${column * pct}%`, width: `${pct}%` }}
                >
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() =>
                      item.isReminder ? onPressReminder?.(item.id) : item.entry && onPressClass?.(item.entry)
                    }
                    style={[styles.block, { borderColor: withAlpha(item.color, 0.55), shadowColor: item.color }]}
                  >
                    {/* One flat tint of the subject colour. A gradient made the
                        foot of every block fade out, which read as the subject
                        petering out rather than as depth. */}
                    <View
                      style={[
                        StyleSheet.absoluteFill,
                        { backgroundColor: withAlpha(item.color, t.isLight ? 0.28 : 0.34) },
                      ]}
                    />
                    <View style={[styles.blockBar, { backgroundColor: item.color }]} />
                    {/* A bell at the leading edge is what separates a reminder
                        from a class at a glance — the two are drawn alike
                        otherwise, and it stays visible on the shortest block. */}
                    {item.isReminder && (
                      <View style={[styles.bellBadge, { backgroundColor: withAlpha(item.color, 0.22) }]}>
                        <Ionicons name="notifications" size={12} color={titleColor(item.color)} />
                      </View>
                    )}
                    <View style={styles.blockBody}>
                      <View style={styles.blockTitleRow}>
                        <Text style={[styles.blockTitle, { color: titleColor(item.color) }]} numberOfLines={1}>
                          {item.title}
                        </Text>
                      </View>
                      {compact && (
                        <Text style={[styles.blockTime, { color: t.text }]} numberOfLines={1}>
                          {item.isReminder ? formatAt(start) : formatRange(start, end)}
                          {!roomy && !!item.meta ? ` · ${item.meta}` : ''}
                        </Text>
                      )}
                      {roomy && !!item.meta && (
                        // Room and teacher are the detail you scan for, so they
                        // sit close to body-text brightness rather than muted.
                        <Text style={[styles.blockMeta, { color: t.text }]} numberOfLines={1}>
                          {item.meta}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}

          </View>

          {/* Current time: a red pill in the hour gutter, a dot where the day's
              column begins, and a rule across the rest of it. Sits above the
              blocks so it stays readable over a class. */}
          {showNow && (
            <View pointerEvents="none" style={[styles.nowRow, { top: yFor(nowMins) - NOW_PILL_H / 2 }]}>
              <View style={styles.nowPillWrap}>
                <View style={[styles.nowPill, { backgroundColor: NOW_RED }]}>
                  <Text style={styles.nowPillText}>{formatClock(nowMins)}</Text>
                </View>
              </View>
              <View style={[styles.nowDot, { backgroundColor: NOW_RED }]} />
              <View style={[styles.nowLine, { backgroundColor: NOW_RED }]} />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { paddingTop: 10, paddingBottom: spacing.xxxl, paddingRight: spacing.xl },
  allDay: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    marginBottom: spacing.sm,
  },
  allDayLabel: { fontSize: 11, fontWeight: '700', width: GUTTER - 8, paddingTop: 6 },
  allDayItems: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  allDayChip: {
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  allDayChipText: { fontSize: 12, fontWeight: '700' },
  hourLabel: {
    position: 'absolute',
    left: 0,
    width: GUTTER - 10,
    textAlign: 'right',
    fontSize: 11,
    fontWeight: '600',
  },
  rule: { position: 'absolute', right: 0, height: StyleSheet.hairlineWidth },
  blocksLayer: { position: 'absolute', left: GUTTER + 6, right: 0, top: 0, bottom: 0 },
  nowRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: NOW_PILL_H,
    flexDirection: 'row',
    alignItems: 'center',
  },
  nowPillWrap: { width: GUTTER - 6, alignItems: 'flex-end' },
  nowPill: {
    height: NOW_PILL_H,
    minWidth: 38,
    borderRadius: NOW_PILL_H / 2,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nowPillText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  nowDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 4 },
  nowLine: { flex: 1, height: 1.5, marginLeft: -1 },
  block: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: radii.md,
    borderWidth: 1,
    overflow: 'hidden',
    // Keeps a hairline of background between side-by-side classes.
    marginRight: 4,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 7,
    elevation: 3,
  },
  blockBar: { width: 4 },
  bellBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginLeft: spacing.sm,
    marginRight: -2,
  },
  blockBody: { flex: 1, paddingHorizontal: spacing.sm, paddingVertical: 4, justifyContent: 'center' },
  blockTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  blockTitle: { flex: 1, fontSize: 13, fontWeight: '800' },
  blockTime: { fontSize: 11, fontWeight: '600', marginTop: 1, opacity: 0.85 },
  blockMeta: { fontSize: 11, fontWeight: '600', marginTop: 1, opacity: 0.85 },
});
