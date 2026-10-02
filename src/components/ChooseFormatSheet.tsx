import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radii, shadow, spacing, APP_MAX_WIDTH } from '../theme/theme';
import { useBaseTheme } from '../theme/useBaseTheme';
import { CycleType } from '../types';

export function ChooseFormatSheet({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (cycleType: CycleType) => void;
}) {
  const t = useBaseTheme();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: t.base }]}>
          <View style={[styles.handle, { backgroundColor: t.cardBorder }]} />
          <Text style={[styles.title, { color: t.text }]}>Choose a format</Text>
          <Text style={[styles.subtitle, { color: t.secondary }]}>How many days is your school's timetable cycle?</Text>

          <View style={styles.optionsRow}>
            <TouchableOpacity
              style={[styles.option, { backgroundColor: t.card, borderColor: t.cardBorder }]}
              onPress={() => onSelect(5)}
              activeOpacity={0.85}
            >
              <Text style={[styles.optionTitle, { color: t.accentLight }]}>5 DAY CYCLE</Text>
              <Text style={[styles.optionSubtitle, { color: t.onCardSecondary }]}>Mon – Fri</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.option, { backgroundColor: t.card, borderColor: t.cardBorder }]}
              onPress={() => onSelect(10)}
              activeOpacity={0.85}
            >
              <Text style={[styles.optionTitle, { color: t.accentLight }]}>10 DAY CYCLE</Text>
              <Text style={[styles.optionSubtitle, { color: t.onCardSecondary }]}>Week 1 + Week 2</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.backgroundElevated,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    width: '100%',
    maxWidth: APP_MAX_WIDTH,
    alignSelf: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: spacing.xl,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  option: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    ...shadow.card,
  },
  optionTitle: {
    color: colors.purpleLight,
    fontWeight: '800',
    fontSize: 15,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  optionSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
  },
});
