import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DataState, SectionTitle } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useApiData } from '../../src/hooks/useApiData';
import { useI18n } from '../../src/i18n';
import { C, fonts, radius } from '../../src/theme';
import { OrgApplicationsPanel } from '../../src/admin/OldAdminPanels';
import { SupportInboxPanel } from '../../src/admin/OldAdminPanels';

type QueueKey = 'org' | 'support' | 'weight' | 'otp' | 'proof';

export default function AdminInboxScreen(): React.ReactElement {
  const { api } = useAuth();
  const { t, formatDateTime } = useI18n();
  const router = useRouter();
  const [queue, setQueue] = useState<QueueKey | null>(null);
  const { data, loading, error, reload } = useApiData(() => api.getAdminInbox(), [api]);

  const openItem = (link: string): void => {
    if (link.startsWith('/admin')) {
      // stay / tab switch handled below
      if (link.includes('tab=orgs')) {
        setQueue('org');
        return;
      }
      if (link.includes('tab=system')) {
        router.push('/admin/system');
        return;
      }
    }
    if (link.startsWith('/support/') || link.startsWith('/lots/')) {
      router.push(link as never);
      return;
    }
    if (link.startsWith('/')) {
      router.push(link as never);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <SectionTitle>{t.admin.tabInbox}</SectionTitle>
      <DataState loading={loading} error={error} data={data} onRetry={reload}>
        {(payload) => (
          <>
            <View style={styles.filters}>
              {(
                [
                  { key: 'org' as const, label: t.admin.queueOrg, count: payload.counts.org },
                  { key: 'support' as const, label: t.admin.queueSupport, count: payload.counts.support },
                  { key: 'weight' as const, label: t.admin.queueWeight, count: payload.counts.weight },
                  { key: 'otp' as const, label: t.admin.queueOtp, count: payload.counts.otp },
                  { key: 'proof' as const, label: t.admin.queueProof, count: payload.counts.proof },
                ] as const
              ).map((item) => (
                <Pressable
                  key={item.key}
                  style={[styles.chip, (queue ?? item.key) === item.key && item.count > 0 ? styles.chipOn : null]}
                  onPress={() => setQueue(queue === item.key ? null : item.key)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      (queue ?? item.key) === item.key && item.count > 0 ? styles.chipTextOn : null,
                    ]}
                  >
                    {item.label} {item.count > 0 ? String(item.count) : ''}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.list}>
              {payload.items
                .filter((item) => queue === null || item.kind === queue)
                .map((item) => (
                  <Pressable
                    key={`${item.kind}-${item.id}`}
                    style={styles.card}
                    onPress={() => openItem(item.link)}
                  >
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: item.kind === 'support' || item.kind === 'org' ? C.leaf : C.soonAccent },
                      ]}
                    />
                    <View style={styles.cardText}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.cardMeta} numberOfLines={1}>
                        {item.subtitle != null ? `${item.subtitle} · ` : ''}
                        {formatDateTime(item.updated_at)}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={C.mute} />
                  </Pressable>
                ))}
              {payload.items.length === 0 ? (
                <Text style={styles.muted}>{t.admin.inboxEmpty}</Text>
              ) : null}
            </View>

            {/* Org-only queue detail uses existing org panel when selected */}
            {queue === 'org' ? (
              <View style={styles.panel}>
                <OrgApplicationsPanel />
              </View>
            ) : null}
            {queue === 'support' ? (
              <View style={styles.panel}>
                <SupportInboxPanel />
              </View>
            ) : null}
          </>
        )}
      </DataState>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 32, gap: 10 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: C.leafDeep, borderColor: C.leafDeep },
  chipText: { fontSize: 13, color: C.ink, fontFamily: fonts.body },
  chipTextOn: { color: C.white, fontWeight: '600' },
  list: { gap: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    padding: 14,
  },
  dot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  cardText: { flex: 1, gap: 3, minWidth: 0 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: C.ink, fontFamily: fonts.bodySemi },
  cardMeta: { fontSize: 12, color: C.mute, fontFamily: fonts.body },
  muted: { color: C.mute, fontFamily: fonts.body },
  panel: { marginTop: 8, backgroundColor: C.surface, borderRadius: radius.cardLg, padding: 8 },
});
