import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../src/api/client';
import { API_BASE_URL } from '../src/api/config';
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
import type {
  DitCrop,
  DitProductSearchHit,
  DitSyncJob,
  OrgApplication,
  OrgChecklist,
} from '../src/api/types';
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
  );
}

function DitMappingPanel(): React.ReactElement {
  const { api } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [advancedOpenId, setAdvancedOpenId] = useState<number | null>(null);
  const [unitDrafts, setUnitDrafts] = useState<Record<number, string>>({});
  const [unitErrors, setUnitErrors] = useState<Record<number, string | null>>({});
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

  const setUnitError = (cropId: number, message: string | null): void => {
    setUnitErrors((prev) => ({ ...prev, [cropId]: message }));
  };

  const confirmProduct = async (
    crop: DitCrop,
    product: { product_code: string; product_name: string; unit: string },
  ): Promise<void> => {
    const needsFactor = product.unit !== 'กก.' && product.unit !== 'unknown';
    const unitRaw = unitDraftFor(crop).trim();
    const unit_to_kg = unitRaw === '' ? undefined : Number(unitRaw);
    if (needsFactor && (unit_to_kg === undefined || !(unit_to_kg > 0))) {
      setUnitError(crop.id, `หน่วยของ ${product.product_name} เป็น ${product.unit} — กรุณาระบุตัวแปลงเป็น กก.`);
      return;
    }
    if (unit_to_kg !== undefined && !(unit_to_kg > 0)) {
      setUnitError(crop.id, 'ตัวแปลงหน่วยต้องเป็นจำนวนบวก');
      return;
    }
    setBusyKey(`map-${crop.id}-${product.product_code}`);
    setError(null);
    setUnitError(crop.id, null);
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
      setUnitError(crop.id, 'ระบุตัวแปลงเป็นจำนวนกก. ต่อ 1 หน่วยต้นทาง');
      return;
    }
    const unit_to_kg = Number(unitRaw);
    if (!(unit_to_kg > 0)) {
      setUnitError(crop.id, 'ตัวแปลงหน่วยต้องเป็นจำนวนบวก');
      return;
    }
    setBusyKey(`unit-${crop.id}`);
    setError(null);
    setUnitError(crop.id, null);
    setBanner(null);
    try {
      await api.setDitUnitFactor(crop.id, { unit_to_kg });
      const base = unitBaseFromDit(crop.dit_unit);
      setBanner(`บันทึกตัวแปลง ${crop.name_th}: 1 ${base} = ${unit_to_kg} กก.`);
      bump();
      reload();
    } catch (err) {
      if (err instanceof ApiError) {
        const fieldMsg = err.fields?.unit_to_kg;
        if (fieldMsg !== undefined) {
          setUnitError(crop.id, fieldMsg);
        } else {
          setError(err.message);
        }
      } else {
        setError('บันทึกตัวแปลงไม่สำเร็จ');
      }
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
                            onChangeText={(text) => {
                              setUnitDrafts((prev) => ({ ...prev, [crop.id]: text }));
                              setUnitError(crop.id, null);
                            }}
                            keyboardType="numeric"
                            placeholder={
                              crop.dit_unit !== null && !crop.dit_unit.includes('กก')
                                ? `เช่น 0.5 ถ้า 1 ${unitBaseFromDit(crop.dit_unit)} = 0.5 กก.`
                                : 'เว้นว่างถ้าเป็นบาท/กก.'
                            }
                            error={unitErrors[crop.id] ?? null}
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
  section: { marginTop: 10, fontWeight: '700', color: C.ink },
  historyTitle: { marginTop: 8, fontWeight: '700', color: C.ink },
  docLink: { color: C.leaf, marginTop: 2, textDecorationLine: 'underline' },
  error: { color: C.chili, marginBottom: 8 },
  banner: { color: C.leaf, marginBottom: 8, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, marginBottom: 4, gap: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  slot: { flexGrow: 1, flexBasis: '30%', minWidth: 100 },
  slotWide: { marginTop: 8 },
  suggestionBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.mute,
  },
});
