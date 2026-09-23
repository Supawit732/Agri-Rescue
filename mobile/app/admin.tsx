import { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../src/api/client';
import { API_BASE_URL } from '../src/api/config';
import { Body, Card, Chip, DataState, Field, PrimaryButton, Screen, SecondaryButton, TopBar } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { useApiData } from '../src/hooks/useApiData';
import { C } from '../src/theme';
import type { OrgApplication, OrgChecklist } from '../src/api/types';
import { loadToken } from '../src/api/storage';

const QUICK_REASONS = ['ขอหนังสือรับรองฉบับล่าสุด', 'เอกสารไม่ชัด', 'ชื่อองค์กรไม่ตรงกับเอกสาร'] as const;

const REQUESTABLE_FIELDS: { key: string; label: string }[] = [
  { key: 'org_name', label: 'ชื่อองค์กร' },
  { key: 'org_type', label: 'ประเภทองค์กร' },
  { key: 'registered_address', label: 'ที่อยู่ตามทะเบียน' },
  { key: 'contact_name', label: 'ชื่อผู้ติดต่อ' },
  { key: 'contact_phone', label: 'เบอร์โทร' },
  { key: 'contact_email', label: 'อีเมล' },
  { key: 'beneficiary_count', label: 'จำนวนผู้รับ' },
  { key: 'documents', label: 'เอกสาร' },
  { key: 'purpose_th', label: 'วัตถุประสงค์' },
];

const DOC_LABELS: Record<string, string> = {
  registration_cert: 'หนังสือรับรองจดทะเบียน',
  community_cert: 'หนังสือรับรองชุมชน',
  site_photo: 'รูปสถานที่',
  other: 'อื่น ๆ',
};

export default function AdminScreen(): React.ReactElement {
  const { api, logout, user } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [actingId, setActingId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [actionMode, setActionMode] = useState<{ userId: number; kind: 'reject' | 'more' } | null>(null);
  const [requestedFields, setRequestedFields] = useState<string[]>([]);
  const [checklists, setChecklists] = useState<Record<number, OrgChecklist>>({});
  const [error, setError] = useState<string | null>(null);

  const { data, loading, error: loadError, reload } = useApiData(() => api.listOrgApplications(), [api, refreshKey]);
  const bump = useCallback(() => setRefreshKey((v) => v + 1), []);

  const openDoc = async (docId: number): Promise<void> => {
    const token = await loadToken();
    try {
      const res = await fetch(`${API_BASE_URL}/api/donors/admin/org-docs/${docId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        setError('เปิดเอกสารไม่สำเร็จ');
        return;
      }
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        await Linking.openURL(objectUrl);
        return;
      }
      setError('เปิดเอกสารได้บนเว็บ — ดาวน์โหลดผ่าน API /api/donors/admin/org-docs/' + docId);
    } catch {
      setError('เปิดเอกสารไม่สำเร็จ');
    }
  };

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

  const saveChecklist = async (userId: number): Promise<void> => {
    const checklist = checklists[userId] ?? {
      name_matches_docs: false,
      location_matches_photos: false,
      docs_not_expired: false,
    };
    setActingId(userId);
    setError(null);
    try {
      await api.saveOrgChecklist(userId, checklist);
      bump();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'บันทึก checklist ไม่สำเร็จ');
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
        await api.requestMoreOrgInfo(actionMode.userId, reason.trim(), requestedFields);
      }
      setActionMode(null);
      setReason('');
      setRequestedFields([]);
      bump();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setActingId(null);
    }
  };

  const toggleCheck = (userId: number, key: keyof OrgChecklist): void => {
    setChecklists((prev) => {
      const current = prev[userId] ?? {
        name_matches_docs: false,
        location_matches_photos: false,
        docs_not_expired: false,
      };
      return { ...prev, [userId]: { ...current, [key]: !current[key] } };
    });
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
              {apps.map((entry) => {
                const checklist = checklists[entry.user_id] ??
                  (entry.checklist as OrgChecklist | null) ?? {
                    name_matches_docs: false,
                    location_matches_photos: false,
                    docs_not_expired: false,
                  };
                const byCat = entry.documents_by_category ?? {};
                return (
                  <Card key={entry.user_id}>
                    <Text style={styles.name}>{entry.org_name ?? entry.contact_name ?? entry.name}</Text>
                    <Text style={styles.meta}>
                      สถานะ {entry.org_status ?? 'pending'} · {entry.application_kind ?? '-'} · {entry.org_type ?? '-'}
                    </Text>
                    <Text style={styles.meta}>
                      ผู้สมัคร {entry.name} · {entry.phone}
                    </Text>

                    <Text style={styles.section}>หมวดองค์กร / บุคคล</Text>
                    {entry.sections?.organization ? (
                      <Text style={styles.meta}>
                        ชื่อ {String(entry.sections.organization.org_name ?? '-')} · จดทะเบียน{' '}
                        {entry.sections.organization.registered === true
                          ? 'ใช่'
                          : entry.sections.organization.registered === false
                            ? 'ไม่'
                            : '-'}
                      </Text>
                    ) : null}
                    {entry.sections?.individual ? (
                      <Text style={styles.meta}>
                        บุคคล {String(entry.sections.individual.contact_name ?? '-')} · วัตถุประสงค์{' '}
                        {String(entry.sections.individual.purpose_th ?? '-')}
                      </Text>
                    ) : null}

                    <Text style={styles.section}>ผู้ติดต่อ</Text>
                    <Text style={styles.meta}>
                      {entry.contact_name} ({entry.contact_title ?? '-'}) {entry.contact_phone}
                      {entry.contact_email ? ` · ${entry.contact_email}` : ''}
                    </Text>

                    <Text style={styles.section}>ผู้รับประโยชน์</Text>
                    <Text style={styles.meta}>
                      จำนวน {entry.beneficiary_count ?? '-'} · รูปแบบ {entry.distribution_mode ?? '-'}
                    </Text>

                    <Text style={styles.section}>เอกสารตามประเภท</Text>
                    {Object.keys(DOC_LABELS).map((cat) => {
                      const docs = byCat[cat] ?? entry.documents.filter((d) => (d.doc_category ?? 'other') === cat);
                      if (docs.length === 0) {
                        return null;
                      }
                      return (
                        <View key={cat}>
                          <Text style={styles.meta}>{DOC_LABELS[cat]}</Text>
                          {docs.map((doc) => (
                            <Pressable key={doc.id} onPress={() => void openDoc(doc.id)}>
                              <Text style={styles.docLink}>
                                · {doc.original_name} ({Math.round(doc.size_bytes / 1024)} KB) — เปิด
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      );
                    })}

                    <Text style={styles.section}>Checklist การตรวจ</Text>
                    {(
                      [
                        ['name_matches_docs', 'ชื่อตรงเอกสาร'],
                        ['location_matches_photos', 'ที่ตั้งตรงรูปสถานที่'],
                        ['docs_not_expired', 'เอกสารยังไม่หมดอายุ'],
                      ] as const
                    ).map(([key, label]) => (
                      <Chip
                        key={key}
                        label={label}
                        selected={checklist[key]}
                        onPress={() => toggleCheck(entry.user_id, key)}
                      />
                    ))}
                    <View style={styles.slotWide}>
                      <SecondaryButton
                        label="บันทึก checklist"
                        onPress={() => void saveChecklist(entry.user_id)}
                        disabled={actingId !== null}
                      />
                    </View>

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
                        {actionMode.kind === 'more' ? (
                          <>
                            <Text style={styles.section}>ช่องที่ต้องแก้</Text>
                            <View style={styles.row}>
                              {REQUESTABLE_FIELDS.map((f) => (
                                <Chip
                                  key={f.key}
                                  label={f.label}
                                  selected={requestedFields.includes(f.key)}
                                  onPress={() => {
                                    setRequestedFields((prev) =>
                                      prev.includes(f.key) ? prev.filter((x) => x !== f.key) : [...prev, f.key],
                                    );
                                  }}
                                />
                              ))}
                            </View>
                          </>
                        ) : null}
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
                                setRequestedFields([]);
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
                            label="ขอข้อมูลเพิ่ม"
                            onPress={() => {
                              setActionMode({ userId: entry.user_id, kind: 'more' });
                              setReason('');
                              setRequestedFields([]);
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
                );
              })}
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
  section: { marginTop: 10, fontWeight: '700', color: C.ink },
  historyTitle: { marginTop: 8, fontWeight: '700', color: C.ink },
  docLink: { color: C.leaf, marginTop: 2, textDecorationLine: 'underline' },
  error: { color: C.chili, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, marginBottom: 4, gap: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  slot: { flexGrow: 1, flexBasis: '30%', minWidth: 100 },
  slotWide: { marginTop: 8 },
});
