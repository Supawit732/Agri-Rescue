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
import { useAuth } from '../context/AuthContext';
import { useApiData } from '../hooks/useApiData';
import { formatCountdown, hoursLeftFrom, useNow } from '../hooks/useNow';
import { formatTemplate, useI18n } from '../i18n';
import { C } from '../theme';

export default function OrdersScreen(): React.ReactElement {
  const { user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  if (user === null) {
    return (
      <Screen>
        <LoginPrompt
          title={t.orders.title}
          message={t.orders.loginMessage}
          returnTo="/(tabs)/orders"
        />
      </Screen>
    );
  }

  if (!user.can_buy) {
    return (
      <Screen>
        <EmptyState
          message={t.orders.enableBuy}
          ctaLabel={t.orders.goAccount}
          onCta={() => router.push('/(tabs)/account')}
        />
      </Screen>
    );
  }

  return <OrdersList />;
}

function OrdersList(): React.ReactElement {
  const { api } = useAuth();
  const { t, formatNumber, cropName, translateError } = useI18n();
  const router = useRouter();
  const now = useNow();
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
      setBanner(
        err instanceof ApiError
          ? translateError(err.code, err.message)
          : t.orders.cancelFailed,
      );
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
        emptyText={t.orders.empty}
      >
        {(orders) => (
          <Body>
            {banner !== null ? <Text style={styles.banner}>{banner}</Text> : null}
            {orders.length === 0 ? (
              <EmptyState
                message={t.orders.empty}
                ctaLabel={t.orders.goMarket}
                onCta={() => router.push('/(tabs)')}
              />
            ) : null}
            {orders.map((order) => {
              const qty = order.quantity_kg ?? 0;
              const total =
                order.total ??
                (order.is_donation ? 0 : Math.round((order.agreed_price_per_kg * qty) * 100) / 100);
              const title =
                order.crop_name_th !== undefined
                  ? cropName({ name_th: order.crop_name_th, name_en: order.crop_name_en })
                  : formatTemplate(t.orders.lotFallback, { id: order.lot_id });
              const hours =
                order.expires_at !== undefined ? hoursLeftFrom(order.expires_at, now) : null;
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
                        {title}
                        {qty > 0 ? ` · ${formatNumber(qty)} ${t.common.kg}` : ''}
                      </Text>
                      <Badge text={t.status[order.status] ?? order.status} fg={C.leaf} bg={C.leafSoft} />
                    </View>
                    <Text style={styles.meta}>
                      {formatTemplate(t.orders.orderMeta, { id: order.id })}
                      {hours !== null ? ` · ${formatCountdown(hours, t.countdown)}` : ''}
                    </Text>
                    <Text style={styles.cardLine}>
                      {order.is_donation
                        ? t.orders.donationNoCharge
                        : formatTemplate(t.orders.totalLine, {
                            total: formatNumber(total),
                            price: formatNumber(order.agreed_price_per_kg),
                          })}
                    </Text>
                    {order.status === 'reserved' && order.batch_id === null ? (
                      <SecondaryButton
                        label={busyId === order.id ? t.orders.cancelling : t.orders.cancel}
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
