import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { SupportTicketStatus } from '../../src/api/types';
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

  const fetchDetail = useCallback(
    () => api.getSupportTicket(ticketId),
    [api, ticketId],
  );
  const { data, loading, error, reload } = useApiData(fetchDetail, [ticketId, nonce]);

  const isAdmin = user?.is_admin === true;
  const ticket = data?.ticket;

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

  if (user === null) {
    return (
      <Screen>
        <StackHeader title={t.support.title} onBack={() => router.replace('/contact-us')} />
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
      <StackHeader title={t.support.title} onBack={() => router.replace('/contact-us')} />
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
              {ticket.user_name != null && isAdmin ? (
                <Text style={styles.meta}>{ticket.user_name}</Text>
              ) : null}
            </View>

            {(data?.messages ?? []).map((msg) => (
              <View
                key={msg.id}
                style={[
                  styles.bubble,
                  msg.sender_role === 'admin' ? styles.bubbleAdmin : styles.bubbleUser,
                ]}
              >
                <Text style={styles.bubbleRole}>
                  {msg.sender_role === 'admin' ? t.support.adminInbox : ticket.user_name ?? ''}
                </Text>
                <Text style={styles.bubbleBody}>{msg.body}</Text>
                <Text style={styles.bubbleTime}>{formatDateTime(msg.created_at)}</Text>
                {msg.attachments.length > 0 ? (
                  <View style={styles.attachRow}>
                    {msg.attachments.map((att) => (
                      <View key={att.id} style={styles.attachChip}>
                        <Feather name="image" size={14} color={C.mute} />
                        <Text style={styles.attachName} numberOfLines={1}>
                          {att.original_name ?? `#${att.id}`}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}

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
  bubble: {
    borderRadius: 16,
    padding: 12,
    gap: 6,
    borderWidth: 1,
  },
  bubbleUser: {
    backgroundColor: C.bg,
    borderColor: C.line,
    borderTopLeftRadius: 4,
    alignSelf: 'flex-start',
    maxWidth: '92%',
  },
  bubbleAdmin: {
    backgroundColor: C.leafSoft,
    borderColor: C.lineStrong,
    borderTopRightRadius: 4,
    alignSelf: 'flex-end',
    maxWidth: '92%',
  },
  bubbleRole: { fontSize: 12, fontWeight: '600', color: C.leaf, fontFamily: fonts.bodySemi },
  bubbleBody: { fontSize: 14, lineHeight: 21, color: C.ink, fontFamily: fonts.body },
  bubbleTime: { fontSize: 11, color: C.mute, fontFamily: fonts.body },
  attachRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
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
