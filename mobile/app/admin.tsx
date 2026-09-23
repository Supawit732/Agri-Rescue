import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../src/api/client';
import { Body, Card, Chip, DataState, Field, PrimaryButton, Screen, SecondaryButton, TopBar } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { useApiData } from '../src/hooks/useApiData';
import { C } from '../src/theme';
import type { OrgApplication } from '../src/api/types';

const QUICK_REASONS = ['ขอหนังสือรับรองฉบับล่าสุด', 'เอกสารไม่ชัด', 'ชื่อองค์กรไม่ตรงกับเอกสาร'] as const;

export default function AdminScreen(): React.ReactElement {
  const { api, logout, user } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [actingId, setActingId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [actionMode, setActionMode] = useState<{ userId: number; kind: 'reject' | 'more' } | null>(null);
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

  const submitReasoned = async (): Promise<void> => {
    if (actionMode === null) {
      return;
    }
    if (reason.trim() === '') {
      setError('กรุณาระบุเหตุผลเมื่อปฏิเสธหรือขอเอกสารเพิ่ม');
      return;
    }
    setActingId(actionMode.userId);
    setError(null);
    try {
      if (actionMode.kind === 'reject') {
        await api.rejectOrg(actionMode.userId, reason.trim());
      } else {
        await api.requestMoreOrgInfo(actionMode.userId, reason.trim());
      }
      setActionMode(null);
      setReason('');
      bump();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'บันทึกไม่สำเร็จ');
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
                    สถานะ {entry.org_status ?? 'pending'} · {entry.org_type} · ผู้รับ {entry.beneficiary_count} คน
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
                  {(entry.review_logs ?? []).length > 0 ? (
                    <>
                      <Text style={styles.historyTitle}>ประวัติการตัดสิน</Text>
                      {(entry.review_logs ?? []).map((log) => (
                        <Text key={log.id} style={styles.meta}>
                          · {log.action}
                          {log.reason ? `: ${log.reason}` : ''} ({new Date(log.created_at).toLocaleString('th-TH')})
                        </Text>
                      ))}
                    </>
                  ) : null}
                  {actionMode?.userId === entry.user_id ? (
                    <>
                      <Field
                        label={actionMode.kind === 'reject' ? 'เหตุผลที่ปฏิเสธ' : 'เหตุผลที่ขอเอกสารเพิ่ม'}
                        value={reason}
                        onChangeText={setReason}
                      />
                      <View style={styles.row}>
                        {QUICK_REASONS.map((item) => (
                          <Chip key={item} label={item} selected={reason === item} onPress={() => setReason(item)} />
                        ))}
                      </View>
                      <View style={styles.actions}>
                        <View style={styles.slot}>
                          <PrimaryButton
                            label="ยืนยัน"
                            tone={actionMode.kind === 'reject' ? 'chili' : 'turmeric'}
                            onPress={() => void submitReasoned()}
                            loading={actingId === entry.user_id}
                          />
                        </View>
                        <View style={styles.slot}>
                          <SecondaryButton
                            label="ยกเลิก"
                            onPress={() => {
                              setActionMode(null);
                              setReason('');
                            }}
                          />
                        </View>
                      </View>
                    </>
                  ) : (
                    <View style={styles.actions}>
                      {entry.org_status !== 'needs_more_info' ? (
                        <View style={styles.slot}>
                          <PrimaryButton
                            label="อนุมัติ"
                            onPress={() => void approve(entry.user_id)}
                            loading={actingId === entry.user_id}
                            disabled={actingId !== null}
                          />
                        </View>
                      ) : null}
                      <View style={styles.slot}>
                        <SecondaryButton
                          label="ขอเอกสารเพิ่ม"
                          onPress={() => {
                            setActionMode({ userId: entry.user_id, kind: 'more' });
                            setReason('');
                          }}
                          disabled={actingId !== null || entry.org_status === 'needs_more_info'}
                        />
                      </View>
                      <View style={styles.slot}>
                        <SecondaryButton
                          label="ปฏิเสธ"
                          onPress={() => {
                            setActionMode({ userId: entry.user_id, kind: 'reject' });
                            setReason('');
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
  historyTitle: { marginTop: 8, fontWeight: '700', color: C.ink },
  doc: { color: C.ink, marginTop: 2 },
  error: { color: C.chili, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, marginBottom: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  slot: { flexGrow: 1, flexBasis: '30%', minWidth: 100 },
});
