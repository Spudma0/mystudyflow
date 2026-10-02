import React from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { APP_MAX_WIDTH, colors, radii, spacing } from '../theme/theme';
import { useBaseTheme } from '../theme/useBaseTheme';
import { withAlpha } from '../store/useThemeStore';

/**
 * The confirmation in front of deleting an account.
 *
 * Deletion cannot be undone and takes the timetable, study history and every
 * generated study plan with it, so it asks for the word to be typed rather
 * than offering a button that a mis-tap could reach. The list of what goes is
 * spelled out: "are you sure?" does not tell anyone what they are losing.
 */

const CONFIRM_WORD = 'DELETE';

const LOSES = [
  'Your timetable and every class on it',
  'All study sessions, hours and streaks',
  'Every generated study plan and lesson',
  'All reminders, assignments and exams',
];

export function DeleteAccountSheet({
  visible,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useBaseTheme();
  const [typed, setTyped] = React.useState('');

  // Never reopen with the word already in the box.
  React.useEffect(() => {
    if (visible) setTyped('');
  }, [visible]);

  const armed = typed.trim().toUpperCase() === CONFIRM_WORD && !busy;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: t.base }]}>
          <View style={[styles.handle, { backgroundColor: t.cardBorder }]} />

          <View style={[styles.warnIcon, { backgroundColor: withAlpha(colors.danger, 0.16) }]}>
            <Ionicons name="trash-outline" size={22} color={colors.danger} />
          </View>

          <Text style={[styles.title, { color: t.text }]}>Delete your account?</Text>
          <Text style={[styles.body, { color: t.secondary }]}>
            This cannot be undone. Deleting removes:
          </Text>

          <View style={styles.list}>
            {LOSES.map((item) => (
              <View key={item} style={styles.listRow}>
                <Ionicons name="close-circle" size={16} color={colors.danger} />
                <Text style={[styles.listText, { color: t.secondary }]}>{item}</Text>
              </View>
            ))}
          </View>

          <Text style={[styles.prompt, { color: t.text }]}>
            Type <Text style={{ color: colors.danger, fontWeight: '900' }}>{CONFIRM_WORD}</Text> to
            confirm
          </Text>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder={CONFIRM_WORD}
            placeholderTextColor={t.muted}
            editable={!busy}
            style={[
              styles.input,
              { color: t.onCard, backgroundColor: t.card, borderColor: armed ? colors.danger : t.cardBorder },
            ]}
          />

          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.deleteButton, { backgroundColor: colors.danger, opacity: armed ? 1 : 0.4 }]}
            activeOpacity={0.88}
            disabled={!armed}
            onPress={onConfirm}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.deleteLabel}>Delete account permanently</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancel} onPress={onClose} disabled={busy}>
            <Text style={[styles.cancelLabel, { color: t.secondary }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    width: '100%',
    maxWidth: APP_MAX_WIDTH,
    alignSelf: 'center',
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.lg },
  warnIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { fontSize: 22, fontWeight: '800' },
  body: { fontSize: 14, marginTop: 6, lineHeight: 20 },
  list: { gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.lg },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  listText: { flex: 1, fontSize: 13, fontWeight: '600' },
  prompt: { fontSize: 14, fontWeight: '700', marginBottom: spacing.sm },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
  },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600', marginTop: spacing.md },
  deleteButton: {
    marginTop: spacing.lg,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  deleteLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  cancel: { alignItems: 'center', paddingVertical: spacing.lg },
  cancelLabel: { fontSize: 15, fontWeight: '700' },
});
