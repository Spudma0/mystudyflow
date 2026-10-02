import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { radii, spacing } from '../../theme/theme';
import { useBaseTheme } from '../../theme/useBaseTheme';
import { PrimaryButton } from '../../components/PrimaryButton';
import { LineGridBackground } from '../../components/LineGridBackground';
import { AuthStackParamList } from '../../navigation/types';

/** The logo's own purple, so the wordmark keeps the brand's two-tone scheme. */
const LOGO_PURPLE = '#811DA3';

// Two exports of the same artwork: the mark's dark half is white in one so it
// reads on a dark page, black in the other for light themes. The purple arc is
// identical in both.
const MARK_DARK = require('../../../assets/logo-mark-dark.png');
const MARK_LIGHT = require('../../../assets/logo-mark-light.png');

/** First thing a new install shows: the mark, the wordmark, two choices. */
export function WelcomeScreen() {
  const t = useBaseTheme();
  const navigation = useNavigation<StackNavigationProp<AuthStackParamList>>();

  // The mark and the copy rise in on a short stagger, so the first frame of the
  // app feels composed rather than simply appearing.
  const rise = useRef(new Animated.Value(0)).current;
  const riseCopy = useRef(new Animated.Value(0)).current;
  const riseActions = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const step = (v: Animated.Value, delay: number) =>
      Animated.timing(v, {
        toValue: 1,
        duration: 520,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
    Animated.parallel([step(rise, 60), step(riseCopy, 180), step(riseActions, 300)]).start();
  }, [rise, riseCopy, riseActions]);

  const lift = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
  });

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: t.base }]}>
      <LineGridBackground always />

      <View style={styles.body}>
        <Animated.View style={lift(rise)}>
          <Image
            source={t.isLight ? MARK_LIGHT : MARK_DARK}
            style={styles.mark}
            resizeMode="contain"
          />
        </Animated.View>

        <Animated.View style={[styles.copy, lift(riseCopy)]}>
          <Text style={[styles.welcome, { color: t.muted }]}>welcome to...</Text>
          <Text style={styles.wordmark}>
            <Text style={{ color: t.text }}>MyStudy</Text>
            <Text style={{ color: LOGO_PURPLE }}>Flow</Text>
          </Text>
          <Text style={[styles.subtitle, { color: t.secondary }]}>
            Your timetable, reminders and study time — in one place.
          </Text>
        </Animated.View>
      </View>

      <Animated.View style={[styles.actions, lift(riseActions)]}>
        <PrimaryButton label="Create an account" onPress={() => navigation.navigate('SignUp')} />
        <TouchableOpacity
          style={[styles.secondaryButton, { borderColor: t.cardBorder, backgroundColor: t.card }]}
          onPress={() => navigation.navigate('SignIn')}
          activeOpacity={0.85}
        >
          <Text style={[styles.secondaryLabel, { color: t.onCard }]}>I already have an account</Text>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  mark: { width: 150, height: 150 },
  copy: { alignItems: 'center', marginTop: spacing.xl },
  welcome: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  // Lowercase and tight, matching the logo's wordmark.
  wordmark: { fontSize: 40, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: spacing.md,
    maxWidth: 300,
  },
  actions: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  secondaryButton: {
    paddingVertical: 16,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryLabel: { fontSize: 15, fontWeight: '700' },
});
