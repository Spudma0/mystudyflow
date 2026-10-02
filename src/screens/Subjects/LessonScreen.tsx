import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radii, spacing } from '../../theme/theme';
import { useBaseTheme } from '../../theme/useBaseTheme';
import { withAlpha } from '../../store/useThemeStore';
import { PrimaryButton } from '../../components/PrimaryButton';
import { MathText } from '../../components/MathText';
import { MathFormula } from '../../components/MathFormula';
import { FunctionGraph } from '../../components/FunctionGraph';
import { collectFormulas, splitFormulas } from '../../lib/mathNotation';
import { plottableFrom, wantsGraph } from '../../lib/plot';
import { maxXpForLesson, xpForLesson } from '../../lib/rank';
import { QuestProgressBar } from '../../components/QuestProgressBar';
import { LessonCompleteCelebration } from '../../components/LessonCompleteCelebration';
import { useSubjectProfileStore } from '../../store/useSubjectProfileStore';
import { LessonQuestion } from '../../types';
import { SubjectsStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<SubjectsStackParamList, 'Lesson'>;

const DIFFICULTY_LABEL = ['', 'Warm-up', 'Easy', 'Medium', 'Hard', 'Hardest'];

/**
 * `y = ...` fragments sitting inside a sentence, as candidates to plot.
 *
 * The function ends where the sentence picks up again — "sketch y = x^3 - 3x
 * for -3 <= x <= 3" is a cubic followed by a domain, and dragging the domain
 * in makes it unparseable rather than merely unbounded.
 */
/**
 * The options a student could actually pick, or null for a written answer.
 *
 * Only strings with something in them count: a list of blanks is a written
 * question that arrived in the wrong shape, not a choice.
 */
function usableChoices(question: LessonQuestion): string[] | null {
  const options = (question.choices ?? []).filter(
    (choice): choice is string => typeof choice === 'string' && choice.trim().length > 0
  );
  return options.length >= 2 ? options : null;
}

function formulasIn(text: string): string[] {
  // `y = ...`, `f(x) = ...`, `h(t) = ...` — any named function of one variable,
  // which is what an application question states before asking about it.
  const matches = (text ?? '').match(/\b(?:y|[A-Za-z]\([A-Za-z]\))\s*=\s*[^.,;?]+/g) ?? [];
  return matches.map((m) => m.split(/\s+(?:for|where|when|on|over|and|if|at|given|metres|m\b)/i)[0].trim());
}

/**
 * Does this question want a calculator?
 *
 * Newer lessons say so outright. Older ones don't carry the field, so it is
 * read from the wording instead — the give-aways are the things you cannot do
 * by hand: a decimal answer to a stated accuracy, a numerical solve, a sketch.
 * Deliberately narrow: a label that appears on questions meant to be done by
 * hand is worse than no label.
 */
const TECHNOLOGY_WORDING =
  /\b(calculator|CAS|technology|correct to \w+ (?:decimal|significant)|to \d+ decimal places?|to \d+ significant|numerically|using technology|graphing|sketch the graph|nearest (?:whole|integer|cent|degree))\b/i;

function isTechnologyActive(question: LessonQuestion): boolean {
  if (typeof question.technologyActive === 'boolean') return question.technologyActive;
  return TECHNOLOGY_WORDING.test(`${question.prompt} ${question.answer}`);
}

/**
 * A wash of colour over the screen when an answer is marked.
 *
 * Deliberately brief and behind the content: the point is to be felt at the
 * edge of vision while reading the explanation, not to be looked at.
 */
function AnswerFlash({ flash }: { flash: { at: number; correct: boolean } | null }) {
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!flash) return;
    value.setValue(0);
    Animated.sequence([
      Animated.timing(value, { toValue: 1, duration: 140, useNativeDriver: true }),
      Animated.timing(value, { toValue: 0, duration: 620, useNativeDriver: true }),
    ]).start();
  }, [flash, value]);

  if (!flash) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.flash,
        {
          backgroundColor: withAlpha(flash.correct ? colors.green : colors.danger, 0.3),
          opacity: value,
        },
      ]}
    />
  );
}

/**
 * Fisher-Yates, driven by a seed rather than `Math.random()`.
 *
 * The order has to be the same on every render while a question is on screen —
 * shuffling afresh each time would move the options under the student's
 * finger — so the randomness comes from a seed that only changes between runs.
 */
function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let state = seed >>> 0 || 1;
  const next = () => {
    // xorshift32: small, and more than random enough for four options.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * One lesson, taught then tested.
 *
 * Reading comes first and the questions are a separate mode, so the teaching
 * isn't something you scroll past on the way to the quiz. Completing the
 * lesson lives at the end of the questions, where it has been earned.
 */
export function LessonScreen({ route, navigation }: Props) {
  const t = useBaseTheme();
  const { subjectName, lessonId } = route.params;

  const profile = useSubjectProfileStore((s) => s.bySubject[subjectName]);
  const completeLesson = useSubjectProfileStore((s) => s.completeLesson);
  const toggleFlagged = useSubjectProfileStore((s) => s.toggleFlagged);

  const lesson = profile?.lessonMap?.lessons.find((l) => l.id === lessonId);
  const content = profile?.lessonContent?.[lessonId];
  const flagged = profile?.flagged ?? [];
  const isDone = !!profile?.completedLessonIds.includes(lessonId);
  // What a perfect run is worth, shown up front so the reward is visible
  // before the work rather than after it.
  const lessonXp = maxXpForLesson(lesson?.durationMin ?? 0);

  const [mode, setMode] = useState<'learn' | 'questions' | 'complete'>('learn');
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [picked, setPicked] = useState<Record<number, string>>({});

  const [shuffle, setShuffle] = useState(() => Date.now());
  const [flash, setFlash] = useState<{ at: number; correct: boolean } | null>(null);
  const [earnedBurst, setEarnedBurst] = useState(false);
  // How many have actually been answered, which is what the bar tracks.
  const answeredCount = Object.keys(revealed).length;

  /**
   * The questions that can actually be marked.
   *
   * Everything asked is multiple choice, so the score means something without
   * the student having to grade themselves. Lessons written before that rule
   * still carry written questions; those are left out rather than shown with
   * nowhere to answer. `sourceIndex` keeps flags pointing at the right question
   * in the stored lesson even though the list has shifted.
   */
  const questions = React.useMemo(
    () =>
      (content?.questions ?? [])
        .map((q, sourceIndex) => ({ ...q, sourceIndex }))
        .filter((q) => usableChoices(q)),
    [content]
  );
  const question = questions[index];

  // The score is out of everything asked, not out of what was reached: leaving
  // halfway through is not the same as getting the rest right.
  const correctCount = questions.filter((q, i) => picked[i] === q.answer).length;
  const markedCount = questions.length;
  const accuracy = markedCount > 0 ? correctCount / markedCount : 1;

  // What the profile actually banked. On a retake this is the first score
  // again, not a fresh payout.
  const awardedXp = xpForLesson(
    lesson?.durationMin ?? 0,
    profile?.lessonScores?.[lessonId] ?? accuracy
  );

  /**
   * The options, reordered for this run through the questions.
   *
   * Written lessons tend to put the right answer in the same place every time,
   * and a student who notices that stops reading the options. The order is
   * drawn from a seed rather than `Math.random()` per render, so it holds still
   * while a question is on screen and only changes when the run does.
   */
  const shuffledChoices = useMemo(
    () =>
      questions.map((q, i) => {
        const options = usableChoices(q);
        return options ? shuffleWithSeed(options, shuffle + i * 7919) : null;
      }),
    [questions, shuffle]
  );
  /**
   * Curves worth showing beside this question.
   *
   * Taken from the question's own `graph` field when it has one, and otherwise
   * read out of the wording — a question about y = x² - 4x + 3 says so, and
   * anything that isn't a function of x is quietly dropped. That means the
   * lessons already written get graphs without being regenerated.
   */
  const questionGraphs = useMemo(() => {
    if (!question) return [];
    // "Differentiate x^5" is about applying a rule, and the curve says nothing
    // about how; an application question is the opposite.
    if (!question.graph && !wantsGraph(question.prompt)) return [];
    return plottableFrom([question.graph, ...formulasIn(question.prompt)]);
  }, [question]);

  const questionFlagged = useMemo(
    () => flagged.some((f) => f.lessonId === lessonId && f.questionIndex === question?.sourceIndex),
    [flagged, lessonId, question]
  );

  if (!lesson) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: t.base }]} edges={['top']}>
        <Header onBack={() => navigation.goBack()} title="" subtitle="" />
        <Text style={[styles.missing, { color: t.secondary }]}>This lesson is no longer in the plan.</Text>
      </SafeAreaView>
    );
  }

  // ---- The lesson hasn't been written yet (older plans, or generation failed) ----
  if (!content) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: t.base }]} edges={['top']}>
        <Header onBack={() => navigation.goBack()} title={lesson.title} subtitle={lesson.unitTitle} />
        <View style={styles.centered}>
          <Ionicons name="document-outline" size={34} color={t.muted} />
          <Text style={[styles.emptyTitle, { color: t.text }]}>This lesson has no content yet</Text>
          <Text style={[styles.emptyBody, { color: t.secondary }]}>
            Rebuild the study plan from the subject profile and the lessons will be written out in
            full.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ---- Finished ----
  if (mode === 'complete') {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: t.base }]} edges={['top']}>
        <LessonCompleteCelebration
          xpEarned={awardedXp}
          maxXp={maxXpForLesson(lesson.durationMin)}
          correct={correctCount}
          answered={markedCount}
          onContinue={() => navigation.goBack()}
        />
      </SafeAreaView>
    );
  }

  // ---- Questions ----
  if (mode === 'questions' && question) {
    const isRevealed = !!revealed[index];
    const chosen = picked[index];
    const last = index === questions.length - 1;
    // Every question reaching this point has options — the set was filtered to
    // the ones that can be marked — so there is always a verdict.
    const choices = shuffledChoices[index] ?? usableChoices(question) ?? [];
    const correct = chosen === question.answer;

    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: t.base }]} edges={['top']}>
        <Header
          onBack={() => setMode('learn')}
          title={`Question ${index + 1} of ${questions.length}`}
          subtitle={DIFFICULTY_LABEL[Math.min(5, Math.max(1, question.difficulty))]}
        />

        {/* Measured by answers given, not by how far you have scrolled through
            the set — so the bar moves at the moment the work is done. */}
        <View style={styles.progressRow}>
          <QuestProgressBar
            progress={answeredCount / questions.length}
            color={t.accent}
            trackColor={t.cardBorder}
            celebrate={earnedBurst}
          />
        </View>

        <AnswerFlash flash={flash} />

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          // A tap on the answer box has to reach it even while the keyboard
          // is up; without this the scroll view swallows the first tap.
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.questionTopRow}>
            <View style={styles.questionTags}>
              <DifficultyDots level={question.difficulty} />
              {isTechnologyActive(question) && (
                <View
                  style={[styles.techPill, { backgroundColor: withAlpha(colors.teal, 0.16) }]}
                >
                  <Ionicons name="calculator-outline" size={11} color={colors.teal} />
                  <Text style={[styles.techLabel, { color: colors.teal }]}>TECHNOLOGY ACTIVE</Text>
                </View>
              )}
            </View>
            {/* Flagging is available before answering — the moment it looks hard
                is the moment worth recording, not after seeing the answer. */}
            <TouchableOpacity
              style={styles.flagButton}
              onPress={() => toggleFlagged(subjectName, lessonId, question.sourceIndex)}
              activeOpacity={0.8}
              hitSlop={8}
            >
              <Ionicons
                name={questionFlagged ? 'bookmark' : 'bookmark-outline'}
                size={16}
                color={questionFlagged ? colors.amber : t.muted}
              />
              <Text
                style={[styles.flagLabel, { color: questionFlagged ? colors.amber : t.muted }]}
              >
                {questionFlagged ? 'Saved for review' : 'Save for review'}
              </Text>
            </TouchableOpacity>
          </View>

          <MathText style={[styles.questionText, { color: t.text }]}>{question.prompt}</MathText>

          {questionGraphs.length > 0 && <FunctionGraph functions={questionGraphs} height={180} />}

          {choices.map((choice) => {
              const isChosen = chosen === choice;
              const isAnswer = choice === question.answer;
              const showState = isRevealed && (isChosen || isAnswer);
              const tint = isAnswer ? colors.green : colors.danger;
              return (
                <TouchableOpacity
                  key={choice}
                  activeOpacity={0.85}
                  disabled={isRevealed}
                  onPress={() => setPicked((p) => ({ ...p, [index]: choice }))}
                  style={[
                    styles.choice,
                    { backgroundColor: t.card, borderColor: t.cardBorder },
                    isChosen && !isRevealed && { borderColor: t.accent },
                    showState && { borderColor: tint, backgroundColor: withAlpha(tint, 0.12) },
                  ]}
                >
                  <MathText style={[styles.choiceText, { color: t.onCard }]}>{choice}</MathText>
                  {showState && (
                    <Ionicons
                      name={isAnswer ? 'checkmark-circle' : 'close-circle'}
                      size={18}
                      color={tint}
                    />
                  )}
                </TouchableOpacity>
              );
          })}

          {isRevealed && (
            <View
              style={[
                styles.verdict,
                { backgroundColor: withAlpha(correct ? colors.green : colors.danger, 0.14) },
              ]}
            >
              <Ionicons
                name={correct ? 'checkmark-circle' : 'close-circle'}
                size={20}
                color={correct ? colors.green : colors.danger}
              />
              <Text
                style={[styles.verdictText, { color: correct ? colors.green : colors.danger }]}
              >
                {correct ? 'Correct' : 'Not quite'}
              </Text>
            </View>
          )}

          {isRevealed && (
            <View style={[styles.answerCard, { backgroundColor: withAlpha(colors.green, 0.1) }]}>
              <Text style={[styles.answerLabel, { color: colors.green }]}>ANSWER</Text>
              <MathText style={[styles.answerText, { color: t.text }]}>{question.answer}</MathText>
              <MathText style={[styles.explanation, { color: t.secondary }]}>
                {question.explanation}
              </MathText>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {!isRevealed ? (
            <PrimaryButton
              label="Check answer"
              disabled={!chosen}
              onPress={() => {
                setRevealed((r) => ({ ...r, [index]: true }));
                // Only a right answer earns the burst on the progress bar. A
                // written answer is unmarked, so there is nothing to claim.
                setEarnedBurst(correct);
                setFlash({ at: Date.now(), correct });
                Haptics.notificationAsync(
                  correct
                    ? Haptics.NotificationFeedbackType.Success
                    : Haptics.NotificationFeedbackType.Error
                ).catch(() => {});
              }}
            />
          ) : last ? (
            <PrimaryButton
              label="Finish lesson"
              icon="checkmark"
              onPress={() => {
                // Recorded here rather than on the way out, so the summary
                // screen shows what was actually banked.
                completeLesson(subjectName, lessonId, accuracy);
                setMode('complete');
              }}
            />
          ) : (
            <PrimaryButton label="Next question" onPress={() => setIndex(index + 1)} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ---- The lesson ----
  const flaggedHere = flagged.filter((f) => f.lessonId === lessonId).length;

  // The three headings from the printed reference. Newer lessons carry them
  // explicitly; older ones are re-presented from what they already have, so
  // nothing has to be regenerated.
  const coreTerms = content.coreTerms?.length
    ? content.coreTerms
    : Array.from(new Set(content.sections.flatMap((s) => s.keyPoints ?? [])));

  const commonMistakes = content.commonMistakes?.length ? content.commonMistakes : content.tips;

  // Curves the lesson is about. Named outright by newer lessons; otherwise
  // whichever of its formulas turn out to be functions of x.
  const lessonGraphs = plottableFrom([
    ...(content.graphs ?? []),
    ...(content.keyFormulas ?? []),
  ]).slice(0, 3);

  const keyFormulas = content.keyFormulas?.length
    ? content.keyFormulas
    : collectFormulas([
        ...content.sections.map((s) => s.body),
        ...content.sections.flatMap((s) => s.keyPoints ?? []),
      ]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: t.base }]} edges={['top']}>
      <Header onBack={() => navigation.goBack()} title={lesson.title} subtitle={lesson.unitTitle} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.metaRow}>
          <Pill icon="time-outline" label={`${lesson.durationMin} min`} />
          {isDone ? (
            <Pill icon="checkmark-circle" label={`Completed · +${awardedXp} XP`} tint={colors.green} />
          ) : (
            <Pill icon="flash-outline" label={`Up to +${lessonXp} XP`} tint={colors.amber} />
          )}
          {flaggedHere > 0 && (
            <Pill icon="bookmark" label={`${flaggedHere} saved`} tint={colors.amber} />
          )}
        </View>

        <MathText style={[styles.focus, { color: t.secondary }]}>{lesson.focus}</MathText>

        {lesson.objectives.length > 0 && (
          <View style={[styles.objectives, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
            <Text style={[styles.objectivesTitle, { color: t.onCardMuted }]}>BY THE END YOU CAN</Text>
            {lesson.objectives.map((o) => (
              <MathText
                key={o}
                style={[styles.bulletText, { color: t.onCard }]}
                bullet={<Ionicons name="ellipse" size={5} color={t.accentLight} />}
                bulletWidth={13}
              >
                {o}
              </MathText>
            ))}
          </View>
        )}

        {coreTerms.length > 0 && (
          <>
            <Text style={[styles.blockTitle, { color: t.muted }]}>CORE TERMS</Text>
            <View style={[styles.keyPoints, { backgroundColor: withAlpha(t.accent, 0.1) }]}>
              {coreTerms.map((k) => (
                <MathText
                  key={k}
                  style={[styles.keyPoint, { color: t.text }]}
                  bullet={<View style={[styles.keyPointDot, { backgroundColor: t.accentLight }]} />}
                  bulletWidth={13}
                >
                  {k}
                </MathText>
              ))}
            </View>
          </>
        )}

        {content.sections.map((s, i) => (
          <View key={`${s.heading}-${i}`} style={styles.section}>
            <View style={styles.sectionHeadingRow}>
              <Text style={[styles.sectionNumber, { color: t.accentLight }]}>
                {String(i + 1).padStart(2, '0')}
              </Text>
              <Text style={[styles.sectionHeading, { color: t.text }]}>{s.heading}</Text>
            </View>

            {/* Paragraphs are separated rather than run together, which is most
                of what makes a wall of text readable. */}
            {s.body
              .split(/\n\s*\n/)
              .map((para) => para.trim())
              .filter(Boolean)
              .map((para, pi) => (
                <View key={pi} style={styles.paragraph}>
                  {/* Any formula inside the paragraph is lifted onto a line of
                      its own — maths set in running text is most of what makes
                      a block of explanation hard to read. */}
                  {splitFormulas(para).map((part, qi) =>
                    part.kind === 'formula' ? (
                      <MathFormula key={qi}>{part.value}</MathFormula>
                    ) : (
                      <MathText key={qi} style={[styles.body, { color: t.secondary }]}>
                        {part.value}
                      </MathText>
                    )
                  )}
                </View>
              ))}
          </View>
        ))}

        {keyFormulas.length > 0 && (
          <>
            <Text style={[styles.blockTitle, { color: t.muted }]}>KEY FORMULAS</Text>
            {keyFormulas.map((f, i) => (
              <MathFormula key={i}>{f}</MathFormula>
            ))}
          </>
        )}

        {lessonGraphs.length > 0 && (
          <>
            <Text style={[styles.blockTitle, { color: t.muted }]}>ON THE AXES</Text>
            {/* One pair of axes per curve rather than all of them together:
                these are usually separate ideas, not a comparison. */}
            {lessonGraphs.map((fn, i) => (
              <FunctionGraph key={i} functions={[fn]} />
            ))}
          </>
        )}

        {content.worked.length > 0 && (
          <>
            <Text style={[styles.blockTitle, { color: t.muted }]}>WORKED EXAMPLES</Text>
            {content.worked.map((w, i) => (
              <View
                key={i}
                style={[styles.workedCard, { backgroundColor: t.card, borderColor: t.cardBorder }]}
              >
                <Text style={[styles.workedLabel, { color: t.onCardMuted }]}>
                  EXAMPLE {i + 1}
                </Text>
                <MathText style={[styles.workedProblem, { color: t.onCard }]}>{w.problem}</MathText>

                <View style={[styles.solutionDivider, { backgroundColor: t.cardBorder }]} />
                <Text style={[styles.workedLabel, { color: t.onCardMuted }]}>SOLUTION</Text>

                {w.steps.map((step, si) => (
                  <View key={si} style={styles.stepRow}>
                    <Text style={[styles.stepNumber, { color: t.accentLight }]}>{si + 1}</Text>
                    <View style={{ flex: 1 }}>
                      {splitFormulas(step).map((part, qi) =>
                        part.kind === 'formula' ? (
                          <MathFormula key={qi} align="left" boxed={false}>
                            {part.value}
                          </MathFormula>
                        ) : (
                          <MathText key={qi} style={[styles.stepText, { color: t.onCardSecondary }]}>
                            {part.value}
                          </MathText>
                        )
                      )}
                    </View>
                  </View>
                ))}

                <View style={[styles.answerStrip, { backgroundColor: withAlpha(colors.green, 0.12) }]}>
                  <MathText style={[styles.workedAnswer, { color: colors.green }]}>
                    {w.answer}
                  </MathText>
                </View>
              </View>
            ))}
          </>
        )}

        {commonMistakes.length > 0 && (
          <TipBlock
            title="COMMON MISTAKES"
            icon="alert-circle-outline"
            tint={colors.amber}
            items={commonMistakes}
          />
        )}
        {content.examTips.length > 0 && (
          <TipBlock title="IN THE EXAM" icon="school-outline" tint={colors.teal} items={content.examTips} />
        )}
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label={questions.length ? `Start ${questions.length} questions` : 'No questions yet'}
          icon="play"
          disabled={!questions.length}
          onPress={() => {
            // A fresh run: new order, and nothing carried over from the last one.
            setShuffle(Date.now());
            setMode('questions');
            setIndex(0);
            setRevealed({});
            setPicked({});
          }}
        />
      </View>
    </SafeAreaView>
  );
}

function Header({
  onBack,
  title,
  subtitle,
}: {
  onBack: () => void;
  title: string;
  subtitle: string;
}) {
  const t = useBaseTheme();
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} hitSlop={10}>
        <Ionicons name="chevron-back" size={26} color={t.text} />
      </TouchableOpacity>
      <View style={styles.headerMiddle}>
        {!!subtitle && (
          <Text style={[styles.headerSub, { color: t.muted }]} numberOfLines={1}>
            {subtitle.toUpperCase()}
          </Text>
        )}
        <Text style={[styles.headerTitle, { color: t.text }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <View style={{ width: 26 }} />
    </View>
  );
}

function Pill({ icon, label, tint }: { icon: string; label: string; tint?: string }) {
  const t = useBaseTheme();
  const color = tint ?? t.muted;
  return (
    <View style={[styles.pill, { backgroundColor: withAlpha(color, 0.14) }]}>
      <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={12} color={color} />
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

function DifficultyDots({ level }: { level: number }) {
  const t = useBaseTheme();
  const n = Math.min(5, Math.max(1, level));
  return (
    <View style={styles.dots}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View
          key={i}
          style={[
            styles.dot,
            { backgroundColor: i <= n ? t.accent : withAlpha(t.text, 0.15) },
          ]}
        />
      ))}
    </View>
  );
}

function TipBlock({
  title,
  icon,
  tint,
  items,
}: {
  title: string;
  icon: string;
  tint: string;
  items: string[];
}) {
  const t = useBaseTheme();
  return (
    <>
      <Text style={[styles.blockTitle, { color: t.muted }]}>{title}</Text>
      <View style={[styles.tipCard, { backgroundColor: withAlpha(tint, 0.1) }]}>
        {items.map((item, i) => (
          <MathText
            key={i}
            style={[styles.tipText, { color: t.text }]}
            bullet={
              <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={14} color={tint} />
            }
            bulletWidth={22}
          >
            {item}
          </MathText>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  missing: { textAlign: 'center', marginTop: spacing.xxxl },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptyBody: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerMiddle: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.sm },
  headerSub: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  headerTitle: { fontSize: 16, fontWeight: '800', marginTop: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  pillText: { fontSize: 11, fontWeight: '800' },
  focus: { fontSize: 15, lineHeight: 22, marginBottom: spacing.lg },
  objectives: { borderRadius: radii.lg, borderWidth: 1, padding: spacing.lg, marginBottom: spacing.xl },
  objectivesTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: spacing.sm },
  bulletText: { fontSize: 13, lineHeight: 19, fontWeight: '600', marginTop: 4 },
  section: { marginBottom: spacing.xxl },
  paragraph: { marginBottom: spacing.xs },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginBottom: spacing.md },
  sectionNumber: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  sectionHeading: { flex: 1, fontSize: 19, fontWeight: '800', lineHeight: 26 },
  // Generous leading and a gap between paragraphs — the single biggest thing
  // that turns a block of explanation into something readable.
  body: { fontSize: 15, lineHeight: 25, marginBottom: spacing.md },
  // A clear gap below, so the first section heading reads as a new start
  // rather than a caption on the box above it.
  keyPoints: {
    borderRadius: radii.md,
    padding: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },
  keyPointsLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: spacing.sm },
  keyPointDot: { width: 5, height: 5, borderRadius: 3 },
  keyPoint: { fontSize: 13.5, lineHeight: 21, fontWeight: '700', marginTop: 6 },
  blockTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  workedCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  workedLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: spacing.sm },
  workedProblem: { fontSize: 15, fontWeight: '700', lineHeight: 23, marginBottom: spacing.md },
  solutionDivider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.md },
  stepRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  stepNumber: { fontSize: 12, fontWeight: '800', width: 14, paddingTop: 2 },
  stepText: { flex: 1, fontSize: 14, lineHeight: 22 },
  answerStrip: { borderRadius: radii.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: spacing.sm },
  workedAnswer: { fontSize: 14.5, fontWeight: '800', lineHeight: 22 },
  tipCard: { borderRadius: radii.lg, padding: spacing.lg, gap: spacing.md },
  tipText: { fontSize: 13.5, lineHeight: 21 },
  // Room either side of the bar for the burst, which overflows the track.
  progressRow: { marginHorizontal: spacing.xl, marginTop: spacing.xs, marginBottom: spacing.sm },
  questionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  flagButton: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  flagLabel: { fontSize: 12, fontWeight: '700' },
  questionText: { fontSize: 18, fontWeight: '700', lineHeight: 28, marginBottom: spacing.lg },
  questionTags: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  techPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  techLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  verdict: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.lg,
  },
  verdictText: { fontSize: 14, fontWeight: '800' },
  flash: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 5 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  choiceText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  answerCard: { borderRadius: radii.lg, padding: spacing.lg, marginTop: spacing.lg },
  answerLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  answerText: { fontSize: 15, fontWeight: '800', marginTop: 4 },
  explanation: { fontSize: 13.5, lineHeight: 21, marginTop: spacing.sm },
  footer: { padding: spacing.xl, paddingTop: spacing.md },
});
