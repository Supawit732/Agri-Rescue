import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppNotification, NotificationFilter } from '../../src/api/types';
import { DataState, PrimaryButton, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useApiData } from '../../src/hooks/useApiData';
import { formatTemplate, useI18n } from '../../src/i18n';
import { C, fonts, radius } from '../../src/theme';

type FilterKey = NotificationFilter;

const FILTERS: Array<{ key: FilterKey; labelKey: 'filterAll' | 'filterShop' | 'filterOrder' }> = [
  { key: 'all', labelKey: 'filterAll' },
  { key: 'shop', labelKey: 'filterShop' },
  { key: 'order', labelKey: 'filterOrder' },
];

function paramsOf(n: AppNotification): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(n.params)) {
    if (v !== null && (typeof v === 'string' || typeof v === 'number')) {
      out[k] = v;
    }
  }
  return out;
}

function messageFor(n: AppNotification, template: string): string {
  return formatTemplate(template, paramsOf(n));
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isYesterday(iso: string): boolean {
  const d = new Date(iso);
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return d.getFullYear() === y.getFullYear() && d.getMonth() === y.getMonth() && d.getDate() === y.getDate();
}

export default function NotificationsTab(): React.ReactElement {
  const { user, api } = useAuth();
  const { t, formatDateTime } = useI18n();
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [extraUnread, setExtraUnread] = useState(0);

  const fetchList = useCallback(
    () => api.listNotifications(filter),
    [api, filter],
  );
  const { data, loading, error, reload } = useApiData(fetchList, [user?.id ?? null, filter]);

  useEffect(() => {
    if (data !== null) {
      setExtraUnread(data.unread_count);
    }
  }, [data]);

  const unread = extraUnread;

  const markRead = async (n: AppNotification): Promise<void> => {
    if (n.read_at !== null || user === null) return;
    try {
      const res = await api.markNotificationRead(n.id);
      setExtraUnread(res.unread_count);
      await reload();
      if (n.link !== null && n.link.startsWith('/')) {
        router.push(n.link as never);
      }
    } catch {
      if (n.link !== null && n.link.startsWith('/')) {
        router.push(n.link as never);
      }
    }
  };

  const markAll = async (): Promise<void> => {
    if (user === null) return;
    const res = await api.markAllNotificationsRead();
    setExtraUnread(res.unread_count);
    await reload();
  };

  const grouped = useMemo(() => {
    if (data === null) return [] as Array<{ label: string; items: AppNotification[] }>;
    const today: AppNotification[] = [];
    const yesterday: AppNotification[] = [];
    const older: AppNotification[] = [];
    for (const n of data.notifications) {
      if (isToday(n.created_at)) today.push(n);
      else if (isYesterday(n.created_at)) yesterday.push(n);
      else older.push(n);
    }
    const groups: Array<{ label: string; items: AppNotification[] }> = [];
    if (today.length > 0) groups.push({ label: t.notifications.today, items: today });
    if (yesterday.length > 0) groups.push({ label: t.notifications.yesterday, items: yesterday });
    if (older.length > 0) groups.push({ label: t.notifications.older, items: older });
    return groups;
  }, [data, t]);

  const titleAndBody = (n: AppNotification): { title: string; body: string } => {
    const titleKey = n.title_key as keyof typeof t.notif;
    const template = (t.notif as Record<string, string>)[titleKey.replace('notif.', '')] ?? titleKey;
    // title_key stored as notif.shop_new_lot — catalog uses t.notif.shop_new_lot
    const key = n.title_key.startsWith('notif.') ? n.title_key.slice('notif.'.length) : n.title_key;
    const bodyTemplate =
      (t.notif as Record<string, string | undefined>)[key] ??
      (t.notif as Record<string, string | undefined>)[titleKey] ??
      key;
    const category =
      n.type === 'shop_new_lot'
        ? t.notifications.catShop
        : n.type === 'lot_booked' || n.type === 'order_delivered'
          ? t.notifications.catOrder
          : n.type === 'donor_review' || n.type === 'donor_proof_due'
            ? t.notifications.catDonor
            : t.notifications.catOther;
    return { title: category, body: messageFor(n, bodyTemplate) };
  };

  const iconFor = (type: string): { icon: keyof typeof Feather.glyphMap; fg: string; bg: string } => {
    if (type === 'shop_new_lot') return { icon: 'home', fg: C.leaf, bg: C.leafSoft };
    if (type === 'lot_booked') return { icon: 'shopping-cart', fg: C.leaf, bg: C.leafSoft };
    if (type === 'order_delivered') return { icon: 'check', fg: C.okFg, bg: C.okBg };
    if (type === 'donor_review') return { icon: 'gift', fg: C.soonFg, bg: C.soonBg };
    if (type === 'donor_proof_due') return { icon: 'clock', fg: C.urgentFg, bg: C.urgentBg };
    return { icon: 'bell', fg: C.mute, bg: C.leafSoft };
  };

  if (user === null) {
    return (
      <Screen>
        <View style={styles.header}>
          <Text style={styles.h1}>{t.tabs.notifications}</Text>
        </View>
        <View style={styles.guest}>
          <Text style={styles.guestText}>{t.notifications.loginRequired}</Text>
          <PrimaryButton
            label={t.common.login}
            onPress={() =>
              router.push({ pathname: '/login', params: { returnTo: '/(tabs)/notifications' } })
            }
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen fullWidth>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.h1}>{t.tabs.notifications}</Text>
          {unread > 0 ? <View style={styles.headerBadge}><Text style={styles.headerBadgeText}>{unread}</Text></View> : null}
        </View>
        <View style={styles.headerRight}>
          <Pressable accessibilityRole="button" onPress={() => void markAll()} hitSlop={8}>
            <Text style={styles.markAll}>{t.notifications.markAll}</Text>
          </Pressable>
          <View style={styles.avatarMini}>
            <Feather name="user" size={16} color={C.leafDeep} />
          </View>
        </View>
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              accessibilityRole="button"
              style={[styles.chip, active ? styles.chipOn : null]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.chipText, active ? styles.chipTextOn : null]}>
                {t.notifications[f.labelKey]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <DataState
        loading={loading}
        error={error}
        data={data}
        onRetry={reload}
        isEmpty={(payload) => payload.notifications.length === 0}
        emptyText={t.notifications.empty}
      >
        {(payload) => (
          <View style={styles.list}>
            {grouped.map((group) => (
              <View key={group.label}>
                <Text style={styles.groupLabel}>{group.label}</Text>
                {group.items.map((n) => {
                  const unreadDot = n.read_at === null;
                  const { title, body } = titleAndBody(n);
                  const icon = iconFor(n.type);
                  return (
                    <Pressable
                      key={n.id}
                      accessibilityRole="button"
                      style={[styles.card, unreadDot ? styles.cardUnread : styles.cardRead]}
                      onPress={() => void markRead(n)}
                    >
                      <View style={[styles.icon, { backgroundColor: icon.bg }]}>
                        <Feather name={icon.icon} size={22} color={icon.fg} />
                      </View>
                      <View style={styles.cardBody}>
                        <Text style={[styles.cardCat, { color: icon.fg }]}>{title}</Text>
                        <Text style={styles.cardText}>{body}</Text>
                        <Text style={styles.cardTime}>{formatDateTime(n.created_at)}</Text>
                      </View>
                      {unreadDot ? (
                        <View style={styles.dot} accessibilityLabel={t.notifications.unreadLabel} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </DataState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  h1: { fontFamily: fonts.titleBold, fontSize: 24, fontWeight: '700', color: C.ink },
  headerBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  headerBadgeText: { color: C.white, fontSize: 11, fontWeight: '700' },
  markAll: { color: C.leaf, fontWeight: '600', fontSize: 14, fontFamily: fonts.bodySemi, minHeight: 36 },
  avatarMini: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.leafSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  chip: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: C.leafDeep, borderColor: C.leafDeep },
  chipText: { fontSize: 14, color: C.ink, fontFamily: fonts.body },
  chipTextOn: { color: C.white, fontWeight: '600', fontFamily: fonts.bodySemi },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  groupLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: C.mute,
    paddingVertical: 6,
    fontFamily: fonts.bodySemi,
  },
  card: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: radius.card,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  cardUnread: { backgroundColor: C.surface, borderColor: C.lineStrong },
  cardRead: { backgroundColor: '#F9FAF7', borderColor: C.line },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardBody: { flex: 1, gap: 3, minWidth: 0 },
  cardCat: { fontSize: 12, fontWeight: '600', fontFamily: fonts.bodySemi },
  cardText: { fontSize: 15, lineHeight: 21, color: C.ink, fontFamily: fonts.body },
  cardTime: { fontSize: 12, color: C.mute, fontFamily: fonts.body },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.leaf,
    marginTop: 4,
    flexShrink: 0,
  },
  guest: { padding: 16, gap: 12 },
  guestText: { color: C.mute, fontFamily: fonts.body },
});
