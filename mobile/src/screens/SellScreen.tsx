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
import { useAuth } from '../context/AuthContext';
import { useApiData } from '../hooks/useApiData';
import { hoursLeftFrom, useNow } from '../hooks/useNow';
import { formatTemplate, useI18n, type Messages } from '../i18n';
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

function modeHasDonation(mode: SaleMode): boolean {
  return mode === 'donate' || mode === 'sell_then_donate';
}

function modeHasPrice(mode: SaleMode): boolean {
  return mode === 'sell' || mode === 'sell_then_donate';
}

function urgencyLabel(hoursLeft: number, t: Messages): string {
  if (hoursLeft < 24) {
    return t.urgency.critical;
  }
  if (hoursLeft < 48) {
    return t.urgency.soon;
  }
  return t.urgency.ok;
}

function formatCountdownLocalized(hoursLeft: number, t: Messages): string {
  if (hoursLeft <= 0) {
    return t.countdown.expired;
  }
  const totalMinutes = Math.floor(hoursLeft * 60);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) {
    return formatTemplate(t.countdown.remainingDaysHours, { days, hours });
  }
  if (hours > 0) {
    return formatTemplate(t.countdown.remainingHoursMinutes, { hours, minutes });
  }
  return formatTemplate(t.countdown.remainingMinutes, { minutes });
}

/** Time fragment for sellTimeLeft (no “left” / “เหลือ” wrapper). */
function shelfTimeFragment(hoursLeft: number, t: Messages): string {
  if (hoursLeft <= 0) {
    return t.countdown.expired;
  }
  const totalMinutes = Math.floor(hoursLeft * 60);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) {
    return formatTemplate(t.countdown.fragmentDaysHours, { days, hours });
  }
  if (hours > 0) {
    return formatTemplate(t.countdown.fragmentHoursMinutes, { hours, minutes });
  }
  return formatTemplate(t.countdown.fragmentMinutes, { minutes });
}

export default function SellScreen(): React.ReactElement {
  const { api } = useAuth();
  const { t } = useI18n();
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
      Alert.alert(t.sell.unsavedTitle, t.sell.unsavedLeave, [
        { text: t.sell.stay, style: 'cancel' },
        {
          text: t.sell.leave,
          style: 'destructive',
          onPress: () => {
            setFormDirty(false);
            navigation.dispatch(event.data.action);
          },
        },
      ]);
    });
    return unsubscribe;
  }, [navigation, formDirty, tab, t]);

  return (
    <Screen>
      <Segmented
        options={[
          { key: 'new', label: editingLot !== null ? t.sell.editTab : t.sell.newTab },
          { key: 'mine', label: t.sell.mineTab },
        ]}
        value={tab}
        onChange={(key) => {
          const next = key as 'new' | 'mine';
          if (next === 'mine') {
            if (formDirty) {
              Alert.alert(t.sell.unsavedTitle, t.sell.unsavedSwitch, [
                { text: t.sell.stay, style: 'cancel' },
                {
                  text: t.sell.switchTab,
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
  const { t } = useI18n();
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
      emptyText={t.sell.noCrops}
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
  const { t, translateError } = useI18n();
  const [name, setName] = useState('');
  const [area, setArea] = useState('1');
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const areaNum = Number(area);
  const canSubmit = name.trim().length > 0 && coords !== null && areaNum > 0;

  const onSubmit = async (): Promise<void> => {
    if (coords === null) {
      setError(t.sell.pickPlotLocation);
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
      setError(
        err instanceof ApiError
          ? translateError(err.code, err.message)
          : t.sell.addPlotFailed,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Body>
      <SectionTitle>{t.sell.addPlotTitle}</SectionTitle>
      <Text style={styles.addPlotHint}>{t.sell.addPlotHint}</Text>
      <Field
        label={t.sell.plotName}
        value={name}
        onChangeText={setName}
        placeholder={t.sell.plotNamePlaceholder}
      />
      <Field label={t.sell.plotArea} value={area} onChangeText={setArea} keyboardType="numeric" />
      <LocationPicker value={coords} onChange={setCoords} label={t.sell.plotLocation} />
      {error !== null ? <Text style={styles.previewError}>{error}</Text> : null}
      <PrimaryButton
        label={t.sell.savePlot}
        onPress={onSubmit}
        loading={submitting}
        disabled={!canSubmit}
      />
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
  const { t, locale, formatNumber, cropName, translateError, translateFieldError } = useI18n();
  const isEditing = editingLot !== null;
  const [cropId, setCropId] = useState<number>(editingLot?.crop_id ?? crops[0]?.id ?? 0);
  const [plotId, setPlotId] = useState<number>(editingLot?.plot_id ?? plots[0]?.id ?? 0);
  const [weight, setWeight] = useState(editingLot !== null ? String(editingLot.weight_kg) : '');
  const [ripeness, setRipeness] = useState<number | null>(editingLot?.ripeness ?? null);
  const [ripenessSource, setRipenessSource] = useState<'user' | 'ai' | null>(
    editingLot !== null ? 'user' : null,
  );
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

  const saleModeOptions = useMemo(
    () =>
      (['sell', 'donate', 'sell_then_donate'] as const).map((key) => ({
        key,
        label: t.saleMode[key],
      })),
    [t],
  );

  const gradeOptions = useMemo(
    () =>
      (['normal', 'substandard'] as const).map((key) => ({
        key,
        label: t.grade[key],
      })),
    [t],
  );

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
    setRipenessSource('user');
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
      setRipeness(null);
      setRipenessSource(null);
      setEstimate(null);
    }
  }, [cropId, isEditing]);

  const startNum = Number(startPrice);
  const floorNum = Number(floorPrice);
  const hasCustomPrices = modeHasPrice(saleMode) && startNum > 0 && floorNum > 0;

  // Debounced 400ms shelf-life + price preview from the API (no local pricing).
  useEffect(() => {
    if (plot === undefined || cropId === 0 || ripeness === null) {
      setEstimate(null);
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
            setEstimateError(
              err instanceof ApiError
                ? translateError(err.code, err.message)
                : t.sell.assessPriceFailed,
            );
          }
        }
      })();
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    api,
    cropId,
    plotId,
    ripeness,
    grade,
    plot,
    saleMode,
    hasCustomPrices,
    startNum,
    floorNum,
    pricesSeeded,
    t,
    translateError,
  ]);

  const weightNum = Number(weight);
  const minOrderNum = Number(minOrderKg);
  const displayPrice =
    estimate !== null && modeHasPrice(saleMode) ? estimate.price_per_kg : null;
  const totalPrice = displayPrice !== null && weightNum > 0 ? Math.round(displayPrice * weightNum) : null;
  const tone = estimate !== null ? urgency(estimate.shelf_hours) : null;
  const previewUrgency =
    estimate !== null ? urgencyLabel(estimate.shelf_hours, t) : null;

  const applyRipeness = (value: number, fromAi: boolean): void => {
    setRipeness(value);
    if (fromAi) {
      setRipenessSource('ai');
      setAiEdited(false);
      return;
    }
    setRipenessSource('user');
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
      throw new Error(t.sell.preparePhotoFailed);
    }
    return { base64: result.base64, mime: 'image/jpeg' };
  };

  const runAssessment = async (uri: string, width: number, height: number): Promise<void> => {
    setAssessing(true);
    setAiMessage(null);
    setPhotoPreview(uri);
    const selected = crops.find((entry) => entry.id === cropId);
    const selectedLabel = selected !== undefined ? cropName(selected) : t.sell.selectedCropFallback;
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
        setAiMessage(t.sell.aiFailedPickManual);
        return;
      }
      if (!result.subject_match) {
        setAiResult(null);
        setAiEdited(false);
        setAiMessage(formatTemplate(t.sell.aiCropNotFound, { crop: selectedLabel }));
        return;
      }
      setAiResult(result);
      applyRipeness(result.ripeness, true);
      if (result.low_confidence) {
        setAiMessage(t.sell.aiUnsure);
      } else {
        setAiMessage(null);
      }
    } catch (err) {
      setAiResult(null);
      setAiEdited(false);
      setAiMessage(
        err instanceof ApiError
          ? translateError(err.code, err.message)
          : t.sell.aiFailedPickManual,
      );
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
    Alert.alert(t.sell.aiPhotoTitle, t.sell.aiPhotoPickSource, [
      {
        text: t.sell.takePhoto,
        onPress: () => {
          void (async () => {
            const permission = await ImagePicker.requestCameraPermissionsAsync();
            if (!permission.granted) {
              setAiMessage(t.sell.cameraDenied);
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
        text: t.sell.photoLibrary,
        onPress: () => {
          void (async () => {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted) {
              setAiMessage(t.sell.libraryDenied);
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
      { text: t.common.cancel, style: 'cancel' },
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
      nextErrors.crop_id = t.sell.needCropAndPlot;
    }
    if (!(weightNum > 0)) {
      nextErrors.weight_kg = t.sell.weightInvalid;
    }
    if (ripeness === null) {
      nextErrors.ripeness = t.sell.ripenessRequired;
    }
    if (!(minOrderNum > 0)) {
      nextErrors.min_order_kg = t.sell.minOrderInvalid;
    }
    if (modeHasPrice(saleMode)) {
      if (!(startNum > 0)) {
        nextErrors.start_price_per_kg = t.sell.needStartPrice;
      }
      if (!(floorNum > 0)) {
        nextErrors.floor_price_per_kg = t.sell.needFloorPrice;
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setSubmitError(t.sell.fixFields);
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
        const loweringRipeness = ripeness !== null && ripeness < editingLot.ripeness;
        await api.patchLot(editingLot.id, {
          weight_kg: weightNum,
          grade,
          ripeness: ripeness as number,
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
          ripeness: ripeness as number,
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
          setFieldErrors(
            Object.fromEntries(
              Object.entries(err.fields).map(([key, value]) => [key, translateFieldError(value)]),
            ),
          );
        }
        setSubmitError(translateError(err.code, err.message));
      } else {
        setSubmitError(isEditing ? t.sell.editFailed : t.sell.publishFailed);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const aiDefects =
    aiResult === null
      ? []
      : locale === 'en' && aiResult.defects_en.length > 0
        ? aiResult.defects_en
        : aiResult.defects;
  const aiNote =
    aiResult === null
      ? ''
      : locale === 'en' && aiResult.note_en.trim() !== ''
        ? aiResult.note_en
        : aiResult.note_th;

  return (
    <Body>
      {isEditing ? (
        <Text style={styles.editHint}>
          {formatTemplate(t.sell.editingLot, { id: editingLot.id })}
        </Text>
      ) : null}

      <SectionTitle>{t.sell.selectCrop}</SectionTitle>
      <View style={styles.row}>
        {crops.map((crop) => (
          <Chip
            key={crop.id}
            label={cropName(crop)}
            selected={crop.id === cropId}
            onPress={() => {
              if (!isEditing) {
                setCropId(crop.id);
              }
            }}
          />
        ))}
      </View>

      <SectionTitle>{t.sell.plot}</SectionTitle>
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
        label={t.sell.weight}
        value={weight}
        onChangeText={(text) => {
          setWeight(text);
          const n = Number(text);
          setFieldErrors((prev) => {
            const next = { ...prev };
            if (!(n > 0)) {
              next.weight_kg = t.sell.weightInvalid;
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
              next.weight_kg = t.sell.weightInvalid;
            } else {
              delete next.weight_kg;
            }
            return next;
          });
        }}
        error={fieldErrors.weight_kg}
        keyboardType="numeric"
        placeholder={t.sell.weightPlaceholder}
      />
      <SectionTitle>{t.sell.splitSection}</SectionTitle>
      <View style={styles.row}>
        <Chip
          label={t.sell.splitAllowed}
          selected={splitAllowed}
          onPress={() => setSplitAllowed(true)}
        />
        <Chip
          label={t.sell.wholeLotOnly}
          selected={!splitAllowed}
          onPress={() => setSplitAllowed(false)}
        />
      </View>
      {splitAllowed ? (
        <Field
          label={t.sell.minOrder}
          value={minOrderKg}
          onChangeText={(text) => {
            setMinOrderKg(text);
            const n = Number(text);
            setFieldErrors((prev) => {
              const next = { ...prev };
              if (!(n > 0)) {
                next.min_order_kg = t.sell.minOrderInvalid;
              } else {
                delete next.min_order_kg;
              }
              return next;
            });
          }}
          error={fieldErrors.min_order_kg}
          keyboardType="numeric"
          placeholder={t.sell.minOrderPlaceholder}
        />
      ) : null}
      {fieldErrors.crop_id !== undefined ? (
        <Text style={styles.previewError}>{fieldErrors.crop_id}</Text>
      ) : null}

      <ChipGroup
        label={t.sell.ripeness}
        name="ripeness"
        options={t.ripenessLabels.map((label, index) => ({ key: String(index), label }))}
        value={ripeness === null ? null : String(ripeness)}
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
            text={aiEdited ? t.sell.aiEditedByFarmer : t.sell.aiAssessed}
            fg={aiEdited ? C.turmeric : C.leaf}
            bg={aiEdited ? C.turmericSoft : C.leafSoft}
          />
          <Text style={styles.aiLine}>
            {formatTemplate(t.sell.aiConfidence, {
              pct: Math.round(aiResult.confidence * 100),
            })}
          </Text>
          {aiDefects.length > 0 ? (
            <Text style={styles.aiLine}>
              {formatTemplate(t.sell.defects, { list: aiDefects.join(', ') })}
            </Text>
          ) : (
            <Text style={styles.aiLine}>{t.sell.noDefects}</Text>
          )}
          <Text style={styles.aiLine}>{aiNote}</Text>
        </Card>
      ) : null}

      <SectionTitle>{t.sell.gradeSection}</SectionTitle>
      <View style={styles.row}>
        {gradeOptions.map((option) => (
          <Chip
            key={option.key}
            label={option.label}
            selected={grade === option.key}
            onPress={() => setGrade(option.key)}
          />
        ))}
      </View>

      <ChipGroup
        label={t.sell.saleMode}
        name="sale_mode"
        options={saleModeOptions}
        value={saleMode}
        onChange={(next) => {
          const value = (Array.isArray(next) ? next[0] : next) as SaleMode;
          onChangeSaleMode(value);
        }}
        error={fieldErrors.sale_mode}
      />

      {modeHasDonation(saleMode) ? (
        <>
          <SectionTitle>{t.sell.donationAudience}</SectionTitle>
          <View style={styles.row}>
            <Chip
              label={t.donationAudience.verified_org_only}
              selected={donationAudience === 'verified_org_only'}
              onPress={() => setDonationAudience('verified_org_only')}
            />
            <Chip
              label={t.donationAudience.any_registered}
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
                {formatTemplate(t.sell.marketPrice, {
                  price: formatNumber(estimate.market_quote.price_per_kg),
                })}
                {estimate.market_quote.is_estimate ? t.sell.marketEstimate : ''}
              </Text>
              {estimate.nearby_median_price_per_kg !== null ? (
                <Text style={styles.previewMuted}>
                  {formatTemplate(t.sell.nearbyMedian, {
                    price: formatNumber(estimate.nearby_median_price_per_kg),
                  })}
                </Text>
              ) : null}
            </Card>
          ) : null}
          <Field
            label={t.sell.startPrice}
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
                  next.start_price_per_kg = t.sell.needStartPrice;
                } else {
                  delete next.start_price_per_kg;
                }
                return next;
              });
            }}
            error={fieldErrors.start_price_per_kg}
            keyboardType="numeric"
            placeholder={t.sell.startPricePlaceholder}
          />
          <Field
            label={t.sell.floorPrice}
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
                  next.floor_price_per_kg = t.sell.needFloorPrice;
                } else {
                  delete next.floor_price_per_kg;
                }
                return next;
              });
            }}
            error={fieldErrors.floor_price_per_kg}
            keyboardType="numeric"
            placeholder={t.sell.floorPricePlaceholder}
          />
          {estimate !== null && estimate.forecast.length > 0 ? (
            <Card>
              <Text style={styles.forecastTitle}>{t.sell.priceForecast}</Text>
              {estimate.forecast.map((row) => (
                <Text key={row.hours} style={styles.forecastLine}>
                  {formatTemplate(t.sell.forecastRow, {
                    hours: formatNumber(row.hours),
                    price: formatNumber(row.price_per_kg),
                  })}
                </Text>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

      <Card style={tone !== null ? { borderColor: tone.fg, backgroundColor: tone.bg } : undefined}>
        {estimateError !== null ? (
          <Text style={styles.previewError}>{estimateError}</Text>
        ) : ripeness === null ? (
          <Text style={styles.previewMuted}>{t.sell.ripenessInvite}</Text>
        ) : estimate === null ? (
          <Text style={styles.previewMuted}>{t.sell.assessing}</Text>
        ) : (
          <>
            <Text style={[styles.previewUrgency, { color: tone?.fg }]}>
              {formatTemplate(t.sell.sellTimeLeft, {
                time: shelfTimeFragment(estimate.shelf_hours, t),
                urgency: previewUrgency ?? '',
              })}
            </Text>
            {modeHasPrice(saleMode) && displayPrice !== null ? (
              <>
                <Text style={styles.previewPrice}>
                  {formatTemplate(t.sell.flashPrice, { price: formatNumber(displayPrice) })}
                </Text>
                <Text style={styles.previewTotal}>
                  {totalPrice !== null
                    ? formatTemplate(t.sell.totalPrice, { total: formatNumber(totalPrice) })
                    : t.sell.enterWeightForTotal}
                </Text>
              </>
            ) : (
              <Text style={styles.previewPrice}>{t.sell.donateNoCharge}</Text>
            )}
            <Text style={styles.previewMuted}>
              {ripenessSource === 'ai' && !aiEdited
                ? t.sell.ripenessSourceAi
                : t.sell.ripenessSourceUser}
            </Text>
            <Text style={styles.previewMuted}>
              {formatTemplate(t.sell.weatherForecast, {
                temp: formatNumber(estimate.temp_c),
                humidity: formatNumber(estimate.humidity),
              })}
            </Text>
            {estimate.weather_source === 'fallback' ? (
              <Text style={styles.previewMuted}>{t.sell.weatherFallback}</Text>
            ) : null}
          </>
        )}
      </Card>

      {submitError !== null ? <Text style={styles.previewError}>{submitError}</Text> : null}
      <PrimaryButton
        label={isEditing ? t.sell.saveEdit : t.sell.publish}
        onPress={() => {
          if (ripeness === null) {
            setFieldErrors((prev) => ({ ...prev, ripeness: t.sell.ripenessRequired }));
            setSubmitError(t.sell.ripenessRequired);
            return;
          }
          void onSubmit();
        }}
        loading={submitting}
        disabled={!(weightNum > 0) || ripeness === null}
      />
      {isEditing ? (
        <SecondaryButton label={t.sell.cancelEdit} onPress={onCancelEdit} />
      ) : null}
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
  const { t, formatNumber, cropName, translateError } = useI18n();
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
      emptyText={t.sell.myLotsEmpty}
    >
      {(lots) => (
        <Body>
          {lots.map((lot: MyLot) => {
            const hours = hoursLeftFrom(lot.expires_at, now);
            const tone = urgency(hours);
            const canEdit = lot.status === 'open' || lot.status === 'partially_reserved';
            const remaining = lot.remaining_kg ?? lot.weight_kg;
            const statusLabel = t.status[lot.status] ?? lot.status;
            return (
              <Card key={lot.id}>
                <View style={styles.lotHeader}>
                  <Text style={styles.lotTitle}>
                    {formatTemplate(t.sell.remainingOf, {
                      crop: cropName({
                        name_th: lot.crop_name_th,
                        name_en: lot.crop_name_en,
                      }),
                      remaining: formatNumber(remaining),
                      total: formatNumber(lot.weight_kg),
                    })}
                  </Text>
                  <Badge text={statusLabel} fg={C.leaf} bg={C.leafSoft} />
                </View>
                <View style={styles.badgeRow}>
                  <Badge
                    text={t.saleMode[lot.sale_mode] ?? lot.sale_mode}
                    fg={lot.sale_mode === 'donate' ? C.turmeric : C.leaf}
                    bg={lot.sale_mode === 'donate' ? C.turmericSoft : C.leafSoft}
                  />
                  <Badge
                    text={lot.split_allowed === false ? t.sell.wholeLotBadge : t.sell.splitBadge}
                    fg={C.mute}
                    bg={C.leafSoft}
                  />
                  {lot.sale_mode === 'sell_then_donate' && lot.donation_opened ? (
                    <Badge text={t.sell.donationOpened} fg={C.turmeric} bg={C.turmericSoft} />
                  ) : null}
                </View>
                <Text style={styles.lotMeta}>{formatTemplate(t.sell.lotMeta, { id: lot.id })}</Text>
                <Text style={styles.lotLine}>
                  {formatTemplate(t.sell.plotLine, { name: lot.plot_name })}
                </Text>
                {lot.sale_mode === 'donate' || lot.price_per_kg === null ? (
                  <Text style={styles.lotLine}>{t.sell.donateNoCharge}</Text>
                ) : (
                  <Text style={styles.lotLine}>
                    {formatTemplate(t.sell.flashPrice, {
                      price: formatNumber(lot.price_per_kg),
                    })}
                  </Text>
                )}
                <Text style={styles.lotLine}>
                  {lot.grade === 'substandard' ? t.grade.substandard : t.grade.normal}
                  {' · '}
                  {formatTemplate(t.sell.ripenessLine, {
                    label: t.ripenessLabels[lot.ripeness] ?? String(lot.ripeness),
                  })}
                </Text>
                {lot.bookings !== undefined && lot.bookings.length > 0 ? (
                  <View style={styles.bookingsBox}>
                    <Text style={styles.bookingsTitle}>
                      {formatTemplate(t.sell.bookings, { count: lot.bookings.length })}
                    </Text>
                    {lot.bookings.map((booking) => (
                      <Pressable
                        key={booking.order_id}
                        onPress={() => router.push(`/orders/${booking.order_id}`)}
                      >
                        <Text style={styles.lotLine}>
                          #{booking.order_id}
                          {booking.buyer_name !== undefined ? ` ${booking.buyer_name}` : ''} ·{' '}
                          {formatNumber(booking.quantity_kg)} {t.common.kg} ·{' '}
                          {booking.is_donation
                            ? t.saleMode.donate
                            : formatTemplate(t.sell.flashPrice, {
                                price: formatNumber(booking.agreed_price_per_kg),
                              })}{' '}
                          · {t.status[booking.status] ?? booking.status}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <Badge
                  text={
                    lot.status === 'open'
                      ? formatCountdownLocalized(hours, t)
                      : urgencyLabel(hours, t)
                  }
                  fg={tone.fg}
                  bg={tone.bg}
                />
                {canEdit ? (
                  <View style={styles.editBtn}>
                    <SecondaryButton label={t.common.edit} onPress={() => onEdit(lot)} />
                  </View>
                ) : null}
                {canEdit && (lot.bookings === undefined || lot.bookings.length === 0) ? (
                  <View style={styles.editBtn}>
                    <SecondaryButton
                      label={t.sell.deleteLot}
                      onPress={() => {
                        Alert.alert(t.sell.confirmDeleteTitle, t.sell.confirmDeleteBody, [
                          { text: t.common.cancel, style: 'cancel' },
                          {
                            text: t.sell.confirmDeleteAction,
                            style: 'destructive',
                            onPress: () => {
                              void (async () => {
                                try {
                                  await api.deleteLot(lot.id);
                                  reload();
                                } catch (err) {
                                  Alert.alert(
                                    t.sell.deleteFailed,
                                    err instanceof ApiError
                                      ? translateError(err.code, err.message)
                                      : t.common.genericError,
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
