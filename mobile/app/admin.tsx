import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../src/api/client';
import {
  Body,
  Card,
  DataState,
  PrimaryButton,
  Screen,
  SecondaryButton,
  TopBar,
} from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { useApiData } from '../src/hooks/useApiData';
import { C } from '../src/theme';
import type { CharityRequest } from '../src/api/types';

export default function AdminScreen(): React.ReactElement {
  const { api, logout, user } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [actingId, setActingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, loading, error, reload } = useApiData(() => api.listCharityRequests(), [api, refreshKey]);

  const bump = useCallback(() => setRefreshKey((value) => value + 1), []);

  const approve = async (userId: number): Promise<void> => {
    setActingId(userId);
    setActionError(null);
    try {
      await api.approveCharity(userId);
      bump();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'อนุมัติไม่สำเร็จ');
    } finally {
      setActingId(null);
    }
  };

  const reject = async (userId: number): Promise<void> => {
    setActingId(userId);
    setActionError(null);
    try {
      await api.rejectCharity(userId);
      bump();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'ปฏิเสธไม่สำเร็จ');
    } finally {
      setActingId(null);
    }
  };

  return (
    <Screen>
      <TopBar title="ผู้ดูแล" onLogout={logout} />
      <Body>
        <Text style={styles.lead}>คำขอเป็นผู้ซื้อประเภทสงเคราะห์</Text>
        {user !== null ? <Text style={styles.meta}>เข้าสู่ระบบเป็น {user.name}</Text> : null}
        {actionError !== null ? <Text style={styles.error}>{actionError}</Text> : null}
        <DataState
          loading={loading}
          error={error}
          data={data}
          onRetry={reload}
          emptyText="ยังไม่มีคำขอรออนุมัติ"
          isEmpty={(rows) => rows.length === 0}
        >
          {(requests: CharityRequest[]) => (
            <>
              {requests.map((entry) => (
                <Card key={entry.user_id}>
                  <Text style={styles.name}>{entry.name}</Text>
                  <Text style={styles.phone}>{entry.phone}</Text>
                  <Text style={styles.meta}>
                    ขอเมื่อ {new Date(entry.created_at).toLocaleString('th-TH')}
                  </Text>
                  <View style={styles.actions}>
                    <View style={styles.actionSlot}>
                      <PrimaryButton
                        label="อนุมัติ"
                        onPress={() => {
                          void approve(entry.user_id);
                        }}
                        loading={actingId === entry.user_id}
                        disabled={actingId !== null}
                      />
                    </View>
                    <View style={styles.actionSlot}>
                      <SecondaryButton
                        label="ปฏิเสธ"
                        onPress={() => {
                          void reject(entry.user_id);
                        }}
                        disabled={actingId !== null}
                      />
                    </View>
                  </View>
                </Card>
              ))}
            </>
          )}
        </DataState>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 18, fontWeight: '800', color: C.ink, marginBottom: 4 },
  name: { fontSize: 16, fontWeight: '700', color: C.ink },
  phone: { color: C.ink, marginTop: 2 },
  meta: { color: C.mute, marginBottom: 8, marginTop: 2 },
  error: { color: C.chili, marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  actionSlot: { flex: 1 },
});
