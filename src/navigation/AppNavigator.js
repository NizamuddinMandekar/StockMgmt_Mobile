import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';

import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import SelectBranchScreen from '../screens/SelectBranchScreen';
import MainNavigator from './MainNavigator';

const Stack = createNativeStackNavigator();

// Hold the native splash (dark bg + logo, see app.json's expo-splash-screen
// config) up for exactly this long, then hand off directly to Login/Main -
// no separate loading screen in between. Login itself fades in smoothly on
// mount (see LoginScreen's entrance animation), so the splash-to-login
// handoff reads as one continuous transition rather than a flash or a
// blank interstitial screen.
const SPLASH_HOLD_MS = 1000;

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function AppNavigator() {
  const { status, branches, activeBranchId } = useAuth();
  const [holdElapsed, setHoldElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setHoldElapsed(true), SPLASH_HOLD_MS);
    return () => clearTimeout(timer);
  }, []);

  const ready = status !== 'loading' && holdElapsed;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    // The native splash is still covering the screen at this point - it
    // hasn't been told to hide yet, so there's nothing to render here.
    return null;
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
          <Stack.Screen name="Main" component={MainNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
