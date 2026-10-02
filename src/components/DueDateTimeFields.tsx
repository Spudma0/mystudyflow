import React, { useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, radii, spacing } from '../theme/theme';
import { useBaseTheme } from '../theme/useBaseTheme';
import { useIsTablet } from '../lib/useIsTablet';

export function DueDateTimeFields({
  value,
  onChange,
  showDate = true,
}: {
  value: Date;
  onChange: (next: Date) => void;
  /** Hidden for repeating reminders, which have a time but no due date. */
  showDate?: boolean;
}) {
  const t = useBaseTheme();
  const isTablet = useIsTablet();
  const [rawPickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);
  // If the date field is hidden while its picker is open, drop back to no picker.
  const pickerMode = !showDate && rawPickerMode === 'date' ? null : rawPickerMode;

  return (
    <>
      <View style={styles.dateRow}>
        {showDate && (
        <TouchableOpacity style={styles.dateField} onPress={() => setPickerMode('date')}>
          <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
          <Text style={styles.dateFieldText}>
            {value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
        </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.dateField} onPress={() => setPickerMode('time')}>
          <Ionicons name="time-outline" size={16} color={colors.textMuted} />
          <Text style={styles.dateFieldText}>
            {value.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </Text>
        </TouchableOpacity>
      </View>

      {/* On a tablet the row is wide enough that a full-width spinner drifts
          away from the field it belongs to — it ends up under the date while
          you are setting the time. Pinning it to that field's half of the row
          keeps the wheel under what it edits. */}
      {pickerMode && (
        <View
          style={
            isTablet && showDate
              ? [styles.pickerHalf, pickerMode === 'time' ? styles.pickerRight : styles.pickerLeft]
              : undefined
          }
        >
        <DateTimePicker
          value={value}
          mode={pickerMode}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_event, selected) => {
            if (Platform.OS !== 'ios') setPickerMode(null);
            if (!selected) return;
            const next = new Date(value);
            if (pickerMode === 'date') {
              next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
            } else {
              next.setHours(selected.getHours(), selected.getMinutes());
            }
            onChange(next);
          }}
        />
        </View>
      )}
      {pickerMode && Platform.OS === 'ios' && (
        <TouchableOpacity onPress={() => setPickerMode(null)} style={styles.doneButton}>
          <Text style={[styles.doneButtonText, { color: t.accentLight }]}>Done</Text>
        </TouchableOpacity>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  dateRow: { flexDirection: 'row', gap: spacing.md },
  dateField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.cardAlt,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateFieldText: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  // Half the row, less half the gap between the two fields.
  pickerHalf: { width: '50%', paddingHorizontal: spacing.md / 2 },
  pickerLeft: { alignSelf: 'flex-start' },
  pickerRight: { alignSelf: 'flex-end' },
  doneButton: { alignSelf: 'flex-end', paddingVertical: spacing.sm },
  doneButtonText: { color: colors.purpleLight, fontWeight: '700' },
});
