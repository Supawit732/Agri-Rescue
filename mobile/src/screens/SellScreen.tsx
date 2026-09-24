import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { ApiError } from '../api/client';
import { AiPhotoInput } from '../components/AiPhotoInput';
import { ChipGroup } from '../components/form';
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
  SecondaryButton,
  Segmented,
} from '../components/ui';
import { LocationPicker, type LatLng } from '../components/LocationPicker';
import { GRADE_OPTIONS, RIPENESS_LABELS, STATUS_LABELS } from '../constants';
import { useAuth } from '../context/AuthContext';
import { useApiData } from '../hooks/useApiData';
import { formatCountdown, hoursLeftFrom, useNow } from '../hooks/useNow';
import { C, urgency } from '../theme';
import type {
  AssessPhotoResponse,
  Crop,
  DonationAudience,
  EstimateResponse,
  Grade,
  MyLot,
  Plot,
  SaleMode,
} from '../api/types';

const SALE_MODE_OPTIONS: { key: SaleMode; label: string }[] = [
  { key: 'sell', label: 'ขาย' },
  { key: 'donate', label: 'บริจาค' },
  { key: 'sell_then_donate', label: 'ขายแล้วค่อยบริจาค' },
];

const SALE_MODE_BADGE: Record<SaleMode, string> = {
  sell: 'ขาย',
  donate: 'บริจาค',
  sell_then_donate: 'ขายแล้วค่อยบริจาค',
};

function modeHasDonation(mode: SaleMode): boolean {
  return mode === 'donate' || mode === 'sell_then_donate';
}

function modeHasPrice(mode: SaleMode): boolean {
  return mode === 'sell' || mode === 'sell_then_donate';
}

export default function SellScreen(): React.ReactElement {
  const { api } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const [tab, setTab] = useState<'new' | 'mine'>('new');
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingLot, setEditingLot] = useState<MyLot | null>(null);
  const [formDirty, setFormDirty] = useState(false);

  const onCreated = useCallback(() => {
    setEditingLot(null);
    setFormDirty(false);
    setRefreshKey((value) => value + 1);
    router.push('/sell/success');
  }, [router]);

  const onPlotCreated = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  const onEditLot = useCallback((lot: MyLot) => {
    setEditingLot(lot);
    setFormDirty(false);
    setTab('new');
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (!formDirty || tab !== 'new') {
        return;
      }
      event.preventDefault();
      Alert.alert('ยังไม่ได้บันทึก', 'ออกจากหน้านี้โดยไม่บันทึกหรือไม่?', [
        { text: 'อยู่ต่อ', style: 'cancel' },
        {
          text: 'ออก',
          style: 'destructive',
          onPress: () => {
            setFormDirty(false);
            navigation.dispatch(event.data.action);
          },
        },
      ]);
    });
    return unsubscribe;
  }, [navigation, formDirty, tab]);

  return (
    <Screen>
      <Segmented
        options={[
          { key: 'new', label: editingLot !== null ? 'แก้ไขล็อต' : 'ลงล็อต' },
          { key: 'mine', label: 'ล็อตของฉัน' },
        ]}
        value={tab}
        onChange={(key) => {
          const next = key as 'new' | 'mine';
          if (next === 'mine') {
            if (formDirty) {
              Alert.alert('ยังไม่ได้บันทึก', 'สลับแท็บโดยไม่บันทึกหรือไม่?', [
                { text: 'อยู่ต่อ', style: 'cancel' },
                {
                  text: 'สลับ',
                  style: 'destructive',
                  onPress: () => {
                    setEditingLot(null);
                    setFormDirty(false);
                    setTab('mine');
                  },
                },
              ]);
              return;
            }
            setEditingLot(null);
          }
          setTab(next);
        }}
      />
      {tab === 'new' ? (
        <NewLot
          api={api}
          refreshKey={refreshKey}
          editingLot={editingLot}
          onCreated={onCreated}
          onPlotCreated={onPlotCreated}
          onCancelEdit={() => {
            setEditingLot(null);
            setFormDirty(false);
          }}
          onDirtyChange={setFormDirty}
        />
      ) : (
        <MyLots api={api} refreshKey={refreshKey} onEdit={onEditLot} />
      )}
    </Screen>
  );
}

function NewLot({
  api,
  refreshKey,
  editingLot,
  onCreated,
  onPlotCreated,
  onCancelEdit,
  onDirtyChange,
}: {
  api: ReturnType<typeof useAuth>['api'];
  refreshKey: number;
  editingLot: MyLot | null;
  onCreated: () => void;
  onPlotCreated: () => void;
  onCancelEdit: () => void;
  onDirtyChange: (dirty: boolean) => void;
}): React.ReactElement {
  const meta = useApiData(async () => {
    const [crops, plots] = await Promise.all([api.getCrops(), api.getPlots()]);
    return { crops, plots };
  }, [refreshKey]);

  return (
    <DataState
      loading={meta.loading}
      error={meta.error}
      data={meta.data}
      onRetry={meta.reload}
      isEmpty={(d) => d.crops.length === 0}
      emptyText="ยังไม่มีพืชในระบบ"
    >
      {(data) =>
        data.plots.length === 0 ? (
          <AddPlotForm api={api} onCreated={onPlotCreated} />
        ) : (
          <NewLotForm
            api={api}
            crops={data.crops}
            plots={data.plots}
            editingLot={editingLot}
            onCreated={onCreated}
            onCancelEdit={onCancelEdit}
            onDirtyChange={onDirtyChange}
          />
        )
      }
    </DataState>
  );
}

function AddPlotForm({
  api,
  onCreated,
}: {
  api: ReturnType<typeof useAuth>['api'];
  onCreated: () => void;
}): React.ReactElement {
  const [name, setName] = useState('');
  const [area, setArea] = useState('1');
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const areaNum = Number(area);
  const canSubmit = name.trim().length > 0 && coords !== null && areaNum > 0;

  const onSubmit = async (): Promise<void> => {
    if (coords === null) {
      setError('กรุณาเลือกตำแหน่งแปลง');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api.createPlot({
        name: name.trim(),
        lat: coords.lat,
        lng: coords.lng,
        area_rai: areaNum,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เพิ่มแปลงไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Body>
      <SectionTitle>เพิ่มแปลงแรก</SectionTitle>
      <Text style={styles.addPlotHint}>ต้องมีแปลงก่อนจึงจะลงล็อตได้</Text>
      <Field label="ชื่อแปลง" value={name} onChangeText={setName} placeholder="เช่น แปลงหน้าบ้าน" />
      <Field label="พื้นที่ (ไร่)" value={area} onChangeText={setArea} keyboardType="numeric" />
      <LocationPicker value={coords} onChange={setCoords} label="ตำแหน่งแปลง" />
      {error !== null ? <Text style={styles.previewError}>{error}</Text> : null}
      <PrimaryButton label="บันทึกแปลง" onPress={onSubmit} loading={submitting} disabled={!canSubmit} />
    </Body>
  );
}

function NewLotForm({
  api,
  crops,
  plots,
  editingLot,
  onCreated,
  onCancelEdit,
  onDirtyChange,
}: {
  api: ReturnType<typeof useAuth>['api'];
  crops: Crop[];
  plots: Plot[];
  editingLot: MyLot | null;
  onCreated: () => void;
  onCancelEdit: () => void;
  onDirtyChange: (dirty: boolean) => void;
}): React.ReactElement {
  const isEditing = editingLot !== null;
  const [cropId, setCropId] = useState<number>(editingLot?.crop_id ?? crops[0]?.id ?? 0);
  const [plotId, setPlotId] = useState<number>(editingLot?.plot_id ?? plots[0]?.id ?? 0);
  const [weight, setWeight] = useState(editingLot !== null ? String(editingLot.weight_kg) : '');
  const [ripeness, setRipeness] = useState(editingLot?.ripeness ?? 2);
  const [grade, setGrade] = useState<Grade>(editingLot?.grade ?? 'substandard');
  const [saleMode, setSaleMode] = useState<SaleMode>(editingLot?.sale_mode ?? 'sell');
  const [donationAudience, setDonationAudience] = useState<DonationAudience>(
    editingLot?.donation_audience ?? 'verified_org_only',
  );
  const [splitAllowed, setSplitAllowed] = useState(editingLot?.split_allowed !== false);
  const [minOrderKg, setMinOrderKg] = useState(
    editingLot?.min_order_kg !== undefined ? String(editingLot.min_order_kg) : '1',
  );
  const [startPrice, setStartPrice] = useState(
    editingLot?.start_price_per_kg !== null && editingLot?.start_price_per_kg !== undefined
      ? String(editingLot.start_price_per_kg)
      : '',
  );
  const [floorPrice, setFloorPrice] = useState(
    editingLot?.floor_price_per_kg !== null && editingLot?.floor_price_per_kg !== undefined
      ? String(editingLot.floor_price_per_kg)
      : '',
  );
  const [pricesSeeded, setPricesSeeded] = useState(
    editingLot?.start_price_per_kg !== null && editingLot?.start_price_per_kg !== undefined,
  );
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [assessing, setAssessing] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<
    Extract<AssessPhotoResponse, { available: true; subject_match: true }> | null
  >(null);
  const [aiEdited, setAiEdited] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const primedDirty = useRef(false);

  const plot = useMemo(() => plots.find((entry) => entry.id === plotId), [plots, plotId]);

  useEffect(() => {
    primedDirty.current = false;
    onDirtyChange(false);
  }, [editingLot, onDirtyChange]);

  useEffect(() => {
    if (!primedDirty.current) {
      primedDirty.current = true;
      return;
    }
    onDirtyChange(true);
  }, [
    cropId,
    plotId,
    weight,
    ripeness,
    grade,
    saleMode,
    donationAudience,
    splitAllowed,
    minOrderKg,
    startPrice,
    floorPrice,
    onDirtyChange,
  ]);

  useEffect(() => {
    if (editingLot === null) {
      return;
    }
    setCropId(editingLot.crop_id);
    setPlotId(editingLot.plot_id);
    setWeight(String(editingLot.weight_kg));
    setRipeness(editingLot.ripeness);
    setGrade(editingLot.grade);
    setSaleMode(editingLot.sale_mode);
    setDonationAudience(editingLot.donation_audience ?? 'verified_org_only');
    setSplitAllowed(editingLot.split_allowed !== false);
    setMinOrderKg(editingLot.min_order_kg !== undefined ? String(editingLot.min_order_kg) : '1');
    setStartPrice(
      editingLot.start_price_per_kg !== null && editingLot.start_price_per_kg !== undefined
        ? String(editingLot.start_price_per_kg)
        : '',
    );
    setFloorPrice(
      editingLot.floor_price_per_kg !== null && editingLot.floor_price_per_kg !== undefined
        ? String(editingLot.floor_price_per_kg)
        : '',
    );
    setPricesSeeded(
      editingLot.start_price_per_kg !== null && editingLot.start_price_per_kg !== undefined,
    );
    setAiResult(null);
    setAiEdited(false);
    setAiMessage(null);
    setPhotoPreview(null);
    setSubmitError(null);
  }, [editingLot]);

  useEffect(() => {
    setAiResult(null);
    setAiEdited(false);
    setAiMessage(null);
    setPhotoPreview(null);
    if (!isEditing) {
      setPricesSeeded(false);
    }
  }, [cropId, isEditing]);

  const startNum = Number(startPrice);
  const floorNum = Number(floorPrice);
  const hasCustomPrices = modeHasPrice(saleMode) && startNum > 0 && floorNum > 0;

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
            ...(hasCustomPrices
              ? { start_price_per_kg: startNum, floor_price_per_kg: floorNum }
              : {}),
          });
          if (active) {
            setEstimate(result);
            if (modeHasPrice(saleMode) && !pricesSeeded) {
              setStartPrice(String(result.suggested_start_price_per_kg));
              setFloorPrice(String(result.suggested_floor_price_per_kg));
              setPricesSeeded(true);
            }
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
  }, [api, cropId, plotId, ripeness, grade, plot, saleMode, hasCustomPrices, startNum, floorNum, pricesSeeded]);

  const weightNum = Number(weight);
  const minOrderNum = Number(minOrderKg);
  const displayPrice =
    estimate !== null && modeHasPrice(saleMode) ? estimate.price_per_kg : null;
  const totalPrice = displayPrice !== null && weightNum > 0 ? Math.round(displayPrice * weightNum) : null;
  const tone = estimate !== null ? urgency(estimate.shelf_hours) : null;

  const applyRipeness = (value: number, fromAi: boolean): void => {
    setRipeness(value);
    if (fromAi) {
      setAiEdited(false);
      return;
    }
    if (aiResult !== null) {
      setAiEdited(value !== aiResult.ripeness);
    }
  };

  const resizeForUpload = async (
    uri: string,
    width: number,
    height: number,
  ): Promise<{ base64: string; mime: 'image/jpeg' }> => {
    const longEdge = Math.max(width, height);
    const actions =
      longEdge > 1024
        ? [
            {
              resize:
                width >= height
                  ? { width: 1024 }
                  : { height: 1024 },
            },
          ]
        : [];
    const result = await ImageManipulator.manipulateAsync(uri, actions, {
      compress: 0.8,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    if (result.base64 === undefined || result.base64 === '') {
      throw new Error('เตรียมรูปไม่สำเร็จ');
    }
    return { base64: result.base64, mime: 'image/jpeg' };
  };

  const runAssessment = async (uri: string, width: number, height: number): Promise<void> => {
    setAssessing(true);
    setAiMessage(null);
    setPhotoPreview(uri);
    const cropName = crops.find((entry) => entry.id === cropId)?.name_th ?? 'พืชที่เลือก';
    try {
      const prepared = await resizeForUpload(uri, width, height);
      const result = await api.assessPhoto({
        crop_id: cropId,
        image_base64: prepared.base64,
        mime: prepared.mime,
      });
      if (!result.available) {
        setAiResult(null);
        setAiEdited(false);
        setAiMessage('ประเมินจากภาพไม่ได้ เลือกระดับความสุกเอง');
        return;
      }
      if (!result.subject_match) {
        setAiResult(null);
        setAiEdited(false);
        setAiMessage(`ในรูปไม่พบ${cropName} กรุณาถ่ายใหม่`);
        return;
      }
      setAiResult(result);
      applyRipeness(result.ripeness, true);
      if (result.low_confidence) {
        setAiMessage('AI ไม่แน่ใจ กรุณาตรวจสอบระดับความสุก');
      } else {
        setAiMessage(null);
      }
    } catch (err) {
      setAiResult(null);
      setAiEdited(false);
      setAiMessage(err instanceof ApiError ? err.message : 'ประเมินจากภาพไม่ได้ เลือกระดับความสุกเอง');
    } finally {
      setAssessing(false);
    }
  };

  const clearPhoto = (): void => {
    setPhotoPreview(null);
    setAiResult(null);
    setAiEdited(false);
    setAiMessage(null);
  };

  const pickPhoto = (): void => {
    Alert.alert('ประเมินความสุกจากภาพ', 'เลือกแหล่งรูป', [
      {
        text: 'ถ่ายรูป',
        onPress: () => {
          void (async () => {
            const permission = await ImagePicker.requestCameraPermissionsAsync();
            if (!permission.granted) {
              setAiMessage('ไม่ได้รับสิทธิ์กล้อง');
              return;
            }
            const picked = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.9,
            });
            if (picked.canceled || picked.assets[0] === undefined) {
              return;
            }
            const asset = picked.assets[0];
            await runAssessment(asset.uri, asset.width, asset.height);
          })();
        },
      },
      {
        text: 'คลังรูป',
        onPress: () => {
          void (async () => {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted) {
              setAiMessage('ไม่ได้รับสิทธิ์คลังรูป');
              return;
            }
            const picked = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.9,
            });
            if (picked.canceled || picked.assets[0] === undefined) {
              return;
            }
            const asset = picked.assets[0];
            await runAssessment(asset.uri, asset.width, asset.height);
          })();
        },
      },
      { text: 'ยกเลิก', style: 'cancel' },
    ]);
  };

  const onChangeSaleMode = (next: SaleMode): void => {
    setSaleMode(next);
    setFieldErrors((prev) => {
      const cleared = { ...prev };
      delete cleared.sale_mode;
      return cleared;
    });
    if (modeHasPrice(next) && !pricesSeeded && estimate !== null) {
      setStartPrice(String(estimate.suggested_start_price_per_kg));
      setFloorPrice(String(estimate.suggested_floor_price_per_kg));
      setPricesSeeded(true);
    }
  };

  const onSubmit = async (): Promise<void> => {
    setSubmitError(null);
    setFieldErrors({});
    const nextErrors: Record<string, string> = {};
    if (plot === undefined || cropId === 0) {
      nextErrors.crop_id = 'กรุณาเลือกแปลงและพืช';
    }
    if (!(weightNum > 0)) {
      nextErrors.weight_kg = 'กรุณากรอกน้ำหนักให้ถูกต้อง (มากกว่า 0)';
    }
    if (!(minOrderNum > 0)) {
      nextErrors.min_order_kg = 'ขั้นต่ำต่อคำสั่งซื้อต้องมากกว่า 0';
    }
    if (modeHasPrice(saleMode)) {
      if (!(startNum > 0)) {
        nextErrors.start_price_per_kg = 'กรุณากรอกราคาเริ่ม';
      }
      if (!(floorNum > 0)) {
        nextErrors.floor_price_per_kg = 'กรุณากรอกราคาต่ำสุด';
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setSubmitError('กรุณาแก้ช่องที่ผิด');
      return;
    }
    setSubmitting(true);
    try {
      const priceFields = modeHasPrice(saleMode)
        ? { start_price_per_kg: startNum, floor_price_per_kg: floorNum }
        : { start_price_per_kg: null, floor_price_per_kg: null };
      const audience = modeHasDonation(saleMode) ? donationAudience : undefined;
      const splitFields = {
        split_allowed: splitAllowed,
        min_order_kg: minOrderNum,
      };
      if (isEditing && editingLot !== null) {
        const loweringRipeness = ripeness < editingLot.ripeness;
        await api.patchLot(editingLot.id, {
          weight_kg: weightNum,
          grade,
          ripeness,
          sale_mode: saleMode,
          donation_audience: audience,
          ...priceFields,
          ...splitFields,
          ...(aiResult !== null ? { ai_ripeness: aiResult.ripeness } : {}),
          ...(aiResult?.photo_url !== undefined ? { photo_url: aiResult.photo_url } : {}),
          ...(loweringRipeness ? { confirm_ripeness_photo: aiResult !== null } : {}),
        });
      } else {
        await api.createLot({
          plot_id: plotId,
          crop_id: cropId,
          weight_kg: weightNum,
          grade,
          ripeness,
          sale_mode: saleMode,
          donation_audience: audience,
          ...priceFields,
          ...splitFields,
          photo_url: aiResult?.photo_url ?? null,
          ai_ripeness: aiResult?.ripeness ?? null,
          ai_confidence: aiResult?.confidence ?? null,
          ai_model: aiResult?.model ?? null,
        });
      }
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields !== undefined) {
          setFieldErrors(err.fields);
        }
        setSubmitError(err.message);
      } else {
        setSubmitError(isEditing ? 'แก้ไขล็อตไม่สำเร็จ' : 'ลงประกาศไม่สำเร็จ');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Body>
      {isEditing ? (
        <Text style={styles.editHint}>กำลังแก้ไขล็อต #{editingLot.id}</Text>
      ) : null}

      <SectionTitle>เลือกพืช</SectionTitle>
      <View style={styles.row}>
        {crops.map((crop) => (
          <Chip
            key={crop.id}
            label={crop.name_th}
            selected={crop.id === cropId}
            onPress={() => {
              if (!isEditing) {
                setCropId(crop.id);
              }
            }}
          />
        ))}
      </View>

      <SectionTitle>แปลง</SectionTitle>
      {plots.length === 1 ? (
        <Text style={styles.plotName}>{plots[0]?.name}</Text>
      ) : (
        <View style={styles.row}>
          {plots.map((entry) => (
            <Chip
              key={entry.id}
              label={entry.name}
              selected={entry.id === plotId}
              onPress={() => {
                if (!isEditing) {
                  setPlotId(entry.id);
                }
              }}
            />
          ))}
        </View>
      )}

      <Field
        label="น้ำหนัก (กก.)"
        value={weight}
        onChangeText={(text) => {
          setWeight(text);
          const n = Number(text);
          setFieldErrors((prev) => {
            const next = { ...prev };
            if (!(n > 0)) {
              next.weight_kg = 'กรุณากรอกน้ำหนักให้ถูกต้อง (มากกว่า 0)';
            } else {
              delete next.weight_kg;
            }
            return next;
          });
        }}
        onBlur={() => {
          const n = Number(weight);
          setFieldErrors((prev) => {
            const next = { ...prev };
            if (!(n > 0)) {
              next.weight_kg = 'กรุณากรอกน้ำหนักให้ถูกต้อง (มากกว่า 0)';
            } else {
              delete next.weight_kg;
            }
            return next;
          });
        }}
        error={fieldErrors.weight_kg}
        keyboardType="numeric"
        placeholder="เช่น 50"
      />
      <SectionTitle>การแบ่งขาย</SectionTitle>
      <View style={styles.row}>
        <Chip label="แบ่งขายได้" selected={splitAllowed} onPress={() => setSplitAllowed(true)} />
        <Chip label="ขายยกล็อตเท่านั้น" selected={!splitAllowed} onPress={() => setSplitAllowed(false)} />
      </View>
      {splitAllowed ? (
        <Field
          label="ขั้นต่ำต่อคำสั่งซื้อ (กก.)"
          value={minOrderKg}
          onChangeText={(text) => {
            setMinOrderKg(text);
            const n = Number(text);
            setFieldErrors((prev) => {
              const next = { ...prev };
              if (!(n > 0)) {
                next.min_order_kg = 'ขั้นต่ำต่อคำสั่งซื้อต้องมากกว่า 0';
              } else {
                delete next.min_order_kg;
              }
              return next;
            });
          }}
          error={fieldErrors.min_order_kg}
          keyboardType="numeric"
          placeholder="1"
        />
      ) : null}
      {fieldErrors.crop_id !== undefined ? (
        <Text style={styles.previewError}>{fieldErrors.crop_id}</Text>
      ) : null}

      <ChipGroup
        label="ความสุก"
        name="ripeness"
        options={RIPENESS_LABELS.map((label, index) => ({ key: String(index), label }))}
        value={String(ripeness)}
        onChange={(next) => {
          const value = Number(Array.isArray(next) ? next[0] : next);
          applyRipeness(value, false);
          setFieldErrors((prev) => {
            const cleared = { ...prev };
            delete cleared.ripeness;
            return cleared;
          });
        }}
        error={fieldErrors.ripeness}
      />
      <AiPhotoInput
        previewUri={photoPreview}
        assessing={assessing}
        disabled={cropId === 0}
        onPickNative={pickPhoto}
        onChangePress={pickPhoto}
        onClear={clearPhoto}
        onInvalid={(message) => {
          setAiMessage(message);
        }}
        onImageReady={(image) => {
          void runAssessment(image.uri, image.width, image.height);
        }}
      />
      {aiMessage !== null ? <Text style={styles.aiWarn}>{aiMessage}</Text> : null}
      {aiResult !== null ? (
        <Card>
          <Badge
            text={aiEdited ? 'แก้โดยเกษตรกร' : 'ประเมินโดย AI'}
            fg={aiEdited ? C.turmeric : C.leaf}
            bg={aiEdited ? C.turmericSoft : C.leafSoft}
          />
          <Text style={styles.aiLine}>ความมั่นใจ {Math.round(aiResult.confidence * 100)}%</Text>
          {aiResult.defects.length > 0 ? (
            <Text style={styles.aiLine}>ตำหนิ: {aiResult.defects.join(', ')}</Text>
          ) : (
            <Text style={styles.aiLine}>ไม่พบตำหนิชัดเจน</Text>
          )}
          <Text style={styles.aiLine}>{aiResult.note_th}</Text>
        </Card>
      ) : null}

      <SectionTitle>เกรด</SectionTitle>
      <View style={styles.row}>
        {GRADE_OPTIONS.map((option) => (
          <Chip key={option.key} label={option.label} selected={grade === option.key} onPress={() => setGrade(option.key)} />
        ))}
      </View>

      <ChipGroup
        label="โหมดขาย"
        name="sale_mode"
        options={SALE_MODE_OPTIONS}
        value={saleMode}
        onChange={(next) => {
          const value = (Array.isArray(next) ? next[0] : next) as SaleMode;
          onChangeSaleMode(value);
        }}
        error={fieldErrors.sale_mode}
      />

      {modeHasDonation(saleMode) ? (
        <>
          <SectionTitle>เปิดรับผู้รับบริจาค</SectionTitle>
          <View style={styles.row}>
            <Chip
              label="เฉพาะองค์กรที่ยืนยันแล้ว"
              selected={donationAudience === 'verified_org_only'}
              onPress={() => setDonationAudience('verified_org_only')}
            />
            <Chip
              label="รวมจิตอาสาด้วย"
              selected={donationAudience === 'all_donors'}
              onPress={() => setDonationAudience('all_donors')}
            />
          </View>
        </>
      ) : null}

      {modeHasPrice(saleMode) ? (
        <>
          {estimate?.market_quote !== undefined ? (
            <Card>
              <Text style={styles.marketLabel}>{estimate.market_quote.label_th}</Text>
              <Text style={styles.previewPrice}>
                ราคาตลาด {estimate.market_quote.price_per_kg} บาท/กก.
                {estimate.market_quote.is_estimate ? ' (ประมาณ)' : ''}
              </Text>
              {estimate.nearby_median_price_per_kg !== null ? (
                <Text style={styles.previewMuted}>
                  มัธยฐานใกล้เคียง {estimate.nearby_median_price_per_kg} บาท/กก.
                </Text>
              ) : null}
            </Card>
          ) : null}
          <Field
            label="ราคาเริ่ม (บาท/กก.)"
            value={startPrice}
            onChangeText={(text) => {
              setStartPrice(text);
              setPricesSeeded(true);
              setFieldErrors((prev) => {
                const cleared = { ...prev };
                delete cleared.start_price_per_kg;
                return cleared;
              });
            }}
            onBlur={() => {
              const n = Number(startPrice);
              setFieldErrors((prev) => {
                const next = { ...prev };
                if (!(n > 0)) {
                  next.start_price_per_kg = 'กรุณากรอกราคาเริ่ม';
                } else {
                  delete next.start_price_per_kg;
                }
                return next;
              });
            }}
            error={fieldErrors.start_price_per_kg}
            keyboardType="numeric"
            placeholder="แนะนำจากตลาด"
          />
          <Field
            label="ราคาต่ำสุด (บาท/กก.)"
            value={floorPrice}
            onChangeText={(text) => {
              setFloorPrice(text);
              setPricesSeeded(true);
              setFieldErrors((prev) => {
                const cleared = { ...prev };
                delete cleared.floor_price_per_kg;
                return cleared;
              });
            }}
            onBlur={() => {
              const n = Number(floorPrice);
              setFieldErrors((prev) => {
                const next = { ...prev };
                if (!(n > 0)) {
                  next.floor_price_per_kg = 'กรุณากรอกราคาต่ำสุด';
                } else {
                  delete next.floor_price_per_kg;
                }
                return next;
              });
            }}
            error={fieldErrors.floor_price_per_kg}
            keyboardType="numeric"
            placeholder="แนะนำจากราคาเริ่ม"
          />
          {estimate !== null && estimate.forecast.length > 0 ? (
            <Card>
              <Text style={styles.forecastTitle}>พยากรณ์ราคา</Text>
              {estimate.forecast.map((row) => (
                <Text key={row.hours} style={styles.forecastLine}>
                  อีก {row.hours} ชม. → {row.price_per_kg} บาท/กก.
                </Text>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

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
            {modeHasPrice(saleMode) && displayPrice !== null ? (
              <>
                <Text style={styles.previewPrice}>ราคาด่วน {displayPrice} บาท/กก.</Text>
                <Text style={styles.previewTotal}>
                  {totalPrice !== null ? `ราคารวม ${totalPrice} บาท` : 'กรอกน้ำหนักเพื่อดูราคารวม'}
                </Text>
              </>
            ) : (
              <Text style={styles.previewPrice}>โหมดบริจาค — ไม่คิดเงิน</Text>
            )}
            <Text style={styles.previewMuted}>
              คำนวณจากพยากรณ์อากาศ 3 วันข้างหน้า (เฉลี่ยกลางวัน {estimate.temp_c}°C ความชื้น{' '}
              {estimate.humidity}%)
            </Text>
            {estimate.weather_source === 'fallback' ? (
              <Text style={styles.previewMuted}>ใช้ค่าอากาศสำรอง</Text>
            ) : null}
          </>
        )}
      </Card>

      {submitError !== null ? <Text style={styles.previewError}>{submitError}</Text> : null}
      <PrimaryButton
        label={isEditing ? 'บันทึกการแก้ไข' : 'ลงประกาศ'}
        onPress={onSubmit}
        loading={submitting}
        disabled={!(weightNum > 0)}
      />
      {isEditing ? <SecondaryButton label="ยกเลิกการแก้ไข" onPress={onCancelEdit} /> : null}
    </Body>
  );
}

function MyLots({
  api,
  refreshKey,
  onEdit,
}: {
  api: ReturnType<typeof useAuth>['api'];
  refreshKey: number;
  onEdit: (lot: MyLot) => void;
}): React.ReactElement {
  const { data, loading, error, reload } = useApiData(() => api.getMyLots(), [refreshKey]);
  const now = useNow();
  const router = useRouter();

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
            const canEdit = lot.status === 'open' || lot.status === 'partially_reserved';
            const remaining = lot.remaining_kg ?? lot.weight_kg;
            return (
              <Card key={lot.id}>
                <View style={styles.lotHeader}>
                  <Text style={styles.lotTitle}>
                    {lot.crop_name_th} เหลือ {remaining} / {lot.weight_kg} กก.
                  </Text>
                  <Badge text={STATUS_LABELS[lot.status] ?? lot.status} fg={C.leaf} bg={C.leafSoft} />
                </View>
                <View style={styles.badgeRow}>
                  <Badge
                    text={SALE_MODE_BADGE[lot.sale_mode] ?? lot.sale_mode}
                    fg={lot.sale_mode === 'donate' ? C.turmeric : C.leaf}
                    bg={lot.sale_mode === 'donate' ? C.turmericSoft : C.leafSoft}
                  />
                  <Badge
                    text={lot.split_allowed === false ? 'ยกล็อต' : 'แบ่งขายได้'}
                    fg={C.mute}
                    bg={C.leafSoft}
                  />
                  {lot.sale_mode === 'sell_then_donate' && lot.donation_opened ? (
                    <Badge text="เปิดบริจาคแล้ว" fg={C.turmeric} bg={C.turmericSoft} />
                  ) : null}
                </View>
                <Text style={styles.lotMeta}>ล็อต #{lot.id}</Text>
                <Text style={styles.lotLine}>แปลง {lot.plot_name}</Text>
                {lot.sale_mode === 'donate' || lot.price_per_kg === null ? (
                  <Text style={styles.lotLine}>บริจาค — ไม่คิดเงิน</Text>
                ) : (
                  <Text style={styles.lotLine}>ราคาด่วน {lot.price_per_kg} บาท/กก.</Text>
                )}
                <Text style={styles.lotLine}>
                  {lot.grade === 'substandard' ? 'ตกเกรด' : 'ปกติ'} · ความสุก {RIPENESS_LABELS[lot.ripeness] ?? lot.ripeness}
                </Text>
                {lot.bookings !== undefined && lot.bookings.length > 0 ? (
                  <View style={styles.bookingsBox}>
                    <Text style={styles.bookingsTitle}>ผู้จอง ({lot.bookings.length})</Text>
                    {lot.bookings.map((booking) => (
                      <Pressable
                        key={booking.order_id}
                        onPress={() => router.push(`/orders/${booking.order_id}`)}
                      >
                        <Text style={styles.lotLine}>
                          #{booking.order_id}
                          {booking.buyer_name !== undefined ? ` ${booking.buyer_name}` : ''} ·{' '}
                          {booking.quantity_kg} กก. ·{' '}
                          {booking.is_donation ? 'บริจาค' : `${booking.agreed_price_per_kg} บาท/กก.`} ·{' '}
                          {STATUS_LABELS[booking.status] ?? booking.status}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <Badge text={lot.status === 'open' ? formatCountdown(hours) : tone.label} fg={tone.fg} bg={tone.bg} />
                {canEdit ? (
                  <View style={styles.editBtn}>
                    <SecondaryButton label="แก้ไข" onPress={() => onEdit(lot)} />
                  </View>
                ) : null}
                {canEdit && (lot.bookings === undefined || lot.bookings.length === 0) ? (
                  <View style={styles.editBtn}>
                    <SecondaryButton
                      label="ลบ/ปิดล็อต"
                      onPress={() => {
                        Alert.alert('ลบหรือปิดล็อตนี้?', 'ล็อตจะถูกซ่อนจากตลาด (เก็บประวัติไว้) — ยืนยันหรือไม่?', [
                          { text: 'ยกเลิก', style: 'cancel' },
                          {
                            text: 'ลบล็อต',
                            style: 'destructive',
                            onPress: () => {
                              void (async () => {
                                try {
                                  await api.deleteLot(lot.id);
                                  reload();
                                } catch (err) {
                                  Alert.alert(
                                    'ลบไม่สำเร็จ',
                                    err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาด',
                                  );
                                }
                              })();
                            },
                          },
                        ]);
                      }}
                    />
                  </View>
                ) : null}
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
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  plotName: { color: C.ink, fontSize: 16, fontWeight: '400', marginBottom: 12 },
  addPlotHint: { color: C.mute, marginBottom: 12 },
  editHint: { color: C.turmeric, fontWeight: '700', marginBottom: 8 },
  aiWarn: { color: C.turmeric, marginBottom: 8, marginTop: 4 },
  aiLine: { color: C.ink, marginTop: 6 },
  marketLabel: { fontSize: 15, fontWeight: '700', color: C.ink, marginBottom: 4 },
  forecastTitle: { fontSize: 15, fontWeight: '700', color: C.ink, marginBottom: 4 },
  forecastLine: { color: C.ink, marginTop: 2 },
  previewUrgency: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  previewPrice: { fontSize: 16, fontWeight: '700', color: C.ink },
  previewTotal: { fontSize: 15, color: C.ink, marginTop: 2 },
  previewMuted: { color: C.mute, marginTop: 4 },
  previewError: { color: C.chili, marginBottom: 8 },
  lotHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  lotTitle: { fontSize: 16, fontWeight: '700', color: C.ink, flex: 1, marginRight: 8 },
  lotMeta: { color: C.mute, fontSize: 12, marginBottom: 6 },
  lotLine: { color: C.ink, marginBottom: 4 },
  bookingsBox: { backgroundColor: C.leafSoft, borderRadius: 12, padding: 10, marginVertical: 8 },
  bookingsTitle: { fontWeight: '700', color: C.ink, marginBottom: 4 },
  editBtn: { marginTop: 10 },
});
