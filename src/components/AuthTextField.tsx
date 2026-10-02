import React, { useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { radii, spacing } from '../theme/theme';
import { useBaseTheme } from '../theme/useBaseTheme';

/**
 * Text field for the auth + onboarding flow: the label sits above the input and
 * the border lifts to the accent colour on focus. Kept deliberately plain —
 * one rule, one colour change — so the forms read as calm rather than busy.
 */
export function AuthTextField({
  label,
  value,
  onChangeText,
  ...rest
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
} & Omit<TextInputProps, 'value' | 'onChangeText' | 'style'>) {
  const t = useBaseTheme();
  const [focused, setFocused] = useState(false);
  const focus = useRef(new Animated.Value(0)).current;

  const animate = (to: number) => {
    setFocused(to === 1);
    Animated.timing(focus, {
      toValue: to,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  };

  const borderColor = focus.interpolate({
    inputRange: [0, 1],
    outputRange: [t.cardBorder, t.accent],
  });

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: focused ? t.accentLight : t.muted }]}>{label}</Text>
      <Animated.View style={[styles.inputWrap, { backgroundColor: t.card, borderColor }]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => animate(1)}
          onBlur={() => animate(0)}
          placeholderTextColor={t.onCardMuted}
          // outlineStyle removes the browser's own focus ring in the web preview;
          // the animated border below is the focus indicator on every platform.
          style={[styles.input, { color: t.onCard }, { outlineStyle: 'none' } as any]}
          {...rest}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  inputWrap: {
    borderRadius: radii.md,
    borderWidth: 1.5,
  },
  input: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '600',
  },
});
