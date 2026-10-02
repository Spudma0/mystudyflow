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

export function SignInScreen() {
  const t = useBaseTheme();
  const navigation = useNavigation<StackNavigationProp<AuthStackParamList>>();
  const signIn = useAuthStore((s) => s.signIn);
  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

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
          <Text style={[styles.title, { color: t.text }]}>Welcome back</Text>
          <Text style={[styles.subtitle, { color: t.secondary }]}>
            Sign in and everything picks up where you left off.
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
              placeholder="Your password"
              secureTextEntry
              autoCapitalize="none"
              textContentType="password"
            />
            {!!error && <Text style={styles.error}>{error}</Text>}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton
            label="Sign in"
            loading={busy}
            disabled={!canSubmit}
            onPress={() => signIn(email, password)}
          />
          <TouchableOpacity onPress={() => navigation.navigate('SignUp')} style={styles.switchRow}>
            <Text style={[styles.switchText, { color: t.muted }]}>
              New here? <Text style={{ color: t.accentLight, fontWeight: '700' }}>Create an account</Text>
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
  error: { color: '#F87171', fontSize: 13, lineHeight: 18, marginTop: spacing.sm },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.md },
  switchRow: { alignItems: 'center' },
  switchText: { fontSize: 14 },
});
