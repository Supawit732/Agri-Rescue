import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DataState, SectionTitle } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useApiData } from '../../src/hooks/useApiData';
import { useI18n } from '../../src/i18n';
import { formatTemplate } from '../../src/i18n';
import { C, fonts } from '../../src/theme';
import { DitMappingPanel } from '../../src/admin/OldAdminPanels';

export default function AdminSystemScreen(): React.ReactElement {
  const { api } = useAuth();
  const { t, formatDateTime } = useI18n();
  const [q, setQ] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const users = useApiData(
    () => api.listAdminUsers({ q: q.trim() || undefined }),
    [api, q, refreshKey],
  );

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <SectionTitle>{t.admin.tabSystem}</SectionTitle>
      <SectionTitle>{t.admin.ditLead}</SectionTitle>
      <DitMappingPanel />

      <SectionTitle>{t.admin.usersDir}</SectionTitle>
      <View style={styles.searchBox}>
        <Feather name="search" size={18} color={C.mute} />
        <TextInput
          style={styles.search}
          value={q}
          onChangeText={setQ}
          placeholder={t.admin.usersSearch}
          placeholderTextColor={C.mute}
          autoCapitalize="none"
        />
      </View>
      <DataState
        loading={users.loading}
        error={users.error}
        data={users.data}
        onRetry={users.reload}
        isEmpty={(p) => p.users.length === 0}
        emptyText={t.admin.usersEmpty}
      >
        {(payload) => (
          <View style={styles.list}>
            {payload.users.map((u) => (
              <View key={u.id} style={styles.card}>
                <Text style={styles.name}>{u.name}</Text>
                <Text style={styles.meta}>
                  {u.phone ?? t.common.dash}
                  {u.email != null ? ` · ${u.email}` : ''}
                </Text>
                <Text style={styles.meta}>
                  {u.role}
                  {u.is_admin ? ' · admin' : ''}
                  {u.can_sell ? ` · ${t.shell.seller}` : ''}
                  {u.can_buy ? ` · ${t.shell.buyer}` : ''}
                </Text>
                <Text style={styles.meta}>{formatDateTime(u.created_at)}</Text>
              </View>
            ))}
          </View>
        )}
      </DataState>
      <Text style={styles.hint}>{t.admin.usersReadOnly}</Text>
      <Text style={styles.meta}>{t.admin.otpsTitle}</Text>
      <UsersOtpHint />
      <Text style={styles.meta}>{t.admin.weightsTitle}</Text>
      <WeightsHint refreshKey={refreshKey} />
    </ScrollView>
  );
}

function UsersOtpHint(): React.ReactElement | null {
  const { api } = useAuth();
  const { t } = useI18n();
  const [nonce, setNonce] = useState(0);
  const { data, reload } = useApiData(() => api.getAdminInbox(), [api, nonce]);
  if (!data || data.counts.otp === 0) return <Text style={{ color: C.mute }}>{t.admin.noOtpLocked}</Text>;

  const handleUnlock = (id: number): void => {
    Alert.alert(
      t.admin.unlockOtp,
      formatTemplate(t.admin.unlockOtpConfirm, { id }),
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.admin.unlockOtp,
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await api.unlockAdminOtpOrder(id);
              Alert.alert(t.admin.unlockOtpSuccess);
              setNonce((n) => n + 1);
              reload();
            })();
          },
        },
      ],
    );
  };

  return (
    <View style={styles.list}>
      {data.items
        .filter((i) => i.kind === 'otp')
        .map((i) => (
          <View key={`otp-${i.id}`} style={styles.card}>
            <View style={styles.otpRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{i.title}</Text>
                <Text style={styles.meta}>{i.subtitle}</Text>
              </View>
              <Pressable
                style={styles.unlockBtn}
                accessibilityRole="button"
                onPress={() => handleUnlock(i.id)}
              >
                <Feather name="unlock" size={14} color={C.white} />
                <Text style={styles.unlockText}>{t.admin.unlockOtp}</Text>
              </Pressable>
            </View>
          </View>
        ))}
    </View>
  );
}

function WeightsHint({ refreshKey }: { refreshKey: number }): React.ReactElement | null {
  const { api } = useAuth();
  const { t, formatNumber } = useI18n();
  const { data } = useApiData(() => api.getAdminInbox(), [api, refreshKey]);
  if (!data || data.counts.weight === 0) {
    return <Text style={{ color: C.mute }}>{t.admin.noWeightFlags}</Text>;
  }
  return (
    <View style={styles.list}>
      {data.items
        .filter((i) => i.kind === 'weight')
        .map((i) => (
          <View key={`w-${i.id}`} style={styles.card}>
            <Text style={styles.name}>{i.title}</Text>
            <Text style={styles.meta}>{i.subtitle ?? formatNumber(i.id)}</Text>
          </View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 32, gap: 8 },
  searchBox: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
  },
  search: { flex: 1, fontSize: 15, color: C.ink, fontFamily: fonts.body },
  list: { gap: 8, marginBottom: 8 },
  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  name: { fontSize: 15, fontWeight: '700', color: C.ink, fontFamily: fonts.bodySemi },
  meta: { fontSize: 13, color: C.mute, fontFamily: fonts.body },
  hint: { fontSize: 12, color: C.mute, fontFamily: fonts.body },
  otpRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  unlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.urgentFg,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  unlockText: { fontSize: 12, color: C.white, fontFamily: fonts.bodySemi },
});
