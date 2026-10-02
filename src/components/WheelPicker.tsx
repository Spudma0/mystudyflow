import React, { useRef } from 'react';
import {
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { radii, spacing } from '../theme/theme';
import { useBaseTheme } from '../theme/useBaseTheme';

const ITEM_H = 32;
const VISIBLE = 5; // odd — center row is the selection
const pad = ((VISIBLE - 1) / 2) * ITEM_H;

/**
 * A scrollable wheel column with iOS-picker physics. Momentum + snap come from
 * the ScrollView itself (snapToInterval); each item's rotation / scale / opacity
 * is derived continuously from the live scroll offset (a native-driven
 * Animated.Value) — never from a discrete index — so the "cylinder" projection
 * stays perfectly smooth and jitter-free while the wheel spins.
 */
export function WheelPicker({
  items,
  selectedIndex,
  onChange,
  width = 72,
  showBand = true,
  visibleRows = VISIBLE,
}: {
  items: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  width?: number;
  showBand?: boolean;
  visibleRows?: number;
}) {
  const t = useBaseTheme();
  const ref = useRef<any>(null);
  const scrollY = useRef(new Animated.Value(selectedIndex * ITEM_H)).current;
  const localPad = ((visibleRows - 1) / 2) * ITEM_H;

  // The wheel is never repositioned from JS while the user is scrolling it.
  // `snapToInterval` makes the ScrollView itself click each row into the band,
  // and the value is simply read back from wherever it lands — so there is no
  // correction step that can fight the gesture and yank the wheel.
  const hasMomentum = useRef(false);
  const positioned = useRef(false);

  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
    useNativeDriver: true,
  });

  // Land on the current value once, when the wheel first has a size. This runs
  // before the user can touch it and never again, so it can't interrupt a scroll.
  const onContentSizeChange = () => {
    if (positioned.current) return;
    positioned.current = true;
    (ref.current as any)?.scrollTo?.({ y: selectedIndex * ITEM_H, animated: false });
  };

  const commitOffset = (y: number) => {
    const i = Math.max(0, Math.min(items.length - 1, Math.round(y / ITEM_H)));
    if (i !== selectedIndex) onChange(i);
  };

  // A drag ends with or without momentum. When momentum follows, let it settle
  // and read the value there instead, so one gesture produces one change.
  const onScrollEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    setTimeout(() => {
      if (hasMomentum.current) return;
      commitOffset(y);
    }, 80);
  };

  const onMomentumScrollBegin = () => {
    hasMomentum.current = true;
  };

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    hasMomentum.current = false;
    commitOffset(e.nativeEvent.contentOffset.y);
  };

  // Tapping a row is the one time we move the wheel for the user.
  const tapTo = (i: number) => {
    (ref.current as any)?.scrollTo?.({ y: i * ITEM_H, animated: true });
    if (i !== selectedIndex) onChange(i);
  };

  return (
    <View style={{ height: ITEM_H * visibleRows, width }}>
      {showBand && (
        <View
          pointerEvents="none"
          style={[styles.band, { top: localPad, height: ITEM_H, backgroundColor: t.cardAlt, borderColor: t.cardBorder }]}
        />
      )}
      <Animated.ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        scrollEventThrottle={16}
        contentOffset={{ x: 0, y: selectedIndex * ITEM_H }}
        onContentSizeChange={onContentSizeChange}
        onScroll={onScroll}
        onScrollEndDrag={onScrollEndDrag}
        onMomentumScrollBegin={onMomentumScrollBegin}
        onMomentumScrollEnd={onMomentumScrollEnd}
        contentContainerStyle={{ paddingVertical: localPad }}
      >
        {items.map((it, i) => {
          const center = i * ITEM_H;
          const inputRange = [center - 2 * ITEM_H, center - ITEM_H, center, center + ITEM_H, center + 2 * ITEM_H];
          const rotateX = scrollY.interpolate({
            inputRange,
            outputRange: ['58deg', '29deg', '0deg', '-29deg', '-58deg'],
            extrapolate: 'clamp',
          });
          const scale = scrollY.interpolate({
            inputRange,
            outputRange: [0.68, 0.84, 1, 0.84, 0.68],
            extrapolate: 'clamp',
          });
          const opacity = scrollY.interpolate({
            inputRange,
            outputRange: [0.25, 0.55, 1, 0.55, 0.25],
            extrapolate: 'clamp',
          });
          return (
            <TouchableOpacity key={i} activeOpacity={0.7} onPress={() => tapTo(i)}>
              <Animated.View style={[styles.item, { opacity, transform: [{ perspective: 520 }, { rotateX }, { scale }] }]}>
                <Text style={{ fontSize: 18, fontWeight: '600', color: t.onCard }}>{it}</Text>
              </Animated.View>
            </TouchableOpacity>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}

/**
 * Hour / minute (+ AM-PM when `hour24` is false) wheels that resolve to a Date.
 * A single grey band spans all columns, so it reads as one selection bar.
 */
export function WheelTimePicker({
  value,
  onChange,
  hour24 = false,
}: {
  value: Date;
  onChange: (d: Date) => void;
  hour24?: boolean;
}) {
  const t = useBaseTheme();
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
  const h24 = value.getHours();
  const minIdx = value.getMinutes();

  if (hour24) {
    const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    const update = (hi: number, mi: number) => {
      const d = new Date(value);
      d.setHours(hi, mi, 0, 0);
      onChange(d);
    };
    return (
      <View style={styles.timeWrap}>
        <View
          pointerEvents="none"
          style={[styles.band, { top: pad, height: ITEM_H, backgroundColor: t.cardAlt, borderColor: t.cardBorder }]}
        />
        <View style={styles.timeRow}>
          <WheelPicker items={hours} selectedIndex={h24} onChange={(i) => update(i, minIdx)} width={64} showBand={false} />
          <Text style={[styles.timeSep, { color: t.onCard }]}>:</Text>
          <WheelPicker items={minutes} selectedIndex={minIdx} onChange={(i) => update(h24, i)} width={64} showBand={false} />
        </View>
      </View>
    );
  }

  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const periods = ['AM', 'PM'];
  const hourIdx = ((h24 % 12) || 12) - 1;
  const periodIdx = h24 >= 12 ? 1 : 0;

  const update = (hi: number, mi: number, pi: number) => {
    let h = (hi + 1) % 12;
    if (pi === 1) h += 12;
    const d = new Date(value);
    d.setHours(h, mi, 0, 0);
    onChange(d);
  };

  return (
    <View style={styles.timeWrap}>
      <View
        pointerEvents="none"
        style={[styles.band, { top: pad, height: ITEM_H, backgroundColor: t.cardAlt, borderColor: t.cardBorder }]}
      />
      <View style={styles.timeRow}>
        <WheelPicker items={hours} selectedIndex={hourIdx} onChange={(i) => update(i, minIdx, periodIdx)} width={64} showBand={false} />
        <WheelPicker items={minutes} selectedIndex={minIdx} onChange={(i) => update(hourIdx, i, periodIdx)} width={64} showBand={false} />
        <WheelPicker items={periods} selectedIndex={periodIdx} onChange={(i) => update(hourIdx, minIdx, i)} width={64} showBand={false} />
      </View>
    </View>
  );
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** A single-column date wheel spanning a window around today. */
export function WheelDatePicker({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const before = 30;
  const after = 150;
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const dates = Array.from({ length: before + after + 1 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() - before + i);
    return d;
  });
  const labels = dates.map((d) => d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' }));
  let idx = dates.findIndex((d) => sameDay(d, value));
  if (idx < 0) idx = before; // default to today

  return (
    <View style={styles.dateWrap}>
      <WheelPicker items={labels} selectedIndex={idx} onChange={(i) => onChange(dates[i])} width={240} visibleRows={3} />
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    position: 'absolute',
    left: 4,
    right: 4,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  item: { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  timeWrap: { alignSelf: 'center' },
  timeRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  timeSep: { fontSize: 18, fontWeight: '700', marginTop: -2 },
  dateWrap: { alignItems: 'center' },
});
