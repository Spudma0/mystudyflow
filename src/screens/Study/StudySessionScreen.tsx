import React, { useEffect, useReducer, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Circle } from 'react-native-svg';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, radii, spacing, APP_MAX_WIDTH } from '../../theme/theme';
import { useBaseTheme } from '../../theme/useBaseTheme';
import { PrimaryButton } from '../../components/PrimaryButton';
import { DueDateTimeFields } from '../../components/DueDateTimeFields';
import { StudySummaryContent } from '../../components/StudySummaryContent';
import { Confetti } from '../../components/Confetti';
import { FlipDigit } from '../../components/FlipDigit';
import { useTimetableStore } from '../../store/useTimetableStore';
import { useSubjectDataStore } from '../../store/useSubjectDataStore';
import { useStudyTopicsStore } from '../../store/useStudyTopicsStore';
import { signalBreak, signalComplete, lightTick } from '../../lib/feedback';
import { RootStackParamList } from '../../navigation/types';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const HOLD_MS = 1700;
const RING_R = 70;
const RING_C = 2 * Math.PI * RING_R;

const GOLD = '#E9C46A';

const STUDY_PRESETS = [20, 25, 30, 45, 50];
const BREAK_PRESETS = [5, 10, 15];

function clockParts(sec: number): string[] {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? [pad(h), pad(m), pad(ss)] : [pad(m), pad(ss)];
}

function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

type Phase = 'setup' | 'running' | 'break' | 'summary';

export function StudySessionScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'StudySession'>>();
  const { subjectName } = route.params;
  const t = useBaseTheme();

  const getSubjects = useTimetableStore((s) => s.getSubjects);
  const logStudySession = useSubjectDataStore((s) => s.logStudySession);
  const subjectColor = getSubjects().find((s) => s.name === subjectName)?.color;

  const savedTopics = useStudyTopicsStore((s) => s.topics);
  const addTopic = useStudyTopicsStore((s) => s.addTopic);
  const removeTopic = useStudyTopicsStore((s) => s.removeTopic);

  const [phase, setPhase] = useState<Phase>('setup');

  // --- Setup fields ---
  const [topic, setTopic] = useState('');
  const [addingTopic, setAddingTopic] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const [endTime, setEndTime] = useState(new Date(Date.now() + 60 * 60 * 1000));
  const [breaksEnabled, setBreaksEnabled] = useState(false);
  const [studyMins, setStudyMins] = useState(30);
  const [breakMins, setBreakMins] = useState(5);

  // --- Notes captured on the completion screen ---
  const [noteUris, setNoteUris] = useState<string[]>([]);

  // --- Running counters ---
  const startedAtRef = useRef(0);
  const c = useRef({ remainingStudy: 0, remainingBreak: 0, sinceBreak: 0, elapsedStudy: 0, breakCount: 0, totalBreak: 0 });
  const [, forceTick] = useReducer((x) => x + 1, 0);

  // --- Hold-to-exit ---
  const holdAnim = useRef(new Animated.Value(0)).current;
  const [holding, setHolding] = useState(false);

  // --- Hint fade (visible then fades over the first 30s) ---
  const hintOpacity = useRef(new Animated.Value(1)).current;
  const hintStarted = useRef(false);

  // Keep the timer landscape-capable; the rest of the app stays portrait.
  useEffect(() => {
    if (phase === 'running' || phase === 'break') {
      ScreenOrientation.unlockAsync().catch(() => {});
    } else {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    }
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [phase]);

  useEffect(() => {
    if (phase === 'running' && !hintStarted.current) {
      hintStarted.current = true;
      Animated.timing(hintOpacity, { toValue: 0, duration: 30000, useNativeDriver: true }).start();
    }
  }, [phase, hintOpacity]);

  // Ticking clock — a fresh interval per running/break phase.
  useEffect(() => {
    if (phase !== 'running' && phase !== 'break') return;
    const id = setInterval(() => {
      const s = c.current;
      if (phase === 'running') {
        s.remainingStudy -= 1;
        s.elapsedStudy += 1;
        s.sinceBreak += 1;
        if (s.remainingStudy <= 0) {
          signalComplete();
          setPhase('summary');
          return;
        }
        if (breaksEnabled && s.sinceBreak >= studyMins * 60) {
          s.sinceBreak = 0;
          s.breakCount += 1;
          s.remainingBreak = breakMins * 60;
          signalBreak();
          setPhase('break');
          return;
        }
      } else {
        s.remainingBreak -= 1;
        s.totalBreak += 1;
        if (s.remainingBreak <= 0) {
          lightTick();
          setPhase('running');
          return;
        }
      }
      forceTick();
    }, 1000);
    return () => clearInterval(id);
  }, [phase, breaksEnabled, studyMins, breakMins]);

  const saveNewTopic = () => {
    const trimmed = newTopic.trim();
    if (!trimmed) {
      setAddingTopic(false);
      return;
    }
    addTopic(trimmed);
    setTopic(trimmed);
    setNewTopic('');
    setAddingTopic(false);
  };

  const handleStart = () => {
    let budget = Math.floor((endTime.getTime() - Date.now()) / 1000);
    if (budget < 60) budget = 60;
    startedAtRef.current = Date.now();
    c.current = { remainingStudy: budget, remainingBreak: 0, sinceBreak: 0, elapsedStudy: 0, breakCount: 0, totalBreak: 0 };
    setPhase('running');
  };

  const beginHold = () => {
    setHolding(true);
    holdAnim.setValue(0);
    Animated.timing(holdAnim, { toValue: 1, duration: HOLD_MS, useNativeDriver: false }).start(({ finished }) => {
      if (finished) {
        setHolding(false);
        holdAnim.setValue(0);
        setPhase('summary');
      }
    });
  };
  const cancelHold = () => {
    setHolding(false);
    Animated.timing(holdAnim, { toValue: 0, duration: 180, useNativeDriver: false }).start();
  };

  const handleDone = () => {
    const s = c.current;
    logStudySession(subjectName, {
      id: `session-${Date.now()}`,
      subjectName,
      topic: topic.trim() || undefined,
      startedAt: startedAtRef.current || Date.now(),
      endedAt: Date.now(),
      durationSec: s.elapsedStudy,
      breakCount: s.breakCount,
      breakSec: s.totalBreak,
      noteImageUris: noteUris.length ? noteUris : undefined,
    });
    navigation.goBack();
  };

  const captureNotes = () => {
    const pick = async (source: 'camera' | 'library') => {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Camera access needed', 'Enable camera access in Settings to capture photos.');
          return;
        }
        const res = await ImagePicker.launchCameraAsync({ quality: 0.7 });
        if (!res.canceled) setNoteUris((prev) => [...prev, res.assets[0].uri]);
      } else {
        const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsMultipleSelection: true });
        if (!res.canceled) setNoteUris((prev) => [...prev, ...res.assets.map((a) => a.uri)]);
      }
    };
    Alert.alert('Capture notes', undefined, [
      { text: 'Take Photo', onPress: () => pick('camera') },
      { text: 'Choose from Library', onPress: () => pick('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ---------------------------------------------------------------- SETUP ----
  if (phase === 'setup') {
    return (
      <View style={styles.setupRoot}>
        <BlurView intensity={30} tint="dark" style={styles.fill} />
        <View style={styles.setupCenter}>
          <View style={[styles.setupCard, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
            <View style={styles.setupHeader}>
              <Text style={[styles.setupTitle, { color: t.onCard }]}>Study {subjectName}</Text>
              <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
                <Ionicons name="close" size={24} color={t.onCardMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 470 }}>
              <Text style={[styles.fieldLabel, { color: t.onCardMuted }]}>WHAT ARE YOU STUDYING?</Text>
              <View style={styles.chipRow}>
                {savedTopics.map((tp) => (
                  <TouchableOpacity
                    key={tp}
                    style={[styles.chip, { borderColor: t.cardBorder }, topic === tp && { backgroundColor: t.accent, borderColor: t.accent }]}
                    onPress={() => setTopic(tp)}
                    onLongPress={() => {
                      removeTopic(tp);
                      if (topic === tp) setTopic('');
                    }}
                  >
                    <Text style={[styles.chipText, { color: topic === tp ? t.onAccent : t.onCardSecondary }]}>{tp}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[styles.addChip, { borderColor: t.accent }]}
                  onPress={() => setAddingTopic(true)}
                >
                  <Ionicons name="add" size={18} color={t.accentLight} />
                </TouchableOpacity>
              </View>
              {savedTopics.length > 0 && (
                <Text style={[styles.chipHint, { color: t.onCardMuted }]}>Long-press a topic to remove it</Text>
              )}

              {addingTopic && (
                <View style={styles.addTopicRow}>
                  <TextInput
                    value={newTopic}
                    onChangeText={setNewTopic}
                    placeholder="New topic name…"
                    placeholderTextColor={t.onCardMuted}
                    autoFocus
                    onSubmitEditing={saveNewTopic}
                    returnKeyType="done"
                    style={[styles.input, { flex: 1, marginTop: 0, color: t.onCard, borderColor: t.cardBorder, backgroundColor: t.cardAlt }]}
                  />
                  <TouchableOpacity
                    style={[styles.addTopicSave, { backgroundColor: t.accent }]}
                    onPress={saveNewTopic}
                  >
                    <Ionicons name="checkmark" size={20} color={t.onAccent} />
                  </TouchableOpacity>
                </View>
              )}

              <Text style={[styles.fieldLabel, { color: t.onCardMuted }]}>STUDY UNTIL</Text>
              {/* The same time field a reminder uses. One way of setting a time
                  across the app beats two that behave differently. */}
              <DueDateTimeFields value={endTime} onChange={setEndTime} showDate={false} />

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: t.onCardMuted, marginTop: 0 }]}>BREAKS</Text>
                  <Text style={[styles.toggleHint, { color: t.onCardMuted }]}>Pause on a repeating interval</Text>
                </View>
                <Switch value={breaksEnabled} onValueChange={setBreaksEnabled} trackColor={{ false: colors.border, true: t.accent }} thumbColor="#FFFFFF" />
              </View>

              {breaksEnabled && (
                <>
                  <Text style={[styles.miniLabel, { color: t.onCardMuted }]}>Study for (mins)</Text>
                  <View style={styles.chipRow}>
                    {STUDY_PRESETS.map((v) => (
                      <TouchableOpacity key={v} style={[styles.chip, { borderColor: t.cardBorder }, studyMins === v && { backgroundColor: t.accent, borderColor: t.accent }]} onPress={() => setStudyMins(v)}>
                        <Text style={[styles.chipText, { color: studyMins === v ? t.onAccent : t.onCardSecondary }]}>{v}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={[styles.miniLabel, { color: t.onCardMuted }]}>Break for (mins)</Text>
                  <View style={styles.chipRow}>
                    {BREAK_PRESETS.map((v) => (
                      <TouchableOpacity key={v} style={[styles.chip, { borderColor: t.cardBorder }, breakMins === v && { backgroundColor: t.accent, borderColor: t.accent }]} onPress={() => setBreakMins(v)}>
                        <Text style={[styles.chipText, { color: breakMins === v ? t.onAccent : t.onCardSecondary }]}>{v}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </ScrollView>

            <View style={{ marginTop: spacing.lg }}>
              <PrimaryButton label="Start Studying" icon="play" onPress={handleStart} />
            </View>
          </View>
        </View>
      </View>
    );
  }

  // ---------------------------------------------------------- SUMMARY --------
  if (phase === 'summary') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: t.base }]} edges={['top']}>
        <Confetti />
        <ScrollView contentContainerStyle={styles.summaryContent} showsVerticalScrollIndicator={false}>
          <View style={styles.summaryBadge}>
            <Ionicons name="checkmark-circle" size={44} color={t.accent} />
            <Text style={[styles.summaryTitle, { color: t.text }]}>Session complete</Text>
          </View>
          <StudySummaryContent
            subjectName={subjectName}
            subjectColor={subjectColor}
            topic={topic.trim() || undefined}
            studiedSec={c.current.elapsedStudy}
            breakCount={c.current.breakCount}
            breakSec={c.current.totalBreak}
            imageUris={noteUris}
          />

          <TouchableOpacity
            style={[styles.captureNotes, { borderColor: t.cardBorder, backgroundColor: t.card }]}
            onPress={captureNotes}
            activeOpacity={0.85}
          >
            <Ionicons name="camera-outline" size={18} color={t.accentLight} />
            <Text style={[styles.captureNotesText, { color: t.accentLight }]}>
              {noteUris.length ? 'Add more notes' : 'Capture notes'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
        <View style={styles.summaryFooter}>
          <PrimaryButton label="Done" icon="checkmark" onPress={handleDone} />
        </View>
      </SafeAreaView>
    );
  }

  // ------------------------------------------------- RUNNING / BREAK ---------
  const isBreak = phase === 'break';
  // Background follows the user's tile preset (accent top-left → base bottom-right),
  // in both portrait and landscape. Digit cards use the card colour; the digits
  // themselves are drawn in the background colour.
  const parts = clockParts(isBreak ? c.current.remainingBreak : c.current.remainingStudy);
  const nextBreakIn = studyMins * 60 - c.current.sinceBreak;

  return (
    <Pressable style={styles.clockScreen} onPressIn={beginHold} onPressOut={cancelHold}>
      <LinearGradient
        colors={t.tileGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.fill}
        pointerEvents="none"
      />
      <SafeAreaView style={styles.clockSafe}>
        <Text style={[styles.clockTop, { color: t.onTile }]}>
          {isBreak ? 'BREAK TIME' : `${subjectName}${topic.trim() ? ` · ${topic.trim()}` : ''}`}
        </Text>

        <View style={styles.digitsRow}>
          {parts.map((p, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Text style={[styles.colon, { color: t.accent }]}>:</Text>}
              <FlipDigit value={p} digitColor={t.accent} cardColor={t.card} />
            </React.Fragment>
          ))}
        </View>

        <Text style={[styles.clockSub, { color: t.onTile }]}>
          {isBreak
            ? 'Relax — study resumes automatically'
            : breaksEnabled
            ? `Next break in ${mmss(nextBreakIn)}`
            : 'Total study time remaining'}
        </Text>

        <Animated.Text style={[styles.holdHint, { opacity: hintOpacity, color: t.onTile }]}>
          Press &amp; hold anywhere to end session
        </Animated.Text>
      </SafeAreaView>

      {holding && (
        <View style={styles.holdOverlay}>
          <BlurView intensity={55} tint="dark" style={styles.fill} />
          <View style={styles.holdCenter}>
            <View style={styles.holdRingWrap}>
              <Svg width={160} height={160}>
                <Circle cx={80} cy={80} r={RING_R} stroke="rgba(233,196,106,0.25)" strokeWidth={6} fill="none" />
                <AnimatedCircle
                  cx={80}
                  cy={80}
                  r={RING_R}
                  stroke={GOLD}
                  strokeWidth={6}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${RING_C}`}
                  strokeDashoffset={holdAnim.interpolate({ inputRange: [0, 1], outputRange: [RING_C, 0] })}
                  transform="rotate(-90 80 80)"
                />
              </Svg>
              <View style={styles.holdFigure}>
                <Text style={styles.holdFigureEmoji}>🙋</Text>
              </View>
            </View>
            <Text style={styles.holdOverlayText}>Press and hold to{'\n'}exit study session</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  // Setup
  setupRoot: { flex: 1 },
  setupCenter: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  setupCard: { borderRadius: radii.xl, borderWidth: 1, padding: spacing.xl, width: '100%', maxWidth: APP_MAX_WIDTH, alignSelf: 'center' },
  setupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  setupTitle: { fontSize: 20, fontWeight: '800' },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm },
  miniLabel: { fontSize: 12, fontWeight: '600', marginTop: spacing.md, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '700' },
  addChip: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipHint: { fontSize: 11, marginTop: spacing.sm },
  addTopicRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  addTopicSave: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: { marginTop: spacing.md, borderRadius: radii.sm, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xl },
  toggleHint: { fontSize: 12, marginTop: 2 },
  // Clock
  clockScreen: { flex: 1 },
  clockSafe: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  clockTop: { color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: '700', letterSpacing: 0.5, marginBottom: spacing.xxl, textAlign: 'center' },
  digitsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  colon: { fontSize: 48, fontWeight: '800', marginHorizontal: 2 },
  clockSub: { color: 'rgba(255,255,255,0.9)', fontSize: 15, fontWeight: '600', marginTop: spacing.xxl },
  holdHint: { position: 'absolute', bottom: spacing.xxl, color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
  holdOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  holdCenter: { alignItems: 'center' },
  holdRingWrap: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
  holdFigure: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  holdFigureEmoji: { fontSize: 60 },
  holdOverlayText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', marginTop: spacing.xl, textAlign: 'center', lineHeight: 24 },
  // Summary
  summaryContent: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  summaryBadge: { alignItems: 'center', marginBottom: spacing.xl },
  summaryTitle: { fontSize: 22, fontWeight: '800', marginTop: spacing.sm },
  summaryFooter: { padding: spacing.xl, borderTopWidth: 1, borderTopColor: 'rgba(128,128,128,0.2)' },
  captureNotes: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    marginTop: spacing.xl,
  },
  captureNotesText: { fontSize: 14, fontWeight: '700' },
});
