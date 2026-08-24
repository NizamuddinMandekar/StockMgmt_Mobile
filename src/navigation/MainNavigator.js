import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CatalogScreen from '../screens/CatalogScreen';
import DashboardScreen from '../screens/DashboardScreen';
import MoreScreen from '../screens/MoreScreen';
import PaymentsScreen from '../screens/PaymentsScreen';
import ProcurementScreen from '../screens/ProcurementScreen';
import SettingsScreen from '../screens/SettingsScreen';
import StockHubScreen from '../screens/StockHubScreen';
import WastageScreen from '../screens/WastageScreen';
import WorkforceScreen from '../screens/WorkforceScreen';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Matches web's manage.js role gating: HR only ever sees Workforce and
// lands there directly, with no Stock/tab chrome around it at all - a
// single-destination role doesn't need navigation UI around its one screen.
// Store Manager sees everything except Workforce. Any other role (e.g.
// admin/manager/staff) gets the full tab bar plus Workforce inside More.
const TAB_ICONS = {
  'Stock Dashboard': 'speedometer-outline',
  Stock: 'cube-outline',
  'Procurement Request': 'document-text-outline',
  Payments: 'card-outline',
  More: 'ellipsis-horizontal-circle-outline',
};

function MainTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: {
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom + 6,
          paddingTop: 6,
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
        tabBarIcon: ({ color, size }) => <Ionicons name={TAB_ICONS[route.name]} size={size} color={color} />,
      })}
    >
      <Tab.Screen name="Stock Dashboard" component={DashboardScreen} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="Stock" component={StockHubScreen} />
      <Tab.Screen
        name="Procurement Request"
        component={ProcurementScreen}
        options={{ tabBarLabel: 'Procurement' }}
      />
      <Tab.Screen name="Payments" component={PaymentsScreen} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}

export default function MainNavigator() {
  const { user } = useAuth();

  if (user?.role === 'hr') {
    return <WorkforceScreen />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={MainTabs} />
      <Stack.Screen name="Product Master" component={CatalogScreen} />
      <Stack.Screen name="Wastage Report" component={WastageScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      {user?.role !== 'store_manager' && <Stack.Screen name="Workforce" component={WorkforceScreen} />}
    </Stack.Navigator>
  );
}
