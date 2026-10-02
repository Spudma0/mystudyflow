import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { classColors, colors, radii, spacing } from '../theme/theme';
import { useBaseTheme } from '../theme/useBaseTheme';
import { ClassEntry } from '../types';
import { TimeField } from './TimeField';

export function ClassCard({
  index,
  entry,
  onChange,
  onDelete,
}: {
  index: number;
  entry: ClassEntry;
  onChange: (patch: Partial<ClassEntry>) => void;
  onDelete: () => void;
}) {
  const t = useBaseTheme();
  const update = (patch: Partial<ClassEntry>) => onChange(patch);
  const inputStyle = [styles.input, { backgroundColor: t.cardAlt, borderColor: t.cardBorder, color: t.onCard }];

  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.headerLabel, { color: t.onCardMuted }]}>CLASS {index + 1}</Text>
        <TouchableOpacity onPress={onDelete} hitSlop={8}>
          <Ionicons name="close-circle" size={22} color={t.onCardMuted} />
        </TouchableOpacity>
      </View>

      <Text style={[styles.fieldLabel, { color: t.onCardMuted }]}>COLOUR</Text>
      <View style={styles.swatchRow}>
        {classColors.map((c) => (
          <TouchableOpacity
            key={c}
            onPress={() => update({ color: c })}
            style={[
              styles.swatch,
              { backgroundColor: c },
              entry.color === c && { borderColor: t.onCard },
            ]}
          >
            {entry.color === c && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.fieldLabel, { color: t.onCardMuted }]}>CLASS NAME</Text>
      <TextInput
        value={entry.name}
        onChangeText={(v) => update({ name: v })}
        placeholder="e.g. AP Calculus BC"
        placeholderTextColor={t.onCardMuted}
        style={inputStyle}
      />

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={[styles.fieldLabel, { color: t.onCardMuted }]}>ROOM</Text>
          <TextInput
            value={entry.room}
            onChangeText={(v) => update({ room: v })}
            placeholder="Room 204"
            placeholderTextColor={t.onCardMuted}
            style={inputStyle}
          />
        </View>
        <View style={styles.half}>
          <Text style={[styles.fieldLabel, { color: t.onCardMuted }]}>TEACHER</Text>
          <TextInput
            value={entry.teacher}
            onChangeText={(v) => update({ teacher: v })}
            placeholder="Dr. Miller"
            placeholderTextColor={t.onCardMuted}
            style={inputStyle}
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.fieldLabel}>START</Text>
          <TimeField
            value={entry.startTime}
            onChange={(time) => update({ startTime: time })}
            placeholder="9:00 AM"
          />
        </View>
        <View style={styles.half}>
          <Text style={styles.fieldLabel}>END</Text>
          <TimeField
            value={entry.endTime}
            onChange={(time) => update({ endTime: time })}
            placeholder="10:00 AM"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  headerLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.lg,
  },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchSelected: {
    borderColor: colors.textPrimary,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.cardAlt,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 15,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  half: {
    flex: 1,
  },
});
