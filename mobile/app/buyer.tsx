import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
import type { MarketLot, Order, SaleMode, User } from '../src/api/types';

const SALE_MODE_BADGE: Record<SaleMode, string> = {
  sell: 'ขาย',
  donate: 'บริจาค',
  sell_then_donate: 'ขายแล้วเปิดบริจาค',
};

function remainingOf(lot: MarketLot): number {
  return lot.remaining_kg ?? lot.weight_kg;
}

function minOrderOf(lot: MarketLot): number {
  return lot.min_order_kg ?? 1;
}

function stepOf(lot: MarketLot): number {
  return lot.order_step_kg ?? 1;
}

function splitAllowedOf(lot: MarketLot): boolean {
  return lot.split_allowed !== false;
}

function defaultQuantity(lot: MarketLot): number {
  const remaining = remainingOf(lot);
  if (!splitAllowedOf(lot)) {
    return remaining;
  }
  const min = minOrderOf(lot);
  if (remaining + 1e-6 < min) {
    return remaining;
  }
  return Math.min(remaining, min);
}

function roundQty(kg: number): number {
  return Math.round(kg * 1000) / 1000;
}

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

function donationEligibility(
  user: User | null,
  lot: MarketLot,
  quantityKg: number,
): { canDonate: boolean; badge: string | null; reason: string | null } {
  const acceptsDonation =
    lot.sale_mode === 'donate' || (lot.sale_mode === 'sell_then_donate' && lot.donation_opened);
  if (!acceptsDonation) {
    return { canDonate: false, badge: null, reason: null };
  }
  if (user === null) {
    return { canDonate: false, badge: 'บริจาคเฉพาะองค์กร', reason: 'ต้องเข้าสู่ระบบ' };
  }
  if (user.donation_suspended) {
    return { canDonate: false, badge: 'บริจาคเฉพาะองค์กร', reason: 'สิทธิ์รับบริจาคถูกระงับ' };
  }
  if (user.org_status === 'pending') {
    return { canDonate: false, badge: 'บริจาคเฉพาะองค์กร', reason: 'รอการอนุมัติองค์กร' };
  }
  if (user.org_status === 'needs_more_info') {
    return { canDonate: false, badge: 'บริจาคเฉพาะองค์กร', reason: 'ต้องส่งเอกสารเพิ่มก่อนขอรับบริจาค' };
  }
  if (user.org_status === 'rejected') {
    return { canDonate: false, badge: 'บริจาคเฉพาะองค์กร', reason: 'คำขอองค์กรถูกปฏิเสธ' };
  }
  if (user.donor_tier === null) {
    return { canDonate: false, badge: 'บริจาคเฉพาะองค์กร', reason: 'ยังไม่ได้ลงทะเบียนผู้รับบริจาค' };
  }
  if (lot.donation_audience === 'verified_org_only' && user.donor_tier !== 'verified_org') {
    return { canDonate: false, badge: 'บริจาคเฉพาะองค์กร', reason: 'ล็อตนี้เปิดรับเฉพาะองค์กรที่ยืนยันแล้ว' };
  }
  if (
    user.donation_remaining_kg !== null &&
    user.donation_remaining_kg !== undefined &&
    quantityKg > user.donation_remaining_kg
  ) {
    return {
      canDonate: false,
      badge: 'บริจาคเฉพาะองค์กร',
      reason: `เกินเพดานสัปดาห์นี้ (คงเหลือ ${user.donation_remaining_kg} กก.)`,
    };
  }
  return { canDonate: true, badge: 'รับบริจาคได้', reason: null };
}

function Market({ refreshKey, onBooked }: { refreshKey: number; onBooked: () => void }): React.ReactElement {
  const { api, user, refreshUser } = useAuth();
  const lat = user?.lat ?? 13.65;
  const lng = user?.lng ?? 100.62;
  const needsPlace =
    user?.donor_tier === 'volunteer' ||
    user?.donor_tier === 'trusted_volunteer' ||
    user?.distribution_mode === 'redistribute';
  const { data, loading, error, reload } = useApiData(() => api.getMarket(lat, lng, 15), [refreshKey, lat, lng]);
  const now = useNow();
  const [banner, setBanner] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{ lot: MarketLot; donation: boolean } | null>(null);
  const [quantityKg, setQuantityKg] = useState(1);
  const [quantityError, setQuantityError] = useState<string | null>(null);

  useEffect(() => {
    if (confirm === null) {
      return;
    }
    setQuantityKg(defaultQuantity(confirm.lot));
    setQuantityError(null);
  }, [confirm]);

  const adjustQuantity = (deltaSteps: number): void => {
    if (confirm === null) {
      return;
    }
    const lot = confirm.lot;
    const remaining = remainingOf(lot);
    const step = stepOf(lot);
    const min = minOrderOf(lot);
    if (!splitAllowedOf(lot) || remaining + 1e-6 < min) {
      setQuantityKg(remaining);
      setQuantityError(null);
      return;
    }
    const next = roundQty(quantityKg + deltaSteps * step);
    if (next + 1e-6 < min) {
      setQuantityKg(min);
    } else if (next - remaining > 1e-6) {
      setQuantityKg(remaining);
    } else {
      setQuantityKg(next);
    }
    setQuantityError(null);
  };

  const book = async (lot: MarketLot, donation: boolean): Promise<void> => {
    setBanner(null);
    setQuantityError(null);
    setBusyId(lot.id);
    try {
      const extras =
        donation && needsPlace
          ? {
              distribution_place: 'จุดรับ/แจกที่ระบุโดยผู้รับ',
              distribution_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            }
          : undefined;
      await api.createOrder(lot.id, donation, quantityKg, extras);
      setConfirm(null);
      await refreshUser();
      onBooked();
      reload();
    } catch (err) {
      if (err instanceof ApiError && err.fields?.quantity_kg !== undefined) {
        setQuantityError(err.fields.quantity_kg);
      }
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
          {confirm !== null ? (
            <Card>
              <Text style={styles.confirmTitle}>ยืนยันก่อนจอง</Text>
              <Text style={styles.cardLine}>
                {confirm.lot.crop_name_th} · เหลือ {remainingOf(confirm.lot)} / {confirm.lot.weight_kg} กก. · โดย{' '}
                {confirm.lot.farmer_name}
              </Text>
              <Text style={styles.cardLine}>ขั้นต่ำ {minOrderOf(confirm.lot)} กก.</Text>
              <Text style={styles.confirmKind}>
                {confirm.donation
                  ? 'ประเภท: ขอรับบริจาค (ไม่คิดเงิน)'
                  : `ประเภท: ซื้อ ${confirm.lot.price_per_kg ?? '—'} บาท/กก.`}
              </Text>
              <Text style={styles.qtyLabel}>จำนวน (กก.)</Text>
              <View style={styles.stepper}>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => adjustQuantity(-1)}
                  disabled={!splitAllowedOf(confirm.lot)}
                >
                  <Text style={styles.stepBtnText}>−</Text>
                </Pressable>
                <Text style={styles.qtyValue}>{quantityKg}</Text>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => adjustQuantity(1)}
                  disabled={!splitAllowedOf(confirm.lot)}
                >
                  <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
              </View>
              {quantityError !== null ? <Text style={styles.fieldError}>{quantityError}</Text> : null}
              {!confirm.donation && confirm.lot.price_per_kg !== null ? (
                <Text style={styles.totalPrice}>
                  รวมประมาณ {Math.round(confirm.lot.price_per_kg * quantityKg)} บาท
                </Text>
              ) : null}
              <View style={styles.actions}>
                <View style={styles.slot}>
                  <PrimaryButton
                    label={confirm.donation ? 'ยืนยันขอรับบริจาค' : 'ยืนยันซื้อ'}
                    tone={confirm.donation ? 'turmeric' : undefined}
                    loading={busyId === confirm.lot.id}
                    onPress={() => void book(confirm.lot, confirm.donation)}
                  />
                </View>
                <View style={styles.slot}>
                  <SecondaryButton label="ยกเลิก" onPress={() => setConfirm(null)} />
                </View>
              </View>
            </Card>
          ) : null}
          {lots.map((lot) => {
            const hours = hoursLeftFrom(lot.expires_at, now);
            const tone = urgency(hours);
            const remaining = remainingOf(lot);
            const elig = donationEligibility(user, lot, remaining);
            const canBuy = lot.sale_mode !== 'donate' && lot.price_per_kg !== null && remaining > 0;
            const saleBadge =
              lot.sale_mode === 'sell_then_donate' && lot.donation_opened
                ? 'ขายแล้วเปิดบริจาค'
                : SALE_MODE_BADGE[lot.sale_mode] ?? lot.sale_mode;
            return (
              <Card key={lot.id}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>
                    {lot.crop_name_th} · เหลือ {remaining} / {lot.weight_kg} กก.
                  </Text>
                  <Badge text={formatCountdown(hours)} fg={tone.fg} bg={tone.bg} />
                </View>
                <View style={styles.badgeRow}>
                  <Badge
                    text={saleBadge}
                    fg={lot.sale_mode === 'donate' ? C.turmeric : C.leaf}
                    bg={lot.sale_mode === 'donate' ? C.turmericSoft : C.leafSoft}
                  />
                  {elig.badge !== null ? (
                    <Badge
                      text={elig.badge}
                      fg={elig.canDonate ? C.turmeric : C.mute}
                      bg={elig.canDonate ? C.turmericSoft : C.leafSoft}
                    />
                  ) : null}
                </View>
                <Text style={styles.cardLine}>โดย {lot.farmer_name}</Text>
                <Text style={styles.cardLine}>
                  ระยะ {lot.distance_km.toFixed(1)} กม. · {lot.grade === 'substandard' ? 'ตกเกรด' : 'ปกติ'}
                  {splitAllowedOf(lot) ? ` · ขั้นต่ำ ${minOrderOf(lot)} กก.` : ' · ขายยกล็อต'}
                </Text>
                {!elig.canDonate && elig.reason !== null ? (
                  <Text style={styles.reason}>{elig.reason}</Text>
                ) : null}
                <View style={styles.actions}>
                  {canBuy ? (
                    <View style={styles.slot}>
                      <PrimaryButton
                        label={`ซื้อ ${lot.price_per_kg} บาท/กก.`}
                        loading={busyId === lot.id}
                        onPress={() => setConfirm({ lot, donation: false })}
                      />
                    </View>
                  ) : null}
                  {elig.canDonate && remaining > 0 ? (
                    <View style={styles.slot}>
                      <PrimaryButton
                        label="ขอรับบริจาค"
                        tone="turmeric"
                        loading={busyId === lot.id}
                        onPress={() => setConfirm({ lot, donation: true })}
                      />
                    </View>
                  ) : null}
                </View>
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
                  {order.is_donation ? 'รับบริจาค' : `ซื้อ ${order.agreed_price_per_kg} บาท/กก.`}
                  {order.quantity_kg !== undefined ? ` · ${order.quantity_kg} กก.` : ''}
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
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  cardLine: { color: C.ink, marginBottom: 4 },
  reason: { color: C.chili, marginTop: 6, marginBottom: 4 },
  confirmTitle: { fontSize: 18, fontWeight: '800', color: C.ink, marginBottom: 6 },
  confirmKind: { fontSize: 15, fontWeight: '700', color: C.leaf, marginVertical: 8 },
  qtyLabel: { color: C.mute, marginTop: 4, marginBottom: 6 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 6 },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.leafSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: 22, fontWeight: '800', color: C.leaf },
  qtyValue: { fontSize: 22, fontWeight: '800', color: C.ink, minWidth: 48, textAlign: 'center' },
  fieldError: { color: C.chili, marginBottom: 6 },
  totalPrice: { fontSize: 15, fontWeight: '700', color: C.ink, marginBottom: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  slot: { flexGrow: 1, flexBasis: '45%', minWidth: 140 },
  otpBox: { backgroundColor: C.leafSoft, borderRadius: 12, padding: 12, alignItems: 'center', marginVertical: 8 },
  otpLabel: { color: C.mute, marginBottom: 4 },
  otpValue: { fontSize: 40, fontWeight: '900', color: C.leaf, letterSpacing: 8 },
});
