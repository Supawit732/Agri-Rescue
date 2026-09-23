import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../src/api/client';
import {
  Badge,
  Body,
  Card,
  DataState,
  PrimaryButton,
  Screen,
  SecondaryButton,
  Segmented,
  TopBar,
} from '../src/components/ui';
import { STATUS_LABELS } from '../src/constants';
import { useAuth } from '../src/context/AuthContext';
import { useApiData } from '../src/hooks/useApiData';
import { formatCountdown, hoursLeftFrom, useNow } from '../src/hooks/useNow';
import { C, urgency } from '../src/theme';
import type { MarketLot, Order } from '../src/api/types';

export default function BuyerScreen(): React.ReactElement {
  const { api, logout, user, mode, setMode } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<'market' | 'orders'>('market');
  const [refreshKey, setRefreshKey] = useState(0);

  const bumpRefresh = useCallback(() => setRefreshKey((value) => value + 1), []);

  const switchMode = (next: 'sell' | 'buy'): void => {
    setMode(next);
    if (next === 'sell') {
      router.replace('/farmer');
    }
  };

  return (
    <Screen>
      <TopBar
        title="โหมดซื้อ"
        onImpact={() => router.push('/impact')}
        onProfile={() => router.push('/profile')}
        onLogout={logout}
        mode={mode}
        onModeChange={switchMode}
        showModeToggle={user?.can_sell === true && user.can_buy === true}
      />
      <Segmented
        options={[
          { key: 'market', label: 'ตลาดด่วน' },
          { key: 'orders', label: 'การจองของฉัน' },
        ]}
        value={tab}
        onChange={(key) => setTab(key as 'market' | 'orders')}
      />
      {tab === 'market' ? (
        <Market refreshKey={refreshKey} onBooked={bumpRefresh} />
      ) : (
        <MyOrders refreshKey={refreshKey} onChanged={bumpRefresh} />
      )}
    </Screen>
  );
}

function Market({ refreshKey, onBooked }: { refreshKey: number; onBooked: () => void }): React.ReactElement {
  const { api, user } = useAuth();
  const lat = user?.lat ?? 13.65;
  const lng = user?.lng ?? 100.62;
  const isDonor = user?.donor_tier != null && user.donation_suspended !== true;
  const needsPlace =
    user?.donor_tier === 'volunteer' ||
    user?.donor_tier === 'trusted_volunteer' ||
    user?.distribution_mode === 'redistribute';
  const { data, loading, error, reload } = useApiData(() => api.getMarket(lat, lng, 15), [refreshKey, lat, lng]);
  const now = useNow();
  const [banner, setBanner] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const book = async (lot: MarketLot, donation: boolean): Promise<void> => {
    setBanner(null);
    setBusyId(lot.id);
    try {
      const extras =
        donation && needsPlace
          ? {
              distribution_place: 'จุดรับ/แจกที่ระบุโดยผู้รับ',
              distribution_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            }
          : undefined;
      await api.createOrder(lot.id, donation, extras);
      onBooked();
      reload();
    } catch (err) {
      setBanner(err instanceof ApiError ? err.message : 'จองไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DataState
      loading={loading}
      error={error}
      data={data}
      onRetry={reload}
      isEmpty={(lots) => lots.length === 0}
      emptyText="ยังไม่มีล็อตใกล้คุณในตอนนี้"
    >
      {(lots) => (
        <Body>
          {banner !== null ? <Text style={styles.banner}>{banner}</Text> : null}
          {lots.map((lot) => {
            const hours = hoursLeftFrom(lot.expires_at, now);
            const tone = urgency(hours);
            const audienceOk =
              lot.donation_audience !== 'verified_org_only' || user?.donor_tier === 'verified_org';
            const canDonate = isDonor && lot.allow_donation && audienceOk;
            return (
              <Card key={lot.id}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>
                    {lot.crop_name_th} · {lot.weight_kg} กก.
                  </Text>
                  <Badge text={formatCountdown(hours)} fg={tone.fg} bg={tone.bg} />
                </View>
                <Text style={styles.cardLine}>โดย {lot.farmer_name}</Text>
                <Text style={styles.cardLine}>
                  ระยะ {lot.distance_km.toFixed(1)} กม. · {lot.grade === 'substandard' ? 'ตกเกรด' : 'ปกติ'}
                </Text>
                {canDonate ? (
                  <>
                    <Text style={styles.donateText}>รับบริจาคได้</Text>
                    <PrimaryButton
                      label="รับบริจาค"
                      tone="turmeric"
                      loading={busyId === lot.id}
                      onPress={() => void book(lot, true)}
                    />
                  </>
                ) : (
                  <>
                    <Text style={styles.priceText}>{lot.price_per_kg} บาท/กก.</Text>
                    <PrimaryButton label="จอง" loading={busyId === lot.id} onPress={() => void book(lot, false)} />
                  </>
                )}
              </Card>
            );
          })}
        </Body>
      )}
    </DataState>
  );
}

function MyOrders({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }): React.ReactElement {
  const { api } = useAuth();
  const { data, loading, error, reload } = useApiData(() => api.getMyOrders(), [refreshKey]);
  const [banner, setBanner] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const cancel = async (order: Order): Promise<void> => {
    setBanner(null);
    setBusyId(order.id);
    try {
      await api.cancelOrder(order.id);
      onChanged();
      reload();
    } catch (err) {
      setBanner(err instanceof ApiError ? err.message : 'ยกเลิกไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DataState
      loading={loading}
      error={error}
      data={data}
      onRetry={reload}
      isEmpty={(orders) => orders.length === 0}
      emptyText="ยังไม่มีการจอง"
    >
      {(orders) => (
        <Body>
          {banner !== null ? <Text style={styles.banner}>{banner}</Text> : null}
          {orders.map((order) => {
            const active = order.status === 'reserved' || order.status === 'picked';
            return (
              <Card key={order.id}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>คำสั่งซื้อ #{order.id}</Text>
                  <Badge text={STATUS_LABELS[order.status] ?? order.status} fg={C.leaf} bg={C.leafSoft} />
                </View>
                <Text style={styles.cardLine}>
                  {order.is_donation ? 'บริจาค' : `${order.agreed_price_per_kg} บาท/กก.`}
                </Text>
                {active ? (
                  <View style={styles.otpBox}>
                    <Text style={styles.otpLabel}>รหัสรับของ (OTP)</Text>
                    <Text style={styles.otpValue}>{order.drop_otp}</Text>
                  </View>
                ) : null}
                {order.status === 'reserved' && order.batch_id === null ? (
                  <SecondaryButton
                    label={busyId === order.id ? 'กำลังยกเลิก…' : 'ยกเลิกการจอง'}
                    disabled={busyId === order.id}
                    onPress={() => void cancel(order)}
                  />
                ) : null}
              </Card>
            );
          })}
        </Body>
      )}
    </DataState>
  );
}

const styles = StyleSheet.create({
  banner: { color: C.chili, marginBottom: 10, fontWeight: '600' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: C.ink, flex: 1, marginRight: 8 },
  cardLine: { color: C.ink, marginBottom: 4 },
  priceText: { fontSize: 18, fontWeight: '800', color: C.leaf, marginVertical: 6 },
  donateText: { fontSize: 16, fontWeight: '800', color: C.turmeric, marginVertical: 6 },
  otpBox: { backgroundColor: C.leafSoft, borderRadius: 12, padding: 12, alignItems: 'center', marginVertical: 8 },
  otpLabel: { color: C.mute, marginBottom: 4 },
  otpValue: { fontSize: 40, fontWeight: '900', color: C.leaf, letterSpacing: 8 },
});
