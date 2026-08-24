import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import ScreenHeader from './ScreenHeader';
import { Button, Input } from './ui';
import { colors } from '../theme';

// Mirrors web's SweetAlertService.promptAdminPassword - gates a sensitive
// action (editing/deleting a salary advance, etc.) behind any admin's
// password, checked via POST /api/auth/verify-admin-password, regardless of
// which role is actually logged in and performing the action.
export default function AdminPasswordModal({
  visible,
  onCancel,
  onConfirm,
  title = 'Admin Password Required',
  message = "Enter an admin's password to confirm this action.",
}) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    setPassword('');
    setError('');
    setLoading(false);
    onCancel();
  };

  const submit = async () => {
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      await onConfirm(password);
      setPassword('');
    } catch (err) {
      setError(err.message || 'Incorrect admin password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={styles.modal}>
        <ScreenHeader title={title} />
        <View style={styles.content}>
          <Text style={styles.message}>{message}</Text>
          <Input
            placeholder="Admin password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            autoFocus
          />
          {!!error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            <Button title="Cancel" variant="outline" onPress={close} style={{ flex: 1 }} />
            <Button title="Confirm" onPress={submit} loading={loading} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 10 },
  message: { fontSize: 13, color: colors.textMuted },
  error: { color: colors.danger, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
});
