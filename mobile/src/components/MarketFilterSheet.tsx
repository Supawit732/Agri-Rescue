import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatTemplate, useI18n } from '../i18n';
import { C, fonts, radius } from '../theme';
import type { CropCategory } from '../api/types';

export type SortKey = 'near' | 'urgent' | 'cheap';

export interface MarketFilters {
  categoryId: number | null;
  radiusKm: number;
  priceMin: string;
  priceMax: string;
  maxHours: number | null;
  sort: SortKey;
}

export const defaultMarketFilters: MarketFilters = {
  categoryId: null,
  radiusKm: 15,
  priceMin: '',
  priceMax: '',
  maxHours: null,
  sort: 'urgent',
};

export function countActiveFilters(f: MarketFilters, selectedCropId: number | null = null): number {
  let n = 0;
  if (f.categoryId !== null) n += 1;
  if (selectedCropId !== null) n += 1;
  if (f.priceMin !== '' || f.priceMax !== '') n += 1;
  if (f.maxHours !== null) n += 1;
  // Default radius is not an active filter; changing it away from default counts.
  if (f.radiusKm !== defaultMarketFilters.radiusKm) n += 1;
  // Sort is never counted on the badge.
  return n;
}

const RADIUS_OPTIONS = [5, 10, 15, 25] as const;
const HOUR_OPTIONS: Array<{ key: number | null; labelKey: 'under24' | 'under48' | 'all' }> = [
  { key: 24, labelKey: 'under24' },
  { key: 48, labelKey: 'under48' },
  { key: null, labelKey: 'all' },
];

export function MarketFilterSheet({
  visible,
  filters,
  categories,
  resultCount,
  onChange,
  onApply,
  onReset,
  onClose,
}: {
  visible: boolean;
  filters: MarketFilters;
  categories: CropCategory[];
  resultCount: number | null;
  onChange: (next: MarketFilters) => void;
  onApply: () => void;
  onReset: () => void;
  onClose: () => void;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { t, cropName } = useI18n();
  const priceMinNum = filters.priceMin === '' ? null : Number(filters.priceMin);
  const priceMaxNum = filters.priceMax === '' ? null : Number(filters.priceMax);
  const priceInvalid =
    priceMinNum !== null &&
    priceMaxNum !== null &&
    !Number.isNaN(priceMinNum) &&
    !Number.isNaN(priceMaxNum) &&
    priceMinNum > priceMaxNum;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t.common.close}>
        <View style={{ flex: 1 }} />
      </Pressable>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.handle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{t.market.filterTitle}</Text>
          <Pressable accessibilityRole="button" onPress={onReset} hitSlop={8}>
            <Text style={styles.reset}>{t.market.filterReset}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.sectionLabel}>{t.market.filterCategory}</Text>
          <View style={styles.chipWrap}>
            <Pressable
              accessibilityRole="button"
              onPress={() => onChange({ ...filters, categoryId: null })}
              style={[styles.chip, filters.categoryId === null ? styles.chipActive : null]}
            >
              <Text style={[styles.chipText, filters.categoryId === null ? styles.chipTextActive : null]}>
                {t.market.allCrops}
              </Text>
            </Pressable>
            {categories.map((cat) => {
              const selected = filters.categoryId === cat.id;
              return (
                <Pressable
                  key={cat.id}
                  accessibilityRole="button"
                  onPress={() => onChange({ ...filters, categoryId: selected ? null : cat.id })}
                  style={[styles.chip, selected ? styles.chipActive : null]}
                >
                  <Text style={[styles.chipText, selected ? styles.chipTextActive : null]}>
                    {cropName(cat)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>{t.market.filterDistance}</Text>
          <View style={styles.segment}>
            {RADIUS_OPTIONS.map((km) => {
              const selected = filters.radiusKm === km;
              return (
                <Pressable
                  key={km}
                  accessibilityRole="button"
                  onPress={() => onChange({ ...filters, radiusKm: km })}
                  style={[styles.segmentItem, selected ? styles.segmentItemActive : null]}
                >
                  <Text style={[styles.segmentText, selected ? styles.segmentTextActive : null]}>
                    {formatTemplate(t.market.radiusKm, { value: km })}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>{t.market.filterPrice}</Text>
          <View style={styles.priceRow}>
            <View style={styles.priceField}>
              <Text style={styles.priceLabel}>{t.market.priceMin}</Text>
              <TextInput
                keyboardType="numeric"
                value={filters.priceMin}
                onChangeText={(text) => onChange({ ...filters, priceMin: text.replace(/[^\d.]/g, '') })}
                style={[styles.input, priceInvalid ? styles.inputError : null]}
                placeholder="0"
                placeholderTextColor={C.mute}
              />
            </View>
            <Text style={styles.dash}>–</Text>
            <View style={styles.priceField}>
              <Text style={styles.priceLabel}>{t.market.priceMax}</Text>
              <TextInput
                keyboardType="numeric"
                value={filters.priceMax}
                onChangeText={(text) => onChange({ ...filters, priceMax: text.replace(/[^\d.]/g, '') })}
                style={[styles.input, priceInvalid ? styles.inputError : null]}
                placeholder="30"
                placeholderTextColor={C.mute}
              />
            </View>
          </View>
          {priceInvalid ? <Text style={styles.priceError}>{t.market.priceInvalid}</Text> : null}

          <Text style={styles.sectionLabel}>{t.market.filterTimeLeft}</Text>
          <View style={styles.chipWrap}>
            {HOUR_OPTIONS.map((opt) => {
              const selected = filters.maxHours === opt.key;
              const label =
                opt.labelKey === 'under24'
                  ? t.market.hoursUnder24
                  : opt.labelKey === 'under48'
                    ? t.market.hoursUnder48
                    : t.market.allHours;
              return (
                <Pressable
                  key={opt.labelKey}
                  accessibilityRole="button"
                  onPress={() => onChange({ ...filters, maxHours: opt.key })}
                  style={[styles.chip, selected ? styles.chipActive : null]}
                >
                  <Text style={[styles.chipText, selected ? styles.chipTextActive : null]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>{t.market.filterSort}</Text>
          {(
            [
              { key: 'urgent' as const, label: t.market.sortUrgentFull },
              { key: 'near' as const, label: t.market.sortNear },
              { key: 'cheap' as const, label: t.market.sortCheap },
            ] as const
          ).map((opt) => {
            const selected = filters.sort === opt.key;
            return (
              <Pressable
                key={opt.key}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => onChange({ ...filters, sort: opt.key })}
                style={styles.radioRow}
              >
                <View style={[styles.radio, selected ? styles.radioOn : null]}>
                  {selected ? <View style={styles.radioDot} /> : null}
                </View>
                <Text style={styles.radioLabel}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (priceInvalid) {
                return;
              }
              onApply();
            }}
            disabled={priceInvalid}
            style={[styles.applyBtn, priceInvalid ? { opacity: 0.5 } : null]}
          >
            <Text style={styles.applyText}>
              {resultCount === null
                ? t.market.filterApply
                : formatTemplate(t.market.filterShowCount, { count: String(resultCount) })}
            </Text>
          </Pressable>
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
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '86%',
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.line,
    marginTop: 10,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  sheetTitle: {
    fontFamily: fonts.titleBold,
    fontSize: 20,
    fontWeight: '700',
    color: C.ink,
  },
  reset: {
    color: C.leaf,
    fontWeight: '600',
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    minHeight: 44,
    textAlignVertical: 'center',
  },
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8, gap: 10 },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: C.ink,
    fontFamily: fonts.bodySemi,
    marginTop: 10,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: C.leaf,
    borderWidth: 1.5,
    backgroundColor: C.leafSoft,
  },
  chipText: { fontSize: 14, color: C.ink, fontFamily: fonts.body },
  chipTextActive: { color: C.leafDeep, fontWeight: '600', fontFamily: fonts.bodySemi },
  segment: {
    flexDirection: 'row',
    backgroundColor: C.bg,
    borderRadius: radius.control,
    padding: 4,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    height: 40,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentItemActive: {
    backgroundColor: C.surface,
    shadowColor: '#141C16',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  segmentText: { fontSize: 14, color: C.mute, fontFamily: fonts.body },
  segmentTextActive: { color: C.leafDeep, fontWeight: '700', fontFamily: fonts.bodySemi },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  priceField: { flex: 1, gap: 4 },
  priceLabel: { fontSize: 12, color: C.mute, fontFamily: fonts.body },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    fontSize: 15,
    color: C.ink,
    backgroundColor: C.surface,
    fontFamily: fonts.body,
  },
  inputError: { borderColor: C.chili, borderWidth: 1.5 },
  priceError: { color: C.chili, fontSize: 12, fontFamily: fonts.body, marginTop: 4 },
  dash: { color: C.mute, marginBottom: 12 },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 40,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: C.leaf,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: C.leaf },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.leaf,
  },
  radioLabel: { fontSize: 15, color: C.ink, fontFamily: fonts.body },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  applyBtn: {
    height: 52,
    borderRadius: radius.button,
    backgroundColor: C.leaf,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyText: {
    color: C.white,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },
});
