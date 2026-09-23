import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../src/api/client';
import {
  Badge,
  Body,
  Card,
  Chip,
  DataState,
  Field,
  PrimaryButton,
  Screen,
  SectionTitle,
  Segmented,
  TopBar,
} from '../src/components/ui';
import { GRADE_OPTIONS, RIPENESS_LABELS, STATUS_LABELS } from '../src/constants';
import { useAuth } from '../src/context/AuthContext';
import { useApiData } from '../src/hooks/useApiData';
import { formatCountdown, hoursLeftFrom, useNow } from '../src/hooks/useNow';
import { C, urgency } from '../src/theme';
import type { Crop, EstimateResponse, Grade, MyLot, Plot } from '../src/api/types';

export default function FarmerScreen(): React.ReactElement {
  const { api, logout } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<'new' | 'mine'>('new');
  const [refreshKey, setRefreshKey] = useState(0);

  const onCreated = useCallback(() => {
    setRefreshKey((value) => value + 1);
    setTab('mine');
  }, []);

  return (
    <Screen>
      <TopBar title="เกษตรกร" onImpact={() => router.push('/impact')} onLogout={logout} />
      <Segmented
        options={[
          { key: 'new', label: 'ลงล็อต' },
          { key: 'mine', label: 'ล็อตของฉัน' },
        ]}
        value={tab}
        onChange={(key) => setTab(key as 'new' | 'mine')}
      />
      {tab === 'new' ? <NewLot api={api} onCreated={onCreated} /> : <MyLots api={api} refreshKey={refreshKey} />}
    </Screen>
  );
}

function NewLot({
  api,
  onCreated,
}: {
  api: ReturnType<typeof useAuth>['api'];
  onCreated: () => void;
}): React.ReactElement {
  const meta = useApiData(async () => {
    const [crops, plots] = await Promise.all([api.getCrops(), api.getPlots()]);
    return { crops, plots };
  }, []);

  return (
    <DataState
      loading={meta.loading}
      error={meta.error}
      data={meta.data}
      onRetry={meta.reload}
      isEmpty={(d) => d.plots.length === 0 || d.crops.length === 0}
      emptyText="ยังไม่มีแปลงหรือพืชสำหรับลงล็อต"
    >
      {(data) => <NewLotForm api={api} crops={data.crops} plots={data.plots} onCreated={onCreated} />}
    </DataState>
  );
}

function NewLotForm({
  api,
  crops,
  plots,
  onCreated,
}: {
  api: ReturnType<typeof useAuth>['api'];
  crops: Crop[];
  plots: Plot[];
  onCreated: () => void;
}): React.ReactElement {
  const [cropId, setCropId] = useState<number>(crops[0]?.id ?? 0);
  const [plotId, setPlotId] = useState<number>(plots[0]?.id ?? 0);
  const [weight, setWeight] = useState('');
  const [ripeness, setRipeness] = useState(2);
  const [grade, setGrade] = useState<Grade>('substandard');
  const [donation, setDonation] = useState(false);
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const plot = useMemo(() => plots.find((entry) => entry.id === plotId), [plots, plotId]);

  // Debounced 400ms shelf-life + price preview from the API (no local pricing).
  useEffect(() => {
    if (plot === undefined || cropId === 0) {
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      void (async () => {
        setEstimateError(null);
        try {
          const result = await api.estimate({
            crop_id: cropId,
            ripeness,
            grade,
            lat: Number(plot.lat),
            lng: Number(plot.lng),
          });
          if (active) {
            setEstimate(result);
          }
        } catch (err) {
          if (active) {
            setEstimate(null);
            setEstimateError(err instanceof ApiError ? err.message : 'ประเมินราคาไม่สำเร็จ');
          }
        }
      })();
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, cropId, plotId, ripeness, grade, plot]);

  const weightNum = Number(weight);
  const totalPrice = estimate !== null && weightNum > 0 ? Math.round(estimate.price_per_kg * weightNum) : null;
  const tone = estimate !== null ? urgency(estimate.shelf_hours) : null;

  const onSubmit = async (): Promise<void> => {
    setSubmitError(null);
    if (plot === undefined || cropId === 0) {
      setSubmitError('กรุณาเลือกแปลงและพืช');
      return;
    }
    if (!(weightNum > 0)) {
      setSubmitError('กรุณากรอกน้ำหนักให้ถูกต้อง');
      return;
    }
    setSubmitting(true);
    try {
      await api.createLot({
        plot_id: plotId,
        crop_id: cropId,
        weight_kg: weightNum,
        grade,
        ripeness,
        allow_donation: donation,
      });
      onCreated();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'ลงประกาศไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Body>
      <SectionTitle>เลือกพืช</SectionTitle>
      <View style={styles.row}>
        {crops.map((crop) => (
          <Chip key={crop.id} label={crop.name_th} selected={crop.id === cropId} onPress={() => setCropId(crop.id)} />
        ))}
      </View>

      <SectionTitle>แปลง</SectionTitle>
      {plots.length === 1 ? (
        <Text style={styles.plotName}>{plots[0]?.name}</Text>
      ) : (
        <View style={styles.row}>
          {plots.map((entry) => (
            <Chip key={entry.id} label={entry.name} selected={entry.id === plotId} onPress={() => setPlotId(entry.id)} />
          ))}
        </View>
      )}

      <Field
        label="น้ำหนัก (กก.)"
        value={weight}
        onChangeText={setWeight}
        keyboardType="numeric"
        placeholder="เช่น 50"
      />

      <SectionTitle>ความสุก</SectionTitle>
      <View style={styles.row}>
        {RIPENESS_LABELS.map((label, index) => (
          <Chip key={label} label={label} selected={ripeness === index} onPress={() => setRipeness(index)} />
        ))}
      </View>

      <SectionTitle>เกรด</SectionTitle>
      <View style={styles.row}>
        {GRADE_OPTIONS.map((option) => (
          <Chip key={option.key} label={option.label} selected={grade === option.key} onPress={() => setGrade(option.key)} />
        ))}
      </View>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: donation }}
        onPress={() => setDonation((value) => !value)}
        style={styles.checkboxRow}
      >
        <View style={[styles.checkbox, donation ? styles.checkboxOn : null]}>
          {donation ? <Text style={styles.checkboxMark}>✓</Text> : null}
        </View>
        <Text style={styles.checkboxLabel}>ยินดีบริจาค (ให้ผู้รับซื้อประเภทสงเคราะห์)</Text>
      </Pressable>

      <Card style={tone !== null ? { borderColor: tone.fg, backgroundColor: tone.bg } : undefined}>
        {estimateError !== null ? (
          <Text style={styles.previewError}>{estimateError}</Text>
        ) : estimate === null ? (
          <Text style={styles.previewMuted}>กำลังประเมิน…</Text>
        ) : (
          <>
            <Text style={[styles.previewUrgency, { color: tone?.fg }]}>
              ขายได้อีก {formatCountdown(estimate.shelf_hours).replace('เหลือ ', '')} · {tone?.label}
            </Text>
            <Text style={styles.previewPrice}>ราคาด่วน {estimate.price_per_kg} บาท/กก.</Text>
            <Text style={styles.previewTotal}>
              {totalPrice !== null ? `ราคารวม ${totalPrice} บาท` : 'กรอกน้ำหนักเพื่อดูราคารวม'}
            </Text>
            <Text style={styles.previewMuted}>
              คำนวณจากอากาศที่แปลง {estimate.temp_c}°C ความชื้น {estimate.humidity}%
            </Text>
            {estimate.weather_source === 'fallback' ? (
              <Text style={styles.previewMuted}>ใช้ค่าอากาศสำรอง</Text>
            ) : null}
          </>
        )}
      </Card>

      {submitError !== null ? <Text style={styles.previewError}>{submitError}</Text> : null}
      <PrimaryButton
        label="ลงประกาศ"
        onPress={onSubmit}
        loading={submitting}
        disabled={!(weightNum > 0)}
      />
    </Body>
  );
}

function MyLots({
  api,
  refreshKey,
}: {
  api: ReturnType<typeof useAuth>['api'];
  refreshKey: number;
}): React.ReactElement {
  const { data, loading, error, reload } = useApiData(() => api.getMyLots(), [refreshKey]);
  const now = useNow();

  return (
    <DataState
      loading={loading}
      error={error}
      data={data}
      onRetry={reload}
      isEmpty={(lots) => lots.length === 0}
      emptyText="ยังไม่มีล็อตที่ลงประกาศ"
    >
      {(lots) => (
        <Body>
          {lots.map((lot: MyLot) => {
            const hours = hoursLeftFrom(lot.expires_at, now);
            const tone = urgency(hours);
            return (
              <Card key={lot.id}>
                <View style={styles.lotHeader}>
                  <Text style={styles.lotTitle}>ล็อต #{lot.id}</Text>
                  <Badge text={STATUS_LABELS[lot.status] ?? lot.status} fg={C.leaf} bg={C.leafSoft} />
                </View>
                <Text style={styles.lotLine}>น้ำหนัก {lot.weight_kg} กก. · {lot.grade === 'substandard' ? 'ตกเกรด' : 'ปกติ'}</Text>
                <Text style={styles.lotLine}>ความสุก: {RIPENESS_LABELS[lot.ripeness] ?? lot.ripeness}</Text>
                <Badge text={lot.status === 'open' ? formatCountdown(hours) : tone.label} fg={tone.fg} bg={tone.bg} />
              </Card>
            );
          })}
        </Body>
      )}
    </DataState>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  plotName: { color: C.ink, fontSize: 16, fontWeight: '600', marginBottom: 12 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 12 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: C.leaf,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxOn: { backgroundColor: C.leaf },
  checkboxMark: { color: C.white, fontWeight: '800' },
  checkboxLabel: { color: C.ink, flex: 1 },
  previewUrgency: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  previewPrice: { fontSize: 16, fontWeight: '700', color: C.ink },
  previewTotal: { fontSize: 15, color: C.ink, marginTop: 2 },
  previewMuted: { color: C.mute, marginTop: 4 },
  previewError: { color: C.chili, marginBottom: 8 },
  lotHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  lotTitle: { fontSize: 16, fontWeight: '700', color: C.ink },
  lotLine: { color: C.ink, marginBottom: 4 },
});
