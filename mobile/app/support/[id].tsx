import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { SupportTicketStatus } from '../../src/api/types';
import { AuthImage } from '../../src/components/AuthImage';
import { FormField, useFieldErrors, useFieldScroll } from '../../src/components/form';
import { Badge, PrimaryButton, Screen, StackHeader } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useApiData } from '../../src/hooks/useApiData';
import { formatDateTime, formatTemplate, useI18n } from '../../src/i18n';
import { C, fonts, radius } from '../../src/theme';

function statusKey(status: string): 'statusOpen' | 'statusInProgress' | 'statusClosed' {
  if (status === 'in_progress') return 'statusInProgress';
  if (status === 'closed') return 'statusClosed';
  return 'statusOpen';
}

export default function SupportTicketScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ id?: string }>();
  const ticketId = Number(params.id);
  const { user, api } = useAuth();
  const { t, formatDateTime, formatNumber, cropName } = useI18n();
  const router = useRouter();
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { errors, setErrors, setFieldError } = useFieldErrors();
  const { scrollRef, registerY, scrollToField } = useFieldScroll();
  const [nonce, setNonce] = useState(0);
  const [viewing, setViewing] = useState<{ uri: string; headers: Record<string, string> } | null>(null);

  const fetchDetail = useCallback(
    () => api.getSupportTicket(ticketId),
    [api, ticketId],
  );
  const { data, loading, error, reload } = useApiData(fetchDetail, [ticketId, nonce]);

  const isAdmin = user?.is_admin === true;
  const ticket = data?.ticket;
  const headerTitle = Number.isFinite(ticketId)
    ? formatTemplate(t.support.ticketTitle, { id: String(ticketId) })
    : t.support.title;

  const sendReply = async (): Promise<void> => {
    if (reply.trim().length === 0) {
      setFieldError('reply', t.support.needDetails);
      scrollToField('reply');
      return;
    }
    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      await api.replySupportTicket(ticketId, reply.trim());
      setReply('');
      setNonce((n) => n + 1);
      await reload();
    } catch {
      setFormError(t.support.replyFailed);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: SupportTicketStatus): Promise<void> => {
    setBusy(true);
    try {
      await api.updateSupportTicketStatus(ticketId, status);
      setNonce((n) => n + 1);
    } catch {
      setFormError(t.support.replyFailed);
    } finally {
      setBusy(false);
    }
  };

  const leave = (): void => {
    if (user?.is_admin === true) {
      router.replace('/admin/inbox' as never);
      return;
    }
    router.replace('/contact-us');
  };

  if (user === null) {
    return (
      <Screen>
        <StackHeader title={t.support.title} onBack={leave} />
        <View style={styles.pad}>
          <Text style={styles.muted}>{t.support.loginRequired}</Text>
          <PrimaryButton
            label={t.common.login}
            onPress={() =>
              router.push({ pathname: '/login', params: { returnTo: `/support/${ticketId}` } })
            }
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <StackHeader title={headerTitle} onBack={leave} />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.body}>
        {loading || ticket === undefined ? (
          <Text style={styles.muted}>{t.common.loading}</Text>
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.headerRow}>
                <Text style={styles.topic}>{ticket.topic_label}</Text>
                <Badge
                  text={t.support[statusKey(ticket.status)]}
                  fg={ticket.status === 'closed' ? C.mute : C.leafDeep}
                  bg={ticket.status === 'closed' ? '#EEF0EC' : C.okBg}
                />
              </View>
              {ticket.order_id !== null ? (
                <Text style={styles.meta}>
                  {t.support.relatedOrder}: #{ticket.order_id}
                  {ticket.order_crop_th != null && ticket.order_qty_kg != null
                    ? ` · ${cropName({
                        name_th: ticket.order_crop_th,
                        name_en: ticket.order_crop_en ?? null,
                      })} · ${formatNumber(ticket.order_qty_kg)} ${t.common.kg}`
                    : ticket.order_summary != null && ticket.order_summary.trim() !== ''
                      ? ` · ${ticket.order_summary}`
                      : ''}
                </Text>
              ) : null}
              {ticket.order_status != null && ticket.order_status !== '' ? (
                <Text style={styles.meta}>
                  {formatTemplate(t.support.orderStatus, { status: ticket.order_status })}
                </Text>
              ) : null}
              <Text style={styles.meta}>{formatDateTime(ticket.created_at)}</Text>
              {isAdmin && (ticket.user_name != null || ticket.user_phone != null) ? (
                <Text style={styles.meta}>
                  {t.support.reportedBy}: {ticket.user_name ?? ''}
                  {ticket.user_phone != null ? (
                    <>
                      {ticket.user_name != null ? ' · ' : ''}
                      <Text
                        style={styles.phoneLink}
                        accessibilityRole="link"
                        onPress={() => {
                          if (Platform.OS !== 'web') void Linking.openURL(`tel:${ticket.user_phone}`);
                        }}
                      >
                        {ticket.user_phone}
                      </Text>
                    </>
                  ) : null}
                </Text>
              ) : null}
            </View>

            {(data?.messages ?? []).map((msg) => {
              const isStaff = msg.sender_role === 'admin';
              return (
                <View key={msg.id} style={[styles.card, isStaff && styles.cardStaff]}>
                  <View style={styles.headerRow}>
                    <View style={styles.senderRow}>
                      <Text style={styles.bubbleRole} numberOfLines={1}>
                        {isStaff ? t.support.adminInbox : ticket.user_name ?? ''}
                      </Text>
                      {isStaff ? (
                        <Badge text={t.support.staffBadge} fg={C.leafDeep} bg={C.okBg} />
                      ) : null}
                    </View>
                    <Text style={styles.bubbleTime}>{formatDateTime(msg.created_at)}</Text>
                  </View>
                  <Text style={styles.bubbleBody}>{msg.body}</Text>
                  {msg.attachments.length > 0 ? (
                    <View style={styles.attachRow}>
                      {msg.attachments.map((att) => (
                        <Pressable
                          key={att.id}
                          accessibilityRole="button"
                          accessibilityLabel={`${t.support.viewPhoto}: ${att.original_name ?? `#${att.id}`}`}
                          onPress={() => setViewing(api.supportAttachmentSource(ticketId, att.id))}
                        >
                          <AuthImage
                            source={api.supportAttachmentSource(ticketId, att.id)}
                            style={styles.attachThumb}
                            resizeMode="cover"
                          />
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}

            {ticket.status !== 'closed' || isAdmin ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>
                  {isAdmin ? t.support.replyToUser : t.support.sendReply}
                </Text>
                <FormField
                  label={t.support.replyPlaceholder}
                  name="reply"
                  value={reply}
                  onChangeText={setReply}
                  onBlurField={() => setFieldError('reply', null)}
                  fieldRef={registerY}
                  error={errors.reply}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  placeholder={t.support.replyPlaceholder}
                  style={styles.textarea}
                />
                {formError !== null ? <Text style={styles.error}>{formError}</Text> : null}
                <PrimaryButton
                  label={isAdmin ? t.support.sendAnswer : t.support.sendReply}
                  onPress={() => void sendReply()}
                  loading={busy}
                />
                {isAdmin ? (
                  <View style={styles.adminActions}>
                    {ticket.status === 'open' ? (
                      <Pressable
                        style={styles.statusBtn}
                        onPress={() => void setStatus('in_progress')}
                      >
                        <Text style={styles.statusBtnText}>{t.support.markInProgress}</Text>
                      </Pressable>
                    ) : null}
                    {ticket.status !== 'closed' ? (
                      <Pressable style={styles.statusBtn} onPress={() => void setStatus('closed')}>
                        <Text style={styles.statusBtnText}>{t.support.markClosed}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}
          </>
        )}
        {error !== null ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <Modal visible={viewing !== null} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable
          style={styles.viewer}
          onPress={() => setViewing(null)}
          accessibilityRole="button"
          accessibilityLabel={t.common.close}
        >
          {viewing !== null ? (
            <AuthImage source={viewing} style={styles.viewerImage} resizeMode="contain" />
          ) : null}
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40, gap: 12 },
  pad: { padding: 16, gap: 12 },
  muted: { fontSize: 13, color: C.mute, fontFamily: fonts.body },
  error: { color: C.danger, fontFamily: fonts.body },
  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: radius.cardLg,
    padding: 16,
    gap: 8,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  topic: { fontFamily: fonts.titleBold, fontSize: 16, fontWeight: '700', color: C.ink, flex: 1 },
  meta: { fontSize: 13, color: C.mute, fontFamily: fonts.body },
  cardStaff: { borderLeftWidth: 4, borderLeftColor: C.leaf },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  bubbleRole: { flexShrink: 1, fontSize: 13, fontWeight: '600', color: C.leaf, fontFamily: fonts.bodySemi },
  bubbleBody: { fontSize: 14, lineHeight: 21, color: C.ink, fontFamily: fonts.body },
  bubbleTime: { fontSize: 11, color: C.mute, fontFamily: fonts.body },
  attachThumb: {
    width: 128,
    height: 128,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.leafSoft,
  },
  viewer: {
    flex: 1,
    backgroundColor: C.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  viewerImage: { width: '100%', height: '100%' },
  attachRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  phoneLink: { color: C.leafDeep, textDecorationLine: 'underline' },
  attachChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: 140,
  },
  attachName: { fontSize: 11, color: C.mute, fontFamily: fonts.body, flexShrink: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: C.ink, fontFamily: fonts.bodySemi },
  textarea: { minHeight: 90, paddingTop: 12 },
  adminActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  statusBtn: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.lineStrong,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBtnText: { fontSize: 14, fontWeight: '600', color: C.ink, fontFamily: fonts.bodySemi },
});
