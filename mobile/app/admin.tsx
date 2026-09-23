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
import type { DitCrop, DitLiveSuggestion, DitProductSearchHit, OrgApplication } from '../src/api/types';

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
  const [unitDrafts, setUnitDrafts] = useState<Record<number, string>>({});
  const [searchQueries, setSearchQueries] = useState<Record<number, string>>({});
  const [searchHits, setSearchHits] = useState<Record<number, DitProductSearchHit[]>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const { data, loading, error: loadError, reload } = useApiData(() => api.listDitCrops(), [api, refreshKey]);
  const bump = useCallback(() => setRefreshKey((v) => v + 1), []);

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
      setBanner(`ยืนยัน ${crop.name_th} → ${product.product_code} แล้ว`);
      setSearchHits((prev) => ({ ...prev, [crop.id]: [] }));
      bump();
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ยืนยันการจับคู่ไม่สำเร็จ');
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
    setBanner(null);
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

  const refreshCatalog = async (): Promise<void> => {
    setBusyKey('refresh-catalog');
    setError(null);
    setBanner(null);
    try {
      const res = await api.refreshDitProducts();
      setBanner(`อัปเดตรายการสินค้า ${res.count} รายการ`);
      bump();
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ดึงรายการสินค้าไม่สำเร็จ');
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
      setBanner(
        res.skipped ? 'ข้ามการดึงราคา (โหมดทดสอบ)' : `ดึงราคาอ้างอิงแล้ว ${res.synced} พืช`,
      );
      bump();
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ดึงราคาไม่สำเร็จ');
    } finally {
      setBusyKey(null);
    }
  };

  const renderSuggestion = (crop: DitCrop, suggestion: DitLiveSuggestion): React.ReactElement => {
    const priceLabel =
      suggestion.latest_price !== null
        ? `ราคาล่าสุด ${suggestion.latest_price}${suggestion.price_unit !== null ? ` ${suggestion.price_unit}` : ''}${suggestion.price_date !== null ? ` (${suggestion.price_date})` : ''}`
        : 'ยังไม่มีราคาล่าสุด';
    return (
      <View key={suggestion.product_code} style={styles.suggestionBox}>
        <Text style={styles.name}>{suggestion.product_name}</Text>
        <Text style={styles.meta}>
          {suggestion.product_code} · หน่วย {suggestion.unit}
          {suggestion.sell_type !== null ? ` · ${suggestion.sell_type}` : ''}
        </Text>
        <Text style={styles.meta}>{priceLabel}</Text>
        <View style={styles.actions}>
          <View style={styles.slot}>
            <PrimaryButton
              label="ยืนยัน"
              loading={busyKey === `map-${crop.id}-${suggestion.product_code}`}
              disabled={busyKey !== null}
              onPress={() =>
                void confirmProduct(crop, {
                  product_code: suggestion.product_code,
                  product_name: suggestion.product_name,
                  unit: suggestion.unit,
                })
              }
            />
          </View>
        </View>
      </View>
    );
  };

  return (
    <Body>
      <Text style={styles.lead}>จับคู่รหัสสินค้า DIT / MOC</Text>
      <Text style={styles.meta}>ระบบแนะนำ 3 อันดับแรกต่อพืช — กดยืนยันได้ทันที หรือค้นหาด้วยชื่อ</Text>
      {data !== null ? (
        <Text style={styles.meta}>
          แคตตาล็อก {data.products_from_cache ? 'จากแคช' : 'เพิ่งดึง'} · {data.products_fetched_at}
        </Text>
      ) : null}
      {banner !== null ? <Text style={styles.banner}>{banner}</Text> : null}
      {error !== null ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <View style={styles.slot}>
          <PrimaryButton
            label="ดึงราคาตอนนี้"
            loading={busyKey === 'sync-prices'}
            disabled={busyKey !== null}
            onPress={() => void fetchPricesNow()}
          />
        </View>
        <View style={styles.slot}>
          <SecondaryButton
            label="รีเฟรชรายการสินค้า"
            disabled={busyKey !== null}
            onPress={() => void refreshCatalog()}
          />
        </View>
      </View>
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
              const hits = searchHits[crop.id] ?? [];
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
                    label="ตัวแปลงเป็น กก. (ถ้าหน่วยไม่ใช่ กก.)"
                    value={unitDraftFor(crop)}
                    onChangeText={(text) => setUnitDrafts((prev) => ({ ...prev, [crop.id]: text }))}
                    keyboardType="numeric"
                    placeholder="เว้นว่างถ้าเป็นบาท/กก."
                  />
                  <Text style={styles.historyTitle}>แนะนำอัตโนมัติ</Text>
                  {crop.suggestions.length === 0 ? (
                    <Text style={styles.meta}>ไม่พบรายการแนะนำ — ลองค้นหาด้วยชื่อ</Text>
                  ) : (
                    crop.suggestions.map((suggestion) => renderSuggestion(crop, suggestion))
                  )}
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
                            label="ยืนยัน"
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
