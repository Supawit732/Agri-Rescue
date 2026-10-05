import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../src/api/client';
import type { AdminAuditItem, AdminAuditType } from '../../src/api/types';
import { Screen, SecondaryButton, StackHeader } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { formatTemplate, useI18n } from '../../src/i18n';
import type { Messages } from '../../src/i18n/types';
import { C, fonts } from '../../src/theme';

const PAGE_SIZE = 20;

function actionLabel(item: AdminAuditItem, t: Messages): string {
  const labels = t.admin.auditActions as Record<string, string | undefined>;
  return labels[item.action.replace('.', '_')] ?? item.summary;
}

function targetLabel(item: AdminAuditItem, t: Messages): string | null {
  if (item.target_type === null || item.target_id === null) return null;
  const template = (t.admin.auditTargets as Record<string, string | undefined>)[item.target_type];
  if (template === undefined) return `${item.target_type} #${item.target_id}`;
  return formatTemplate(template, { id: item.target_id, label: item.metadata?.target_label ?? `#${item.target_id}` });
}

/** Screens that exist for a target; others render as plain text. */
function targetRoute(item: AdminAuditItem): string | null {
  if (item.target_id === null) return null;
  if (item.target_type === 'org') return `/admin/orgs?user=${item.target_id}&from=audit`;
  if (item.target_type === 'support_ticket') return `/support/${item.target_id}`;
  if (item.target_type === 'lot') return `/lots/${item.target_id}`;
  return null;
}

/** Read-only admin activity log (admin_audit_log), newest first, filterable by action type. */
export default function AdminAuditScreen(): React.ReactElement {
  const { api } = useAuth();
  const { t, formatDateTime, translateError } = useI18n();
  const router = useRouter();
  const [type, setType] = useState<AdminAuditType>('all');
  const [items, setItems] = useState<AdminAuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (offset: number, isActive: () => boolean): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.listAdminAuditLog({ type, limit: PAGE_SIZE, offset });
        if (!isActive()) return;
        setTotal(res.total);
        setItems((prev) => (offset === 0 ? res.items : [...prev, ...res.items]));
      } catch (err) {
        if (isActive()) setError(err instanceof ApiError ? translateError(err.code, err.message) : translateError('ERROR'));
      } finally {
        if (isActive()) setLoading(false);
      }
    },
    [api, type, translateError],
  );

  useEffect(() => {
    let active = true;
    void load(0, () => active);
    return () => {
      active = false;
    };
  }, [load]);

  const filters: Array<{ key: AdminAuditType; label: string }> = [
    { key: 'all', label: t.admin.auditFilterAll },
    { key: 'org', label: t.admin.auditFilterOrg },
    { key: 'support', label: t.admin.auditFilterSupport },
    { key: 'lot', label: t.admin.auditFilterLot },
    { key: 'dit', label: t.admin.auditFilterDit },
    { key: 'other', label: t.admin.auditFilterOther },
  ];

  return (
    <Screen fullWidth>
      <StackHeader title={t.admin.auditLink} onBack={() => router.navigate('/admin/system' as never)} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.filters}>
          {filters.map((f) => {
            const selected = type === f.key;
            return (
              <Pressable
                key={f.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[styles.chip, selected ? styles.chipOn : null]}
                onPress={() => setType(f.key)}
              >
                <Text style={[styles.chipText, selected ? styles.chipTextOn : null]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {error !== null ? <Text style={styles.error}>{error}</Text> : null}
        {items.length > 0 ? (
          <Text style={styles.muted}>
            {formatTemplate(t.admin.auditCount, { shown: String(items.length), total: String(total) })}
          </Text>
        ) : null}

        <View style={styles.list}>
          {items.map((item) => {
            const target = targetLabel(item, t);
            const route = targetRoute(item);
            const reason = item.metadata?.reason;
            return (
              <View key={item.id} style={styles.card}>
                <Text style={styles.time}>{formatDateTime(item.created_at)}</Text>
                <Text style={styles.action}>{actionLabel(item, t)}</Text>
                <View style={styles.adminRow}>
                  <Text style={[styles.meta, styles.adminName]} numberOfLines={1}>
                    {item.admin_name === null || item.metadata?.admin_unknown === true
                      ? t.admin.auditUnknownAdmin
                      : item.admin_name}
                  </Text>
                  {item.metadata?.backfilled === true ? (
                    <Text style={styles.tag}>{t.admin.auditBackfilled}</Text>
                  ) : null}
                </View>
                {target !== null ? (
                  route !== null ? (
                    <Pressable
                      accessibilityRole="link"
                      style={styles.targetLink}
                      onPress={() => router.push(route as never)}
                    >
                      <Text style={styles.targetText} numberOfLines={2}>
                        {target}
                      </Text>
                      <Feather name="chevron-right" size={14} color={C.leafDeep} />
                    </Pressable>
                  ) : (
                    <Text style={styles.meta}>{target}</Text>
                  )
                ) : null}
                {typeof reason === 'string' && reason !== '' ? (
                  <Text style={styles.meta}>{formatTemplate(t.admin.auditReason, { reason })}</Text>
                ) : null}
              </View>
            );
          })}
        </View>

        {!loading && items.length === 0 && error === null ? <Text style={styles.muted}>{t.admin.auditEmpty}</Text> : null}
        {loading ? <Text style={styles.muted}>{t.common.loading}</Text> : null}
        {!loading && items.length < total ? (
          <SecondaryButton block label={t.admin.auditLoadMore} onPress={() => void load(items.length, () => true)} />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 32, gap: 10 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
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
    gap: 4,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    padding: 14,
  },
  time: { fontSize: 12, color: C.mute, fontFamily: fonts.body },
  action: { fontSize: 14, fontWeight: '600', color: C.ink, fontFamily: fonts.bodySemi },
  meta: { fontSize: 12, color: C.mute, fontFamily: fonts.body },
  adminRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  adminName: { flexShrink: 1 },
  tag: {
    fontSize: 11,
    color: C.mute,
    fontFamily: fonts.body,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  targetLink: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  targetText: { flexShrink: 1, fontSize: 13, color: C.leafDeep, fontFamily: fonts.bodySemi, fontWeight: '600' },
  muted: { color: C.mute, fontFamily: fonts.body, fontSize: 12 },
  error: { color: C.danger, fontFamily: fonts.body },
});
