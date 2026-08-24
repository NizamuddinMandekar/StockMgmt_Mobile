import { Ionicons } from '@expo/vector-icons';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import LogoMark from '../components/LogoMark';
import { useAuth } from '../context/AuthContext';
import CatalogScreen from '../screens/CatalogScreen';
import DashboardScreen from '../screens/DashboardScreen';
import PaymentsScreen from '../screens/PaymentsScreen';
import ProcurementScreen from '../screens/ProcurementScreen';
import SettingsScreen from '../screens/SettingsScreen';
import StockHistoryScreen from '../screens/StockHistoryScreen';
import StockInScreen from '../screens/StockInScreen';
import StockOutScreen from '../screens/StockOutScreen';
import WastageScreen from '../screens/WastageScreen';
import WorkforceScreen from '../screens/WorkforceScreen';
import { colors } from '../theme';

const Drawer = createDrawerNavigator();

// Matches StockMgmt_WebApp/src/View/StockManagement/manage.js's navTabs
// exactly - same order, same labels, remix-icon equivalents from Ionicons.
const MENU = [
  { name: 'Stock Dashboard', icon: 'speedometer-outline', component: DashboardScreen },
  { name: 'Product Master', icon: 'cube-outline', component: CatalogScreen },
  { name: 'Procurement Request', icon: 'document-text-outline', component: ProcurementScreen },
  { name: 'Stock In', icon: 'log-in-outline', component: StockInScreen },
  { name: 'Payments', icon: 'card-outline', component: PaymentsScreen },
  { name: 'Stock In History', icon: 'time-outline', component: StockHistoryScreen },
  { name: 'Stock Out', icon: 'log-out-outline', component: StockOutScreen },
  { name: 'Wastage Report', icon: 'trash-outline', component: WastageScreen },
  { name: 'Settings', icon: 'settings-outline', component: SettingsScreen },
  { name: 'Workforce', icon: 'people-outline', component: WorkforceScreen },
];

// Matches manage.js's role gating: HR only ever sees Workforce (lands
// there directly, no Stock-side tabs at all); Store Manager sees
// everything except Workforce. Any other role (e.g. admin/owner) gets
// the full menu.
function getMenuForRole(role) {
  if (role === 'hr') return MENU.filter((m) => m.name === 'Workforce');
  if (role === 'store_manager') return MENU.filter((m) => m.name !== 'Workforce');
  return MENU;
}

function CustomDrawerContent({ navigation, state }) {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const menu = getMenuForRole(user?.role);

  const confirmLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <View style={[styles.drawer, { paddingTop: insets.top + 16 }]}>
      <View style={styles.brandRow}>
        <LogoMark size={40} imageSize={28} radius={10} />
        <View>
          <Text style={styles.brandTitle}>Stock Management</Text>
          {user?.workspace_name ? <Text style={styles.brandSubtitle}>{user.workspace_name}</Text> : null}
        </View>
      </View>

      <View style={styles.menu}>
        {state.routeNames.filter((name) => menu.some((m) => m.name === name)).map((name) => {
          const index = state.routeNames.indexOf(name);
          const focused = state.index === index;
          const item = MENU.find((m) => m.name === name);
          return (
            <Pressable
              key={name}
              onPress={() => navigation.navigate(name)}
              style={[styles.menuItem, focused && styles.menuItemActive]}
            >
              <Ionicons name={item?.icon || 'ellipse-outline'} size={18} color={focused ? '#fff' : colors.pillText} />
              <Text style={[styles.menuText, focused && styles.menuTextActive]}>{name}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable onPress={confirmLogout} style={[styles.logoutRow, { paddingBottom: 16 + insets.bottom }]}>
        <Ionicons name="log-out-outline" size={18} color={colors.danger} />
        <Text style={styles.logoutText}>Log Out</Text>
      </Pressable>
    </View>
  );
}

export default function MainDrawer() {
  const { user } = useAuth();
  const menu = getMenuForRole(user?.role);

  return (
    <Drawer.Navigator
      key={user?.role || 'default'}
      initialRouteName={menu[0]?.name}
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{ headerShown: false, drawerType: 'front' }}
    >
      {menu.map((item) => (
        <Drawer.Screen key={item.name} name={item.name} component={item.component} />
      ))}
    </Drawer.Navigator>
  );
}

const styles = StyleSheet.create({
  drawer: {
    flex: 1,
    backgroundColor: colors.card,
    paddingTop: 56,
    paddingHorizontal: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingBottom: 20,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brandTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  brandSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
  },
  menu: {
    flex: 1,
    gap: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
  },
  menuItemActive: {
    backgroundColor: colors.ink,
  },
  menuText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.pillText,
  },
  menuTextActive: {
    color: '#fff',
  },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.danger,
  },
});
