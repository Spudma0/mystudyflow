import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '../theme/theme';

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

function toDateInputValue(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeInputValue(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const [y, m, d] = e.target.value.split('-').map(Number);
    if (!y || !m || !d) return;
    const next = new Date(value);
    next.setFullYear(y, m - 1, d);
    onChange(next);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const [h, min] = e.target.value.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(min)) return;
    const next = new Date(value);
    next.setHours(h, min);
    onChange(next);
  };

  return (
    <View style={styles.dateRow}>
      {showDate && (
        <View style={styles.dateField}>
          <input
            type="date"
            value={toDateInputValue(value)}
            onChange={handleDateChange}
            style={webInputStyle}
          />
        </View>
      )}
      <View style={styles.dateField}>
        <input
          type="time"
          value={toTimeInputValue(value)}
          onChange={handleTimeChange}
          style={webInputStyle}
        />
      </View>
    </View>
  );
}

const webInputStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: colors.textPrimary,
  fontSize: 14,
  fontWeight: 600,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  width: '100%',
  colorScheme: 'dark',
};

const styles = StyleSheet.create({
  dateRow: { flexDirection: 'row', gap: spacing.md },
  dateField: {
    flex: 1,
    backgroundColor: colors.cardAlt,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
