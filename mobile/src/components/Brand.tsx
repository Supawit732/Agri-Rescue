import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { formatTemplate, useI18n } from '../i18n';
import { mediaUri } from '../lib/media';
import { C, fonts, radius } from '../theme';
import { LogoMark, initialsOf } from './LogoMark';
import { ProfileMenu } from './ProfileMenu';

export function AppHeader({ radiusKm = 15 }: { radiusKm?: number }): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
      <View style={styles.brandRow}>
        <LogoMark />
        <View style={styles.brandText}>
          <Text style={styles.brandTitle}>Agri-Rescue</Text>
          <View style={styles.locRow}>
            <Feather name="map-pin" size={12} color={C.mute} />
            <Text style={styles.brandSub}>
              {formatTemplate(t.shell.nearMeRadius, { radius: radiusKm })}
            </Text>
          </View>
        </View>
      </View>
      {user !== null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.shell.openAccountMenu}
          onPress={() => setMenuOpen(true)}
          style={styles.avatar}
        >
          {mediaUri(user.avatar) !== null ? (
            <Image source={{ uri: mediaUri(user.avatar)! }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarText}>{initialsOf(user.name)}</Text>
          )}
        </Pressable>
      ) : (
        <View style={styles.avatarSpacer} accessibilityElementsHidden />
      )}
      <ProfileMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: C.bg,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  logo: {
    backgroundColor: C.leaf,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: { gap: 2, minWidth: 0 },
  brandTitle: {
    fontFamily: fonts.titleBold,
    fontSize: 19,
    fontWeight: '700',
    color: C.ink,
    lineHeight: 22,
  },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  brandSub: { fontSize: 12, color: C.mute },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.leafSoft,
    borderWidth: 2,
    borderColor: C.white,
    // outer ring
    shadowColor: C.lineStrong,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarSpacer: { width: 44, height: 44 },
  avatarText: {
    fontFamily: fonts.titleBold,
    fontWeight: '700',
    fontSize: 15,
    color: C.leafDeep,
  },
});

export const brandRadius = radius;
