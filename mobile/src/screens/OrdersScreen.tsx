import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../api/client';
import type { Order } from '../api/types';
import {
  Badge,
  Body,
  Card,
  DataState,
  EmptyState,
  LoginPrompt,
  Screen,
  SecondaryButton,
} from '../components/ui';
import { STATUS_LABELS } from '../constants';
import { useAuth } from '../context/AuthContext';
import { useApiData } from '../hooks/useApiData';
import { C } from '../theme';

export default function OrdersScreen(): React.ReactElement {
  const { user } = useAuth();
  const router = useRouter();

  if (user === null) {
    return (
      <Screen>
        <LoginPrompt
          title="คำสั่งซื้อ"
          message="เข้าสู่ระบบเพื่อดูและจัดการการจองของคุณ"
          returnTo="/(tabs)/orders"
        />
      </Screen>
    );
  }

  if (!user.can_buy) {
    return (
      <Screen>
        <EmptyState
          message="ยังไม่ได้เปิดการซื้อ — ไปที่บัญชีเพื่อเปิดสิทธิ์ซื้อ"
          ctaLabel="ไปที่บัญชี"
          onCta={() => router.push('/(tabs)/account')}
        />
      </Screen>
    );
  }

  return <OrdersList />;
}

function OrdersList(): React.ReactElement {
  const { api } = useAuth();
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = useCallback(() => setRefreshKey((v) => v + 1), []);
  const { data, loading, error, reload } = useApiData(() => api.getMyOrders(), [refreshKey]);
  const [banner, setBanner] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const cancel = async (order: Order): Promise<void> => {
    setBanner(null);
    setBusyId(order.id);
    try {
      await api.cancelOrder(order.id);
      bump();
      reload();
    } catch (err) {
      setBanner(err instanceof ApiError ? err.message : 'ยกเลิกไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen>
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
            {orders.length === 0 ? (
              <EmptyState
                message="ยังไม่มีการจอง"
                ctaLabel="ไปตลาด"
                onCta={() => router.push('/(tabs)')}
              />
            ) : null}
            {orders.map((order) => {
              const qty = order.quantity_kg ?? 0;
              const total =
                order.total ??
                (order.is_donation ? 0 : Math.round((order.agreed_price_per_kg * qty) * 100) / 100);
              return (
                <Pressable
                  key={order.id}
                  onPress={() =>
                    router.push({ pathname: '/orders/[id]', params: { id: String(order.id) } })
                  }
                >
                  <Card>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>
                        {order.crop_name_th ?? `ล็อต #${order.lot_id}`}
                        {qty > 0 ? ` · ${qty} กก.` : ''}
                      </Text>
                      <Badge text={STATUS_LABELS[order.status] ?? order.status} fg={C.leaf} bg={C.leafSoft} />
                    </View>
                    <Text style={styles.meta}>คำสั่งซื้อ #{order.id}</Text>
                    <Text style={styles.cardLine}>
                      {order.is_donation
                        ? 'รับบริจาค — ไม่คิดเงิน'
                        : `รวม ${total} บาท (${order.agreed_price_per_kg} บาท/กก.)`}
                    </Text>
                    {order.status === 'reserved' && order.batch_id === null ? (
                      <SecondaryButton
                        label={busyId === order.id ? 'กำลังยกเลิก…' : 'ยกเลิกการจอง'}
                        disabled={busyId === order.id}
                        onPress={() => void cancel(order)}
                      />
                    ) : null}
                  </Card>
                </Pressable>
              );
            })}
          </Body>
        )}
      </DataState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { color: C.chili, marginBottom: 10, fontWeight: '600' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: C.ink, flex: 1, marginRight: 8 },
  meta: { color: C.mute, fontSize: 12, marginBottom: 4 },
  cardLine: { color: C.ink, marginBottom: 4 },
});
