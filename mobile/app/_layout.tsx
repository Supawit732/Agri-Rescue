import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { C } from '../src/theme';

export const unstable_settings = {
  initialRouteName: 'index',
};

/** Routes reachable without login (tabs invite internally). */
const openRoots = new Set(['index', '(tabs)', 'login', 'register', 'terms', 'lots']);

function AuthGate(): React.ReactElement {
  const { ready, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) {
      return;
    }
    const root = String(segments[0] ?? 'index');

    // Hide driver/coordinator from navigation; keep screens for later phases.
    if (root === 'driver' || root === 'coordinator') {
      router.replace('/(tabs)' as never);
      return;
    }

    if (user === null) {
      if (!openRoots.has(root)) {
        const returnTo = `/${segments.join('/')}`;
        router.replace({ pathname: '/login', params: { returnTo } } as never);
      }
      return;
    }

    // Authenticated: do not force sell/buy mode homes.
    if (root === 'login' || root === 'register' || root === 'index' || root === '') {
      router.replace('/(tabs)' as never);
      return;
    }

    if (root === 'admin' && !user.is_admin) {
      router.replace('/(tabs)/account' as never);
      return;
    }

    if (root === 'farmer') {
      router.replace('/(tabs)/sell' as never);
      return;
    }
    if (root === 'buyer') {
      router.replace('/(tabs)' as never);
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
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="farmer" />
      <Stack.Screen name="buyer" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="admin" />
      <Stack.Screen name="donor-apply" />
      <Stack.Screen name="terms/donor" />
      <Stack.Screen name="lots/[id]/index" />
      <Stack.Screen name="lots/[id]/confirm" />
      <Stack.Screen name="lots/[id]/success" />
      <Stack.Screen name="orders/[id]" />
      <Stack.Screen name="sell/success" />
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
