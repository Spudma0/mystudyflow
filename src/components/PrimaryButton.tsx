import React from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radii, shadow, spacing } from '../theme/theme';
import { useBaseTheme } from '../theme/useBaseTheme';
import { Ionicons } from '@expo/vector-icons';

export function PrimaryButton({
  label,
  onPress,
  icon,
  style,
  loading,
  disabled,
}: {
  label: string;
  onPress: (e: GestureResponderEvent) => void;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
  loading?: boolean;
  disabled?: boolean;
}) {
  const t = useBaseTheme();
  if (disabled) {
    return (
      <View style={[styles.button, styles.buttonDisabled, style]}>
        {icon && <Ionicons name={icon} size={18} color={colors.textMuted} style={{ marginRight: spacing.sm }} />}
        <Text style={[styles.label, styles.labelDisabled]}>{label}</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} disabled={loading} style={style}>
      <LinearGradient
        colors={[t.accentLight, t.accent]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.button, shadow.glow]}
      >
        {loading ? (
          <ActivityIndicator color={t.onAccent} />
        ) : (
          <>
            {icon && <Ionicons name={icon} size={18} color={t.onAccent} style={{ marginRight: spacing.sm }} />}
            <Text style={[styles.label, { color: t.onAccent }]}>{label}</Text>
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: radii.md,
  },
  buttonDisabled: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  labelDisabled: {
    color: colors.textMuted,
  },
});
