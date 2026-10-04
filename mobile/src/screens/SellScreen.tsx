import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { confirmAlert } from '../lib/confirm';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { ApiError } from '../api/client';
import { ripenessLabel } from '../constants';
import { AiPhotoInput } from '../components/AiPhotoInput';
import { ChipGroup, FormField, useFieldScroll } from '../components/form';
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
import { mediaUri } from '../lib/media';
import { C, urgency } from '../theme';
import type {
  AssessPhotoResponse,
  Crop,
  CropCategory,
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

const DESCRIPTION_MIN_HEIGHT = 84; // ~3 lines
const DESCRIPTION_MAX_HEIGHT = 156; // ~6 lines

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
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();

  useEffect(() => {
    if (tabParam === 'mine') {
      setTab('mine');
    }
  }, [tabParam]);

  const onCreated = useCallback(
    (summary?: {
      crop?: string;
      weight?: string;
      price?: string;
      photoUrl?: string;
      saleMode?: string;
      startPrice?: string;
      shelfHours?: string;
    }) => {
      setEditingLot(null);
      setFormDirty(false);
      setRefreshKey((value) => value + 1);
      setTab('mine');
      router.push({
        pathname: '/sell/success',
        params: {
          ...(summary?.crop != null ? { crop: summary.crop } : {}),
          ...(summary?.weight != null ? { weight: summary.weight } : {}),
          ...(summary?.price != null ? { price: summary.price } : {}),
          ...(summary?.photoUrl != null ? { photoUrl: summary.photoUrl } : {}),
          ...(summary?.saleMode != null ? { saleMode: summary.saleMode } : {}),
          ...(summary?.startPrice != null ? { startPrice: summary.startPrice } : {}),
          ...(summary?.shelfHours != null ? { shelfHours: summary.shelfHours } : {}),
        },
      });
    },
    [router],
  );

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
      confirmAlert({
        title: t.sell.unsavedTitle,
        message: t.sell.unsavedLeave,
        confirmText: t.sell.leave,
        cancelText: t.sell.stay,
        destructive: true,
        onConfirm: () => {
          setFormDirty(false);
          navigation.dispatch(event.data.action);
        },
      });
    });
    return unsubscribe;
  }, [navigation, formDirty, tab, t]);

  return (
    <Screen skipTopSafeArea>
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
              confirmAlert({
                title: t.sell.unsavedTitle,
                message: t.sell.unsavedSwitch,
                confirmText: t.sell.switchTab,
                cancelText: t.sell.stay,
                destructive: true,
                onConfirm: () => {
                  setEditingLot(null);
                  setFormDirty(false);
                  setTab('mine');
                },
              });
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
  onCreated: (summary?: {
    crop?: string;
    weight?: string;
    price?: string;
    photoUrl?: string;
    saleMode?: string;
    startPrice?: string;
    shelfHours?: string;
  }) => void;
  onPlotCreated: () => void;
  onCancelEdit: () => void;
  onDirtyChange: (dirty: boolean) => void;
}): React.ReactElement {
  const { t } = useI18n();
  const meta = useApiData(async () => {
    const [crops, plots, frequentCrops, categories] = await Promise.all([
      api.getCrops(),
      api.getPlots(),
      api.getMyFrequentCrops().catch(() => [] as Crop[]),
      api.getCropCategories().catch(() => [] as CropCategory[]),
    ]);
    return { crops, plots, frequentCrops, categories };
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
            frequentCrops={data.frequentCrops}
            categories={data.categories}
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
  frequentCrops,
  categories,
  plots,
  editingLot,
  onCreated,
  onCancelEdit,
  onDirtyChange,
}: {
  api: ReturnType<typeof useAuth>['api'];
  crops: Crop[];
  frequentCrops: Crop[];
  categories: CropCategory[];
  plots: Plot[];
  editingLot: MyLot | null;
  onCreated: (summary?: {
    crop?: string;
    weight?: string;
    price?: string;
    photoUrl?: string;
    saleMode?: string;
    startPrice?: string;
    shelfHours?: string;
  }) => void;
  onCancelEdit: () => void;
  onDirtyChange: (dirty: boolean) => void;
}): React.ReactElement {
  const { t, locale, formatNumber, formatDate, cropName, translateError, translateFieldError } =
    useI18n();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const { scrollRef, registerY, scrollToField } = useFieldScroll();
  const isEditing = editingLot !== null;
  const cropLockedByOrders =
    isEditing && editingLot !== null && editingLot.bookings !== undefined && editingLot.bookings.length > 0;
  const canChangeCrop = !cropLockedByOrders;
  const [cropId, setCropId] = useState<number>(editingLot?.crop_id ?? crops[0]?.id ?? 0);
  const [plotId, setPlotId] = useState<number>(editingLot?.plot_id ?? plots[0]?.id ?? 0);
  const [weight, setWeight] = useState(editingLot !== null ? String(editingLot.weight_kg) : '');
  const [ripeness, setRipeness] = useState<number | null>(editingLot?.ripeness ?? null);
  const [ripenessSource, setRipenessSource] = useState<'user' | 'ai' | null>(
    editingLot !== null ? 'user' : null,
  );
  const [grade, setGrade] = useState<Grade>(editingLot?.grade ?? 'substandard');
  const [description, setDescription] = useState(editingLot?.description ?? '');
  const [descriptionHeight, setDescriptionHeight] = useState(DESCRIPTION_MIN_HEIGHT);
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
  // true once the seller typed a price (or the lot being edited already has prices);
  // until then suggested prices follow the estimate (e.g. re-seed on grade change).
  const [pricesEdited, setPricesEdited] = useState(
    editingLot?.start_price_per_kg !== null && editingLot?.start_price_per_kg !== undefined,
  );
  // true once the seller has typed into the floor field THIS session; until then, changing
  // the start price keeps re-suggesting the floor (30% of start, not below the market minimum).
  const [floorEdited, setFloorEdited] = useState(false);
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [assessing, setAssessing] = useState(false);
  const [assessElapsedSec, setAssessElapsedSec] = useState(0);
  const assessRequestIdRef = useRef(0);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  // Kept separate from aiResult: the photo is always saved server-side (even when the AI
  // check is unavailable or reports a subject mismatch), so it must survive a null aiResult.
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string | null>(
    editingLot?.photo_url ?? null,
  );
  const [aiResult, setAiResult] = useState<
    Extract<AssessPhotoResponse, { available: true; subject_match: true }> | null
  >(null);
  const [aiEdited, setAiEdited] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [cropSearch, setCropSearch] = useState('');
  const [showProposeForm, setShowProposeForm] = useState(false);
  const [proposeNameTh, setProposeNameTh] = useState('');
  const [proposeNameEn, setProposeNameEn] = useState('');
  const [proposeCategoryId, setProposeCategoryId] = useState<number>(0);
  const [proposePrice, setProposePrice] = useState('');
  const [proposeSubmitting, setProposeSubmitting] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);
  const [proposeNearMatches, setProposeNearMatches] = useState<
    Array<{ id: number; name_th: string; name_en: string | null }>
  >([]);
  const primedDirty = useRef(false);
  const editingLotRef = useRef<MyLot | null>(null);

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
    if (!assessing) {
      return;
    }
    const timer = setInterval(() => {
      setAssessElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [assessing]);

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

  // Single effect for both "sync form to the lot being edited" and "user changed the crop"
  // (merged to avoid a two-effect race: cropId and editingLot can both change in one commit
  // when entering edit mode, and a photo/price reset from the crop-change branch would
  // otherwise clobber the just-synced photo before the sync effect's state settles).
  useEffect(() => {
    if (editingLot !== editingLotRef.current) {
      editingLotRef.current = editingLot;
      if (editingLot !== null) {
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
        setPricesEdited(
          editingLot.start_price_per_kg !== null && editingLot.start_price_per_kg !== undefined,
        );
        setFloorEdited(false);
        setDescription(editingLot.description ?? '');
        setDescriptionHeight(DESCRIPTION_MIN_HEIGHT);
        setAiResult(null);
        setAiEdited(false);
        setAiMessage(null);
        setPhotoPreview(mediaUri(editingLot.photo_url));
        setUploadedPhotoUrl(editingLot.photo_url ?? null);
        setSubmitError(null);
      } else {
        setAiResult(null);
        setAiEdited(false);
        setAiMessage(null);
        setPhotoPreview(null);
        setUploadedPhotoUrl(null);
        setPricesEdited(false);
        setFloorEdited(false);
        setStartPrice('');
        setFloorPrice('');
        setDescription('');
        setDescriptionHeight(DESCRIPTION_MIN_HEIGHT);
        setRipeness(null);
        setRipenessSource(null);
        setEstimate(null);
      }
      return;
    }
    // editingLot identity is unchanged — a dependency change here means the seller picked
    // a different crop (create flow, or an in-place crop change while editing).
    if (isEditing && editingLot !== null) {
      // In edit mode: restore original photo if switching back to original crop, else clear on change.
      if (cropId === editingLot.crop_id) {
        setPhotoPreview(mediaUri(editingLot.photo_url));
        setUploadedPhotoUrl(editingLot.photo_url ?? null);
        setAiResult(null);
        setAiEdited(false);
        setAiMessage(null);
      } else {
        setAiResult(null);
        setAiEdited(false);
        setAiMessage(null);
        setPhotoPreview(null);
        setUploadedPhotoUrl(null);
      }
    } else if (!isEditing) {
      // Create mode: clear photo/AI on any crop change.
      setAiResult(null);
      setAiEdited(false);
      setAiMessage(null);
      setPhotoPreview(null);
      setUploadedPhotoUrl(null);
      setPricesEdited(false);
      setFloorEdited(false);
      setStartPrice('');
      setFloorPrice('');
      setRipeness(null);
      setRipenessSource(null);
      setEstimate(null);
    }
  }, [editingLot, cropId, isEditing]);

  const startNum = Number(startPrice);
  const floorNum = Number(floorPrice);
  // Only treat the price fields as a seller override once pricesEdited is true — otherwise a
  // grade change would re-send the previous grade's auto-seeded price as an "override" for one
  // debounce cycle, computing price_per_kg from the stale value before it self-corrects.
  const hasCustomPrices = modeHasPrice(saleMode) && pricesEdited && startNum > 0 && floorNum > 0;

  const seedPrices = useCallback((result: EstimateResponse) => {
    setStartPrice(String(result.suggested_start_price_per_kg));
    setFloorPrice(String(result.suggested_floor_price_per_kg));
    setFieldErrors((prev) => {
      const cleared = { ...prev };
      delete cleared.start_price_per_kg;
      delete cleared.floor_price_per_kg;
      return cleared;
    });
  }, []);

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
            if (modeHasPrice(saleMode) && !pricesEdited) {
              seedPrices(result);
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
    pricesEdited,
    seedPrices,
    t,
    translateError,
  ]);

  const weightNum = Number(weight);
  const minOrderNum = Number(minOrderKg);
  const displayPrice =
    estimate !== null && modeHasPrice(saleMode) ? estimate.price_per_kg : null;
  const totalPrice = displayPrice !== null && weightNum > 0 ? Math.round(displayPrice * weightNum) : null;
  // Price fields wait for the API suggestion; unlocked if the estimate failed so the seller is not stuck.
  const pricesLocked = estimate === null && !pricesEdited && estimateError === null;
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

  /** A ripeness tap after a long wait cancels the pending assessment; its result is then ignored. */
  const cancelAssessment = (): void => {
    assessRequestIdRef.current += 1;
    setAssessing(false);
    setAssessElapsedSec(0);
  };

  const runAssessment = async (uri: string, width: number, height: number): Promise<void> => {
    const requestId = (assessRequestIdRef.current += 1);
    setAssessing(true);
    setAssessElapsedSec(0);
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
      if (assessRequestIdRef.current !== requestId) {
        return;
      }
      // Photo is always saved server-side even when the AI check fails or is unavailable.
      setUploadedPhotoUrl(result.photo_url);
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
      if (assessRequestIdRef.current !== requestId) {
        return;
      }
      setAiResult(null);
      setAiEdited(false);
      setAiMessage(
        err instanceof ApiError
          ? translateError(err.code, err.message)
          : t.sell.aiFailedPickManual,
      );
    } finally {
      if (assessRequestIdRef.current === requestId) {
        setAssessing(false);
      }
    }
  };

  const clearPhoto = (): void => {
    setPhotoPreview(null);
    setUploadedPhotoUrl(null);
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
    if (modeHasPrice(next) && !pricesEdited && estimate !== null) {
      seedPrices(estimate);
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
      const first = Object.keys(nextErrors)[0] ?? null;
      scrollToField(first);
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
      const descriptionValue = description.trim() === '' ? null : description.trim();
      if (isEditing && editingLot !== null) {
        const loweringRipeness = ripeness !== null && ripeness < editingLot.ripeness;
        const cropChanged = cropId !== editingLot.crop_id;
        await api.patchLot(editingLot.id, {
          ...(cropChanged ? { crop_id: cropId } : {}),
          weight_kg: weightNum,
          grade,
          ripeness: ripeness as number,
          sale_mode: saleMode,
          donation_audience: audience,
          ...priceFields,
          ...splitFields,
          description: descriptionValue,
          ...(aiResult !== null ? { ai_ripeness: aiResult.ripeness } : {}),
          ...(uploadedPhotoUrl !== (editingLot.photo_url ?? null)
            ? { photo_url: uploadedPhotoUrl }
            : {}),
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
          description: descriptionValue,
          photo_url: uploadedPhotoUrl,
          ai_ripeness: aiResult?.ripeness ?? null,
          ai_confidence: aiResult?.confidence ?? null,
          ai_model: aiResult?.model ?? null,
        });
      }
      const selectedCrop = crops.find((c) => c.id === cropId);
      onCreated({
        crop: selectedCrop !== undefined ? cropName(selectedCrop) : undefined,
        weight: String(weightNum),
        price: displayPrice !== null ? String(displayPrice) : undefined,
        photoUrl: uploadedPhotoUrl ?? undefined,
        saleMode,
        startPrice: modeHasPrice(saleMode) && startNum > 0 ? String(startNum) : undefined,
        shelfHours: estimate !== null ? String(estimate.shelf_hours) : undefined,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields !== undefined) {
          setFieldErrors(
            Object.fromEntries(
              Object.entries(err.fields).map(([key, value]) => [key, translateFieldError(value)]),
            ),
          );
          const firstField = Object.keys(err.fields)[0] ?? null;
          scrollToField(firstField);
        }
        setSubmitError(translateError(err.code, err.message));
      } else {
        setSubmitError(isEditing ? t.sell.editFailed : t.sell.publishFailed);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitPress = (): void => {
    if (ripeness === null) {
      setFieldErrors((prev) => ({ ...prev, ripeness: t.sell.ripenessRequired }));
      setSubmitError(t.sell.ripenessRequired);
      scrollToField('ripeness');
      return;
    }
    void onSubmit();
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
    <KeyboardAvoidingView
      style={styles.formWrap}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <Body scrollRef={scrollRef}>
        {isEditing ? (
          <View style={styles.editSummaryCard}>
            {mediaUri(editingLot.photo_url) !== null ? (
              <Image source={{ uri: mediaUri(editingLot.photo_url)! }} style={styles.editSummaryThumb} />
            ) : (
              <View style={[styles.editSummaryThumb, styles.editSummaryThumbPlaceholder]} />
            )}
            <Text style={styles.editSummaryText} numberOfLines={2}>
              {formatTemplate(t.sell.editSummary, {
                crop: cropName({ name_th: editingLot.crop_name_th, name_en: editingLot.crop_name_en }),
                weight: formatNumber(editingLot.weight_kg),
                date: formatDate(editingLot.created_at),
              })}
            </Text>
          </View>
        ) : null}

      <SectionTitle>{t.sell.selectCrop}</SectionTitle>
      {isEditing && cropLockedByOrders ? (
        <>
          <View style={styles.cropLockedRow}>
            <Badge
              text={cropName({ name_th: editingLot!.crop_name_th, name_en: editingLot!.crop_name_en })}
              fg={C.leafDeep}
              bg={C.leafSoft}
            />
          </View>
          <Text style={styles.cropLockedHint}>{t.sell.cropLockedHasOrders}</Text>
        </>
      ) : (
        <>
          <TextInput
            style={styles.cropSearchInput}
            value={cropSearch}
            onChangeText={setCropSearch}
            placeholder={t.sell.searchCropPlaceholder}
            placeholderTextColor={C.mute}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {frequentCrops.length > 0 && cropSearch.trim() === '' ? (
            <>
              <Text style={styles.cropSubheading}>{t.sell.frequentCropsSection}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {frequentCrops.map((crop) => (
                  <Chip
                    key={crop.id}
                    label={cropName(crop)}
                    selected={crop.id === cropId}
                    onPress={() => { setCropId(crop.id); }}
                  />
                ))}
              </ScrollView>
              <Text style={styles.cropSubheading}>{t.sell.allCropsSection}</Text>
            </>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            {(cropSearch.trim() === ''
              ? crops
              : crops.filter((c) => {
                  const q = cropSearch.trim().toLowerCase();
                  return c.name_th.toLowerCase().includes(q) ||
                    (c.name_en ?? '').toLowerCase().includes(q);
                })
            ).map((crop) => (
              <Chip
                key={crop.id}
                label={cropName(crop)}
                selected={crop.id === cropId}
                onPress={() => {
                  setCropId(crop.id);
                }}
              />
            ))}
          </ScrollView>
          {isEditing && cropId !== editingLot!.crop_id ? (
            <Text style={styles.cropChangeHint}>{t.sell.cropChangeHint}</Text>
          ) : null}
        </>
      )}
      {canChangeCrop ? (
        <Pressable
          style={styles.addCropButton}
          onPress={() => { setShowProposeForm((v) => !v); }}
        >
          <Text style={styles.addCropButtonText}>{t.sell.addNewCrop}</Text>
        </Pressable>
      ) : null}
      {showProposeForm ? (
        <View style={styles.proposeForm}>
          <Field
            label={t.sell.proposeCropNameTh}
            value={proposeNameTh}
            onChangeText={setProposeNameTh}
          />
          <Field
            label={t.sell.proposeCropNameEn}
            value={proposeNameEn}
            onChangeText={setProposeNameEn}
          />
          <SectionTitle>{t.sell.proposeCropCategory}</SectionTitle>
          <View style={styles.row}>
            {categories.map((cat) => (
              <Chip
                key={cat.id}
                label={locale === 'en' && cat.name_en !== null ? cat.name_en : cat.name_th}
                selected={cat.id === proposeCategoryId}
                onPress={() => { setProposeCategoryId(cat.id); }}
              />
            ))}
          </View>
          {proposeCategoryId !== 0 ? (() => {
            const selectedCat = categories.find((c) => c.id === proposeCategoryId);
            if (selectedCat === undefined) return null;
            const exampleNames = (selectedCat.example_crops ?? [])
              .map((c) => (locale === 'en' && c.name_en !== null ? c.name_en : c.name_th))
              .join(', ');
            const shelfDays = selectedCat.default_shelf_days ?? 0;
            if (exampleNames === '' || shelfDays === 0) return null;
            return (
              <Text style={styles.categoryHint}>
                {formatTemplate(t.sell.proposeCropCategoryHint, {
                  examples: exampleNames,
                  days: shelfDays,
                })}
              </Text>
            );
          })() : null}
          <Field
            label={t.sell.proposeCropPrice}
            value={proposePrice}
            onChangeText={setProposePrice}
            keyboardType="numeric"
          />
          {proposeError !== null ? (
            <Text style={styles.previewError}>{proposeError}</Text>
          ) : null}
          {proposeNearMatches.length > 0 ? (
            <View style={styles.nearMatchBox}>
              <Text style={styles.nearMatchTitle}>{t.sell.proposeCropNearMatch}</Text>
              {proposeNearMatches.map((c) => (
                <Pressable
                  key={c.id}
                  style={styles.nearMatchItem}
                  onPress={() => {
                    setCropId(c.id);
                    setShowProposeForm(false);
                    setProposeNearMatches([]);
                    setProposeNameTh('');
                    setProposeNameEn('');
                    setProposeCategoryId(0);
                    setProposePrice('');
                  }}
                >
                  <Text style={styles.nearMatchName}>
                    {locale === 'en' && c.name_en !== null ? c.name_en : c.name_th}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                style={styles.addCropButton}
                onPress={async () => {
                  setProposeSubmitting(true);
                  setProposeError(null);
                  setProposeNearMatches([]);
                  try {
                    await api.proposeCrop({
                      name_th: proposeNameTh.trim(),
                      name_en: proposeNameEn.trim() !== '' ? proposeNameEn.trim() : undefined,
                      category_id: proposeCategoryId,
                      market_price_per_kg: Number(proposePrice),
                      force: true,
                    });
                    setShowProposeForm(false);
                    setProposeNameTh('');
                    setProposeNameEn('');
                    setProposeCategoryId(0);
                    setProposePrice('');
                    Alert.alert('', t.sell.proposeCropSuccess);
                  } catch (err) {
                    setProposeError(
                      err instanceof ApiError
                        ? err.code === 'PRICE_SANITY'
                          ? t.sell.proposeCropPriceSanity
                          : err.code === 'DUPLICATE'
                            ? t.sell.proposeCropDuplicate
                            : t.sell.proposeCropFailed
                        : t.sell.proposeCropFailed,
                    );
                  } finally {
                    setProposeSubmitting(false);
                  }
                }}
              >
                <Text style={styles.addCropButtonText}>{t.sell.proposeCropForceAdd}</Text>
              </Pressable>
            </View>
          ) : null}
          <PrimaryButton
            label={t.sell.proposeCropSubmit}
            loading={proposeSubmitting}
            disabled={proposeNameTh.trim().length === 0 || proposeCategoryId === 0 || Number(proposePrice) <= 0}
            onPress={async () => {
              setProposeSubmitting(true);
              setProposeError(null);
              setProposeNearMatches([]);
              try {
                await api.proposeCrop({
                  name_th: proposeNameTh.trim(),
                  name_en: proposeNameEn.trim() !== '' ? proposeNameEn.trim() : undefined,
                  category_id: proposeCategoryId,
                  market_price_per_kg: Number(proposePrice),
                });
                setShowProposeForm(false);
                setProposeNameTh('');
                setProposeNameEn('');
                setProposeCategoryId(0);
                setProposePrice('');
                Alert.alert('', t.sell.proposeCropSuccess);
              } catch (err) {
                if (err instanceof ApiError) {
                  if (err.code === 'NEAR_MATCH') {
                    const suggestions = (err.details?.suggestions ?? []) as Array<{
                      id: number;
                      name_th: string;
                      name_en: string | null;
                    }>;
                    setProposeNearMatches(suggestions);
                  } else if (err.code === 'DUPLICATE') {
                    setProposeError(t.sell.proposeCropDuplicate);
                  } else if (err.code === 'PRICE_SANITY') {
                    setProposeError(t.sell.proposeCropPriceSanity);
                  } else {
                    setProposeError(t.sell.proposeCropFailed);
                  }
                } else {
                  setProposeError(t.sell.proposeCropFailed);
                }
              } finally {
                setProposeSubmitting(false);
              }
            }}
          />
        </View>
      ) : null}

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
        disabled={assessing && assessElapsedSec < 20}
        onChange={(next) => {
          const value = Number(Array.isArray(next) ? next[0] : next);
          if (assessing) {
            cancelAssessment();
          }
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
        assessElapsedSec={assessElapsedSec}
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
      {grade === 'substandard' && pricesEdited ? (
        <Text style={styles.cropChangeHint}>{t.sell.substandardPriceHint}</Text>
      ) : null}

      <FormField
        label={t.sell.descriptionLabel}
        name="description"
        value={description}
        onChangeText={(text) => setDescription(text.slice(0, 500))}
        placeholder={t.sell.descriptionPlaceholder}
        multiline
        numberOfLines={3}
        maxLength={500}
        style={[styles.descriptionInput, { height: descriptionHeight }]}
        onContentSizeChange={(e: { nativeEvent: { contentSize: { height: number } } }) => {
          setDescriptionHeight(
            Math.max(
              DESCRIPTION_MIN_HEIGHT,
              Math.min(DESCRIPTION_MAX_HEIGHT, e.nativeEvent.contentSize.height + 24),
            ),
          );
        }}
      />
      <Text style={styles.descriptionCounter}>
        {formatTemplate(t.sell.descriptionCounter, { n: description.length, max: 500 })}
      </Text>

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
          {pricesLocked ? (
            <Text style={styles.priceLockedHint}>{t.sell.pricesLockedHint}</Text>
          ) : null}
          <View style={pricesLocked ? styles.priceFieldLocked : undefined}>
            <Field
              label={t.sell.startPrice}
              value={startPrice}
              editable={!pricesLocked}
              onChangeText={(text) => {
                setStartPrice(text);
                setPricesEdited(true);
                setFieldErrors((prev) => {
                  const cleared = { ...prev };
                  delete cleared.start_price_per_kg;
                  return cleared;
                });
                if (!floorEdited && estimate !== null) {
                  const startVal = Number(text);
                  if (startVal > 0) {
                    const suggested = Math.max(
                      Math.round(startVal * 0.3 * 100) / 100,
                      estimate.min_floor_price_per_kg,
                    );
                    setFloorPrice(String(suggested));
                    setFieldErrors((prev) => {
                      const cleared = { ...prev };
                      delete cleared.floor_price_per_kg;
                      return cleared;
                    });
                  }
                }
              }}
              onBlur={() => {
                if (estimate === null) {
                  return;
                }
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
          </View>
          {!pricesLocked ? (
            <Text style={styles.fieldHint}>{t.sell.startPriceHint}</Text>
          ) : null}
          {estimate !== null ? (
            <View style={styles.priceHelp}>
              <Text style={styles.priceHelpText}>
                {estimate.market_quote.source === 'crop_fallback'
                  ? formatTemplate(t.sell.priceRefBackup, {
                      price: formatNumber(estimate.market_quote.price_per_kg),
                    }) + (estimate.market_quote.seasonal_adjusted ? t.sell.priceRefSeasonal : '')
                  : estimate.market_quote.is_estimate
                    ? formatTemplate(t.sell.priceRefEstimate, {
                        price: formatNumber(estimate.market_quote.price_per_kg),
                      }) + (estimate.market_quote.seasonal_adjusted ? t.sell.priceRefSeasonal : '')
                    : formatTemplate(t.sell.priceRefMoc, {
                        price: formatNumber(estimate.market_quote.price_per_kg),
                        date:
                          estimate.market_quote.as_of !== null
                            ? formatDate(estimate.market_quote.as_of)
                            : '',
                      })}
              </Text>
              {startNum > 0 && estimate.max_start_price_per_kg > 0 && startNum > estimate.max_start_price_per_kg ? (
                <Text style={styles.priceWarning}>
                  {formatTemplate(t.sell.priceAboveMarketWarning, {
                    percent: Math.round(
                      ((startNum - estimate.max_start_price_per_kg) / estimate.max_start_price_per_kg) * 100,
                    ),
                  })}
                </Text>
              ) : null}
              {estimate.nearby_median_price_per_kg !== null ? (
                <Text style={styles.priceHelpText}>
                  {formatTemplate(t.sell.nearbyMedian, {
                    price: formatNumber(estimate.nearby_median_price_per_kg),
                  })}
                </Text>
              ) : null}
            </View>
          ) : null}
          <View style={pricesLocked ? styles.priceFieldLocked : undefined}>
            <Field
              label={t.sell.floorPrice}
              value={floorPrice}
              editable={!pricesLocked}
              onChangeText={(text) => {
                setFloorPrice(text);
                setPricesEdited(true);
                setFloorEdited(true);
                setFieldErrors((prev) => {
                  const cleared = { ...prev };
                  delete cleared.floor_price_per_kg;
                  const n = Number(text);
                  if (estimate !== null && n > 0 && n < estimate.min_floor_price_per_kg) {
                    cleared.floor_price_per_kg = formatTemplate(t.sell.floorBelowMinimum, {
                      price: formatNumber(estimate.min_floor_price_per_kg),
                    });
                  }
                  return cleared;
                });
              }}
              onBlur={() => {
                if (estimate === null) {
                  return;
                }
                const n = Number(floorPrice);
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  if (!(n > 0)) {
                    next.floor_price_per_kg = t.sell.needFloorPrice;
                  } else if (n < estimate.min_floor_price_per_kg) {
                    next.floor_price_per_kg = formatTemplate(t.sell.floorBelowMinimum, {
                      price: formatNumber(estimate.min_floor_price_per_kg),
                    });
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
          </View>
          {estimate !== null ? (
            <View style={styles.priceHelp}>
              <Text style={styles.priceHelpStrong}>
                {formatTemplate(t.sell.floorPriceMin, {
                  price: formatNumber(estimate.min_floor_price_per_kg),
                  pct: formatNumber(estimate.min_floor_pct_of_market),
                })}
              </Text>
            </View>
          ) : null}
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

    </Body>
    <View style={[styles.stickyFooter, { paddingBottom: isWide ? insets.bottom + 12 : 12 }]}>
      {submitError !== null ? <Text style={styles.previewError}>{submitError}</Text> : null}
      {isEditing ? (
        <View style={styles.footerButtonRow}>
          <View style={{ flex: 1 }}>
            <PrimaryButton
              label={t.sell.saveEdit}
              onPress={handleSubmitPress}
              loading={submitting}
              disabled={!(weightNum > 0) || ripeness === null || assessing}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <SecondaryButton label={t.sell.cancelEdit} onPress={onCancelEdit} />
          </View>
        </View>
      ) : (
        <PrimaryButton
          label={t.sell.publish}
          block
          onPress={handleSubmitPress}
          loading={submitting}
          disabled={!(weightNum > 0) || ripeness === null || assessing}
        />
      )}
    </View>
    </KeyboardAvoidingView>
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'booked' | 'expired'>('all');

  const statusOptions: Array<{ key: typeof statusFilter; label: string }> = [
    { key: 'all', label: t.sell.filterAll },
    { key: 'open', label: t.sell.filterOpen },
    { key: 'booked', label: t.sell.filterBooked },
    { key: 'expired', label: t.sell.filterExpired },
  ];

  return (
    <DataState
      loading={loading}
      error={error}
      data={data}
      onRetry={reload}
      isEmpty={(lots) => lots.length === 0}
      emptyText={t.sell.myLotsEmpty}
    >
      {(lots) => {
        const filtered = lots.filter((lot) => {
          const q = search.trim().toLowerCase();
          const matchesSearch =
            q === '' ||
            lot.crop_name_th.toLowerCase().includes(q) ||
            (lot.crop_name_en ?? '').toLowerCase().includes(q) ||
            (lot.description ?? '').toLowerCase().includes(q);
          if (!matchesSearch) {
            return false;
          }
          if (statusFilter === 'all') {
            return true;
          }
          const hours = hoursLeftFrom(lot.expires_at, now);
          const expired = lot.status === 'expired' || hours <= 0;
          if (statusFilter === 'expired') {
            return expired;
          }
          const booked = lot.bookings !== undefined && lot.bookings.length > 0;
          if (statusFilter === 'booked') {
            return booked;
          }
          return (lot.status === 'open' || lot.status === 'partially_reserved') && !expired;
        });

        return (
        <Body>
          <TextInput
            style={styles.myLotsSearchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={t.sell.myLotsSearchPlaceholder}
            placeholderTextColor={C.mute}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          <View style={styles.myLotsFilterRow}>
            {statusOptions.map((opt) => (
              <Chip
                key={opt.key}
                label={opt.label}
                selected={statusFilter === opt.key}
                onPress={() => setStatusFilter(opt.key)}
              />
            ))}
          </View>
          {filtered.length === 0 ? (
            <Text style={styles.myLotsFilterEmpty}>{t.sell.myLotsFilterEmpty}</Text>
          ) : null}
          {filtered.map((lot: MyLot) => {
            const hours = hoursLeftFrom(lot.expires_at, now);
            const tone = urgency(hours);
            const canEdit = lot.status === 'open' || lot.status === 'partially_reserved';
            const remaining = lot.remaining_kg ?? lot.weight_kg;
            const statusLabel = t.status[lot.status] ?? lot.status;
            return (
              <Card key={lot.id}>
                <View style={styles.myLotTopRow}>
                  {mediaUri(lot.photo_url) !== null ? (
                    <Image source={{ uri: mediaUri(lot.photo_url)! }} style={styles.myLotThumb} />
                  ) : (
                    <View style={[styles.myLotThumb, styles.myLotThumbPlaceholder]} />
                  )}
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
                </View>
                {lot.description !== null && lot.description !== undefined && lot.description !== '' ? (
                  <Text style={styles.myLotDescription} numberOfLines={2}>
                    {lot.description}
                  </Text>
                ) : null}
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
                  {ripenessLabel(t, lot.ripeness) !== null
                    ? ` · ${formatTemplate(t.sell.ripenessLine, { label: ripenessLabel(t, lot.ripeness) as string })}`
                    : ''}
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
                      tone="danger"
                      label={t.sell.deleteLot}
                      onPress={() => {
                        confirmAlert({
                          title: t.sell.confirmDeleteTitle,
                          message: t.sell.confirmDeleteBody,
                          confirmText: t.sell.confirmDeleteAction,
                          cancelText: t.common.cancel,
                          destructive: true,
                          onConfirm: () => {
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
                        });
                      }}
                    />
                  </View>
                ) : null}
              </Card>
            );
          })}
        </Body>
        );
      }}
    </DataState>
  );
}

const styles = StyleSheet.create({
  formWrap: { flex: 1 },
  stickyFooter: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.surface,
    gap: 8,
  },
  footerButtonRow: { flexDirection: 'row', gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  plotName: { color: C.ink, fontSize: 16, fontWeight: '400', marginBottom: 12 },
  addPlotHint: { color: C.mute, marginBottom: 12 },
  editSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.turmericSoft,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  editSummaryThumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: C.leafSoft },
  editSummaryThumbPlaceholder: { backgroundColor: C.line },
  editSummaryText: { flex: 1, color: C.ink, fontWeight: '600' },
  aiWarn: { color: C.turmeric, marginBottom: 8, marginTop: 4 },
  aiLine: { color: C.ink, marginTop: 6 },
  descriptionInput: { alignItems: 'flex-start', paddingTop: 12 },
  descriptionCounter: { color: C.mute, fontSize: 12, textAlign: 'right', marginTop: -4, marginBottom: 8 },
  priceLockedHint: {
    color: C.ink,
    backgroundColor: C.leafSoft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  priceFieldLocked: { opacity: 0.5 },
  priceHelp: { marginTop: -6, marginBottom: 12 },
  priceHelpText: { color: C.mute, fontSize: 13, marginTop: 2 },
  priceHelpStrong: { color: C.ink, fontSize: 13, fontWeight: '600', marginTop: 2 },
  priceWarning: { color: C.turmeric, fontSize: 13, fontWeight: '600', marginTop: 2 },
  fieldHint: { fontSize: 12, color: C.mute, marginTop: -2, marginBottom: 12 },
  forecastTitle: { fontSize: 15, fontWeight: '700', color: C.ink, marginBottom: 4 },
  forecastLine: { color: C.ink, marginTop: 2 },
  previewUrgency: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  previewPrice: { fontSize: 16, fontWeight: '700', color: C.ink },
  previewTotal: { fontSize: 15, color: C.ink, marginTop: 2 },
  previewMuted: { color: C.mute, marginTop: 4 },
  previewError: { color: C.chili, marginBottom: 8 },
  myLotTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  myLotThumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: C.leafSoft },
  myLotThumbPlaceholder: { backgroundColor: C.line },
  myLotDescription: { color: C.mute, fontSize: 13, marginTop: 4, marginBottom: 4 },
  myLotsSearchInput: {
    height: 44,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: C.ink,
    backgroundColor: C.white,
    marginBottom: 10,
  },
  myLotsFilterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  myLotsFilterEmpty: { color: C.mute, textAlign: 'center', marginTop: 16, marginBottom: 8 },
  lotHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flex: 1 },
  lotTitle: { fontSize: 16, fontWeight: '700', color: C.ink, flex: 1, marginRight: 8 },
  lotMeta: { color: C.mute, fontSize: 12, marginBottom: 6 },
  lotLine: { color: C.ink, marginBottom: 4 },
  bookingsBox: { backgroundColor: C.leafSoft, borderRadius: 12, padding: 10, marginVertical: 8 },
  bookingsTitle: { fontWeight: '700', color: C.ink, marginBottom: 4 },
  editBtn: { marginTop: 10 },
  cropSearchInput: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: C.ink,
    backgroundColor: C.surface,
    marginBottom: 8,
  },
  cropSubheading: { fontSize: 13, color: C.mute, fontWeight: '600', marginBottom: 4, marginTop: 4 },
  cropLockedRow: { flexDirection: 'row', marginBottom: 4 },
  cropLockedHint: { fontSize: 12, color: C.mute, marginBottom: 4 },
  cropChangeHint: { fontSize: 12, color: C.turmeric, fontWeight: '600', marginTop: 2, marginBottom: 4 },
  chipScroll: { marginBottom: 4 },
  addCropButton: { paddingVertical: 6, paddingHorizontal: 2, marginBottom: 8 },
  addCropButtonText: { color: C.leaf, fontWeight: '600', fontSize: 14 },
  proposeForm: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    backgroundColor: C.surface,
  },
  categoryHint: {
    fontSize: 12,
    color: C.mute,
    marginTop: 4,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  nearMatchBox: {
    backgroundColor: C.turmericSoft,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  nearMatchTitle: {
    fontWeight: '600',
    color: C.ink,
    marginBottom: 6,
    fontSize: 13,
  },
  nearMatchItem: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  nearMatchName: {
    color: C.leaf,
    fontWeight: '600',
    fontSize: 14,
  },
});
