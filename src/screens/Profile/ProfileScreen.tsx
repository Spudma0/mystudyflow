import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DeleteAccountSheet } from '../../components/DeleteAccountSheet';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing } from '../../theme/theme';
import { useBaseTheme } from '../../theme/useBaseTheme';
import { LineGridBackground } from '../../components/LineGridBackground';
import { Avatar } from '../../components/Avatar';
import { useAuthStore } from '../../store/useAuthStore';
import {
  BASE_COLOR_PALETTE,
  ACCENT_COLOR_PALETTE,
  CARD_COLOR_PALETTE,
  useThemeStore,
  contrastText,
} from '../../store/useThemeStore';

/** Where to write when something goes wrong. */
const SUPPORT_EMAIL = 'mystudyflowbusiness@gmail.com';

const SETTINGS_ROWS: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** What the row does: open iOS settings, or expand underneath itself. */
  kind: 'notifications' | 'theme' | 'help';
}[] = [
  { icon: 'notifications-outline', label: 'Notifications', kind: 'notifications' },
  { icon: 'color-palette-outline', label: 'Theme', kind: 'theme' },
  { icon: 'help-circle-outline', label: 'Help & Support', kind: 'help' },
];

export function ProfileScreen() {
  const t = useBaseTheme();
  const [themeExpanded, setThemeExpanded] = useState(false);
  const [helpExpanded, setHelpExpanded] = useState(false);
  const baseColor = useThemeStore((s) => s.baseColor);
  const setBaseColor = useThemeStore((s) => s.setBaseColor);
  const accentColor = useThemeStore((s) => s.accentColor);
  const setAccentColor = useThemeStore((s) => s.setAccentColor);
  const linkBackground = useThemeStore((s) => s.linkBackground);
  const setLinkBackground = useThemeStore((s) => s.setLinkBackground);
  const bgColor = useThemeStore((s) => s.bgColor);
  const setBgColor = useThemeStore((s) => s.setBgColor);
  const cardColor = useThemeStore((s) => s.cardColor);
  const setCardColor = useThemeStore((s) => s.setCardColor);
  const lineGrid = useThemeStore((s) => s.lineGrid);
  const setLineGrid = useThemeStore((s) => s.setLineGrid);

  // Inline slide-down reveal for the separate-background palette (shown when
  // the background is unlinked from the tile).
  const reveal = useRef(new Animated.Value(linkBackground ? 0 : 1)).current;
  useEffect(() => {
    Animated.timing(reveal, {
      toValue: linkBackground ? 0 : 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [linkBackground, reveal]);

  const profile = useAuthStore((s) => s.profile);
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const clearError = useAuthStore((s) => s.clearError);
  const busy = useAuthStore((s) => s.busy);
  const authError = useAuthStore((s) => s.error);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const email = session?.user.email ?? '';
  const initials =
    (profile?.full_name || email)
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?';
  const subtitle = [profile?.year_level, profile?.school].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: t.base }]} edges={['top']}>
      <LineGridBackground />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.headerTitle, { color: t.text }]}>Profile</Text>

        <View style={styles.profileHeader}>
          <Avatar initials={initials} size={88} />
          <Text style={[styles.name, { color: t.text }]}>{profile?.full_name || 'Your account'}</Text>
          <Text style={[styles.email, { color: t.secondary }]}>{email}</Text>
          {!!subtitle && <Text style={[styles.school, { color: t.muted }]}>{subtitle}</Text>}
        </View>

        <View style={[styles.settingsList, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
          {SETTINGS_ROWS.map((row, i) => {
            const isTheme = row.kind === 'theme';
            const isHelp = row.kind === 'help';
            const expanded = (isTheme && themeExpanded) || (isHelp && helpExpanded);
            return (
              <React.Fragment key={row.label}>
                <TouchableOpacity
                  style={[
                    styles.settingsRow,
                    i !== SETTINGS_ROWS.length - 1 && [styles.settingsRowBorder, { borderBottomColor: t.cardBorder }],
                  ]}
                  activeOpacity={0.7}
                  onPress={
                    isTheme
                      ? () => setThemeExpanded((v) => !v)
                      : isHelp
                      ? () => setHelpExpanded((v) => !v)
                      : // Notifications are granted by iOS, not by us, so this
                        // opens the app's own page in Settings rather than
                        // pretending to hold a switch we do not own.
                        () => Linking.openSettings()
                  }
                >
                  <View style={[styles.settingsIconWrap, { backgroundColor: t.cardAlt }]}>
                    <Ionicons name={row.icon} size={18} color={t.accentLight} />
                  </View>
                  <Text style={[styles.settingsLabel, { color: t.onCard }]}>{row.label}</Text>
                  <Ionicons
                    name={expanded ? 'chevron-down' : 'chevron-forward'}
                    size={18}
                    color={t.onCardMuted}
                  />
                </TouchableOpacity>

                {isHelp && helpExpanded && (
                  <View style={[styles.helpWrap, { borderTopColor: t.cardBorder }]}>
                    <Text style={[styles.helpText, { color: t.onCardSecondary }]}>
                      For help and support, get in touch at
                    </Text>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
                    >
                      <Text style={[styles.helpEmail, { color: t.accentLight }]}>
                        {SUPPORT_EMAIL}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {isTheme && themeExpanded && (
                  <View style={[styles.paletteWrap, { borderBottomColor: t.cardBorder }]}>
                    {/* Live preview of the home tile gradient (accent → base) */}
                    <LinearGradient
                      colors={t.tileGradient}
                      locations={[0.3, 0.5, 0.7]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.gradientPreview}
                    >
                      <Text style={[styles.previewCorner, styles.previewTL, { color: t.onAccent }]}>
                        Accent
                      </Text>
                      <Text
                        style={[
                          styles.previewCorner,
                          styles.previewBR,
                          { color: contrastText(baseColor) },
                        ]}
                      >
                        Background
                      </Text>
                    </LinearGradient>

                    <Text style={styles.paletteHint}>Accent colour (top-left)</Text>
                    <View style={styles.paletteRow}>
                      {ACCENT_COLOR_PALETTE.map((option) => {
                        const selected = option.color === accentColor;
                        return (
                          <TouchableOpacity
                            key={option.color}
                            onPress={() => setAccentColor(option.color)}
                            style={[
                              styles.swatch,
                              { backgroundColor: option.color },
                              selected && { borderWidth: 2, borderColor: t.accentLight },
                            ]}
                            accessibilityLabel={option.name}
                          >
                            {selected && (
                              <Ionicons name="checkmark" size={16} color={contrastText(option.color)} />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <View style={styles.paletteTitleRow}>
                      <Text style={[styles.paletteHint, { marginBottom: 0 }]}>
                        Background colour (bottom-right)
                      </Text>
                      <Switch
                        value={linkBackground}
                        onValueChange={setLinkBackground}
                        trackColor={{ false: colors.border, true: t.accent }}
                        thumbColor="#FFFFFF"
                      />
                    </View>
                    <Text style={styles.paletteSubHint}>
                      {linkBackground
                        ? 'Also used as the app background'
                        : 'App background set separately'}
                    </Text>
                    <View style={styles.paletteRow}>
                      {BASE_COLOR_PALETTE.map((option) => {
                        const selected = option.color === baseColor;
                        return (
                          <TouchableOpacity
                            key={option.color}
                            onPress={() => setBaseColor(option.color)}
                            style={[
                              styles.swatch,
                              { backgroundColor: option.color },
                              selected && { borderWidth: 2, borderColor: t.accentLight },
                            ]}
                            accessibilityLabel={option.name}
                          >
                            {selected && (
                              <Ionicons name="checkmark" size={16} color={contrastText(option.color)} />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {!linkBackground && (
                      <Animated.View
                        style={{
                          opacity: reveal,
                          transform: [
                            { translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) },
                          ],
                        }}
                      >
                        <View style={[styles.bgDivider, { backgroundColor: t.cardBorder }]} />
                        <Text style={styles.paletteHint}>App background colour</Text>
                        <View style={styles.paletteRow}>
                          {BASE_COLOR_PALETTE.map((option) => {
                            const selected = option.color === bgColor;
                            return (
                              <TouchableOpacity
                                key={option.color}
                                onPress={() => setBgColor(option.color)}
                                style={[
                                  styles.swatch,
                                  { backgroundColor: option.color },
                                  selected && { borderWidth: 2, borderColor: t.accentLight },
                                ]}
                                accessibilityLabel={option.name}
                              >
                                {selected && (
                                  <Ionicons name="checkmark" size={16} color={contrastText(option.color)} />
                                )}
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </Animated.View>
                    )}

                    <View style={[styles.bgDivider, { backgroundColor: t.cardBorder }]} />
                    <Text style={styles.paletteHint}>Card / button colour</Text>
                    <View style={styles.paletteRow}>
                      {CARD_COLOR_PALETTE.map((option) => {
                        const selected = option.color === cardColor;
                        return (
                          <TouchableOpacity
                            key={option.color}
                            onPress={() => setCardColor(option.color)}
                            style={[
                              styles.swatch,
                              { backgroundColor: option.color },
                              selected && { borderWidth: 2, borderColor: t.accentLight },
                            ]}
                            accessibilityLabel={option.name}
                          >
                            {selected && (
                              <Ionicons name="checkmark" size={16} color={contrastText(option.color)} />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <View style={[styles.bgDivider, { backgroundColor: t.cardBorder }]} />
                    <View style={styles.paletteTitleRow}>
                      <Text style={[styles.paletteHint, { marginBottom: 0 }]}>Line pattern</Text>
                      <Switch
                        value={lineGrid}
                        onValueChange={setLineGrid}
                        trackColor={{ false: colors.border, true: t.accent }}
                        thumbColor="#FFFFFF"
                      />
                    </View>
                    <Text style={styles.paletteSubHint}>
                      {lineGrid
                        ? 'Faint lines and curves behind every screen'
                        : 'Plain background, no pattern'}
                    </Text>
                  </View>
                )}
              </React.Fragment>
            );
          })}
        </View>

        <TouchableOpacity style={styles.signOutButton} activeOpacity={0.85} onPress={signOut}>
          <Text style={styles.signOutLabel}>Sign Out</Text>
        </TouchableOpacity>

        {/* Deleting the account has to be reachable from inside the app, and
            sits apart from signing out so the two are not confused. */}
        <TouchableOpacity
          style={styles.deleteAccountButton}
          activeOpacity={0.7}
          onPress={() => setDeleteOpen(true)}
        >
          <Text style={styles.deleteAccountLabel}>Delete Account</Text>
        </TouchableOpacity>
      </ScrollView>

      <DeleteAccountSheet
        visible={deleteOpen}
        busy={busy}
        error={authError}
        onConfirm={async () => {
          const done = await deleteAccount();
          if (done) setDeleteOpen(false);
        }}
        onClose={() => {
          clearError();
          setDeleteOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  headerTitle: { color: colors.textPrimary, fontSize: 30, fontWeight: '800', marginBottom: spacing.xl },
  profileHeader: { alignItems: 'center', marginBottom: spacing.xxl },
  name: { color: colors.textPrimary, fontSize: 22, fontWeight: '800', marginTop: spacing.lg },
  email: { color: colors.textSecondary, fontSize: 14, marginTop: spacing.xs },
  school: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },
  settingsList: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xxl,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  settingsRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  settingsIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  settingsLabel: { flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  paletteWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  helpWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  helpText: { fontSize: 13.5, lineHeight: 19 },
  helpEmail: { fontSize: 14.5, fontWeight: '700', marginTop: spacing.xs },
  paletteHint: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  gradientPreview: {
    height: 84,
    borderRadius: radii.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  previewCorner: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  previewTL: { alignSelf: 'flex-start' },
  previewBR: { alignSelf: 'flex-end' },
  paletteTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  paletteSubHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: spacing.md,
  },
  bgDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  paletteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchSelected: { borderWidth: 2, borderColor: colors.purpleLight },
  signOutButton: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  signOutLabel: { color: colors.danger, fontWeight: '700', fontSize: 15 },
  deleteAccountButton: { alignItems: 'center', paddingVertical: spacing.lg },
  deleteAccountLabel: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});
