import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radii, spacing } from '../../theme/theme';
import { useBaseTheme } from '../../theme/useBaseTheme';
import { withAlpha } from '../../store/useThemeStore';
import { PrimaryButton } from '../../components/PrimaryButton';
import { AuthTextField } from '../../components/AuthTextField';
import { LineGridBackground } from '../../components/LineGridBackground';
import { DueDateTimeFields } from '../../components/DueDateTimeFields';
import { LessonMap as LessonMapView } from '../../components/LessonMap';
import { useSubjectProfileStore } from '../../store/useSubjectProfileStore';
import { useAuthStore } from '../../store/useAuthStore';
import { generateLessonContent, generateLessonMap, scanTextbook } from '../../lib/ai';
import { LessonContent, LessonMap, TextbookScan } from '../../types';
import { SubjectsStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<SubjectsStackParamList, 'SubjectProfile'>;

const STEPS = ['Textbook', 'Scan', 'Test', 'Plan'] as const;

/** Whole days from now until a date, never negative. */
function daysFromNow(date: Date): number {
  const ms = date.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/**
 * Building a subject's profile: which book it's taught from, what that book
 * covers, what's being tested, and the plan that comes out of it.
 *
 * Laid out like registration — one screen that slides between steps — because
 * the same "answer a few things and we'll set it up" feeling applies.
 */
export function SubjectProfileScreen({ route, navigation }: Props) {
  const t = useBaseTheme();
  const { subjectName, startAt } = route.params;

  const profile = useSubjectProfileStore((s) => s.bySubject[subjectName]);
  const saveProfile = useSubjectProfileStore((s) => s.saveProfile);
  const deleteProfile = useSubjectProfileStore((s) => s.deleteProfile);
  const yearLevel = useAuthStore((s) => s.profile?.year_level);

  const [width, setWidth] = useState(0);
  // Changing focus starts at the focus step: the book was settled the first
  // time through, and walking back past it to reach the one thing they came
  // to change is the long way round.
  const [step, setStep] = useState(startAt === 'focus' ? 2 : 0);

  // Step 1 — what they're using
  const [title, setTitle] = useState(profile?.textbookQuery.title ?? '');
  const [author, setAuthor] = useState(profile?.textbookQuery.author ?? '');
  const [edition, setEdition] = useState(profile?.textbookQuery.edition ?? '');

  // Step 2 — what the scan came back with
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<TextbookScan | null>(profile?.scan ?? null);
  const [scanError, setScanError] = useState<string | null>(null);

  // Step 3 — the test
  const [hasExam, setHasExam] = useState<boolean | null>(
    profile ? profile.exam.hasExam : null
  );
  const [topicArea, setTopicArea] = useState(profile?.exam.topicArea ?? '');
  const [fromTextbook, setFromTextbook] = useState<boolean>(profile?.exam.fromTextbook ?? true);
  const [examDate, setExamDate] = useState(
    profile?.exam.date ? new Date(profile.exam.date) : new Date(Date.now() + 7 * 864e5)
  );
  // Step 3, the other branch — what to go deep on when there is no test.
  const [focusArea, setFocusArea] = useState(profile?.focusArea ?? '');

  /** The scanned book's own units, offered as ready-made areas to choose from. */
  const topicChoices = useMemo(
    () => (scan?.units ?? []).map((u) => u.title).filter(Boolean).slice(0, 12),
    [scan]
  );

  // Step 4 — the plan
  const [building, setBuilding] = useState(false);
  const [written, setWritten] = useState(0);
  const [totalToWrite, setTotalToWrite] = useState(0);
  const [lessonMap, setLessonMap] = useState<LessonMap | null>(profile?.lessonMap ?? null);
  const [buildError, setBuildError] = useState<string | null>(null);

  const slide = useRef(new Animated.Value(startAt === 'focus' ? 2 : 0)).current;

  const goTo = (next: number) => {
    Animated.timing(slide, {
      toValue: next,
      duration: 320,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: true,
    }).start();
    setStep(next);
  };

  const handleScan = async () => {
    setScanning(true);
    setScanError(null);
    goTo(1);
    try {
      const result = await scanTextbook({
        subjectName,
        textbookTitle: title.trim(),
        author: author.trim() || undefined,
        edition: edition.trim() || undefined,
        yearLevel: yearLevel || undefined,
      });
      setScan(result);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'That lookup failed. Try again?');
    } finally {
      setScanning(false);
    }
  };

  const handleBuildPlan = async () => {
    if (!scan) return;
    setBuilding(true);
    setBuildError(null);
    goTo(3);
    try {
      const map = await generateLessonMap({
        subjectName,
        book: scan.book,
        units: scan.units,
        exam: {
          topicArea: hasExam ? topicArea.trim() : focusArea.trim(),
          fromTextbook,
          daysUntil: hasExam ? daysFromNow(examDate) : null,
        },
        mode: hasExam ? 'exam' : focusArea.trim() ? 'focus' : 'survey',
      });
      setLessonMap(map);

      // Write every lesson out now, while the student is already waiting, so
      // opening one later is instant.
      //
      // A few at a time, not all at once: a browser only opens so many
      // connections to one origin, and the request timeout starts ticking when
      // fetch is called, not when the connection frees up. Firing ten together
      // left the last few queued until they timed out having never been sent.
      setTotalToWrite(map.lessons.length);
      setWritten(0);

      const lessonContent: Record<string, LessonContent> = {};
      const queue = [...map.lessons];
      /** Kept so a plan that wrote nothing can say why instead of looking built. */
      let lastFailure: unknown = null;

      const worker = async () => {
        for (;;) {
          const l = queue.shift();
          if (!l) return;
          try {
            lessonContent[l.id] = await generateLessonContent({
              bookTitle: scan.book.title,
              unitTitle: l.unitTitle,
              topic: l.topic || l.title,
            });
          } catch (err) {
            // One lesson failing shouldn't cost them the whole plan — the
            // lesson screen says which are missing and offers a rebuild.
            lastFailure = err;
          }
          setWritten((n) => n + 1);
        }
      };

      await Promise.all([worker(), worker(), worker()]);

      // Every lesson failing is not a plan with gaps in it, it is a plan with
      // nothing in it — almost always the backend being unreachable. Saving it
      // would leave a study plan that looks built and opens empty everywhere,
      // which is exactly the state this used to produce silently.
      if (map.lessons.length > 0 && Object.keys(lessonContent).length === 0) {
        throw lastFailure instanceof Error
          ? lastFailure
          : new Error('No lessons could be written. Check your connection and try again.');
      }

      saveProfile({
        subjectName,
        textbookQuery: { title: title.trim(), author: author.trim(), edition: edition.trim() },
        scan,
        exam: {
          hasExam: !!hasExam,
          topicArea: hasExam ? topicArea.trim() : '',
          fromTextbook,
          date: hasExam ? examDate.toISOString() : null,
        },
        focusArea: hasExam ? '' : focusArea.trim(),
        lessonMap: map,
        lessonContent,
        // Rebuilding produces different lessons that happen to reuse ids, so
        // carrying progress over would tick off work that was never done.
        completedLessonIds: [],
        flagged: [],
        completedAt: Date.now(),
      });
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : "Couldn't build the plan. Try again?");
    } finally {
      setBuilding(false);
    }
  };

  const canAdvance =
    step === 0
      ? title.trim().length > 0
      : step === 1
      ? !scanning && !!scan
      : step === 2
      ? (hasExam === true && topicArea.trim().length > 0) ||
        (hasExam === false && focusArea.trim().length > 0)
      : !building && !!lessonMap;

  const handleNext = () => {
    if (step === 0) return handleScan();
    if (step === 1) return goTo(2);
    if (step === 2) return handleBuildPlan();
    navigation.goBack();
  };

  const nextLabel =
    step === 0
      ? 'Scan this textbook'
      : step === 1
      ? 'Looks right'
      : step === 2
      ? 'Build my lesson map'
      : 'Done';

  const translateX = slide.interpolate({
    inputRange: [0, STEPS.length - 1],
    outputRange: [0, -width * (STEPS.length - 1)],
  });

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: t.base }]} edges={['top']}>
      <LineGridBackground always />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => (step > 0 && !scanning && !building ? goTo(step - 1) : navigation.goBack())}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={26} color={t.text} />
        </TouchableOpacity>
        <View style={styles.headerMiddle}>
          <Text style={[styles.headerSubject, { color: t.muted }]} numberOfLines={1}>
            {subjectName.toUpperCase()}
          </Text>
          <Text style={[styles.headerStep, { color: t.text }]}>{STEPS[step]}</Text>
        </View>
        <View style={{ width: 26 }} />
      </View>

      <View style={[styles.track, { backgroundColor: t.cardBorder }]}>
        <View
          style={[
            styles.trackFill,
            { backgroundColor: t.accent, width: `${((step + 1) / STEPS.length) * 100}%` },
          ]}
        />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        <Animated.View style={[styles.slider, { transform: [{ translateX }] }]}>
          {/* ---- 1. Which textbook ---- */}
          <Step width={width}>
            <Heading
              title="Which textbook are you using?"
              subtitle={`Name the book your ${subjectName} class works from. We'll look it up and work out what your course covers.`}
            />
            <AuthTextField
              label="Textbook title"
              value={title}
              onChangeText={setTitle}
              placeholder="Cambridge Mathematics Methods Unit 3"
              autoCapitalize="words"
            />
            <AuthTextField
              label="Author (optional)"
              value={author}
              onChangeText={setAuthor}
              placeholder="Evans, Lipson"
              autoCapitalize="words"
            />
            <AuthTextField
              label="Edition (optional)"
              value={edition}
              onChangeText={setEdition}
              placeholder="3rd edition"
            />

            {/* Scanning again overwrites the profile anyway; this is for
                clearing one out entirely, e.g. after changing textbooks. */}
            {!!profile && (
              <TouchableOpacity
                style={styles.removeRow}
                activeOpacity={0.7}
                onPress={() => {
                  deleteProfile(subjectName);
                  navigation.goBack();
                }}
              >
                <Ionicons name="trash-outline" size={15} color={colors.danger} />
                <Text style={[styles.removeLabel, { color: colors.danger }]}>
                  Remove this subject profile
                </Text>
              </TouchableOpacity>
            )}
          </Step>

          {/* ---- 2. The scan ---- */}
          <Step width={width}>
            {scanning ? (
              <ScanningState subjectName={subjectName} />
            ) : scanError ? (
              <>
                <Heading title="That didn't work" subtitle={scanError} />
                <TouchableOpacity
                  style={[styles.retry, { borderColor: t.cardBorder, backgroundColor: t.card }]}
                  onPress={handleScan}
                  activeOpacity={0.85}
                >
                  <Ionicons name="refresh" size={16} color={t.accentLight} />
                  <Text style={[styles.retryLabel, { color: t.accentLight }]}>Try again</Text>
                </TouchableOpacity>
              </>
            ) : scan ? (
              <>
                <Heading
                  title="Here's what we found"
                  subtitle="Check this is your book before we plan around it."
                />
                <View style={[styles.bookCard, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
                  <View style={styles.bookHeader}>
                    <Ionicons name="book" size={18} color={t.accentLight} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.bookTitle, { color: t.onCard }]}>{scan.book.title}</Text>
                      <Text style={[styles.bookMeta, { color: t.onCardMuted }]}>
                        {[scan.book.authors, scan.book.edition, scan.book.publisher, scan.book.year]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    <ConfidenceChip level={scan.book.confidence} />
                  </View>
                  {!!scan.book.overview && (
                    <Text style={[styles.bookOverview, { color: t.onCardSecondary }]}>
                      {scan.book.overview}
                    </Text>
                  )}
                </View>

                {!!scan.notes && (
                  <View style={[styles.noteRow, { backgroundColor: withAlpha(colors.amber, 0.12) }]}>
                    <Ionicons name="alert-circle-outline" size={16} color={colors.amber} />
                    <Text style={[styles.noteText, { color: t.secondary }]}>{scan.notes}</Text>
                  </View>
                )}

                <Text style={[styles.fieldLabel, { color: t.muted }]}>
                  What you're studying · {scan.units.length} units
                </Text>
                {scan.units.map((u, i) => (
                  <View
                    key={`${u.title}-${i}`}
                    style={[styles.unitRow, { backgroundColor: t.card, borderColor: t.cardBorder }]}
                  >
                    <Text style={[styles.unitIndex, { color: t.accentLight }]}>
                      {String(i + 1).padStart(2, '0')}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.unitTitle, { color: t.onCard }]}>{u.title}</Text>
                      <Text style={[styles.unitTopics, { color: t.onCardMuted }]}>
                        {u.topics.join(' · ')}
                      </Text>
                    </View>
                  </View>
                ))}

                {scan.sources.length > 0 && (
                  <>
                    <Text style={[styles.fieldLabel, { color: t.muted }]}>Sources read</Text>
                    {scan.sources.map((s) => (
                      <Text key={s.url} style={[styles.source, { color: t.muted }]} numberOfLines={1}>
                        · {s.title}
                      </Text>
                    ))}
                  </>
                )}
              </>
            ) : null}
          </Step>

          {/* ---- 3. The test, or an area to go deep on ---- */}
          <Step width={width}>
            <Heading
              title="Any tests coming up?"
              subtitle="If there's one on the horizon we'll aim the whole plan at it."
            />

            <View style={styles.choiceRow}>
              <Choice label="Yes, I have a test" active={hasExam === true} onPress={() => setHasExam(true)} />
              <Choice label="Not right now" active={hasExam === false} onPress={() => setHasExam(false)} />
            </View>

            {/* No test is not the same as no goal. Without a deadline to work
                back from, the useful question is what they want to get good
                at — and the plan is then built the same way, just deeper. */}
            {hasExam === false && (
              <>
                <Heading
                  title="What do you want to get really good at?"
                  subtitle="Pick one area and we'll build an intensive deep dive into it."
                />

                {topicChoices.length > 0 && (
                  <View style={styles.areaGrid}>
                    {topicChoices.map((choice: string) => (
                      <TouchableOpacity
                        key={choice}
                        activeOpacity={0.85}
                        onPress={() => setFocusArea(choice)}
                        style={[
                          styles.areaChip,
                          { backgroundColor: t.card, borderColor: t.cardBorder },
                          focusArea === choice && {
                            borderColor: t.accent,
                            backgroundColor: withAlpha(t.accent, 0.14),
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.areaChipText,
                            { color: focusArea === choice ? t.text : t.onCardSecondary },
                          ]}
                        >
                          {choice}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <AuthTextField
                  label="Or describe it yourself"
                  value={focusArea}
                  onChangeText={setFocusArea}
                  placeholder="Differentiation from first principles"
                />
              </>
            )}

            {hasExam === true && (
              <>
                <AuthTextField
                  label="What's it on?"
                  value={topicArea}
                  onChangeText={setTopicArea}
                  placeholder="Arithmetic and geometric sequences"
                />

                <Text style={[styles.fieldLabel, { color: t.muted }]}>When is it?</Text>
                <DueDateTimeFields value={examDate} onChange={setExamDate} />

                <Text style={[styles.fieldLabel, { color: t.muted, marginTop: spacing.xl }]}>
                  Does the material come from the textbook?
                </Text>
                <View style={styles.choiceRow}>
                  <Choice label="Yes, from the book" active={fromTextbook} onPress={() => setFromTextbook(true)} />
                  <Choice label="No, elsewhere" active={!fromTextbook} onPress={() => setFromTextbook(false)} />
                </View>
              </>
            )}
          </Step>

          {/* ---- 4. The plan ---- */}
          <Step width={width}>
            {building ? (
              <BuildingState written={written} total={totalToWrite} />
            ) : buildError ? (
              <>
                <Heading title="That didn't work" subtitle={buildError} />
                <TouchableOpacity
                  style={[styles.retry, { borderColor: t.cardBorder, backgroundColor: t.card }]}
                  onPress={handleBuildPlan}
                  activeOpacity={0.85}
                >
                  <Ionicons name="refresh" size={16} color={t.accentLight} />
                  <Text style={[styles.retryLabel, { color: t.accentLight }]}>Try again</Text>
                </TouchableOpacity>
              </>
            ) : lessonMap ? (
              <>
                <Heading title={lessonMap.title} subtitle={lessonMap.summary} />
                {hasExam ? (
                  <View style={[styles.examBanner, { backgroundColor: withAlpha(t.accent, 0.14) }]}>
                    <Ionicons name="flag" size={15} color={t.accentLight} />
                    <Text style={[styles.examBannerText, { color: t.text }]}>
                      Exam in {daysFromNow(examDate)} day{daysFromNow(examDate) === 1 ? '' : 's'}
                    </Text>
                  </View>
                ) : focusArea.trim() ? (
                  <TouchableOpacity
                    style={[styles.examBanner, { backgroundColor: withAlpha(t.accent, 0.14) }]}
                    activeOpacity={0.85}
                    onPress={() => goTo(2)}
                  >
                    <Ionicons name="telescope" size={15} color={t.accentLight} />
                    <Text style={[styles.examBannerText, { color: t.text }]} numberOfLines={1}>
                      Deep dive: {focusArea.trim()}
                    </Text>
                    <Text style={[styles.examBannerAction, { color: t.accentLight }]}>Change</Text>
                  </TouchableOpacity>
                ) : null}
                <LessonMapView lessons={lessonMap.lessons} completedIds={[]} />
              </>
            ) : null}
          </Step>
        </Animated.View>

        <View style={styles.footer}>
          <PrimaryButton
            label={nextLabel}
            loading={scanning || building}
            disabled={!canAdvance}
            onPress={handleNext}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** What the scan is doing, spelled out — it takes a while and silence reads as broken. */
function ScanningState({ subjectName }: { subjectName: string }) {
  const t = useBaseTheme();
  return (
    <View style={styles.busy}>
      <ActivityIndicator size="large" color={t.accentLight} />
      <Text style={[styles.busyTitle, { color: t.text }]}>Reading your textbook</Text>
      <Text style={[styles.busyBody, { color: t.secondary }]}>
        Searching the web for your book, finding its contents, and working out what your{' '}
        {subjectName} course actually covers. This takes a moment.
      </Text>
    </View>
  );
}

function BuildingState({ written, total }: { written: number; total: number }) {
  const t = useBaseTheme();
  return (
    <View style={styles.busy}>
      <ActivityIndicator size="large" color={t.accentLight} />
      <Text style={[styles.busyTitle, { color: t.text }]}>
        {total ? 'Writing your lessons' : 'Building your lesson map'}
      </Text>
      <Text style={[styles.busyBody, { color: t.secondary }]}>
        {total
          ? `Teaching notes, worked examples and questions — ${written} of ${total} done.`
          : 'Ordering the topics so each lesson sets up the next one.'}
      </Text>
    </View>
  );
}

function ConfidenceChip({ level }: { level: string }) {
  const t = useBaseTheme();
  const color = level === 'high' ? colors.green : level === 'medium' ? colors.amber : colors.danger;
  return (
    <View style={[styles.chip, { backgroundColor: withAlpha(color, 0.16) }]}>
      <Text style={[styles.chipText, { color }]}>{level || 'unknown'}</Text>
    </View>
  );
}

function Choice({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const t = useBaseTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.choice,
        {
          backgroundColor: active ? t.accent : t.card,
          borderColor: active ? t.accent : t.cardBorder,
        },
      ]}
    >
      <Text style={[styles.choiceText, { color: active ? t.onAccent : t.onCard }]}>{label}</Text>
    </TouchableOpacity>
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
      {!!subtitle && <Text style={[styles.subtitle, { color: t.secondary }]}>{subtitle}</Text>}
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
  headerMiddle: { flex: 1, alignItems: 'center' },
  headerSubject: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  headerStep: { fontSize: 15, fontWeight: '800', marginTop: 1 },
  track: { height: 3, marginHorizontal: spacing.xl, borderRadius: 2, overflow: 'hidden' },
  trackFill: { height: 3, borderRadius: 2 },
  slider: { flex: 1, flexDirection: 'row' },
  stepContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
  },
  heading: { marginBottom: spacing.xxl },
  title: { fontSize: 26, fontWeight: '800' },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: spacing.sm },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  busy: { alignItems: 'center', paddingTop: spacing.xxxl, gap: spacing.lg },
  busyTitle: { fontSize: 20, fontWeight: '800' },
  busyBody: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  bookCard: { borderRadius: radii.lg, borderWidth: 1, padding: spacing.lg },
  bookHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  bookTitle: { fontSize: 16, fontWeight: '800' },
  bookMeta: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  bookOverview: { fontSize: 13, lineHeight: 19, marginTop: spacing.md },
  chip: { borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  chipText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  noteRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  noteText: { flex: 1, fontSize: 12, lineHeight: 18 },
  unitRow: {
    flexDirection: 'row',
    gap: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  unitIndex: { fontSize: 13, fontWeight: '800', width: 22 },
  unitTitle: { fontSize: 14, fontWeight: '700' },
  unitTopics: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  source: { fontSize: 11, marginBottom: 3 },
  choiceRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  choice: {
    flex: 1,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  choiceText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  examBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  examBannerText: { flex: 1, fontSize: 13, fontWeight: '800' },
  examBannerAction: { fontSize: 12, fontWeight: '800' },
  areaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  areaChip: { borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 7 },
  areaChipText: { fontSize: 12.5, fontWeight: '700' },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingVertical: spacing.md,
  },
  retryLabel: { fontSize: 14, fontWeight: '700' },
  removeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
    marginTop: spacing.md,
  },
  removeLabel: { fontSize: 13, fontWeight: '700' },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.sm },
});
