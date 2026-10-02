import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { radii, shadow, spacing } from '../theme/theme';
import { useBaseTheme } from '../theme/useBaseTheme';

export function Card({ style, children, ...rest }: ViewProps) {
  const t = useBaseTheme();
  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    ...shadow.card,
  },
});
