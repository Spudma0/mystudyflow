import React from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radii, spacing, APP_MAX_WIDTH } from '../theme/theme';
import { useBaseTheme } from '../theme/useBaseTheme';
import { withAlpha } from '../store/useThemeStore';
import { useWidgetsStore, WIDGET_CATALOGUE, WidgetId } from '../store/useWidgetsStore';

/**
 * The editor behind a long-press on the home widgets: switch each one on or
 * off and shuffle the order of the ones you keep.
 */
export function WidgetSettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useBaseTheme();
  const widgets = useWidgetsStore((s) => s.widgets);
  const toggleWidget = useWidgetsStore((s) => s.toggleWidget);
  const moveWidget = useWidgetsStore((s) => s.moveWidget);
  const resetWidgets = useWidgetsStore((s) => s.resetWidgets);

  // Enabled widgets first, in their live order, so the list mirrors the strip.
  const ordered = [
    ...widgets.map((id) => WIDGET_CATALOGUE.find((w) => w.id === id)!).filter(Boolean),
    ...WIDGET_CATALOGUE.filter((w) => !widgets.includes(w.id)),
  ];

  const canRemove = widgets.length > 1;

  // --- Swipe down to dismiss ---------------------------------------------
  // The gesture lives on the grab area at the top of the sheet rather than the
  // whole surface, so a downward flick inside the list still scrolls it.
  const drag = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) drag.setValue(0);
  }, [visible, drag]);

  const dismiss = React.useCallback(() => {
    Animated.timing(drag, { toValue: 600, duration: 180, useNativeDriver: true }).start(() => {
      drag.setValue(0);
      onClose();
    });
  }, [drag, onClose]);

  const pan = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
        // Only downward travel moves the sheet — dragging up must not lift it
        // off the bottom of the screen.
        onPanResponderMove: (_e, g) => drag.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_e, g) => {
          // Either far enough or fast enough counts, so a short flick works.
          if (g.dy > 110 || g.vy > 0.7) dismiss();
          else Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        },
      }),
    [drag, dismiss]
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <Animated.View
          style={[styles.sheet, { backgroundColor: t.base, transform: [{ translateY: drag }] }]}
        >
          <View style={styles.grabArea} {...pan.panHandlers}>
            <View style={[styles.handle, { backgroundColor: t.cardBorder }]} />

            <View style={styles.titleRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: t.text }]}>Customise widgets</Text>
                <Text style={[styles.subtitle, { color: t.secondary }]}>
                  Choose what sits at the top of your home screen.
                </Text>
              </View>
              <TouchableOpacity
                onPress={resetWidgets}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.reset, { color: t.accentLight }]}>Reset</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {ordered.map((w) => {
              const on = widgets.includes(w.id);
              const index = widgets.indexOf(w.id);
              return (
                <TouchableOpacity
                  key={w.id}
                  activeOpacity={0.85}
                  onPress={() => toggleWidget(w.id)}
                  disabled={on && !canRemove}
                  style={[
                    styles.row,
                    {
                      backgroundColor: t.card,
                      borderColor: on ? withAlpha(t.accent, 0.7) : t.cardBorder,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.iconWrap,
                      { backgroundColor: on ? t.accentSoftBg : withAlpha(t.onCard, 0.07) },
                    ]}
                  >
                    <Ionicons
                      name={w.icon as keyof typeof Ionicons.glyphMap}
                      size={18}
                      color={on ? t.accentLight : t.onCardMuted}
                    />
                  </View>

                  <View style={styles.rowBody}>
                    <Text style={[styles.rowTitle, { color: t.onCard }]}>{w.title}</Text>
                    <Text style={[styles.rowSubtitle, { color: t.onCardMuted }]} numberOfLines={2}>
                      {w.subtitle}
                    </Text>
                  </View>

                  {on && (
                    <View style={styles.arrows}>
                      <ReorderButton
                        icon="chevron-up"
                        disabled={index <= 0}
                        color={t.onCardSecondary}
                        onPress={() => moveWidget(w.id, -1)}
                      />
                      <ReorderButton
                        icon="chevron-down"
                        disabled={index >= widgets.length - 1}
                        color={t.onCardSecondary}
                        onPress={() => moveWidget(w.id, 1)}
                      />
                    </View>
                  )}

                  <View
                    style={[
                      styles.check,
                      on
                        ? { backgroundColor: t.accent, borderColor: t.accent }
                        : { borderColor: t.cardBorder },
                    ]}
                  >
                    {on && <Ionicons name="checkmark" size={15} color={t.onAccent} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={[styles.done, { backgroundColor: t.accent }]}
            activeOpacity={0.88}
            onPress={onClose}
          >
            <Text style={[styles.doneText, { color: t.onAccent }]}>Done</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

function ReorderButton({
  icon,
  disabled,
  color,
  onPress,
}: {
  icon: 'chevron-up' | 'chevron-down';
  disabled: boolean;
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      style={{ opacity: disabled ? 0.25 : 1 }}
    >
      <Ionicons name={icon} size={16} color={color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    width: '100%',
    maxWidth: APP_MAX_WIDTH,
    alignSelf: 'center',
    maxHeight: '86%',
  },
  // The whole heading is the grab handle, not just the bar — a 40×4 target is
  // hard to hit, and dragging the title is what people try anyway.
  grabArea: { paddingTop: spacing.xs, marginTop: -spacing.xs },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.lg },
  title: { fontSize: 22, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 2 },
  reset: { fontSize: 14, fontWeight: '700', paddingTop: 4 },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '800' },
  rowSubtitle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  arrows: { justifyContent: 'center', gap: 2 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  done: {
    marginTop: spacing.lg,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  doneText: { fontSize: 16, fontWeight: '800' },
});
