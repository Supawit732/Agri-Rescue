import { Tabs, useRouter, useSegments } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { useI18n } from '../../src/i18n';
import { C, fonts } from '../../src/theme';
import { initialsOf } from '../../src/components/LogoMark';

/**
 * Admin console shell — light header (not old green bar) + bottom tabs.
 * Tabs: overview · market · inbox (badge) · system
 */
export default function AdminLayout(): React.ReactElement {
  const { t } = useI18n();
  const { user, api, logout } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (user === null) return;
      try {
        const res = await api.getAdminInbox();
        if (alive) setUnread(res.counts.total);
      } catch {
        if (alive) setUnread(0);
      }
    };
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [api, user, segments]);

  const badge = unread > 0 ? (unread > 99 ? '99+' : String(unread)) : undefined;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>AGRI-RESCUE</Text>
          <Text style={styles.title}>{t.admin.title}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.shell.openAccountMenu}
          style={styles.avatar}
          onPress={() => setMenuOpen(true)}
        >
          <Text style={styles.avatarText}>{initialsOf(user?.name ?? 'AD')}</Text>
        </Pressable>
      </View>

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: C.leaf,
          tabBarInactiveTintColor: C.mute,
          tabBarStyle: { backgroundColor: C.surface, borderTopColor: C.line },
          sceneStyle: { backgroundColor: C.bg },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t.admin.tabOverview,
            tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="market"
          options={{
            title: t.admin.tabMarket,
            tabBarIcon: ({ color, size }) => <Feather name="shopping-bag" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="inbox"
          options={{
            title: t.admin.tabInbox,
            tabBarBadge: badge,
            tabBarBadgeStyle: { backgroundColor: C.danger, color: C.white, fontSize: 11 },
            tabBarIcon: ({ color, size }) => <Feather name="inbox" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="system"
          options={{
            title: t.admin.tabSystem,
            tabBarIcon: ({ color, size }) => <Feather name="server" size={size} color={color} />,
          }}
        />
      </Tabs>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)} accessibilityLabel={t.common.close}>
          <View style={{ flex: 1 }} />
        </Pressable>
        <View style={[styles.sheet, { top: 70 }]} pointerEvents="box-none">
          <View style={styles.menu} accessibilityRole="menu">
            <Text style={styles.menuName}>{user?.name ?? 'admin'}</Text>
            <View style={styles.divider} />
            <View style={styles.langRow}>
              <Text style={styles.langLabel}>{t.common.language}</Text>
              <LanguageChips />
            </View>
            <View style={styles.divider} />
            <Pressable
              accessibilityRole="menuitem"
              style={styles.item}
              onPress={() => {
                setMenuOpen(false);
                logout();
                router.replace('/(tabs)');
              }}
            >
              <Feather name="log-out" size={20} color={C.danger} />
              <Text style={[styles.itemText, { color: C.danger }]}>{t.common.logout}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function LanguageChips(): React.ReactElement {
  const { locale, setLocale, t } = useI18n();
  return (
    <View style={styles.langToggle}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setLocale('th')}
        style={[styles.langBtn, locale === 'th' ? styles.langBtnOn : null]}
      >
        <Text style={[styles.langText, locale === 'th' ? styles.langTextOn : null]}>TH</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => setLocale('en')}
        style={[styles.langBtn, locale === 'en' ? styles.langBtnOn : null]}
      >
        <Text style={[styles.langText, locale === 'en' ? styles.langTextOn : null]}>EN</Text>
      </Pressable>
      <Text style={{ display: 'none' }}>{t.common.language}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    backgroundColor: C.bg,
  },
  kicker: { fontSize: 12, color: C.mute, fontWeight: '600', fontFamily: fonts.bodySemi },
  title: { fontFamily: fonts.titleBold, fontSize: 24, fontWeight: '700', color: C.ink },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.leafDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: C.white, fontWeight: '700', fontSize: 15, fontFamily: fonts.titleBold },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.overlay },
  sheet: { position: 'absolute', right: 12, left: 12, alignItems: 'flex-end' },
  menu: {
    width: '100%',
    maxWidth: 300,
    backgroundColor: C.surface,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#141C16',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  menuName: {
    padding: 16,
    fontFamily: fonts.titleBold,
    fontWeight: '700',
    fontSize: 16,
    color: C.ink,
  },
  divider: { height: 1, backgroundColor: C.line },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 16,
  },
  langLabel: { fontSize: 15, color: C.ink, fontFamily: fonts.body },
  langToggle: { flexDirection: 'row', backgroundColor: C.leafSoft, borderRadius: 10, padding: 3 },
  langBtn: {
    height: 32,
    minWidth: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langBtnOn: { backgroundColor: C.white },
  langText: { fontSize: 13, fontWeight: '600', color: C.mute },
  langTextOn: { color: C.leafDeep, fontWeight: '700' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  itemText: { fontSize: 15, fontFamily: fonts.body },
});
