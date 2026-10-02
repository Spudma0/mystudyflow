import React, { useState } from 'react';
import {
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
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { spacing } from '../../theme/theme';
import { useBaseTheme } from '../../theme/useBaseTheme';
import { PrimaryButton } from '../../components/PrimaryButton';
import { AuthTextField } from '../../components/AuthTextField';
import { LineGridBackground } from '../../components/LineGridBackground';
import { useAuthStore } from '../../store/useAuthStore';
import { AuthStackParamList } from '../../navigation/types';

const MIN_PASSWORD = 8;

export function SignUpScreen() {
  const t = useBaseTheme();
  const navigation = useNavigation<StackNavigationProp<AuthStackParamList>>();
  const signUp = useAuthStore((s) => s.signUp);
  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const emailLooksValid = /^\S+@\S+\.\S+$/.test(email.trim());
  const longEnough = password.length >= MIN_PASSWORD;
  const matches = confirm.length > 0 && confirm === password;
  const canSubmit = emailLooksValid && longEnough && matches && !busy;

  // Only nag once there is something to nag about — no red text on an empty form.
  const passwordHint =
    password.length > 0 && !longEnough ? `At least ${MIN_PASSWORD} characters` : null;
  const confirmHint = confirm.length > 0 && !matches ? "Passwords don't match" : null;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: t.base }]} edges={['top']}>
      <LineGridBackground always />

      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={t.text} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.title, { color: t.text }]}>Create your account</Text>
          <Text style={[styles.subtitle, { color: t.secondary }]}>
            Your timetable and study history stay with this account, on any device.
          </Text>

          <View style={styles.form}>
            <AuthTextField
              label="Email"
              value={email}
              onChangeText={(v) => {
                clearError();
                setEmail(v);
              }}
              placeholder="you@school.edu"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <AuthTextField
              label="Password"
              value={password}
              onChangeText={(v) => {
                clearError();
                setPassword(v);
              }}
              placeholder={`At least ${MIN_PASSWORD} characters`}
              secureTextEntry
              autoCapitalize="none"
              textContentType="newPassword"
            />
            {!!passwordHint && <Text style={[styles.hint, { color: t.muted }]}>{passwordHint}</Text>}

            <AuthTextField
              label="Confirm password"
              value={confirm}
              onChangeText={(v) => {
                clearError();
                setConfirm(v);
              }}
              placeholder="Type it again"
              secureTextEntry
              autoCapitalize="none"
              textContentType="newPassword"
            />
            {!!confirmHint && <Text style={[styles.hint, { color: t.muted }]}>{confirmHint}</Text>}

            {!!error && <Text style={styles.error}>{error}</Text>}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton
            label="Continue"
            loading={busy}
            disabled={!canSubmit}
            onPress={() => signUp(email, password)}
          />
          <TouchableOpacity onPress={() => navigation.navigate('SignIn')} style={styles.switchRow}>
            <Text style={[styles.switchText, { color: t.muted }]}>
              Already have an account? <Text style={{ color: t.accentLight, fontWeight: '700' }}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  headerRow: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: 28, fontWeight: '800' },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: spacing.sm },
  form: { marginTop: spacing.xxl },
  hint: { fontSize: 12, marginTop: -spacing.md, marginBottom: spacing.md },
  error: { color: '#F87171', fontSize: 13, lineHeight: 18, marginTop: spacing.sm },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.md },
  switchRow: { alignItems: 'center' },
  switchText: { fontSize: 14 },
});
