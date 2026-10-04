import { Feather } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatTemplate, useI18n } from '../i18n';
import { C, fonts, radius } from '../theme';
import { LogoMark } from './LogoMark';

/** Market branding (logo + location line); rendered inside ScreenHeader's `left` slot. */
export function MarketBrand({ radiusKm = 15 }: { radiusKm?: number }): React.ReactElement {
  const { t } = useI18n();
  return (
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
  );
}

const styles = StyleSheet.create({
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
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
});

export const brandRadius = radius;
