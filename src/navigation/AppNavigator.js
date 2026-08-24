import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import SelectBranchScreen from '../screens/SelectBranchScreen';
import { colors } from '../theme';
import MainDrawer from './MainDrawer';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { status, branches, activeBranchId } = useAuth();

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.ink} size="large" />
      </View>
    );
  }

  const needsBranchChoice = status === 'signedIn' && branches.length > 1 && !activeBranchId;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {status === 'signedOut' ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : needsBranchChoice ? (
          <Stack.Screen name="SelectBranch" component={SelectBranchScreen} />
        ) : (
          <Stack.Screen name="Main" component={MainDrawer} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
