import { useCallback, useEffect, useRef, useState } from 'react';
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
import type { DitCrop, DitProductSearchHit, DitSyncJob, OrgApplication } from '../src/api/types';

const QUICK_REASONS = ['ขอหนังสือรับรองฉบับล่าสุด', 'เอกสารไม่ชัด', 'ชื่อองค์กรไม่ตรงกับเอกสาร'] as const;

/** "บาท/หวี" → "หวี" for conversion labels. */
function unitBaseFromDit(unit: string | null): string {
  if (unit === null || unit.trim() === '') {
    return 'หน่วย';
  }
  const slash = unit.indexOf('/');
  return slash >= 0 ? unit.slice(slash + 1).trim() || unit : unit.trim();
}

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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [advancedOpenId, setAdvancedOpenId] = useState<number | null>(null);
  const [unitDrafts, setUnitDrafts] = useState<Record<number, string>>({});
  const [searchQueries, setSearchQueries] = useState<Record<number, string>>({});
  const [searchHits, setSearchHits] = useState<Record<number, DitProductSearchHit[]>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [syncJob, setSyncJob] = useState<DitSyncJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data, loading, error: loadError, reload } = useApiData(() => api.listDitCrops(), [api, refreshKey]);
  const bump = useCallback(() => setRefreshKey((v) => v + 1), []);

  useEffect(() => {
    if (data?.sync_job !== undefined) {
      setSyncJob(data.sync_job);
    }
  }, [data?.sync_job]);

  useEffect(() => {
    return () => {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current);
      }
    };
  }, []);

  const stopPoll = (): void => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPoll = (): void => {
    stopPoll();
    pollRef.current = setInterval(() => {
      void (async () => {
        try {
          const job = await api.getDitSyncStatus();
          setSyncJob(job);
          if (job.status === 'done' || job.status === 'error') {
            stopPoll();
            setBusyKey(null);
            if (job.status === 'done') {
              setBanner(
                `ดึงราคาเสร็จ: จับคู่ ${job.matched} · บันทึก ${job.saved}/${job.total}` +
                  (job.outliers > 0 ? ` · ราคาเพี้ยน ${job.outliers}` : ''),
              );
            } else {
              setError(job.message ?? 'ดึงราคาไม่สำเร็จ');
            }
            bump();
            reload();
          }
        } catch {
          // keep polling
        }
      })();
    }, 1500);
  };

  const unitDraftFor = (crop: DitCrop): string => {
    if (unitDrafts[crop.id] !== undefined) {
      return unitDrafts[crop.id]!;
    }
    return crop.dit_unit_to_kg !== null ? String(crop.dit_unit_to_kg) : '';
  };

  const confirmProduct = async (
    crop: DitCrop,
    product: { product_code: string; product_name: string; unit: string },
  ): Promise<void> => {
    const needsFactor = product.unit !== 'กก.' && product.unit !== 'unknown';
    const unitRaw = unitDraftFor(crop).trim();
    const unit_to_kg = unitRaw === '' ? undefined : Number(unitRaw);
    if (needsFactor && (unit_to_kg === undefined || !(unit_to_kg > 0))) {
      setError(`หน่วยของ ${product.product_name} เป็น ${product.unit} — กรุณาระบุตัวแปลงเป็น กก.`);
      return;
    }
    if (unit_to_kg !== undefined && !(unit_to_kg > 0)) {
      setError('ตัวแปลงหน่วยต้องเป็นจำนวนบวก');
      return;
    }
    setBusyKey(`map-${crop.id}-${product.product_code}`);
    setError(null);
    setBanner(null);
    try {
      await api.mapDitCrop(crop.id, {
        product_code: product.product_code,
        ...(unit_to_kg !== undefined ? { unit_to_kg } : {}),
      });
      setBanner(`แก้คู่ ${crop.name_th} → ${product.product_code} (manual)`);
      setSearchHits((prev) => ({ ...prev, [crop.id]: [] }));
      setEditingId(null);
      bump();
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'แก้คู่ไม่สำเร็จ');
    } finally {
      setBusyKey(null);
    }
  };

  const searchProducts = async (crop: DitCrop): Promise<void> => {
    const q = (searchQueries[crop.id] ?? '').trim();
    if (q === '') {
      setError('พิมพ์ชื่อสินค้าเพื่อค้นหา');
      return;
    }
    setBusyKey(`search-${crop.id}`);
    setError(null);
    try {
      const hits = await api.searchDitProducts(q);
      setSearchHits((prev) => ({ ...prev, [crop.id]: hits }));
      setBanner(hits.length === 0 ? `ไม่พบสินค้าที่ตรงกับ “${q}”` : `พบ ${hits.length} รายการ`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ค้นหาสินค้าไม่สำเร็จ');
    } finally {
      setBusyKey(null);
    }
  };

  const fetchPricesNow = async (): Promise<void> => {
    setBusyKey('sync-prices');
    setError(null);
    setBanner(null);
    try {
      const res = await api.syncDitPrices();
      setSyncJob(res.job);
      setBanner('เริ่มดึงราคาเบื้องหลังแล้ว…');
      if (res.job.status === 'running') {
        startPoll();
      } else {
        setBusyKey(null);
        bump();
        reload();
      }
    } catch (err) {
      setBusyKey(null);
      setError(err instanceof ApiError ? err.message : 'ดึงราคาไม่สำเร็จ');
    }
  };

  const saveUnitFactor = async (crop: DitCrop): Promise<void> => {
    if (crop.dit_product_code === null) {
      setError('ยังไม่มีรหัสสินค้า — จับคู่ก่อนแล้วค่อยใส่ตัวแปลง');
      return;
    }
    const unitRaw = unitDraftFor(crop).trim();
    if (unitRaw === '') {
      setError('ระบุตัวแปลงเป็นจำนวนกก. ต่อ 1 หน่วยต้นทาง');
      return;
    }
    const unit_to_kg = Number(unitRaw);
    if (!(unit_to_kg > 0)) {
      setError('ตัวแปลงหน่วยต้องเป็นจำนวนบวก');
      return;
    }
    setBusyKey(`unit-${crop.id}`);
    setError(null);
    setBanner(null);
    try {
      await api.setDitUnitFactor(crop.id, { unit_to_kg });
      const base = unitBaseFromDit(crop.dit_unit);
      setBanner(`บันทึกตัวแปลง ${crop.name_th}: 1 ${base} = ${unit_to_kg} กก.`);
      bump();
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'บันทึกตัวแปลงไม่สำเร็จ');
    } finally {
      setBusyKey(null);
    }
  };

  const syncLabel =
    syncJob === null
      ? null
      : syncJob.status === 'running'
        ? `กำลังดึงราคา ${syncJob.done}/${syncJob.total || '…'}`
        : syncJob.status === 'done'
          ? `ดึงล่าสุดเสร็จ · บันทึก ${syncJob.saved}`
          : syncJob.status === 'error'
            ? `ดึงราคาล้มเหลว: ${syncJob.message ?? ''}`
            : null;

  const auto = data?.automation;
  const statusBar =
    auto !== undefined && auto.last_auto_hm !== null
      ? `อัปเดตอัตโนมัติล่าสุด ${auto.last_auto_hm} · สำเร็จ ${auto.success_label}` +
        (auto.next_retry_hm !== null ? ` · ลองใหม่ครั้งถัดไป ${auto.next_retry_hm}` : '')
      : 'รออัปเดตอัตโนมัติหลังเปิดเซิร์ฟเวอร์…';

  return (
    <Body>
      <Text style={styles.lead}>ราคา DIT / MOC</Text>
      <Text style={styles.banner}>{statusBar}</Text>
      {auto?.message !== null && auto?.message !== undefined ? (
        <Text style={styles.meta}>{auto.message}</Text>
      ) : null}
      {syncLabel !== null ? <Text style={styles.meta}>{syncLabel}</Text> : null}
      {banner !== null ? <Text style={styles.banner}>{banner}</Text> : null}
      {error !== null ? <Text style={styles.error}>{error}</Text> : null}
      <DataState
        loading={loading}
        error={loadError}
        data={data?.crops ?? null}
        onRetry={reload}
        emptyText="ยังไม่มีพืชในระบบ"
        isEmpty={(rows) => rows.length === 0}
      >
        {(crops: DitCrop[]) => (
          <>
            {crops.map((crop) => {
              const editing = editingId === crop.id;
              const hits = searchHits[crop.id] ?? [];
              const matchLabel =
                crop.dit_match_source === 'auto'
                  ? 'auto'
                  : crop.dit_match_source === 'manual'
                    ? 'manual'
                    : 'ยังไม่จับคู่';
              const advancedOpen = editingId === crop.id || advancedOpenId === crop.id;
              return (
                <Card key={crop.id}>
                  <Text style={styles.name}>{crop.name_th}</Text>
                  <Text style={styles.meta}>
                    รหัส {crop.dit_product_code ?? '—'} · {matchLabel}
                    {crop.dit_unit !== null ? ` · ${crop.dit_unit}` : ''}
                  </Text>
                  {crop.dit_product_name !== null ? (
                    <Text style={styles.meta}>สินค้า: {crop.dit_product_name}</Text>
                  ) : null}
                  <Text style={styles.meta}>ราคาตลาดในระบบ {crop.market_price_per_kg} บาท/กก.</Text>
                  {crop.latest_ref_price !== null && !crop.latest_ref_price.rejected_as_outlier ? (
                    <>
                      <Text style={styles.meta}>
                        ราคาอ้างอิง {crop.latest_ref_price.wholesale_price}
                        {crop.latest_ref_price.unit !== null ? ` ${crop.latest_ref_price.unit}` : ''}
                        {' · '}
                        {crop.latest_ref_price.date}
                      </Text>
                      {crop.latest_ref_price.fetched_at !== null ? (
                        <Text style={styles.meta}>ดึงเมื่อ {crop.latest_ref_price.fetched_at}</Text>
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.meta}>
                      ยังไม่มีราคาใช้ได้ —{' '}
                      {crop.dit_price_status ?? 'ใช้ราคาประมาณ'}
                    </Text>
                  )}
                  {crop.dit_price_status !== null && crop.latest_ref_price !== null ? (
                    <Text style={styles.error}>{crop.dit_price_status}</Text>
                  ) : null}
                  {crop.latest_ref_price?.rejected_as_outlier ? (
                    <Text style={styles.error}>flag: ราคาเพี้ยน — ไม่ใช้ประเมิน</Text>
                  ) : null}
                  <View style={styles.actions}>
                    <View style={styles.slot}>
                      <SecondaryButton
                        label={advancedOpen ? 'ซ่อนขั้นสูง' : 'ขั้นสูง'}
                        disabled={busyKey !== null && !advancedOpen}
                        onPress={() => {
                          setAdvancedOpenId(advancedOpen ? null : crop.id);
                          if (advancedOpen) {
                            setEditingId(null);
                          }
                          setError(null);
                        }}
                      />
                    </View>
                  </View>
                  {advancedOpen ? (
                    <>
                      <Text style={styles.historyTitle}>ขั้นสูง</Text>
                      {crop.dit_product_code !== null ? (
                        <>
                          <Text style={styles.meta}>
                            หน่วยต้นทางจาก DIT:{' '}
                            {crop.dit_unit !== null ? crop.dit_unit : 'ยังไม่ทราบ (รอราคา)'}
                          </Text>
                          <Field
                            label={
                              crop.dit_unit !== null && !crop.dit_unit.includes('กก')
                                ? `1 ${unitBaseFromDit(crop.dit_unit)} = กี่ กก.?`
                                : 'ตัวแปลงเป็น กก. (ถ้าหน่วยไม่ใช่ กก.)'
                            }
                            value={unitDraftFor(crop)}
                            onChangeText={(text) => setUnitDrafts((prev) => ({ ...prev, [crop.id]: text }))}
                            keyboardType="numeric"
                            placeholder={
                              crop.dit_unit !== null && !crop.dit_unit.includes('กก')
                                ? `เช่น 0.5 ถ้า 1 ${unitBaseFromDit(crop.dit_unit)} = 0.5 กก.`
                                : 'เว้นว่างถ้าเป็นบาท/กก.'
                            }
                          />
                          <View style={styles.actions}>
                            <View style={styles.slot}>
                              <PrimaryButton
                                label="บันทึกตัวแปลงหน่วย"
                                loading={busyKey === `unit-${crop.id}`}
                                disabled={busyKey !== null}
                                onPress={() => void saveUnitFactor(crop)}
                              />
                            </View>
                          </View>
                          {crop.dit_unit_to_kg !== null ? (
                            <Text style={styles.meta}>
                              ใช้ตอนนี้: 1 {unitBaseFromDit(crop.dit_unit)} = {crop.dit_unit_to_kg} กก.
                            </Text>
                          ) : null}
                        </>
                      ) : null}
                      <View style={styles.actions}>
                        <View style={styles.slot}>
                          <PrimaryButton
                            label="ดึงราคาตอนนี้"
                            loading={busyKey === 'sync-prices' || syncJob?.status === 'running'}
                            disabled={busyKey !== null && busyKey !== 'sync-prices'}
                            onPress={() => void fetchPricesNow()}
                          />
                        </View>
                        <View style={styles.slot}>
                          <SecondaryButton
                            label={editing ? 'ปิดการแก้คู่' : 'แก้คู่'}
                            disabled={busyKey !== null}
                            onPress={() => {
                              setEditingId(editing ? null : crop.id);
                              setError(null);
                            }}
                          />
                        </View>
                      </View>
                      {editing ? (
                        <>
                          <Field
                            label="ค้นหาสินค้าด้วยชื่อ"
                            value={searchQueries[crop.id] ?? ''}
                            onChangeText={(text) => setSearchQueries((prev) => ({ ...prev, [crop.id]: text }))}
                            placeholder={`เช่น ${crop.name_th}`}
                          />
                          <View style={styles.actions}>
                            <View style={styles.slot}>
                              <SecondaryButton
                                label="ค้นหา"
                                disabled={busyKey !== null}
                                onPress={() => void searchProducts(crop)}
                              />
                            </View>
                          </View>
                          {hits.map((hit) => (
                            <View key={hit.product_id} style={styles.suggestionBox}>
                              <Text style={styles.name}>{hit.product_name}</Text>
                              <Text style={styles.meta}>
                                {hit.product_id} · หน่วย {hit.unit}
                                {hit.sell_type !== null ? ` · ${hit.sell_type}` : ''}
                              </Text>
                              <View style={styles.actions}>
                                <View style={styles.slot}>
                                  <PrimaryButton
                                    label="บันทึกคู่ (manual)"
                                    loading={busyKey === `map-${crop.id}-${hit.product_id}`}
                                    disabled={busyKey !== null}
                                    onPress={() =>
                                      void confirmProduct(crop, {
                                        product_code: hit.product_id,
                                        product_name: hit.product_name,
                                        unit: hit.unit,
                                      })
                                    }
                                  />
                                </View>
                              </View>
                            </View>
                          ))}
                        </>
                      ) : null}
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
