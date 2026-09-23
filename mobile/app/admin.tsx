import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../src/api/client';
import { Body, Card, DataState, Field, PrimaryButton, Screen, SecondaryButton, TopBar } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { useApiData } from '../src/hooks/useApiData';
import { C } from '../src/theme';
import type { OrgApplication } from '../src/api/types';

export default function AdminScreen(): React.ReactElement {
  const { api, logout, user } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [actingId, setActingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, loading, error: loadError, reload } = useApiData(() => api.listOrgApplications(), [api, refreshKey]);
  const bump = useCallback(() => setRefreshKey((v) => v + 1), []);

  const approve = async (userId: number): Promise<void> => {
    setActingId(userId);
    setError(null);
    try {
      await api.approveOrg(userId);
      bump();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'อนุมัติไม่สำเร็จ');
    } finally {
      setActingId(null);
    }
  };

  const reject = async (userId: number): Promise<void> => {
    if (rejectReason.trim() === '') {
      setError('กรุณาระบุเหตุผลเมื่อปฏิเสธ');
      return;
    }
    setActingId(userId);
    setError(null);
    try {
      await api.rejectOrg(userId, rejectReason.trim());
      setRejectingId(null);
      setRejectReason('');
      bump();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ปฏิเสธไม่สำเร็จ');
    } finally {
      setActingId(null);
    }
  };

  return (
    <Screen>
      <TopBar title="ผู้ดูแล" onLogout={logout} />
      <Body>
        <Text style={styles.lead}>คำขอเป็นองค์กรผู้รับบริจาค</Text>
        {user !== null ? <Text style={styles.meta}>เข้าสู่ระบบเป็น {user.name}</Text> : null}
        {error !== null ? <Text style={styles.error}>{error}</Text> : null}
        <DataState
          loading={loading}
          error={loadError}
          data={data}
          onRetry={reload}
          emptyText="ยังไม่มีคำขอรออนุมัติ"
          isEmpty={(rows) => rows.length === 0}
        >
          {(apps: OrgApplication[]) => (
            <>
              {apps.map((entry) => (
                <Card key={entry.user_id}>
                  <Text style={styles.name}>{entry.org_name}</Text>
                  <Text style={styles.meta}>
                    {entry.org_type} · ผู้รับ {entry.beneficiary_count} คน · {entry.distribution_mode}
                  </Text>
                  <Text style={styles.meta}>
                    ผู้ติดต่อ {entry.contact_name} ({entry.contact_title}) {entry.contact_phone}
                  </Text>
                  <Text style={styles.meta}>
                    ผู้สมัคร {entry.name} · {entry.phone}
                  </Text>
                  <Text style={styles.meta}>เอกสาร {entry.documents.length} ไฟล์</Text>
                  {entry.documents.map((doc) => (
                    <Text key={doc.id} style={styles.doc}>
                      · {doc.original_name} ({Math.round(doc.size_bytes / 1024)} KB)
                    </Text>
                  ))}
                  {rejectingId === entry.user_id ? (
                    <>
                      <Field label="เหตุผลที่ปฏิเสธ" value={rejectReason} onChangeText={setRejectReason} />
                      <View style={styles.actions}>
                        <View style={styles.slot}>
                          <PrimaryButton
                            label="ยืนยันปฏิเสธ"
                            tone="chili"
                            onPress={() => void reject(entry.user_id)}
                            loading={actingId === entry.user_id}
                          />
                        </View>
                        <View style={styles.slot}>
                          <SecondaryButton label="ยกเลิก" onPress={() => setRejectingId(null)} />
                        </View>
                      </View>
                    </>
                  ) : (
                    <View style={styles.actions}>
                      <View style={styles.slot}>
                        <PrimaryButton
                          label="อนุมัติ"
                          onPress={() => void approve(entry.user_id)}
                          loading={actingId === entry.user_id}
                          disabled={actingId !== null}
                        />
                      </View>
                      <View style={styles.slot}>
                        <SecondaryButton
                          label="ปฏิเสธ"
                          onPress={() => {
                            setRejectingId(entry.user_id);
                            setRejectReason('');
                          }}
                          disabled={actingId !== null}
                        />
                      </View>
                    </View>
                  )}
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
  meta: { color: C.mute, marginTop: 2, marginBottom: 2 },
  doc: { color: C.ink, marginTop: 2 },
  error: { color: C.chili, marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  slot: { flex: 1 },
});
