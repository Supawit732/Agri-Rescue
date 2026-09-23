import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { C } from '../src/theme';
import type { AppMode, User } from '../src/api/types';

export const unstable_settings = {
  initialRouteName: 'index',
};

const publicRoutes = new Set(['login', 'register', 'terms']);

function homeFor(user: User, mode: AppMode): string {
  if (user.is_admin && !user.can_sell && !user.can_buy) {
    return '/admin';
  }
  if (mode === 'sell' && user.can_sell) {
    return '/farmer';
  }
  if (mode === 'buy' && user.can_buy) {
    return '/buyer';
  }
  if (user.can_sell) {
    return '/farmer';
  }
  if (user.can_buy) {
    return '/buyer';
  }
  if (user.is_admin) {
    return '/admin';
  }
  return '/login';
}

function AuthGate(): React.ReactElement {
  const { ready, user, mode, setMode } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) {
      return;
    }
    const current = segments[0] ?? 'index';
    const onPublic = publicRoutes.has(current);
    if (user === null) {
      if (!onPublic) {
        router.replace('/login');
      }
      return;
    }

    // Hide driver/coordinator from navigation; keep screens for later phases.
    if (current === 'driver' || current === 'coordinator') {
      router.replace(homeFor(user, mode) as never);
      return;
    }

    const home = homeFor(user, mode);
    const routeName = String(current);
    if (onPublic || routeName === 'index' || routeName === '') {
      // Logged-in users may still open terms
      if (routeName === 'terms') {
        return;
      }
      router.replace(home as never);
      return;
    }

    if (current === 'admin' && !user.is_admin) {
      router.replace(home as never);
      return;
    }

    if (current === 'farmer' && !user.can_sell) {
      if (user.can_buy) {
        setMode('buy');
      }
      router.replace(homeFor(user, 'buy') as never);
      return;
    }
    if (current === 'buyer' && !user.can_buy) {
      if (user.can_sell) {
        setMode('sell');
      }
      router.replace(homeFor(user, 'sell') as never);
      return;
    }

    const allowed = new Set(['farmer', 'buyer', 'impact', 'profile', 'admin', 'donor-apply', 'terms']);
    if (!allowed.has(current)) {
      router.replace(home as never);
    }
  }, [ready, user, mode, segments, router, setMode]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator size="large" color={C.leaf} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="farmer" />
      <Stack.Screen name="buyer" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="admin" />
      <Stack.Screen name="donor-apply" />
      <Stack.Screen name="terms/donor" />
      <Stack.Screen name="driver" />
      <Stack.Screen name="coordinator" />
      <Stack.Screen name="impact" />
    </Stack>
  );
}

export default function RootLayout(): React.ReactElement {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <AuthGate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
