import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, fonts } from '../theme';

/** Top header for main tab screens (matches AppHeader / admin header look). */
export function TabHeader({ title }: { title: string }): React.ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: C.bg,
    minHeight: 44,
    justifyContent: 'center',
  },
  title: { fontFamily: fonts.titleBold, fontSize: 24, fontWeight: '700', color: C.ink },
});
