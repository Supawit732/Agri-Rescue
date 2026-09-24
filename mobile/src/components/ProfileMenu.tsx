import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { donorStatusLabel } from '../donorLabels';
import { useI18n } from '../i18n';
import { C, fonts, radius } from '../theme';
import { LogoMark, initialsOf } from './LogoMark';

type MenuAction = {
  key: string;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  badge?: string;
  onPress: () => void;
};

export function ProfileMenu({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { t, locale, setLocale } = useI18n();

  const go = (path: string) => {
    onClose();
    router.push(path as never);
  };

  const items: MenuAction[] = [];
  if (user !== null) {
    items.push(
      {
        key: 'shop',
        icon: 'shopping-bag',
        label: t.shell.myShop,
        onPress: () => go(`/shops/${String(user.id)}`),
      },
    );
    if (user.can_sell || user.is_admin) {
      items.push({
        key: 'dashboard',
        icon: 'bar-chart-2',
        label: t.shell.dashboard,
        onPress: () => go('/dashboard'),
      });
    }
    items.push(
      {
        key: 'followed',
        icon: 'users',
        label: t.shell.followedShops,
        onPress: () => go('/followed-shops'),
      },
      {
        key: 'contact',
        icon: 'message-circle',
        label: t.shell.contactUs,
        onPress: () => go('/contact-us'),
      },
    );
    items.push({
      key: 'donor',
      icon: 'gift',
      label: t.shell.donate,
      badge: donorStatusLabel(user, t),
      onPress: () => go('/donor-apply'),
    });
    items.push({
      key: 'impact',
      icon: 'trending-up',
      label: t.shell.impact,
      onPress: () => go('/impact'),
    });
    items.push({
      key: 'terms',
      icon: 'file-text',
      label: t.shell.terms,
      onPress: () => go('/terms/donor'),
    });
    if (user.is_admin) {
      items.push({
        key: 'admin',
        icon: 'shield',
        label: t.shell.admin,
        onPress: () => go('/admin'),
      });
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t.common.close}>
        <View style={{ flex: 1 }} />
      </Pressable>
      <View style={[styles.sheetWrap, { top: insets.top + 64 }]} pointerEvents="box-none">
        <View style={styles.menu} accessibilityRole="menu">
          {user !== null ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => go('/profile')}
              style={styles.headerRow}
            >
              <View style={styles.avatarLg}>
                <Text style={styles.avatarLgText}>{initialsOf(user.name)}</Text>
              </View>
              <View style={styles.headerText}>
                <Text style={styles.name} numberOfLines={1}>
                  {user.name}
                </Text>
                <View style={styles.badgeRow}>
                  {user.can_sell ? (
                    <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>{t.shell.seller}</Text>
                    </View>
                  ) : null}
                  {user.can_buy ? (
                    <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>{t.shell.buyer}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.editLink}>{t.shell.viewEditProfile}</Text>
              </View>
            </Pressable>
          ) : (
            <View style={styles.headerRow}>
              <LogoMark size={52} />
              <View style={styles.headerText}>
                <Text style={styles.name}>Agri-Rescue</Text>
                <Text style={styles.editLink}>{t.market.guestBanner}</Text>
              </View>
            </View>
          )}

          <View style={styles.divider} />

          <View style={styles.itemList}>
            {items.map((item) => (
              <Pressable key={item.key} accessibilityRole="menuitem" onPress={item.onPress} style={styles.item}>
                <Feather name={item.icon} size={20} color={C.leaf} />
                <Text style={styles.itemLabel}>{item.label}</Text>
                {item.badge !== undefined && item.badge !== '' ? (
                  <View style={styles.itemBadge}>
                    <Text style={styles.itemBadgeText}>{item.badge}</Text>
                  </View>
                ) : null}
                <Feather name="chevron-right" size={16} color={C.mute} />
              </Pressable>
            ))}
          </View>

          <View style={styles.divider} />

          <View style={styles.langRow}>
            <Feather name="globe" size={20} color={C.leaf} />
            <Text style={styles.itemLabel}>{t.common.language}</Text>
            <View style={styles.langToggle}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: locale === 'th' }}
                onPress={() => setLocale('th')}
                style={[styles.langBtn, locale === 'th' ? styles.langBtnActive : null]}
              >
                <Text style={[styles.langBtnText, locale === 'th' ? styles.langBtnTextActive : null]}>TH</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: locale === 'en' }}
                onPress={() => setLocale('en')}
                style={[styles.langBtn, locale === 'en' ? styles.langBtnActive : null]}
              >
                <Text style={[styles.langBtnText, locale === 'en' ? styles.langBtnTextActive : null]}>EN</Text>
              </Pressable>
            </View>
          </View>

          {user !== null ? (
            <>
              <View style={styles.divider} />
              <Pressable
                accessibilityRole="menuitem"
                onPress={() => {
                  onClose();
                  logout();
                  router.replace('/(tabs)');
                }}
                style={[styles.item, styles.logout]}
              >
                <Feather name="log-out" size={20} color={C.danger} />
                <Text style={[styles.itemLabel, styles.logoutText]}>{t.common.logout}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.divider} />
              <Pressable
                accessibilityRole="menuitem"
                onPress={() => go('/login')}
                style={styles.item}
              >
                <Feather name="log-in" size={20} color={C.leaf} />
                <Text style={styles.itemLabel}>{t.common.login}</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.overlay,
  },
  sheetWrap: {
    position: 'absolute',
    right: 12,
    left: 12,
    alignItems: 'flex-end',
  },
  menu: {
    width: '100%',
    maxWidth: 316,
    backgroundColor: C.surface,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#141C16',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  avatarLg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.leafSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLgText: {
    fontFamily: fonts.titleBold,
    fontWeight: '700',
    fontSize: 18,
    color: C.leafDeep,
  },
  headerText: { flex: 1, gap: 4, minWidth: 0 },
  name: {
    fontFamily: fonts.titleBold,
    fontSize: 17,
    fontWeight: '700',
    color: C.ink,
  },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  roleBadge: {
    backgroundColor: C.leafSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.leafDeep,
    fontFamily: fonts.bodySemi,
  },
  editLink: {
    fontSize: 12,
    color: C.leaf,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },
  divider: { height: 1, backgroundColor: C.line },
  itemList: { paddingVertical: 6 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  itemLabel: {
    flex: 1,
    fontSize: 15,
    color: C.ink,
    fontFamily: fonts.body,
  },
  itemBadge: {
    backgroundColor: C.soonBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  itemBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.soonFg,
    fontFamily: fonts.bodySemi,
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
  },
  langToggle: {
    flexDirection: 'row',
    backgroundColor: C.leafSoft,
    borderRadius: 10,
    padding: 3,
  },
  langBtn: {
    height: 32,
    minWidth: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langBtnActive: { backgroundColor: C.white },
  langBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.mute,
    fontFamily: fonts.bodySemi,
  },
  langBtnTextActive: { color: C.leafDeep, fontWeight: '700' },
  logout: { minHeight: 52 },
  logoutText: { color: C.danger, fontWeight: '600' },
});

export const profileMenuRadius = radius;
