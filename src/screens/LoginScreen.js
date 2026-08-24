import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import LogoMark from '../components/LogoMark';
import { Button, Input } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { colors, radius } from '../theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFieldY, setPasswordFieldY] = useState(null);

  const shakeX = useSharedValue(0);
  const shake = () => {
    shakeX.value = withSequence(
      withTiming(-8, { duration: 60 }),
      withTiming(8, { duration: 60 }),
      withTiming(-6, { duration: 60 }),
      withTiming(6, { duration: 60 }),
      withTiming(-3, { duration: 50 }),
      withTiming(3, { duration: 50 }),
      withTiming(0, { duration: 50 }),
    );
  };
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));

  useEffect(() => {
    if (error) shake();
  }, [error]);

  const handleSubmit = async () => {
    if (!username.trim() || !password) {
      setError(!username.trim() ? 'Username is required.' : 'Password is required.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
      <Animated.View style={[styles.card, shakeStyle]}>
        <View style={styles.headerRow}>
          <LogoMark size={60} imageSize={44} radius={14} />
          <View style={styles.headerText}>
            <Text style={styles.title}>Sign in to your workspace</Text>
            <Text style={styles.subtitle}>Stock Management dashboard</Text>
          </View>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Username</Text>
            <Input
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Enter your username"
              value={username}
              onChangeText={setUsername}
              editable={!loading}
            />
          </View>

          <View style={styles.field} onLayout={(e) => setPasswordFieldY(e.nativeEvent.layout.y)}>
            <Text style={styles.label}>Password</Text>
            <Input
              placeholder="Enter your password"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              editable={!loading}
            />
          </View>

          {/* This button intentionally lives outside the password field's own
              Animated.View (as a sibling at the `form` level, positioned via
              measured layout) rather than inline next to the TextInput.
              Placing any Pressable inside the same immediate parent as a
              focused secureTextEntry input reproducibly breaks its text
              rendering on this Android build - the input still holds the
              correct value, it just stops painting the masked dots and its
              border. Keep this structure even though it looks unusual. */}
          {passwordFieldY != null && (
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={10}
              style={[styles.eyeButton, { top: passwordFieldY + 18 + 6 }]}
            >
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textFaint} />
            </Pressable>
          )}

          {!!error && (
            <Animated.Text entering={FadeInDown.duration(200)} style={styles.error}>
              {error}
            </Animated.Text>
          )}

          <Button title="Sign In" onPress={handleSubmit} loading={loading} style={styles.submit} />
        </View>

        <Text style={styles.footer}>Stock Management © {new Date().getFullYear()}</Text>
      </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 28,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
  },
  form: {
    gap: 14,
    position: 'relative',
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.pillText,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
  passwordInput: {
    paddingRight: 44,
  },
  eyeButton: {
    position: 'absolute',
    right: 14,
    height: 48,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submit: {
    marginTop: 4,
  },
  footer: {
    textAlign: 'center',
    color: colors.textFaint,
    fontSize: 12,
    marginTop: 24,
  },
});
