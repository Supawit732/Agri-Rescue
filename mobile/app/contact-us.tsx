import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { SupportReplyVia, SupportTopic } from '../src/api/types';
import { FormField, useFieldErrors, useFieldScroll } from '../src/components/form';
import { PrimaryButton, Screen, SecondaryButton, StackHeader } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { useApiData } from '../src/hooks/useApiData';
import { formatTemplate, useI18n } from '../src/i18n';
import { resizeToBase64 } from '../src/lib/media';
import { C, fonts, radius } from '../src/theme';

type PendingPhoto = { id: string; name: string; base64: string; mime: string };

const TOPICS: Array<{ key: SupportTopic; labelKey: keyof ReturnType<typeof useI18n>['t']['support'] }> = [
  { key: 'order_pickup', labelKey: 'topicOrderPickup' },
  { key: 'item_mismatch', labelKey: 'topicItemMismatch' },
  { key: 'account_login', labelKey: 'topicAccount' },
  { key: 'donation', labelKey: 'topicDonation' },
  { key: 'other', labelKey: 'topicOther' },
];

function statusLabelKey(status: string): 'statusOpen' | 'statusInProgress' | 'statusClosed' {
  if (status === 'in_progress') return 'statusInProgress';
  if (status === 'closed') return 'statusClosed';
  return 'statusOpen';
}

export default function ContactUsScreen(): React.ReactElement {
  const { user, api } = useAuth();
  const { t, formatDateTime, formatNumber } = useI18n();
  const router = useRouter();
  const [topic, setTopic] = useState<SupportTopic>('order_pickup');
  const [details, setDetails] = useState('');
  const [replyVia, setReplyVia] = useState<SupportReplyVia>('app');
  const [orderId, setOrderId] = useState<number | null>(null);
  const [orderPickerOpen, setOrderPickerOpen] = useState(false);
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { errors, setErrors, setFieldError } = useFieldErrors();
  const { scrollRef, registerY, scrollToField } = useFieldScroll();

  const fetchTickets = useCallback(
    () => api.listSupportTickets({ mine: true }),
    [api],
  );
  const tickets = useApiData(fetchTickets, [user?.id ?? null]);
  const orders = useApiData(() => api.getMyOrders(), [user?.id ?? null]);

  const validate = (): Record<string, string> => {
    const next: Record<string, string> = {};
    if (details.trim().length === 0) {
      next.details = t.support.needDetails;
    } else if (details.trim().length > 1000) {
      next.details = t.support.detailsCount.replace('{count}', String(details.trim().length));
    }
    return next;
  };

  const addPhoto = (): void => {
    Alert.alert(t.support.attachPhoto, undefined, [
      {
        text: t.sell.takePhoto,
        onPress: () => {
          void pickImage(ImagePicker.launchCameraAsync);
        },
      },
      {
        text: t.sell.photoLibrary,
        onPress: () => {
          void pickImage(ImagePicker.launchImageLibraryAsync);
        },
      },
      { text: t.common.cancel, style: 'cancel' },
    ]);
  };

  const pickImage = async (launcher: typeof ImagePicker.launchCameraAsync): Promise<void> => {
    if (photos.length >= 3) {
      setFormError(t.support.maxPhotos);
      return;
    }
    try {
      const permission =
        launcher === ImagePicker.launchCameraAsync
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setFormError(t.profile.photoDenied);
        return;
      }
      const picked = await launcher({ mediaTypes: ['images'], quality: 0.85 });
      if (picked.canceled || picked.assets[0] === undefined) {
        return;
      }
      const asset = picked.assets[0];
      const prepared = await resizeToBase64(asset.uri, asset.width, asset.height, 1024);
      setPhotos((prev) =>
        prev.length >= 3
          ? prev
          : [
              ...prev,
              {
                id: `${Date.now()}-${String(prev.length)}`,
                name: asset.fileName ?? `photo-${String(prev.length + 1)}.jpg`,
                base64: prepared.base64,
                mime: prepared.mime,
              },
            ],
      );
      setFormError(null);
    } catch {
      setFormError(t.support.photoTooLarge);
    }
  };

  const submit = async (): Promise<void> => {
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) {
      setFieldError('details', next.details ?? null);
      scrollToField('details');
      return;
    }
    setFormError(null);
    setBusy(true);
    try {
      const { ticket } = await api.createSupportTicket({
        topic,
        details: details.trim(),
        order_id: orderId,
        reply_via: replyVia,
        attachments: photos.map((p) => ({
          filename: p.name,
          mime: p.mime,
          base64: p.base64,
          original_name: p.name,
        })),
      });
      setDetails('');
      setOrderId(null);
      setTopic('order_pickup');
      setPhotos([]);
      tickets.reload();
      router.push({ pathname: '/support/[id]', params: { id: String(ticket.id) } });
    } catch {
      setFormError(t.support.failed);
    } finally {
      setBusy(false);
    }
  };

  if (user === null) {
    return (
      <Screen>
        <StackHeader title={t.support.title} onBack={() => router.replace('/(tabs)')} />
        <View style={styles.pad}>
          <Text style={styles.muted}>{t.support.loginRequired}</Text>
          <PrimaryButton
            label={t.common.login}
            onPress={() =>
              router.push({ pathname: '/login', params: { returnTo: '/contact-us' } })
            }
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <StackHeader title={t.support.title} onBack={() => router.replace('/(tabs)')} />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{t.support.myTickets}</Text>
            <Text style={styles.muted}>
              {formatTemplate(t.support.ticketCount, {
                count: tickets.data?.tickets.length ?? 0,
              })}
            </Text>
          </View>
          {tickets.data?.tickets.map((ticket) => (
            <Pressable
              key={ticket.id}
              style={styles.ticketRow}
              onPress={() =>
                router.push({ pathname: '/support/[id]', params: { id: String(ticket.id) } })
              }
            >
              <View style={styles.ticketText}>
                <Text style={styles.ticketTitle} numberOfLines={1}>
                  {ticket.topic_label} {ticket.order_id != null ? `· #${ticket.order_id}` : ''}
                </Text>
                <Text style={styles.muted}>
                  {t.support[statusLabelKey(ticket.status)]} · {formatDateTime(ticket.updated_at)}
                </Text>
              </View>
              {ticket.has_new_reply ? (
                <View style={styles.badgeNew}>
                  <Text style={styles.badgeNewText}>{t.support.newReply}</Text>
                </View>
              ) : null}
            </Pressable>
          ))}
            {tickets.data?.tickets.length === 0 ? (
              <Text style={styles.muted}>{t.support.empty}</Text>
            ) : null}
          {tickets.loading && tickets.data === null ? (
            <Text style={styles.muted}>{t.common.loading}</Text>
          ) : null}
          {tickets.error !== null && tickets.data === null ? (
            <Text style={styles.error}>{tickets.error}</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>{t.support.newTicket}</Text>
          <Text style={styles.muted}>{t.support.replyWithin}</Text>

          <Text style={styles.label}>{t.support.topicLabel}</Text>
          <View style={styles.chipWrap}>
            {TOPICS.map((item) => {
              const selected = topic === item.key;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setTopic(item.key)}
                  style={[styles.chip, selected ? styles.chipOn : null]}
                >
                  <Text style={[styles.chipText, selected ? styles.chipTextOn : null]}>
                    {t.support[item.labelKey as keyof typeof t.support] as string}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>{t.support.relatedOrder}</Text>
          <Pressable
            accessibilityRole="button"
            style={styles.select}
            onPress={() => setOrderPickerOpen(true)}
          >
            <Text style={styles.selectText}>
              {orderId === null
                ? t.support.noOrder
                : (() => {
                    const order = orders.data?.find((o) => o.id === orderId);
                    if (order === undefined) return `#${orderId}`;
                    const kg = order.quantity_kg ?? 0;
                    return `#${orderId} · ${formatNumber(kg)} ${t.dashboard.unitKg}`;
                  })()}
            </Text>
            <Feather name="chevron-down" size={18} color={C.mute} />
          </Pressable>

          <Modal
            visible={orderPickerOpen}
            transparent
            animationType="slide"
            onRequestClose={() => setOrderPickerOpen(false)}
          >
            <Pressable
              style={styles.sheetBackdrop}
              onPress={() => setOrderPickerOpen(false)}
              accessibilityLabel={t.common.close}
            >
              <View style={{ flex: 1 }} />
            </Pressable>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>{t.support.relatedOrder}</Text>
              <ScrollView contentContainerStyle={styles.sheetList}>
                <Pressable
                  accessibilityRole="button"
                  style={styles.sheetRow}
                  onPress={() => {
                    setOrderId(null);
                    setOrderPickerOpen(false);
                  }}
                >
                  <Text style={styles.sheetRowText}>{t.support.noOrder}</Text>
                </Pressable>
                {(orders.data ?? []).map((order) => {
                  const kg = order.quantity_kg ?? 0;
                  const label = `#${order.id} · ${formatNumber(kg)} ${t.dashboard.unitKg}`;
                  return (
                    <Pressable
                      key={order.id}
                      accessibilityRole="button"
                      style={styles.sheetRow}
                      onPress={() => {
                        setOrderId(order.id);
                        setOrderPickerOpen(false);
                      }}
                    >
                      <Text style={styles.sheetRowText}>{label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </Modal>

          <FormField
            label={t.support.detailLabel}
            name="details"
            value={details}
            onChangeText={(text) => {
              setDetails(text);
              if (text.trim().length > 0) setFieldError('details', null);
            }}
            onBlurField={() => {
              const msg = details.trim().length === 0 ? t.support.needDetails : null;
              setFieldError('details', msg);
            }}
            fieldRef={registerY}
            error={errors.details}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            placeholder={t.support.detailsPlaceholder}
            style={styles.textarea}
          />
          <Text style={styles.counter}>
            {formatTemplate(t.support.detailsCount, { count: details.length })}
          </Text>

          {/* Photo attach: ≤3 private images (owner + admin). */}
          <Text style={styles.label}>{t.support.photosHint}</Text>
          <Text style={styles.muted}>{t.support.maxPhotos}</Text>
          <View style={styles.chipWrap}>
            {photos.map((p) => (
              <View key={p.id} style={styles.photoChip}>
                <Feather name="image" size={14} color={C.leaf} />
                <Text style={styles.photoChipText} numberOfLines={1}>
                  {p.name}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setPhotos((prev) => prev.filter((x) => x.id !== p.id))}
                  hitSlop={6}
                >
                  <Feather name="x" size={16} color={C.mute} />
                </Pressable>
              </View>
            ))}
            {photos.length < 3 ? (
              <Pressable
                accessibilityRole="button"
                onPress={addPhoto}
                style={[styles.chip, styles.chipOn]}
              >
                <Text style={[styles.chipText, styles.chipTextOn]}>{t.support.attachPhoto}</Text>
              </Pressable>
            ) : null}
          </View>

          <Text style={styles.label}>{t.support.replyVia}</Text>
          {(
            [
              { key: 'app' as const, label: t.support.replyViaApp },
              { key: 'phone' as const, label: t.support.replyViaPhone },
            ] as const
          ).map((opt) => {
            const selected = replyVia === opt.key;
            return (
              <Pressable
                key={opt.key}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setReplyVia(opt.key)}
                style={styles.radioRow}
              >
                <View style={[styles.radio, selected ? styles.radioOn : null]}>
                  {selected ? <View style={styles.radioDot} /> : null}
                </View>
                <Text style={styles.radioLabel}>{opt.label}</Text>
              </Pressable>
            );
          })}

          {formError !== null ? <Text style={styles.error}>{formError}</Text> : null}
          <PrimaryButton label={t.support.submit} block onPress={() => void submit()} loading={busy} />
        </View>

        <View style={styles.warning}>
          <Feather name="alert-circle" size={22} color={C.soonFg} />
          <Text style={styles.warningText}>{t.support.otpWarning}</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40, gap: 14 },
  pad: { padding: 16, gap: 12 },
  muted: { fontSize: 12, color: C.mute, fontFamily: fonts.body },
  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: radius.cardLg,
    padding: 16,
    gap: 10,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: C.ink, fontFamily: fonts.bodySemi },
  h2: { fontFamily: fonts.titleBold, fontSize: 18, fontWeight: '700', color: C.ink },
  ticketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    borderTopWidth: 1,
    borderTopColor: '#E9ECE6',
    paddingTop: 10,
  },
  ticketText: { flex: 1, gap: 2, minWidth: 0 },
  ticketTitle: { fontSize: 14, fontWeight: '600', color: C.ink, fontFamily: fonts.bodySemi },
  badgeNew: {
    backgroundColor: C.okBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeNewText: { fontSize: 11, fontWeight: '700', color: C.okFg, fontFamily: fonts.bodySemi },
  label: { fontSize: 14, fontWeight: '600', color: C.ink, fontFamily: fonts.bodySemi, marginTop: 4 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { borderColor: C.leaf, borderWidth: 1.5, backgroundColor: C.leafSoft },
  chipText: { fontSize: 14, color: C.ink, fontFamily: fonts.body },
  chipTextOn: { color: C.leafDeep, fontWeight: '600', fontFamily: fonts.bodySemi },
  select: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: C.lineStrong,
    borderRadius: radius.control,
    paddingHorizontal: 14,
    backgroundColor: C.surface,
  },
  selectText: { fontSize: 15, color: C.ink, fontFamily: fonts.body },
  textarea: { minHeight: 110, paddingTop: 12 },
  counter: { fontSize: 12, color: C.mute, textAlign: 'right', fontFamily: fonts.body },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
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
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.leaf },
  radioLabel: { fontSize: 15, color: C.ink, fontFamily: fonts.body },
  photoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.leaf,
    backgroundColor: C.leafSoft,
    maxWidth: 220,
  },
  photoChipText: { flex: 1, fontSize: 13, color: C.leafDeep, fontFamily: fonts.bodySemi },
  error: { color: C.danger, fontFamily: fonts.body },
  warning: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: C.soonBg,
    borderRadius: radius.cardLg,
    padding: 14,
    alignItems: 'flex-start',
  },
  warningText: { flex: 1, fontSize: 13, color: '#3B2A06', lineHeight: 20, fontFamily: fonts.body },
  sheetBackdrop: {
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
    maxHeight: '70%',
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  sheetTitle: {
    fontFamily: fonts.titleBold,
    fontSize: 18,
    fontWeight: '700',
    color: C.ink,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sheetList: { paddingHorizontal: 12, gap: 4 },
  sheetRow: {
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  sheetRowText: { fontSize: 15, color: C.ink, fontFamily: fonts.body },
});
