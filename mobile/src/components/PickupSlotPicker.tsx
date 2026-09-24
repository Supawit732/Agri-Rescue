import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PickupSlotOption } from '../api/types';
import { useI18n } from '../i18n';
import { C, fonts, radius } from '../theme';

function formatSlotRange(
  slot: Pick<PickupSlotOption, 'start_at' | 'end_at'>,
  dayLabel: string,
): string {
  const start = new Date(slot.start_at);
  const end = new Date(slot.end_at);
  const fmt = (d: Date): string =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${dayLabel} ${fmt(start)}–${fmt(end)}`;
}

export function reasonForUnavailable(
  slot: PickupSlotOption,
  labels: { started: string; past: string; expiry: string },
): string {
  if (slot.reason_code === 'too_close_to_expiry') {
    return labels.expiry;
  }
  if (slot.reason_code === 'started') {
    return labels.started;
  }
  return labels.past;
}

export function formatPickupSlotLabel(
  slot: Pick<PickupSlotOption, 'start_at' | 'end_at' | 'day'>,
  labels: { today: string; tomorrow: string },
): string {
  return formatSlotRange(slot, slot.day === 'today' ? labels.today : labels.tomorrow);
}

export function formatIsoSlotShort(
  startIso: string,
  endIso: string,
  labels: { today: string; tomorrow: string },
): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startDay = start.toDateString();
  const endDay = end.toDateString();
  const nowDay = new Date().toDateString();
  const tomorrow = new Date(Date.now() + 86_400_000).toDateString();
  let dayLabel = '';
  if (startDay === nowDay) {
    dayLabel = labels.today;
  } else if (startDay === tomorrow) {
    dayLabel = labels.tomorrow;
  } else {
    dayLabel = `${String(start.getDate()).padStart(2, '0')}/${String(start.getMonth() + 1).padStart(2, '0')}`;
  }
  const fmt = (d: Date): string =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${dayLabel} ${fmt(start)}–${fmt(end)}`;
}

export function PickupSlotPicker({
  slots,
  selectedKey,
  onSelect,
}: {
  slots: PickupSlotOption[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}): React.ReactElement {
  const { t } = useI18n();
  const dayLabels = { today: t.confirmBooking.today, tomorrow: t.confirmBooking.tomorrow };
  const reasons = {
    started: t.confirmBooking.reasonStarted,
    past: t.confirmBooking.reasonPast,
    expiry: t.confirmBooking.reasonExpiry,
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t.confirmBooking.pickupTitle}</Text>
      <Text style={styles.hint}>{t.confirmBooking.pickupHint}</Text>
      {slots.map((slot) => {
        const selected = selectedKey === slot.key;
        const label = formatPickupSlotLabel(slot, dayLabels);
        return (
          <Pressable
            key={slot.key}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: !slot.available }}
            disabled={!slot.available}
            onPress={() => onSelect(slot.key)}
            style={[
              styles.row,
              selected ? styles.rowOn : null,
              !slot.available ? styles.rowOff : null,
            ]}
          >
            <View style={[styles.radio, selected ? styles.radioOn : null, !slot.available ? styles.radioOff : null]}>
              {selected ? <View style={styles.radioDot} /> : null}
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, !slot.available ? styles.rowLabelOff : null]}>{label}</Text>
              {!slot.available ? (
                <Text style={styles.reason}>
                  {t.confirmBooking.slotUnavailable} · {reasonForUnavailable(slot, reasons)}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginBottom: 12 },
  title: {
    fontFamily: fonts.title,
    fontSize: 16,
    fontWeight: '700',
    color: C.ink,
  },
  hint: { fontSize: 13, color: C.mute, fontFamily: fonts.body },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: radius.control,
    backgroundColor: C.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  rowOn: { borderColor: C.leaf, backgroundColor: C.leafSoft },
  rowOff: { opacity: 0.55, backgroundColor: C.bg },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: C.leaf,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioOff: { borderColor: C.mute },
  radioOn: { borderColor: C.leaf },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.leaf },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 15, color: C.ink, fontFamily: fonts.bodySemi, fontWeight: '600' },
  rowLabelOff: { color: C.mute },
  reason: { fontSize: 12, color: C.soonFg, fontFamily: fonts.body },
});
