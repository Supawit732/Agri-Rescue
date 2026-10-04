import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { mediaUri } from '../lib/media';
import { C, fonts } from '../theme';
import { initialsOf } from './LogoMark';
import { ProfileMenu } from './ProfileMenu';

/**
 * Shared top header for every main screen (Market, Sell, Orders, Alerts, admin tabs).
 * Owns the safe-area top inset, so screens below it must use `skipTopSafeArea`.
 * Large title on the left, optional actions, profile avatar at the far right.
 */
export function ScreenHeader({
  title,
  left,
  badge,
  actions,
  onProfilePress,
  showProfile,
}: {
  title?: string;
  /** Replaces the title (e.g. Market branding). */
  left?: React.ReactNode;
  /** Unread count shown next to the title. */
  badge?: number;
  actions?: React.ReactNode;
  /** Defaults to opening the shared ProfileMenu. */
  onProfilePress?: () => void;
  /** Defaults to true when signed in. */
  showProfile?: boolean;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const profile = showProfile ?? user !== null;
  const avatarUri = user !== null ? mediaUri(user.avatar) : null;

  return (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      {onProfilePress === undefined ? (
        <ProfileMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />
      ) : null}
      <View style={styles.headerLeft}>
        {left ?? (
          <Text accessibilityRole="header" style={styles.h1} numberOfLines={1}>
            {title}
          </Text>
        )}
        {badge !== undefined && badge > 0 ? (
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.headerRight}>
        {actions}
        {profile ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.shell.openAccountMenu}
            onPress={onProfilePress ?? (() => setMenuOpen(true))}
            style={styles.avatarMini}
          >
            {user === null ? (
              <Feather name="user" size={16} color={C.leafDeep} />
            ) : avatarUri !== null ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>{initialsOf(user.name)}</Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Text action for the header's right side (e.g. "Mark all read"). */
export function HeaderAction({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}): React.ReactElement {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={styles.actionHit}>
      <Text style={styles.action}>{label}</Text>
    </Pressable>
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
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  // minHeight keeps the row 44px tall for guests (no avatar) so the title never shifts.
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  h1: { fontFamily: fonts.titleBold, fontSize: 24, fontWeight: '700', color: C.ink },
  headerBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  headerBadgeText: { color: C.white, fontSize: 11, fontWeight: '700' },
  actionHit: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  action: { color: C.leaf, fontWeight: '600', fontSize: 14, fontFamily: fonts.bodySemi },
  avatarMini: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.leafSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { fontFamily: fonts.titleBold, fontWeight: '700', fontSize: 15, color: C.leafDeep },
});
