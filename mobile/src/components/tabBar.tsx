import { Feather } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C, fonts } from '../theme';

type IconName = React.ComponentProps<typeof Feather>['name'];

/** Shared bottom-tab styling: light-green pill behind a green icon + bold green label when active. */
export function tabBarScreenOptions(bottomInset: number) {
  const pad = Math.max(bottomInset, 8);
  return {
    headerShown: false,
    tabBarActiveTintColor: C.leaf,
    tabBarInactiveTintColor: C.mute,
    tabBarStyle: {
      backgroundColor: C.surface,
      borderTopColor: C.line,
      height: 64 + pad,
      paddingTop: 6,
      paddingBottom: pad,
    },
    tabBarItemStyle: { paddingVertical: 0 },
    sceneStyle: { backgroundColor: C.bg },
  } as const;
}

/** Icon + label renderers; `active` comes from the caller (route match or `focused`). */
export function tabItemOptions(label: string, icon: IconName, active: boolean) {
  return {
    title: label,
    tabBarIcon: ({ size }: { size: number }) => (
      <View style={styles.pill}>
        <View style={[styles.pillBg, active ? styles.pillOn : null]} />
        <Feather name={icon} size={size} color={active ? C.leaf : C.mute} />
      </View>
    ),
    tabBarLabel: () => (
      <Text numberOfLines={1} style={[styles.tabLabel, active ? styles.tabLabelOn : null]}>
        {label}
      </Text>
    ),
  };
}

const styles = StyleSheet.create({
  pill: { width: 52, height: 30, alignItems: 'center', justifyContent: 'center' },
  pillBg: { ...StyleSheet.absoluteFill, borderRadius: 15 },
  pillOn: { backgroundColor: C.leafSoft },
  tabLabel: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: C.mute, fontFamily: fonts.body },
  tabLabelOn: { fontWeight: '700', color: C.leaf, fontFamily: fonts.bodySemi },
});
