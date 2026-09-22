import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { C } from '../src/theme';
import type { UserRole } from '../src/api/types';

export const unstable_settings = {
  initialRouteName: 'index',
};

const roleHome: Record<UserRole, string> = {
  farmer: '/farmer',
  buyer: '/buyer',
  driver: '/driver',
  coordinator: '/coordinator',
};

const publicRoutes = new Set(['login', 'register']);

function AuthGate(): React.ReactElement {
  const { ready, user } = useAuth();
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
    const home = roleHome[user.role];
    // Keep the user inside their role area (and off the auth/index screens).
    if (onPublic || current === 'index' || `/${current}` === '/index') {
      router.replace(home as never);
      return;
    }
    const allowed = new Set([home.slice(1), 'impact']);
    if (!allowed.has(current)) {
      router.replace(home as never);
    }
  }, [ready, user, segments, router]);

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
