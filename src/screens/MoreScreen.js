import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import LogoMark from '../components/LogoMark';
import { Card } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { colors, radius, type } from '../theme';

// Note: this screen intentionally only lists destinations + logout, mirroring
// exactly what the old drawer's menu + logout row offered - no new
// capabilities (e.g. branch switching) were added, this is a visual-only
// relocation of the same functionality into a native list-screen layout.

// Everything not frequent enough to earn a spot on the bottom tab bar lives
// here - a native-style settings/list screen, not another dashboard.
const DESTINATIONS = [
  { name: 'Product Master', icon: 'cube-outline', roles: ['admin', 'manager', 'staff', 'store_manager'] },
  { name: 'Wastage Report', icon: 'trash-outline', roles: ['admin', 'manager', 'staff', 'store_manager'] },
  { name: 'Settings', icon: 'settings-outline', roles: ['admin', 'manager', 'staff', 'store_manager'] },
  { name: 'Workforce', icon: 'people-outline', roles: ['admin', 'manager', 'staff', 'hr'] },
];

export default function MoreScreen() {
  const navigation = useNavigation();
  const { user, logout } = useAuth();
  const items = DESTINATIONS.filter((d) => d.roles.includes(user?.role));

  const confirmLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <LogoMark size={44} imageSize={30} radius={12} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{user?.full_name || user?.username}</Text>
          <Text style={styles.role}>
            {user?.workspace_name}
            {user?.role ? ` · ${user.role.replace('_', ' ')}` : ''}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.listCard}>
          {items.map((item, index) => (
            <Pressable
              key={item.name}
              onPress={() => navigation.navigate(item.name)}
              style={({ pressed }) => [
                styles.row,
                index !== items.length - 1 && styles.rowBorder,
                pressed && styles.rowPressed,
              ]}
            >
              <View style={styles.rowIconWrap}>
                <Ionicons name={item.icon} size={18} color={colors.ink} />
              </View>
              <Text style={styles.rowText}>{item.name}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>
          ))}
        </Card>

        <Pressable onPress={confirmLogout} style={({ pressed }) => [styles.logoutRow, pressed && styles.rowPressed]}>
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  name: { ...type.heading, color: colors.text },
  role: { ...type.caption, color: colors.textMuted, marginTop: 2, textTransform: 'capitalize' },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  listCard: { padding: 0, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowPressed: { backgroundColor: colors.bg },
  rowIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, ...type.body, fontWeight: '500', color: colors.text },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 6,
    borderRadius: radius.md,
  },
  logoutText: { ...type.body, fontWeight: '600', color: colors.danger },
});
