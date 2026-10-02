import React, { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { radii, spacing } from '../../theme/theme';
import { useBaseTheme } from '../../theme/useBaseTheme';
import { PrimaryButton } from '../../components/PrimaryButton';
import { AuthTextField } from '../../components/AuthTextField';
import { LineGridBackground } from '../../components/LineGridBackground';
import { SetupStep } from './SetupStep';
import { useAuthStore } from '../../store/useAuthStore';
import {
  useThemeStore,
  ACCENT_COLOR_PALETTE,
  BASE_COLOR_PALETTE,
  CARD_COLOR_PALETTE,
} from '../../store/useThemeStore';

const SCREEN_W = Dimensions.get('window').width;
const YEAR_LEVELS = ['Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11', 'Year 12', 'Other'];
const STEPS = ['You', 'School', 'Theme', 'Setup'] as const;

/**
 * Registration part two: the questions that make the app yours.
 *
 * One screen holds all three steps and slides between them, so there is no
 * navigator push per question and the progress bar can animate continuously.
 */
export function OnboardingScreen() {
  const t = useBaseTheme();
  const saveProfile = useAuthStore((s) => s.saveProfile);
  const finishOnboarding = useAuthStore((s) => s.finishOnboarding);
  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);

  const accentColor = useThemeStore((s) => s.accentColor);
  const baseColor = useThemeStore((s) => s.baseColor);
  const cardColor = useThemeStore((s) => s.cardColor);
  const setAccentColor = useThemeStore((s) => s.setAccentColor);
  const setBaseColor = useThemeStore((s) => s.setBaseColor);
  const setCardColor = useThemeStore((s) => s.setCardColor);

  // The step width is measured rather than taken from Dimensions: the window is
  // not the same as the pane the slider actually occupies (web preview frame,
  // split view, rotation), and a wrong width mis-aligns every slide.
  const [width, setWidth] = useState(SCREEN_W);
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState('');
  const [school, setSchool] = useState('');
  const [yearLevel, setYearLevel] = useState('');

  const slide = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;

  const goTo = (next: number) => {
    Animated.parallel([
      Animated.timing(slide, {
        toValue: next,
        duration: 320,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: true,
      }),
      Animated.timing(progress, {
        toValue: next,
        duration: 320,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: false,
      }),
    ]).start();
    setStep(next);
  };

  const canAdvance =
    step === 0 ? fullName.trim().length > 0 : step === 1 ? yearLevel.length > 0 : true;

  const handleNext = async () => {
    if (step < STEPS.length - 1) {
      goTo(step + 1);
      return;
    }
    // Last step — persist everything to the account, then hand over to the app.
    const ok = await saveProfile({
      full_name: fullName.trim(),
      school: school.trim(),
      year_level: yearLevel,
      accent_color: accentColor,
      base_color: baseColor,
      card_color: cardColor,
    });
    if (ok) await finishOnboarding();
  };

  const translateX = slide.interpolate({
    inputRange: [0, STEPS.length - 1],
    outputRange: [0, -width * (STEPS.length - 1)],
  });

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: t.base }]} edges={['top']}>
      {/* Sits outside the sliding step container, so the pattern stays put while
          the steps move across it. */}
      <LineGridBackground always />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => step > 0 && goTo(step - 1)}
          hitSlop={10}
          style={{ opacity: step > 0 ? 1 : 0 }}
          disabled={step === 0}
        >
          <Ionicons name="chevron-back" size={26} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.stepLabel, { color: t.muted }]}>
          Step {step + 1} of {STEPS.length}
        </Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={[styles.track, { backgroundColor: t.cardBorder }]}>
        <Animated.View
          style={[
            styles.trackFill,
            {
              backgroundColor: t.accent,
              width: progress.interpolate({
                inputRange: [0, STEPS.length - 1],
                outputRange: [`${Math.round(100 / STEPS.length)}%`, '100%'],
              }),
            },
          ]}
        />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        <Animated.View style={[styles.slider, { transform: [{ translateX }] }]}>
          {/* ---- Step 1: name ---- */}
          <Step width={width}>
            <Heading
              title="What should we call you?"
              subtitle="This is the name on your home screen each morning."
            />
            <AuthTextField
              label="Full name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Alex Chen"
              autoCapitalize="words"
              returnKeyType="next"
            />
          </Step>

          {/* ---- Step 2: school + year ---- */}
          <Step width={width}>
            <Heading
              title="Where do you study?"
              subtitle="Used to label your timetable. You can change it later."
            />
            <AuthTextField
              label="School"
              value={school}
              onChangeText={setSchool}
              placeholder="Westside Prep"
              autoCapitalize="words"
            />
            <Text style={[styles.fieldLabel, { color: t.muted }]}>Year level</Text>
            <View style={styles.chipWrap}>
              {YEAR_LEVELS.map((y) => {
                const active = yearLevel === y;
                return (
                  <TouchableOpacity
                    key={y}
                    onPress={() => setYearLevel(y)}
                    activeOpacity={0.85}
                    style={[
                      styles.chip,
                      { backgroundColor: active ? t.accent : t.card, borderColor: active ? t.accent : t.cardBorder },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: active ? t.onAccent : t.onCard }]}>{y}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Step>

          {/* ---- Step 3: theme ---- */}
          <Step width={width}>
            <Heading
              title="Make it yours"
              subtitle="Pick your colours — the whole app follows them."
            />

            <LinearGradient
              colors={[accentColor, baseColor]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.preview}
            >
              <View style={[styles.previewCard, { backgroundColor: cardColor }]} />
            </LinearGradient>

            <Swatches
              label="Accent"
              options={ACCENT_COLOR_PALETTE}
              selected={accentColor}
              onSelect={setAccentColor}
            />
            <Swatches
              label="Background"
              options={BASE_COLOR_PALETTE}
              selected={baseColor}
              onSelect={setBaseColor}
            />
            <Swatches
              label="Cards"
              options={CARD_COLOR_PALETTE}
              selected={cardColor}
              onSelect={setCardColor}
            />
          </Step>

          {/* ---- Step 4: load in their real timetable + reminders ---- */}
          <Step width={width}>
            <Heading
              title="Bring your stuff in"
              subtitle="Optional — you can do any of this later from the app."
            />
            <SetupStep />
          </Step>
        </Animated.View>

        <View style={styles.footer}>
          {!!error && <Text style={styles.error}>{error}</Text>}
          <PrimaryButton
            label={step === STEPS.length - 1 ? 'Finish setup' : 'Continue'}
            loading={busy}
            disabled={!canAdvance || busy}
            onPress={handleNext}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Step({ width, children }: { width: number; children: React.ReactNode }) {
  return (
    <ScrollView
      style={{ width, flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={styles.stepContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

function Heading({ title, subtitle }: { title: string; subtitle: string }) {
  const t = useBaseTheme();
  return (
    <View style={styles.heading}>
      <Text style={[styles.title, { color: t.text }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: t.secondary }]}>{subtitle}</Text>
    </View>
  );
}

function Swatches({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: { name: string; color: string }[];
  selected: string;
  onSelect: (c: string) => void;
}) {
  const t = useBaseTheme();
  return (
    <View style={styles.swatchBlock}>
      <Text style={[styles.fieldLabel, { color: t.muted }]}>{label}</Text>
      <View style={styles.swatchRow}>
        {options.map((o) => (
          <TouchableOpacity
            key={o.name}
            onPress={() => onSelect(o.color)}
            activeOpacity={0.8}
            style={[
              styles.swatch,
              { backgroundColor: o.color },
              selected === o.color && { borderColor: t.accentLight, borderWidth: 3 },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  stepLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  track: { height: 3, marginHorizontal: spacing.xl, borderRadius: 2, overflow: 'hidden' },
  trackFill: { height: 3, borderRadius: 2 },
  slider: { flex: 1, flexDirection: 'row' },
  stepContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, paddingBottom: spacing.xl },
  heading: { marginBottom: spacing.xxl },
  title: { fontSize: 26, fontWeight: '800' },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: spacing.sm },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  chipText: { fontSize: 14, fontWeight: '700' },
  preview: {
    height: 96,
    borderRadius: radii.lg,
    marginBottom: spacing.xl,
    padding: spacing.lg,
    justifyContent: 'flex-end',
  },
  previewCard: { height: 34, borderRadius: radii.md },
  swatchBlock: { marginBottom: spacing.lg },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  swatch: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.18)',
  },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.sm },
  error: { color: '#F87171', fontSize: 13, lineHeight: 18 },
});
