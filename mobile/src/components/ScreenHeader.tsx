import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { mediaUri } from '../lib/media';
import { C, fonts } from '../theme';
import { initialsOf } from './LogoMark';
import { ProfileMenu } from './ProfileMenu';

/** Scroll distance (pt) over which the opt-in collapsing header goes from large to compact. */
const COLLAPSE_DISTANCE = 48;
const TITLE_SIZE_LARGE = 24;
const TITLE_SIZE_COMPACT = 20;
const AVATAR_LARGE = 44;
const AVATAR_COMPACT = 36;

/**
 * Shared top header for every main screen (Market, Sell, Orders, Alerts, admin tabs).
 * Owns the safe-area top inset, so screens below it must use `skipTopSafeArea`.
 * Large title on the left, optional actions, profile avatar at the far right.
 * `accessory` renders between the title and the right-hand side (e.g. a compact segmented control).
 * `collapseOnScroll` + `scrollY` shrink the title, padding and avatar as the screen scrolls;
 * with the OS "Reduce Motion" setting on it snaps between the two states instead.
 */
export function ScreenHeader({
  title,
  left,
  badge,
  actions,
  onProfilePress,
  showProfile,
  accessory,
  collapseOnScroll,
  scrollY,
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
  /** Rendered between the title and the right-hand actions/avatar. */
  accessory?: React.ReactNode;
  /** Opt in to the large-to-compact collapse. Requires `scrollY`. */
  collapseOnScroll?: boolean;
  /** Vertical scroll offset of the screen content, in points. */
  scrollY?: SharedValue<number>;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const profile = showProfile ?? user !== null;
  const avatarUri = user !== null ? mediaUri(user.avatar) : null;
  const reduceMotion = useReducedMotion();
  const collapsible = collapseOnScroll === true && scrollY !== undefined;

  // 0 = large, 1 = compact. Reduced motion: hard switch halfway instead of a continuous tween.
  const progress = (): number => {
    'worklet';
    const y = scrollY !== undefined ? scrollY.value : 0;
    if (reduceMotion) {
      return y > COLLAPSE_DISTANCE / 2 ? 1 : 0;
    }
    return interpolate(y, [0, COLLAPSE_DISTANCE], [0, 1], Extrapolation.CLAMP);
  };
  const headerAnim = useAnimatedStyle(() => {
    if (!collapsible) {
      return {};
    }
    const p = progress();
    return {
      paddingTop: insets.top + interpolate(p, [0, 1], [12, 4]),
      paddingBottom: interpolate(p, [0, 1], [8, 4]),
    };
  });
  const titleAnim = useAnimatedStyle(() => {
    if (!collapsible) {
      return {};
    }
    return { fontSize: interpolate(progress(), [0, 1], [TITLE_SIZE_LARGE, TITLE_SIZE_COMPACT]) };
  });
  const avatarAnim = useAnimatedStyle(() => {
    if (!collapsible) {
      return {};
    }
    const size = interpolate(progress(), [0, 1], [AVATAR_LARGE, AVATAR_COMPACT]);
    return { width: size, height: size, borderRadius: size / 2 };
  });
  const rightAnim = useAnimatedStyle(() => {
    if (!collapsible) {
      return {};
    }
    return { minHeight: interpolate(progress(), [0, 1], [AVATAR_LARGE, AVATAR_COMPACT]) };
  });

  return (
    <Animated.View style={[styles.header, { paddingTop: insets.top + 12 }, headerAnim]}>
      {onProfilePress === undefined ? (
        <ProfileMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />
      ) : null}
      <View style={[styles.headerLeft, accessory !== undefined ? styles.headerLeftFixed : null]}>
        {left ?? (
          <Animated.Text accessibilityRole="header" style={[styles.h1, titleAnim]} numberOfLines={1}>
            {title}
          </Animated.Text>
        )}
        {badge !== undefined && badge > 0 ? (
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      {accessory !== undefined ? <View style={styles.accessory}>{accessory}</View> : null}
      <Animated.View style={[styles.headerRight, rightAnim]}>
        {actions}
        {profile ? (
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={t.shell.openAccountMenu}
            onPress={onProfilePress ?? (() => setMenuOpen(true))}
            hitSlop={collapsible ? 4 : undefined}
            style={[styles.avatarMini, avatarAnim]}
          >
            {user === null ? (
              <Feather name="user" size={16} color={C.leafDeep} />
            ) : avatarUri !== null ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>{initialsOf(user.name)}</Text>
            )}
          </AnimatedPressable>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
  headerLeftFixed: { flexShrink: 0 },
  accessory: { flex: 1, minWidth: 0, alignItems: 'center', marginHorizontal: 8 },
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
