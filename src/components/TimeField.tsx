import React, { useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, radii, spacing } from '../theme/theme';
import { useBaseTheme } from '../theme/useBaseTheme';
import { dateToTime24, formatTimeLabel, time24ToDate } from '../lib/date';

export function TimeField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (time24: string) => void;
  placeholder: string;
}) {
  const t = useBaseTheme();
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleChange = (_event: unknown, selected?: Date) => {
    if (Platform.OS !== 'ios') setPickerOpen(false);
    if (!selected) return;
    onChange(dateToTime24(selected));
  };

  return (
    <View>
      <TouchableOpacity
        style={[styles.wrap, { backgroundColor: t.cardAlt, borderColor: t.cardBorder }]}
        onPress={() => setPickerOpen(true)}
      >
        <Text style={[styles.value, { color: value ? t.onCard : t.onCardMuted }]}>
          {value ? formatTimeLabel(value) : placeholder}
        </Text>
        <Ionicons name="time-outline" size={16} color={t.onCardMuted} />
      </TouchableOpacity>

      {pickerOpen && (
        <DateTimePicker
          value={time24ToDate(value)}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleChange}
        />
      )}
      {pickerOpen && Platform.OS === 'ios' && (
        <TouchableOpacity onPress={() => setPickerOpen(false)} style={styles.doneButton}>
          <Text style={[styles.doneButtonText, { color: t.accentLight }]}>Done</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardAlt,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  value: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  placeholder: { color: colors.textMuted, fontWeight: '400' },
  doneButton: { alignSelf: 'flex-end', paddingVertical: spacing.sm },
  doneButtonText: { color: colors.purpleLight, fontWeight: '700' },
});
