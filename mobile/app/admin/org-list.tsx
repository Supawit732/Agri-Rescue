import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError } from '../../src/api/client';
import type { AdminOrgListItem, AdminOrgStatusFilter } from '../../src/api/types';
import { Badge, Screen, SecondaryButton, StackHeader } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { labelOrgStatus, labelOrgType } from '../../src/donorLabels';
import { formatTemplate, useI18n } from '../../src/i18n';
import { C, fonts } from '../../src/theme';

const PAGE_SIZE = 20;

function statusColors(status: string): { fg: string; bg: string } {
  if (status === 'approved') return { fg: C.okFg, bg: C.okBg };
  if (status === 'rejected') return { fg: C.urgentFg, bg: C.urgentBg };
  return { fg: C.soonFg, bg: C.soonBg };
}

/** Every org application regardless of status (the inbox only lists open ones). Rows open the review screen. */
export default function AdminOrgListScreen(): React.ReactElement {
  const { api } = useAuth();
  const { t, formatDate, translateError } = useI18n();
  const router = useRouter();
  const [status, setStatus] = useState<AdminOrgStatusFilter>('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<AdminOrgListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const load = useCallback(
    async (offset: number, isActive: () => boolean): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.listAdminOrgApplications({ status, q: debounced, limit: PAGE_SIZE, offset });
        if (!isActive()) return;
        setTotal(res.total);
        setItems((prev) => (offset === 0 ? res.items : [...prev, ...res.items]));
      } catch (err) {
        if (isActive()) setError(err instanceof ApiError ? translateError(err.code, err.message) : translateError('ERROR'));
      } finally {
        if (isActive()) setLoading(false);
      }
    },
    [api, status, debounced, translateError],
  );

  // Restart from the first page whenever the filter or search changes.
  useEffect(() => {
    let active = true;
    void load(0, () => active);
    return () => {
      active = false;
    };
  }, [load]);

  const filters: Array<{ key: AdminOrgStatusFilter; label: string }> = [
    { key: 'all', label: t.admin.statusAll },
    { key: 'pending', label: t.admin.orgListFilterPending },
    { key: 'approved', label: t.admin.orgListFilterApproved },
    { key: 'rejected', label: t.admin.orgListFilterRejected },
  ];

  return (
    <Screen fullWidth>
      <StackHeader title={t.admin.orgListTitle} onBack={() => router.navigate('/admin/inbox' as never)} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder={t.admin.orgListSearch}
          placeholderTextColor={C.mute}
          accessibilityLabel={t.admin.orgListSearch}
          returnKeyType="search"
        />
        <View style={styles.filters}>
          {filters.map((f) => {
            const selected = status === f.key;
            return (
              <Pressable
                key={f.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[styles.chip, selected ? styles.chipOn : null]}
                onPress={() => setStatus(f.key)}
              >
                <Text style={[styles.chipText, selected ? styles.chipTextOn : null]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {error !== null ? <Text style={styles.error}>{error}</Text> : null}
        {items.length > 0 ? (
          <Text style={styles.muted}>
            {formatTemplate(t.admin.orgListCount, { shown: String(items.length), total: String(total) })}
          </Text>
        ) : null}

        <View style={styles.list}>
          {items.map((item) => {
            const colors = statusColors(item.org_status);
            const dateText =
              item.decided_at !== null
                ? formatTemplate(t.admin.orgListDecided, { date: formatDate(item.decided_at) })
                : formatTemplate(t.admin.orgListSubmitted, { date: formatDate(item.created_at) });
            return (
              <Pressable
                key={item.user_id}
                accessibilityRole="link"
                style={styles.card}
                onPress={() => router.push(`/admin/orgs?user=${String(item.user_id)}&from=list` as never)}
              >
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {item.org_name}
                  </Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {labelOrgType(item.org_type, t)} · {dateText}
                  </Text>
                  <View style={styles.badgeRow}>
                    <Badge text={labelOrgStatus(item.org_status, t)} fg={colors.fg} bg={colors.bg} />
                  </View>
                </View>
                <Feather name="chevron-right" size={16} color={C.mute} />
              </Pressable>
            );
          })}
        </View>

        {!loading && items.length === 0 && error === null ? <Text style={styles.muted}>{t.admin.orgListEmpty}</Text> : null}
        {loading ? <Text style={styles.muted}>{t.common.loading}</Text> : null}
        {!loading && items.length < total ? (
          <SecondaryButton block label={t.admin.orgListLoadMore} onPress={() => void load(items.length, () => true)} />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 32, gap: 10 },
  search: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    backgroundColor: C.surface,
    paddingHorizontal: 12,
    color: C.ink,
    fontFamily: fonts.body,
    fontSize: 14,
  },
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    padding: 14,
  },
  cardText: { flex: 1, gap: 4, minWidth: 0 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: C.ink, fontFamily: fonts.bodySemi },
  cardMeta: { fontSize: 12, color: C.mute, fontFamily: fonts.body },
  badgeRow: { flexDirection: 'row' },
  muted: { color: C.mute, fontFamily: fonts.body, fontSize: 12 },
  error: { color: C.danger, fontFamily: fonts.body },
});
