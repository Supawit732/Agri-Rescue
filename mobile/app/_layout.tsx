import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts as useAnuphan,
  Anuphan_500Medium,
  Anuphan_600SemiBold,
  Anuphan_700Bold,
} from '@expo-google-fonts/anuphan';
import {
  useFonts as usePlex,
  IBMPlexSansThai_400Regular,
  IBMPlexSansThai_500Medium,
  IBMPlexSansThai_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans-thai';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { I18nProvider } from '../src/i18n';
import { C } from '../src/theme';

export const unstable_settings = {
  initialRouteName: 'index',
};

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Routes reachable without login (tabs invite internally). */
const openRoots = new Set([
  'index',
  '(tabs)',
  'login',
  'register',
  'terms',
  'lots',
  'profile',
  'shops',
  'followed-shops',
  'contact-us',
  'support',
]);

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
      if (user.is_admin) {
        router.replace('/admin' as never);
      } else {
        router.replace('/(tabs)' as never);
      }
      return;
    }

    if (root === 'admin' && !user.is_admin) {
      router.replace('/profile' as never);
      return;
    }

    // Admin home is the console, not marketplace tabs.
    if (user.is_admin && root === '(tabs)') {
      router.replace('/admin' as never);
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
      <Stack.Screen name="dashboard" />
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
      <Stack.Screen name="shops/[userId]" />
      <Stack.Screen name="followed-shops" />
      <Stack.Screen name="contact-us" />
      <Stack.Screen name="support/[id]" />
    </Stack>
  );
}

export default function RootLayout(): React.ReactElement {
  const [anuphanLoaded] = useAnuphan({
    Anuphan_500Medium,
    Anuphan_600SemiBold,
    Anuphan_700Bold,
  });
  const [plexLoaded] = usePlex({
    IBMPlexSansThai_400Regular,
    IBMPlexSansThai_500Medium,
    IBMPlexSansThai_600SemiBold,
  });
  const fontsReady = anuphanLoaded && plexLoaded;
  const [layoutReady, setLayoutReady] = useState(false);

  useEffect(() => {
    if (fontsReady && !layoutReady) {
      setLayoutReady(true);
      void SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsReady, layoutReady]);

  if (!fontsReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator size="large" color={C.leaf} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <I18nProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <AuthGate />
        </AuthProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
