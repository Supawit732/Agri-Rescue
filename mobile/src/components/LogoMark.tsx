import { Feather } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { C } from '../theme';

export function LogoMark({ size = 36 }: { size?: number }): React.ReactElement {
  return (
    <View style={[styles.logo, { width: size, height: size, borderRadius: size >= 50 ? 18 : 12 }]}>
      <Feather name="feather" size={size >= 50 ? 32 : 20} color={C.white} />
    </View>
  );
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2);
  }
  return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`;
}

const styles = StyleSheet.create({
  logo: {
    backgroundColor: C.leaf,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
