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
  StackHeader,
} from '../src/components/ui';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { isDitKgUnit } from '../src/dit/units';
import { useApiData } from '../src/hooks/useApiData';
import {
  labelApplicationKind,
  labelDistributionMode,
  labelOrgStatus,
  labelOrgType,
  labelReviewAction,
} from '../src/donorLabels';
import { formatTemplate, useI18n, type Messages } from '../src/i18n';
import { C } from '../src/theme';
import type {
  DitCrop,
  DitProductSearchHit,
  DitSyncJob,
  OrgApplication,
  OrgChecklist,
} from '../src/api/types';
import { loadToken } from '../src/api/storage';

function quickReasons(t: Messages): string[] {
  return [t.admin.quickReasonLatestCert, t.admin.quickReasonUnclear, t.admin.quickReasonNameMismatch];
}

function requestableFields(t: Messages): { key: string; label: string }[] {
  return [
    { key: 'org_name', label: t.admin.fieldOrgName },
    { key: 'org_type', label: t.admin.fieldOrgType },
    { key: 'registered_address', label: t.admin.fieldRegisteredAddress },
    { key: 'contact_name', label: t.admin.fieldContactName },
    { key: 'contact_phone', label: t.admin.fieldContactPhone },
    { key: 'contact_email', label: t.admin.fieldContactEmail },
    { key: 'beneficiary_count', label: t.admin.fieldBeneficiaryCount },
    { key: 'documents', label: t.admin.fieldDocuments },
    { key: 'purpose_th', label: t.admin.fieldPurpose },
  ];
}

function docLabels(t: Messages): Record<string, string> {
  return {
    registration_cert: t.admin.docRegistrationCert,
    community_cert: t.admin.docCommunityCert,
    site_photo: t.admin.docSitePhoto,
    other: t.admin.docOther,
  };
}

/** "บาท/หวี" → "หวี" for conversion labels. */
function unitBaseFromDit(unit: string | null, fallback: string): string {
  if (unit === null || unit.trim() === '') {
    return fallback;
  }
  const slash = unit.indexOf('/');
  return slash >= 0 ? unit.slice(slash + 1).trim() || unit : unit.trim();
}

export default function AdminScreen(): React.ReactElement {
  const { user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState<'orgs' | 'dit'>('orgs');

  return (
    <Screen>
      <StackHeader title={t.admin.title} onBack={() => router.replace('/profile')} />
      <Segmented
        options={[
          { key: 'orgs', label: t.admin.tabOrgs },
          { key: 'dit', label: t.admin.tabDit },
        ]}
        value={tab}
        onChange={(key) => setTab(key as 'orgs' | 'dit')}
      />
      {user !== null ? (
        <Text style={styles.metaPad}>{formatTemplate(t.admin.loggedInAs, { name: user.name })}</Text>
      ) : null}
      {tab === 'orgs' ? <OrgApplicationsPanel /> : <DitMappingPanel />}
    </Screen>
  );
}

function OrgApplicationsPanel(): React.ReactElement {
  const { api } = useAuth();
  const { t, formatDateTime } = useI18n();
  const reasons = quickReasons(t);
  const fields = requestableFields(t);
  const docsByCat = docLabels(t);
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
        setError(t.admin.openDocFailed);
        return;
      }
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        await Linking.openURL(objectUrl);
        return;
      }
      setError(`${t.admin.openDocWebOnly} /api/donors/admin/org-docs/${docId}`);
    } catch {
      setError(t.admin.openDocFailed);
    }
  };

  const approve = async (userId: number): Promise<void> => {
    setActingId(userId);
    setError(null);
    try {
      await api.approveOrg(userId);
      bump();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.admin.approveFailed);
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
      setError(err instanceof ApiError ? err.message : t.admin.checklistFailed);
    } finally {
      setActingId(null);
    }
  };

  const submitReasoned = async (): Promise<void> => {
    if (actionMode === null) {
      return;
    }
    if (reason.trim() === '') {
      setError(t.admin.needReason);
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
      setError(err instanceof ApiError ? err.message : t.admin.saveFailed);
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
      <Text style={styles.lead}>{t.admin.orgsLead}</Text>
      {error !== null ? <Text style={styles.error}>{error}</Text> : null}
      <DataState
        loading={loading}
        error={loadError}
        data={data}
        onRetry={reload}
        emptyText={t.admin.emptyOrgs}
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
                    {formatTemplate(t.admin.statusMeta, {
                      status: labelOrgStatus(entry.org_status ?? 'pending', t),
                      kind: labelApplicationKind(entry.application_kind ?? null, t),
                      orgType: labelOrgType(entry.org_type, t),
                    })}
                  </Text>
                  <Text style={styles.meta}>
                    {formatTemplate(t.admin.applicant, { name: entry.name, phone: entry.phone })}
                  </Text>

                  <Text style={styles.section}>{t.admin.sectionOrgIndividual}</Text>
                  {entry.sections?.organization ? (
                    <Text style={styles.meta}>
                      {formatTemplate(t.admin.orgNameRegistered, {
                        name: String(entry.sections.organization.org_name ?? t.common.dash),
                        registered:
                          entry.sections.organization.registered === true
                            ? t.admin.registeredYes
                            : entry.sections.organization.registered === false
                              ? t.admin.registeredNo
                              : t.common.dash,
                      })}
                    </Text>
                  ) : null}
                  {entry.sections?.individual ? (
                    <Text style={styles.meta}>
                      {formatTemplate(t.admin.individualLine, {
                        name: String(entry.sections.individual.contact_name ?? t.common.dash),
                        purpose: String(entry.sections.individual.purpose_th ?? t.common.dash),
                      })}
                    </Text>
                  ) : null}

                  <Text style={styles.section}>{t.admin.sectionContact}</Text>
                  <Text style={styles.meta}>
                    {entry.contact_name} ({entry.contact_title ?? '-'}) {entry.contact_phone}
                    {entry.contact_email ? ` · ${entry.contact_email}` : ''}
                  </Text>

                  <Text style={styles.section}>{t.admin.sectionBeneficiaries}</Text>
                  <Text style={styles.meta}>
                    {formatTemplate(t.admin.beneficiariesLine, {
                      count: entry.beneficiary_count ?? t.common.dash,
                      mode: labelDistributionMode(entry.distribution_mode, t),
                    })}
                  </Text>

                  <Text style={styles.section}>{t.admin.sectionDocsByCategory}</Text>
                  {Object.keys(docsByCat).map((cat) => {
                    const docs = byCat[cat] ?? entry.documents.filter((d) => (d.doc_category ?? 'other') === cat);
                    if (docs.length === 0) {
                      return null;
                    }
                    return (
                      <View key={cat}>
                        <Text style={styles.meta}>{docsByCat[cat]}</Text>
                        {docs.map((doc) => (
                          <Pressable key={doc.id} onPress={() => void openDoc(doc.id)}>
                            <Text style={styles.docLink}>
                              {formatTemplate(t.admin.docOpen, {
                                name: doc.original_name,
                                kb: Math.round(doc.size_bytes / 1024),
                              })}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    );
                  })}

                  <Text style={styles.section}>{t.admin.sectionChecklist}</Text>
                  {(
                    [
                      ['name_matches_docs', t.admin.checklistName],
                      ['location_matches_photos', t.admin.checklistLocation],
                      ['docs_not_expired', t.admin.checklistDocs],
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
                      label={t.admin.saveChecklist}
                      onPress={() => void saveChecklist(entry.user_id)}
                      disabled={actingId !== null}
                    />
                  </View>

                  {(entry.review_logs ?? []).length > 0 ? (
                    <>
                      <Text style={styles.historyTitle}>{t.admin.historyTitle}</Text>
                      {(entry.review_logs ?? []).map((log) => (
                        <Text key={log.id} style={styles.meta}>
                          · {labelReviewAction(log.action, t)}
                          {log.reason ? `: ${log.reason}` : ''} ({formatDateTime(log.created_at)})
                        </Text>
                      ))}
                    </>
                  ) : null}

                  {actionMode?.userId === entry.user_id ? (
                    <>
                      <Field
                        label={actionMode.kind === 'reject' ? t.admin.reasonReject : t.admin.reasonMoreInfo}
                        value={reason}
                        onChangeText={setReason}
                      />
                      <View style={styles.row}>
                        {reasons.map((item) => (
                          <Chip key={item} label={item} selected={reason === item} onPress={() => setReason(item)} />
                        ))}
                      </View>
                      {actionMode.kind === 'more' ? (
                        <>
                          <Text style={styles.section}>{t.admin.fieldsToFix}</Text>
                          <View style={styles.row}>
                            {fields.map((f) => (
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
                            label={t.admin.confirm}
                            tone={actionMode.kind === 'reject' ? 'chili' : 'turmeric'}
                            onPress={() => void submitReasoned()}
                            loading={actingId === entry.user_id}
                          />
                        </View>
                        <View style={styles.slot}>
                          <SecondaryButton
                            label={t.admin.cancel}
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
                            label={t.admin.approve}
                            onPress={() => void approve(entry.user_id)}
                            loading={actingId === entry.user_id}
                            disabled={actingId !== null}
                          />
                        </View>
                      ) : null}
                      <View style={styles.slot}>
                        <SecondaryButton
                          label={t.admin.requestMoreInfo}
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
                          label={t.admin.reject}
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
  const { t, cropName, formatNumber } = useI18n();
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
                formatTemplate(t.admin.fetchDone, {
                  matched: job.matched,
                  saved: job.saved,
                  total: job.total,
                }) +
                  (job.outliers > 0
                    ? formatTemplate(t.admin.fetchDoneOutliers, { outliers: job.outliers })
                    : ''),
              );
            } else {
              setError(job.message ?? t.admin.fetchPriceFailed);
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
    const needsFactor = !isDitKgUnit(product.unit) && product.unit !== 'unknown';
    const unitRaw = unitDraftFor(crop).trim();
    const unit_to_kg = unitRaw === '' ? undefined : Number(unitRaw);
    if (needsFactor && (unit_to_kg === undefined || !(unit_to_kg > 0))) {
      setUnitError(crop.id, formatTemplate(t.admin.unitNeedsFactor, { product: product.product_name, unit: product.unit }));
      return;
    }
    if (unit_to_kg !== undefined && !(unit_to_kg > 0)) {
      setUnitError(crop.id, t.admin.unitFactorPositive);
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
      setBanner(formatTemplate(t.admin.remapped, { crop: cropName(crop), code: product.product_code }));
      setSearchHits((prev) => ({ ...prev, [crop.id]: [] }));
      setEditingId(null);
      bump();
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.admin.remapFailed);
    } finally {
      setBusyKey(null);
    }
  };

  const searchProducts = async (crop: DitCrop): Promise<void> => {
    const q = (searchQueries[crop.id] ?? '').trim();
    if (q === '') {
      setError(t.admin.searchHint);
      return;
    }
    setBusyKey(`search-${crop.id}`);
    setError(null);
    try {
      const hits = await api.searchDitProducts(q);
      setSearchHits((prev) => ({ ...prev, [crop.id]: hits }));
      setBanner(hits.length === 0 ? formatTemplate(t.admin.searchNone, { q }) : formatTemplate(t.admin.searchFound, { count: hits.length }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.admin.searchFailed);
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
      setBanner(t.admin.fetchStarted);
      if (res.job.status === 'running') {
        startPoll();
      } else {
        setBusyKey(null);
        bump();
        reload();
      }
    } catch (err) {
      setBusyKey(null);
      setError(err instanceof ApiError ? err.message : t.admin.fetchPriceFailed);
    }
  };

  const saveUnitFactor = async (crop: DitCrop): Promise<void> => {
    if (crop.dit_product_code === null) {
      setError(t.admin.needProductCode);
      return;
    }
    const unitRaw = unitDraftFor(crop).trim();
    if (unitRaw === '') {
      setUnitError(crop.id, t.admin.unitFactorRequired);
      return;
    }
    const unit_to_kg = Number(unitRaw);
    if (!(unit_to_kg > 0)) {
      setUnitError(crop.id, t.admin.unitFactorPositive);
      return;
    }
    setBusyKey(`unit-${crop.id}`);
    setError(null);
    setUnitError(crop.id, null);
    setBanner(null);
    try {
      await api.setDitUnitFactor(crop.id, { unit_to_kg });
      const base = unitBaseFromDit(crop.dit_unit, t.admin.unitFallback);
      setBanner(formatTemplate(t.admin.factorSaved, { crop: cropName(crop), base, kg: unit_to_kg }));
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
        setError(t.admin.saveFactorFailed);
      }
    } finally {
      setBusyKey(null);
    }
  };

  const syncLabel =
    syncJob === null
      ? null
      : syncJob.status === 'running'
        ? formatTemplate(t.admin.syncRunning, {
            done: syncJob.done,
            total: syncJob.total || '…',
          })
        : syncJob.status === 'done'
          ? formatTemplate(t.admin.syncDone, { saved: syncJob.saved })
          : syncJob.status === 'error'
            ? formatTemplate(t.admin.syncFailed, { message: syncJob.message ?? '' })
            : null;

  const auto = data?.automation;
  const statusBar =
    auto !== undefined && auto.last_auto_hm !== null
      ? formatTemplate(t.admin.autoUpdated, {
          hm: auto.last_auto_hm,
          label: auto.success_label,
        }) +
        (auto.next_retry_hm !== null
          ? formatTemplate(t.admin.autoNextRetry, { hm: auto.next_retry_hm })
          : '')
      : t.admin.waitingAuto;

  return (
    <Body>
      <Text style={styles.lead}>{t.admin.ditLead}</Text>
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
        emptyText={t.admin.emptyCrops}
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
                    : t.admin.notMapped;
              const advancedOpen = editingId === crop.id || advancedOpenId === crop.id;
              return (
                <Card key={crop.id}>
                  <Text style={styles.name}>{cropName(crop)}</Text>
                  <Text style={styles.meta}>
                    {formatTemplate(t.admin.productCodeLine, {
                      code: crop.dit_product_code ?? t.common.dash,
                      match: matchLabel,
                    })}
                    {crop.dit_unit !== null ? ` · ${crop.dit_unit}` : ''}
                  </Text>
                  {crop.dit_product_name !== null ? (
                    <Text style={styles.meta}>
                      {formatTemplate(t.admin.productNameLine, { name: crop.dit_product_name })}
                    </Text>
                  ) : null}
                  <Text style={styles.meta}>
                    {formatTemplate(t.admin.marketPriceLine, {
                      price: formatNumber(crop.market_price_per_kg),
                    })}
                  </Text>
                  {crop.latest_ref_price !== null && !crop.latest_ref_price.rejected_as_outlier ? (
                    <>
                      <Text style={styles.meta}>
                        {formatTemplate(t.admin.refPriceLine, {
                          price: crop.latest_ref_price.wholesale_price,
                          unit: crop.latest_ref_price.unit !== null ? ` ${crop.latest_ref_price.unit}` : '',
                          date: crop.latest_ref_price.date,
                        })}
                      </Text>
                      {crop.latest_ref_price.fetched_at !== null ? (
                        <Text style={styles.meta}>
                          {formatTemplate(t.admin.fetchedAt, { at: crop.latest_ref_price.fetched_at })}
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.meta}>
                      {formatTemplate(t.admin.noUsablePrice, {
                        status: crop.dit_price_status ?? t.admin.estimatePrice,
                      })}
                    </Text>
                  )}
                  {crop.dit_price_status !== null && crop.latest_ref_price !== null ? (
                    <Text style={styles.error}>{crop.dit_price_status}</Text>
                  ) : null}
                  {crop.latest_ref_price?.rejected_as_outlier ? (
                    <Text style={styles.error}>{t.admin.outlierFlag}</Text>
                  ) : null}
                  <View style={styles.actions}>
                    <View style={styles.slot}>
                      <SecondaryButton
                        label={advancedOpen ? t.admin.hideAdvanced : t.admin.advanced}
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
                      <Text style={styles.historyTitle}>{t.admin.advanced}</Text>
                      {crop.dit_product_code !== null ? (
                        <>
                          <Text style={styles.meta}>
                            {formatTemplate(t.admin.sourceUnit, {
                              unit: crop.dit_unit !== null ? crop.dit_unit : t.admin.unitUnknown,
                            })}
                          </Text>
                          <Field
                            label={
                              crop.dit_unit !== null && !isDitKgUnit(crop.dit_unit)
                                ? formatTemplate(t.admin.factorLabelWithUnit, {
                                    base: unitBaseFromDit(crop.dit_unit, t.admin.unitFallback),
                                  })
                                : t.admin.factorLabelOptional
                            }
                            value={unitDraftFor(crop)}
                            onChangeText={(textValue) => {
                              setUnitDrafts((prev) => ({ ...prev, [crop.id]: textValue }));
                              setUnitError(crop.id, null);
                            }}
                            keyboardType="numeric"
                            placeholder={
                              crop.dit_unit !== null && !isDitKgUnit(crop.dit_unit)
                                ? formatTemplate(t.admin.factorPlaceholderWithUnit, {
                                    base: unitBaseFromDit(crop.dit_unit, t.admin.unitFallback),
                                  })
                                : t.admin.factorPlaceholderOptional
                            }
                            error={unitErrors[crop.id] ?? null}
                          />
                          <View style={styles.actions}>
                            <View style={styles.slot}>
                              <PrimaryButton
                                label={t.admin.saveUnitFactor}
                                loading={busyKey === `unit-${crop.id}`}
                                disabled={busyKey !== null}
                                onPress={() => void saveUnitFactor(crop)}
                              />
                            </View>
                          </View>
                          {crop.dit_unit_to_kg !== null ? (
                            <Text style={styles.meta}>
                              {formatTemplate(t.admin.factorInUse, {
                                base: unitBaseFromDit(crop.dit_unit, t.admin.unitFallback),
                                kg: crop.dit_unit_to_kg,
                              })}
                            </Text>
                          ) : null}
                        </>
                      ) : null}
                      <View style={styles.actions}>
                        <View style={styles.slot}>
                          <PrimaryButton
                            label={t.admin.fetchNow}
                            loading={busyKey === 'sync-prices' || syncJob?.status === 'running'}
                            disabled={busyKey !== null && busyKey !== 'sync-prices'}
                            onPress={() => void fetchPricesNow()}
                          />
                        </View>
                        <View style={styles.slot}>
                          <SecondaryButton
                            label={editing ? t.admin.closeMapping : t.admin.editMapping}
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
                            label={t.admin.searchProducts}
                            value={searchQueries[crop.id] ?? ''}
                            onChangeText={(textValue) =>
                              setSearchQueries((prev) => ({ ...prev, [crop.id]: textValue }))
                            }
                            placeholder={cropName(crop)}
                          />
                          <View style={styles.actions}>
                            <View style={styles.slot}>
                              <SecondaryButton
                                label={t.admin.search}
                                disabled={busyKey !== null}
                                onPress={() => void searchProducts(crop)}
                              />
                            </View>
                          </View>
                          {hits.map((hit) => (
                            <View key={hit.product_id} style={styles.suggestionBox}>
                              <Text style={styles.name}>{hit.product_name}</Text>
                              <Text style={styles.meta}>
                                {formatTemplate(t.admin.hitUnitLine, {
                                  code: hit.product_id,
                                  unit: hit.unit,
                                })}
                                {hit.sell_type !== null ? ` · ${hit.sell_type}` : ''}
                              </Text>
                              <View style={styles.actions}>
                                <View style={styles.slot}>
                                  <PrimaryButton
                                    label={t.admin.saveManualPair}
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
