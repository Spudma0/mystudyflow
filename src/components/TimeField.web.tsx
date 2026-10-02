import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '../theme/theme';

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

/** "9:00 AM" -> "09:00" (24hr), used only as the input's display default before a value is picked. */
function placeholderTo24(placeholder: string): string {
  const match = placeholder.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!match) return '09:00';
  let h = parseInt(match[1], 10);
  const m = match[2];
  const period = match[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${pad(h)}:${m}`;
}

export function TimeField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (time24: string) => void;
  placeholder: string;
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const [h, m] = e.target.value.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    onChange(`${pad(h)}:${pad(m)}`);
  };

  return (
    <View style={styles.wrap}>
      <input
        type="time"
        value={value || placeholderTo24(placeholder)}
        onChange={handleChange}
        style={webInputStyle}
      />
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
  wrap: {
    backgroundColor: colors.cardAlt,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
