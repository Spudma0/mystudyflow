import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useBaseTheme } from '../theme/useBaseTheme';

export function Avatar({ initials, size = 48 }: { initials: string; size?: number }) {
  const t = useBaseTheme();
  return (
    <LinearGradient
      colors={[t.accentLight, t.accentDark]}
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size * 0.32 },
      ]}
    >
      <Text style={[styles.text, { fontSize: size * 0.36, color: t.onAccent }]}>{initials}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
