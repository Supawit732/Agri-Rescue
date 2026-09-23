import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../src/api/client';
import {
  Body,
  Card,
  Chip,
  DataState,
  Field,
  PrimaryButton,
  Screen,
  SecondaryButton,
  Segmented,
  TopBar,
} from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { useApiData } from '../src/hooks/useApiData';
import { C } from '../src/theme';
import type { DitCrop, DitSuggestion, OrgApplication } from '../src/api/types';

const QUICK_REASONS = ['ขอหนังสือรับรองฉบับล่าสุด', 'เอกสารไม่ชัด', 'ชื่อองค์กรไม่ตรงกับเอกสาร'] as const;

export default function AdminScreen(): React.ReactElement {
  const { logout, user } = useAuth();
  const [tab, setTab] = useState<'orgs' | 'dit'>('orgs');

  return (
    <Screen>
      <TopBar title="ผู้ดูแล" onLogout={logout} />
      <Segmented
        options={[
          { key: 'orgs', label: 'คำขอองค์กร' },
          { key: 'dit', label: 'จับคู่ราคา DIT' },
        ]}
        value={tab}
        onChange={(key) => setTab(key as 'orgs' | 'dit')}
      />
      {user !== null ? <Text style={styles.metaPad}>เข้าสู่ระบบเป็น {user.name}</Text> : null}
      {tab === 'orgs' ? <OrgApplicationsPanel /> : <DitMappingPanel />}
    </Screen>
  );
}

function OrgApplicationsPanel(): React.ReactElement {
  const { api } = useAuth();
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
    <Body>
      <Text style={styles.lead}>คำขอเป็นองค์กรผู้รับบริจาค</Text>
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
  );
}

function DitMappingPanel(): React.ReactElement {
  const { api } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [drafts, setDrafts] = useState<Record<number, { product_code: string; unit_to_kg: string }>>({});
  const [suggestions, setSuggestions] = useState<Record<number, DitSuggestion[]>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const { data, loading, error: loadError, reload } = useApiData(() => api.listDitCrops(), [api, refreshKey]);
  const bump = useCallback(() => setRefreshKey((v) => v + 1), []);

  const draftFor = (crop: DitCrop): { product_code: string; unit_to_kg: string } => {
    const existing = drafts[crop.id];
    if (existing !== undefined) {
      return existing;
    }
    return {
      product_code: crop.dit_product_code ?? '',
      unit_to_kg: crop.dit_unit_to_kg !== null ? String(crop.dit_unit_to_kg) : '',
    };
  };

  const setDraft = (cropId: number, patch: Partial<{ product_code: string; unit_to_kg: string }>): void => {
    setDrafts((prev) => {
      const crop = data?.find((entry) => entry.id === cropId);
      const base =
        prev[cropId] ??
        (crop !== undefined
          ? {
              product_code: crop.dit_product_code ?? '',
              unit_to_kg: crop.dit_unit_to_kg !== null ? String(crop.dit_unit_to_kg) : '',
            }
          : { product_code: '', unit_to_kg: '' });
      return { ...prev, [cropId]: { ...base, ...patch } };
    });
  };

  const saveMapping = async (crop: DitCrop): Promise<void> => {
    const draft = draftFor(crop);
    if (draft.product_code.trim() === '') {
      setError('กรุณาระบุรหัสสินค้า DIT');
      return;
    }
    setBusyKey(`map-${crop.id}`);
    setError(null);
    setBanner(null);
    try {
      const unitRaw = draft.unit_to_kg.trim();
      const unit_to_kg = unitRaw === '' ? undefined : Number(unitRaw);
      if (unit_to_kg !== undefined && !(unit_to_kg > 0)) {
        setError('ตัวแปลงหน่วยต้องเป็นจำนวนบวก');
        return;
      }
      await api.mapDitCrop(crop.id, {
        product_code: draft.product_code.trim(),
        ...(unit_to_kg !== undefined ? { unit_to_kg } : {}),
      });
      setBanner(`บันทึกการจับคู่ ${crop.name_th} แล้ว`);
      bump();
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'บันทึกการจับคู่ไม่สำเร็จ');
    } finally {
      setBusyKey(null);
    }
  };

  const suggest = async (crop: DitCrop): Promise<void> => {
    setBusyKey(`suggest-${crop.id}`);
    setError(null);
    setBanner(null);
    try {
      const rows = await api.suggestDit(crop.id);
      setSuggestions((prev) => ({ ...prev, [crop.id]: rows }));
      setBanner(
        rows.length === 0
          ? `ไม่พบคำแนะนำสำหรับ ${crop.name_th}`
          : `ได้คำแนะนำ ${rows.length} รายการสำหรับ ${crop.name_th}`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ขอคำแนะนำไม่สำเร็จ');
    } finally {
      setBusyKey(null);
    }
  };

  const accept = async (suggestion: DitSuggestion): Promise<void> => {
    setBusyKey(`accept-${suggestion.id}`);
    setError(null);
    setBanner(null);
    try {
      await api.acceptDitSuggestion(suggestion.id);
      setSuggestions((prev) => ({
        ...prev,
        [suggestion.crop_id]: (prev[suggestion.crop_id] ?? []).filter((row) => row.id !== suggestion.id),
      }));
      setBanner(`ยอมรับรหัส ${suggestion.product_code} แล้ว`);
      bump();
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ยอมรับคำแนะนำไม่สำเร็จ');
    } finally {
      setBusyKey(null);
    }
  };

  const reject = async (suggestion: DitSuggestion): Promise<void> => {
    setBusyKey(`reject-${suggestion.id}`);
    setError(null);
    setBanner(null);
    try {
      await api.rejectDitSuggestion(suggestion.id);
      setSuggestions((prev) => ({
        ...prev,
        [suggestion.crop_id]: (prev[suggestion.crop_id] ?? []).filter((row) => row.id !== suggestion.id),
      }));
      setBanner(`ปฏิเสธรหัส ${suggestion.product_code} แล้ว`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ปฏิเสธคำแนะนำไม่สำเร็จ');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <Body>
      <Text style={styles.lead}>จับคู่รหัสสินค้า DIT / MOC</Text>
      <Text style={styles.meta}>กำหนด product_code และตัวแปลงหน่วย (ถ้าไม่ใช่บาท/กก.)</Text>
      {banner !== null ? <Text style={styles.banner}>{banner}</Text> : null}
      {error !== null ? <Text style={styles.error}>{error}</Text> : null}
      <DataState
        loading={loading}
        error={loadError}
        data={data}
        onRetry={reload}
        emptyText="ยังไม่มีพืชในระบบ"
        isEmpty={(rows) => rows.length === 0}
      >
        {(crops: DitCrop[]) => (
          <>
            {crops.map((crop) => {
              const draft = draftFor(crop);
              const cropSuggestions = suggestions[crop.id] ?? [];
              return (
                <Card key={crop.id}>
                  <Text style={styles.name}>{crop.name_th}</Text>
                  <Text style={styles.meta}>ราคาตลาดในระบบ {crop.market_price_per_kg} บาท/กก.</Text>
                  <Text style={styles.meta}>
                    รหัสปัจจุบัน {crop.dit_product_code ?? '—'}
                    {crop.dit_unit !== null ? ` · หน่วย ${crop.dit_unit}` : ''}
                    {crop.dit_unit_to_kg !== null ? ` · แปลง ${crop.dit_unit_to_kg}` : ''}
                  </Text>
                  {crop.latest_ref_price !== null ? (
                    <Text style={styles.meta}>
                      อ้างอิงล่าสุด {crop.latest_ref_price.date}: {crop.latest_ref_price.wholesale_price}
                      {crop.latest_ref_price.unit !== null ? ` ${crop.latest_ref_price.unit}` : ''}
                    </Text>
                  ) : (
                    <Text style={styles.meta}>ยังไม่มีราคาอ้างอิงจาก DIT</Text>
                  )}
                  <Field
                    label="รหัสสินค้า DIT"
                    value={draft.product_code}
                    onChangeText={(text) => setDraft(crop.id, { product_code: text })}
                    placeholder="เช่น W01001"
                  />
                  <Field
                    label="ตัวแปลงเป็น กก. (ถ้าจำเป็น)"
                    value={draft.unit_to_kg}
                    onChangeText={(text) => setDraft(crop.id, { unit_to_kg: text })}
                    keyboardType="numeric"
                    placeholder="เว้นว่างถ้าเป็นบาท/กก."
                  />
                  <View style={styles.actions}>
                    <View style={styles.slot}>
                      <PrimaryButton
                        label="บันทึกการจับคู่"
                        loading={busyKey === `map-${crop.id}`}
                        disabled={busyKey !== null}
                        onPress={() => void saveMapping(crop)}
                      />
                    </View>
                    <View style={styles.slot}>
                      <SecondaryButton
                        label="แนะนำรหัส"
                        disabled={busyKey !== null}
                        onPress={() => void suggest(crop)}
                      />
                    </View>
                  </View>
                  {cropSuggestions.length > 0 ? (
                    <>
                      <Text style={styles.historyTitle}>คำแนะนำ</Text>
                      {cropSuggestions.map((suggestion) => (
                        <View key={suggestion.id} style={styles.suggestionBox}>
                          <Text style={styles.meta}>
                            {suggestion.product_code} · {suggestion.product_name} ({suggestion.sell_type})
                          </Text>
                          <View style={styles.actions}>
                            <View style={styles.slot}>
                              <PrimaryButton
                                label="ยอมรับ"
                                loading={busyKey === `accept-${suggestion.id}`}
                                disabled={busyKey !== null}
                                onPress={() => void accept(suggestion)}
                              />
                            </View>
                            <View style={styles.slot}>
                              <SecondaryButton
                                label="ปฏิเสธ"
                                disabled={busyKey !== null}
                                onPress={() => void reject(suggestion)}
                              />
                            </View>
                          </View>
                        </View>
                      ))}
                    </>
                  ) : null}
                </Card>
              );
            })}
          </>
        )}
      </DataState>
    </Body>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 18, fontWeight: '800', color: C.ink, marginBottom: 4 },
  name: { fontSize: 16, fontWeight: '700', color: C.ink },
  meta: { color: C.mute, marginTop: 2, marginBottom: 2 },
  metaPad: { color: C.mute, marginHorizontal: 16, marginBottom: 4 },
  historyTitle: { marginTop: 8, fontWeight: '700', color: C.ink },
  doc: { color: C.ink, marginTop: 2 },
  error: { color: C.chili, marginBottom: 8 },
  banner: { color: C.leaf, marginBottom: 8, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, marginBottom: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  slot: { flexGrow: 1, flexBasis: '30%', minWidth: 100 },
  suggestionBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.mute,
  },
});
