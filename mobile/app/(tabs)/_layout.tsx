import { Tabs, usePathname, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { useI18n } from '../../src/i18n';
import { C, fonts } from '../../src/theme';

const SIDEBAR_BREAKPOINT = 900;

export default function TabsLayout(): React.ReactElement {
  const { width } = useWindowDimensions();
  const isWide = width >= SIDEBAR_BREAKPOINT;
  const { t } = useI18n();
  const { user, api } = useAuth();
  const [unread, setUnread] = useState(0);

  const refreshUnread = useCallback(async () => {
    if (user === null) {
      setUnread(0);
      return;
    }
    try {
      const res = await api.unreadNotificationCount();
      setUnread(res.unread_count);
    } catch {
      setUnread(0);
    }
  }, [user, api]);

  useEffect(() => {
    void refreshUnread();
    const id = setInterval(() => {
      void refreshUnread();
    }, 60_000);
    return () => clearInterval(id);
  }, [refreshUnread]);

  const badgeLabel = unread > 0 ? (unread > 99 ? '99+' : String(unread)) : undefined;

  const tabItems: {
    name: string;
    href: string;
    label: string;
    icon: keyof typeof Feather.glyphMap;
  }[] = [
    { name: 'index', href: '/(tabs)', label: t.tabs.market, icon: 'home' },
    { name: 'sell', href: '/(tabs)/sell', label: t.tabs.sell, icon: 'plus-circle' },
    { name: 'orders', href: '/(tabs)/orders', label: t.tabs.orders, icon: 'file-text' },
    {
      name: 'notifications',
      href: '/(tabs)/notifications',
      label: t.tabs.notifications,
      icon: 'bell',
    },
  ];

  return (
    <View style={[styles.root, isWide ? styles.rootWide : null]}>
      {isWide ? <SideNav items={tabItems} unread={unread} /> : null}
      <View style={styles.tabsWrap}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: C.leaf,
            tabBarInactiveTintColor: C.mute,
            tabBarStyle: isWide
              ? { display: 'none' }
              : { backgroundColor: C.surface, borderTopColor: C.line },
            sceneStyle: { backgroundColor: C.bg },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: t.tabs.market,
              tabBarIcon: ({ color, size, focused }) => (
                <Feather name="home" size={size} color={color} style={focused ? styles.iconOn : null} />
              ),
            }}
          />
          <Tabs.Screen
            name="sell"
            options={{
              title: t.tabs.sell,
              tabBarIcon: ({ color, size }) => <Feather name="plus-circle" size={size} color={color} />,
            }}
          />
          <Tabs.Screen
            name="orders"
            options={{
              title: t.tabs.orders,
              tabBarIcon: ({ color, size }) => <Feather name="file-text" size={size} color={color} />,
            }}
          />
          <Tabs.Screen
            name="notifications"
            options={{
              title: t.tabs.notifications,
              tabBarBadge: badgeLabel,
              tabBarBadgeStyle: { backgroundColor: C.danger, color: C.white, fontSize: 11 },
              tabBarIcon: ({ color, size }) => <Feather name="bell" size={size} color={color} />,
            }}
          />
          {/* Account lives in the header profile menu; keep the route out of the tab bar. */}
          <Tabs.Screen name="account" options={{ href: null, title: t.tabs.account }} />
        </Tabs>
      </View>
    </View>
  );
}

function SideNav({
  items,
  unread,
}: {
  items: {
    name: string;
    href: string;
    label: string;
    icon: keyof typeof Feather.glyphMap;
  }[];
  unread: number;
}): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const isActive = (href: string): boolean => {
    if (href === '/(tabs)') {
      return pathname === '/' || pathname === '/(tabs)' || pathname.endsWith('/(tabs)');
    }
    return pathname.includes(href.replace('/(tabs)', '')) || pathname.includes(href);
  };

  return (
    <View style={[styles.sideNav, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.brand}>Agri-Rescue</Text>
      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <Pressable
            key={item.name}
            accessibilityRole="button"
            onPress={() => router.navigate(item.href as never)}
            style={[styles.sideItem, active ? styles.sideItemActive : null]}
          >
            <Feather name={item.icon} size={22} color={active ? C.leaf : C.mute} />
            <Text style={[styles.sideLabel, active ? styles.sideLabelActive : null]}>{item.label}</Text>
            {item.name === 'notifications' && unread > 0 ? (
              <View style={styles.sideBadge}>
                <Text style={styles.sideBadgeText}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  rootWide: { flexDirection: 'row' },
  tabsWrap: { flex: 1, minWidth: 0 },
  sideNav: {
    width: 220,
    backgroundColor: C.surface,
    borderRightWidth: 1,
    borderRightColor: C.line,
    paddingHorizontal: 12,
    gap: 4,
  },
  brand: {
    fontSize: 18,
    fontWeight: '800',
    color: C.leaf,
    marginBottom: 16,
    paddingHorizontal: 8,
    fontFamily: fonts.titleBold,
  },
  sideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  sideItemActive: { backgroundColor: C.leafSoft },
  sideLabel: { fontSize: 15, fontWeight: '600', color: C.mute, fontFamily: fonts.bodySemi, flex: 1 },
  sideLabelActive: { color: C.leaf },
  sideBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  sideBadgeText: { color: C.white, fontSize: 11, fontWeight: '700' },
  iconOn: { fontWeight: '700' },
});
