import { Tabs, usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../../src/i18n';
import { C } from '../../src/theme';

const SIDEBAR_BREAKPOINT = 900;

export default function TabsLayout(): React.ReactElement {
  const { width } = useWindowDimensions();
  const isWide = width >= SIDEBAR_BREAKPOINT;
  const { t } = useI18n();

  const tabItems: {
    name: string;
    href: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    iconOutline: keyof typeof Ionicons.glyphMap;
  }[] = [
    { name: 'index', href: '/(tabs)', label: t.tabs.market, icon: 'storefront', iconOutline: 'storefront-outline' },
    { name: 'sell', href: '/(tabs)/sell', label: t.tabs.sell, icon: 'leaf', iconOutline: 'leaf-outline' },
    {
      name: 'orders',
      href: '/(tabs)/orders',
      label: t.tabs.orders,
      icon: 'receipt',
      iconOutline: 'receipt-outline',
    },
    {
      name: 'notifications',
      href: '/(tabs)/notifications',
      label: t.tabs.notifications,
      icon: 'notifications',
      iconOutline: 'notifications-outline',
    },
    {
      name: 'account',
      href: '/(tabs)/account',
      label: t.tabs.account,
      icon: 'person',
      iconOutline: 'person-outline',
    },
  ];

  return (
    <View style={[styles.root, isWide ? styles.rootWide : null]}>
      {isWide ? <SideNav items={tabItems} /> : null}
      <View style={styles.tabsWrap}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: C.leaf,
            tabBarInactiveTintColor: C.mute,
            tabBarStyle: isWide
              ? { display: 'none' }
              : { backgroundColor: C.white, borderTopColor: C.line },
            sceneStyle: { backgroundColor: C.bg },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: t.tabs.market,
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons name={focused ? 'storefront' : 'storefront-outline'} size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="sell"
            options={{
              title: t.tabs.sell,
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons name={focused ? 'leaf' : 'leaf-outline'} size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="orders"
            options={{
              title: t.tabs.orders,
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="notifications"
            options={{
              title: t.tabs.notifications,
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons
                  name={focused ? 'notifications' : 'notifications-outline'}
                  size={size}
                  color={color}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="account"
            options={{
              title: t.tabs.account,
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />
              ),
            }}
          />
        </Tabs>
      </View>
    </View>
  );
}

function SideNav({
  items,
}: {
  items: {
    name: string;
    href: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    iconOutline: keyof typeof Ionicons.glyphMap;
  }[];
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
            <Ionicons
              name={active ? item.icon : item.iconOutline}
              size={22}
              color={active ? C.leaf : C.mute}
            />
            <Text style={[styles.sideLabel, active ? styles.sideLabelActive : null]}>{item.label}</Text>
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
    backgroundColor: C.white,
    borderRightWidth: 1,
    borderRightColor: C.line,
    paddingHorizontal: 12,
    gap: 4,
  },
  brand: { fontSize: 18, fontWeight: '800', color: C.leaf, marginBottom: 16, paddingHorizontal: 8 },
  sideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  sideItemActive: { backgroundColor: C.leafSoft },
  sideLabel: { fontSize: 15, fontWeight: '600', color: C.mute },
  sideLabelActive: { color: C.leaf },
});
