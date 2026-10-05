import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { SupportReplyVia, SupportTopic } from '../src/api/types';
import { FormField, useFieldErrors, useFieldScroll } from '../src/components/form';
import { PrimaryButton, Screen, SecondaryButton, StackHeader } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { useApiData } from '../src/hooks/useApiData';
import { formatTemplate, useI18n } from '../src/i18n';
import { PhotoTooLargeError, resizeToBase64Capped } from '../src/lib/media';
import { pickImages } from '../src/lib/pickImages';
import { C, fonts, radius } from '../src/theme';

type PendingPhoto = { id: string; name: string; base64: string; mime: string; uri: string };

const MAX_PHOTOS = 3;
/** Matches the server's support-image limit (decoded bytes). */
const PHOTO_MAX_BYTES = 1_000_000;
const PHOTO_MAX_EDGE = 1024;

type OrderRule = 'required' | 'optional' | 'hidden';
type PhotoHintKey = 'photosHintOrder' | 'photosHintPayment' | 'photosHintAccount';

/** Which fields each topic shows. Photos are always optional; hidden fields are neither sent nor validated. */
const TOPICS: Array<{
  key: SupportTopic;
  labelKey: keyof ReturnType<typeof useI18n>['t']['support'];
  order: OrderRule;
  photoHint: PhotoHintKey;
}> = [
  { key: 'order_pickup', labelKey: 'topicOrderPickup', order: 'required', photoHint: 'photosHintOrder' },
  { key: 'item_mismatch', labelKey: 'topicItemMismatch', order: 'required', photoHint: 'photosHintOrder' },
  { key: 'weight_mismatch', labelKey: 'topicWeightMismatch', order: 'required', photoHint: 'photosHintOrder' },
  { key: 'payment', labelKey: 'topicPayment', order: 'optional', photoHint: 'photosHintPayment' },
  { key: 'account_login', labelKey: 'topicAccount', order: 'hidden', photoHint: 'photosHintAccount' },
  { key: 'donation', labelKey: 'topicDonation', order: 'optional', photoHint: 'photosHintOrder' },
  { key: 'other', labelKey: 'topicOther', order: 'optional', photoHint: 'photosHintOrder' },
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
  const [photoBusy, setPhotoBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { errors, setErrors, setFieldError } = useFieldErrors();
  const { scrollRef, registerY, scrollToField } = useFieldScroll();

  // User-only queries: skip for guests and admins so they never produce 401/403.
  const canQuery = user !== null && user.is_admin !== true;
  const fetchTickets = useCallback(
    () => (canQuery ? api.listSupportTickets({ mine: true }) : Promise.resolve({ tickets: [], unread_count: 0 })),
    [api, canQuery],
  );
  const tickets = useApiData(fetchTickets, [user?.id ?? null, canQuery]);
  const orders = useApiData(
    () => (canQuery ? api.getMyOrders() : Promise.resolve([])),
    [user?.id ?? null, canQuery],
  );

  const topicConfig = TOPICS.find((item) => item.key === topic) ?? TOPICS[0]!;

  const validate = (): Record<string, string> => {
    const next: Record<string, string> = {};
    if (details.trim().length === 0) {
      next.details = t.support.needDetails;
    } else if (details.trim().length > 1000) {
      next.details = t.support.detailsCount.replace('{count}', String(details.trim().length));
    }
    if (topicConfig.order === 'required' && orderId === null) {
      next.order = t.support.needOrder;
    }
    return next;
  };

  const addPhotos = async (): Promise<void> => {
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setFormError(t.support.maxPhotos);
      return;
    }
    try {
      // Web: file picker opens directly (multi-select); native: camera/library chooser.
      const picked = await pickImages({
        labels: {
          title: t.support.attachPhoto,
          takePhoto: t.sell.takePhoto,
          library: t.sell.photoLibrary,
          cancel: t.common.cancel,
        },
        limit: room,
        quality: 0.85,
      });
      if (picked.status === 'denied') {
        setFormError(picked.source === 'camera' ? t.sell.cameraDenied : t.sell.libraryDenied);
        return;
      }
      if (picked.status !== 'picked') {
        return;
      }
      setFormError(picked.rejected > 0 ? t.support.photoInvalidType : null);
      if (picked.assets.length === 0) {
        return;
      }
      setPhotoBusy(true);
      const prepared: PendingPhoto[] = [];
      for (const [index, asset] of picked.assets.entries()) {
        try {
          const out = await resizeToBase64Capped(
            asset.uri,
            asset.width,
            asset.height,
            PHOTO_MAX_EDGE,
            PHOTO_MAX_BYTES,
            asset.fileSize,
          );
          prepared.push({
            id: `${Date.now()}-${String(index)}-${Math.random().toString(36).slice(2, 7)}`,
            name: asset.fileName ?? `photo-${String(photos.length + prepared.length + 1)}.jpg`,
            base64: out.base64,
            mime: out.mime,
            uri: asset.uri,
          });
        } catch (error) {
          setFormError(error instanceof PhotoTooLargeError ? t.support.photoTooLarge : t.support.photoInvalidType);
        }
      }
      setPhotos((prev) => [...prev, ...prepared].slice(0, MAX_PHOTOS));
    } catch {
      setFormError(t.support.photoTooLarge);
    } finally {
      setPhotoBusy(false);
    }
  };

  const submit = async (): Promise<void> => {
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) {
      setFieldError('details', next.details ?? null);
      setFieldError('order', next.order ?? null);
      scrollToField(next.details !== undefined ? 'details' : null);
      return;
    }
    setFormError(null);
    setBusy(true);
    try {
      const { ticket } = await api.createSupportTicket({
        topic,
        details: details.trim(),
        // Hidden fields are not sent.
        ...(topicConfig.order !== 'hidden' && orderId !== null ? { order_id: orderId } : {}),
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
                  onPress={() => {
                    setTopic(item.key);
                    setFieldError('order', null);
                    if (item.order === 'hidden') setOrderId(null);
                  }}
                  style={[styles.chip, selected ? styles.chipOn : null]}
                >
                  <Text style={[styles.chipText, selected ? styles.chipTextOn : null]}>
                    {t.support[item.labelKey as keyof typeof t.support] as string}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {topicConfig.order !== 'hidden' ? (
            <>
              <Text style={styles.label}>
                {topicConfig.order === 'required'
                  ? t.support.relatedOrderRequired
                  : t.support.relatedOrderOptional}
              </Text>
              <Pressable
                accessibilityRole="button"
                style={[styles.select, errors.order !== undefined ? styles.selectError : null]}
                onPress={() => setOrderPickerOpen(true)}
              >
                <Text style={styles.selectText}>
                  {orderId === null
                    ? topicConfig.order === 'required'
                      ? t.support.pickOrder
                      : t.support.noOrder
                    : (() => {
                        const order = orders.data?.find((o) => o.id === orderId);
                        if (order === undefined) return `#${orderId}`;
                        const kg = order.quantity_kg ?? 0;
                        return `#${orderId} · ${formatNumber(kg)} ${t.dashboard.unitKg}`;
                      })()}
                </Text>
                <Feather name="chevron-down" size={18} color={C.mute} />
              </Pressable>
              {errors.order !== undefined ? <Text style={styles.error}>{errors.order}</Text> : null}
            </>
          ) : null}

          <Modal
            visible={orderPickerOpen && topicConfig.order !== 'hidden'}
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
                {topicConfig.order === 'optional' ? (
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
                ) : null}
                {(orders.data ?? []).length === 0 && orders.data !== null ? (
                  <Text style={[styles.muted, styles.sheetRow]}>{t.support.noOrdersYet}</Text>
                ) : null}
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
                        setFieldError('order', null);
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

          {/* Photo attach: optional, ≤3 private images (owner + admin). */}
          <Text style={styles.label}>{t.support.photos}</Text>
          <Text style={styles.muted}>{t.support[topicConfig.photoHint]}</Text>
          <View style={styles.chipWrap}>
            {photos.map((p) => (
              <View key={p.id} style={styles.thumbWrap}>
                <Image source={{ uri: p.uri }} style={styles.thumb} accessibilityLabel={p.name} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t.support.removePhoto}: ${p.name}`}
                  onPress={() => setPhotos((prev) => prev.filter((x) => x.id !== p.id))}
                  style={styles.thumbRemove}
                  hitSlop={8}
                >
                  <Feather name="x" size={14} color={C.white} />
                </Pressable>
              </View>
            ))}
            {photos.length < MAX_PHOTOS ? (
              <Pressable
                accessibilityRole="button"
                disabled={photoBusy}
                onPress={() => void addPhotos()}
                style={[styles.chip, styles.chipOn, styles.addPhoto, photoBusy ? styles.disabled : null]}
              >
                <Feather name="camera" size={16} color={C.leafDeep} />
                <Text style={[styles.chipText, styles.chipTextOn]}>{t.support.attachPhoto}</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.muted}>
            {formatTemplate(t.support.photoCount, { count: photos.length, max: MAX_PHOTOS })}
          </Text>

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
  selectError: { borderColor: C.danger },
  thumbWrap: { width: 84, height: 84 },
  thumb: {
    width: 84,
    height: 84,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.leafSoft,
  },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhoto: { flexDirection: 'row', gap: 6, minHeight: 44, paddingHorizontal: 12 },
  disabled: { opacity: 0.5 },
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
