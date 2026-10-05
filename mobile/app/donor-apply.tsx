import { Feather } from '@expo/vector-icons';
import { pickImages } from '../src/lib/pickImages';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError } from '../src/api/client';
import type { ApplicationKind, DocCategory, OrgStatus, OrgType } from '../src/api/types';
import { confirmAlert } from '../src/lib/confirm';
import { formatPhone, formatPhoneOnChange, isValidEmail, normalizeEmail, normalizePhone } from '../src/lib/phoneEmail';
import { LocationPicker, type LatLng } from '../src/components/LocationPicker';
import {
  ChipGroup,
  FileField,
  FormField,
  useFieldErrors,
  useFieldScroll,
} from '../src/components/form';
import { Body, PrimaryButton, Screen, SecondaryButton, StackHeader } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import {
  labelApplicationKind,
  labelDonorTier,
  labelOrgStatus,
  labelOrgType,
  labelRecipientGroups,
  labelReviewAction,
  OPEN_ORG_STATUSES,
  orgTypeOptions,
  recipientGroupOptions,
} from '../src/donorLabels';
import { formatTemplate, useI18n, type Messages } from '../src/i18n';
import { C } from '../src/theme';

const FREQUENCY_KEYS = ['daily', 'weekly', 'monthly', 'irregular'] as const;

/** Digits-only phone for the API; the input shows the 099-999-9999 mask. */
const phoneDigits = (display: string): string => normalizePhone(display);

type LocalDoc = {
  id: string;
  name: string;
  mime: 'application/pdf' | 'image/jpeg' | 'image/png';
  base64: string;
  doc_category: DocCategory;
  existingId?: number;
};

function ProgressBar({ step, total }: { step: number; total: number }): React.ReactElement {
  const { t } = useI18n();
  const pct = Math.round(((step + 1) / total) * 100);
  return (
    <View style={styles.progressWrap}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.progressLabel}>
        {formatTemplate(t.donorApply.stepProgress, { step: step + 1, total })}
      </Text>
    </View>
  );
}

function StatusBanner({
  orgStatus,
  applicationKind,
  adminMessages,
  onEditDocs,
  onWithdraw,
  onSwitchIndividual,
  busy,
  compact,
  t,
}: {
  orgStatus: OrgStatus;
  applicationKind: ApplicationKind | null;
  adminMessages: { action: string; reason: string | null; application_kind?: ApplicationKind | null }[];
  onEditDocs: () => void;
  onWithdraw: () => void;
  onSwitchIndividual: () => void;
  busy: boolean;
  /** One-line status only (no admin messages / buttons) for steps after the first. */
  compact: boolean;
  t: Messages;
}): React.ReactElement | null {
  if (!OPEN_ORG_STATUSES.has(orgStatus) && orgStatus !== 'rejected') {
    return null;
  }
  if (compact) {
    return (
      <Text style={styles.statusCompact}>
        {formatTemplate(t.donorApply.requestStatus, {
          kind: labelApplicationKind(applicationKind, t),
          status: labelOrgStatus(orgStatus, t),
        })}
      </Text>
    );
  }
  return (
    <View style={styles.statusBanner}>
      <Text style={styles.statusTitle}>
        {formatTemplate(t.donorApply.requestStatus, {
          kind: labelApplicationKind(applicationKind, t),
          status: labelOrgStatus(orgStatus, t),
        })}
      </Text>
      {adminMessages.map((msg, index) => {
        const kindSuffix =
          msg.application_kind !== undefined && msg.application_kind !== null
            ? formatTemplate(t.donorApply.adminMessageKindSuffix, {
                kind: labelApplicationKind(msg.application_kind, t),
              })
            : '';
        return (
          <Text key={`${msg.action}-${index}`} style={styles.statusAdmin}>
            {formatTemplate(t.donorApply.adminMessage, {
              action: labelReviewAction(msg.action, t),
              kindSuffix,
              reason: msg.reason ?? t.common.dash,
            })}
          </Text>
        );
      })}
      {OPEN_ORG_STATUSES.has(orgStatus) ? (
        <View style={styles.statusActions}>
          <PrimaryButton
            label={orgStatus === 'draft' && applicationKind === null ? t.donorApply.continueApplication : t.donorApply.uploadMoreDocs}
            onPress={onEditDocs}
            disabled={busy}
          />
          {applicationKind === 'organization' ? (
            <SecondaryButton label={t.donorApply.switchIndividual} onPress={onSwitchIndividual} disabled={busy} />
          ) : null}
          <SecondaryButton label={t.donorApply.withdraw} onPress={onWithdraw} disabled={busy} />
        </View>
      ) : null}
    </View>
  );
}

export default function DonorApplyScreen(): React.ReactElement {
  const { user, api, refreshUser } = useAuth();
  const { t, formatDate } = useI18n();
  const router = useRouter();
  const orgTypes = useMemo(() => orgTypeOptions(t), [t]);
  const recipientOpts = useMemo(() => recipientGroupOptions(t), [t]);
  const { errors, setErrors, setFieldError, clearField, applyServerFields, firstErrorName } = useFieldErrors();
  const { scrollRef, registerY, scrollToField } = useFieldScroll();

  const [kind, setKind] = useState<ApplicationKind | null>(user?.application_kind ?? null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsVersion, setTermsVersion] = useState<string | null>(null);

  const [contactName, setContactName] = useState(user?.name ?? '');
  const [contactPhone, setContactPhone] = useState(formatPhone(user?.phone ?? ''));
  const [contactEmail, setContactEmail] = useState(user?.contact_email ?? '');
  const [contactTitle, setContactTitle] = useState('');
  const [coords, setCoords] = useState<LatLng | null>(
    user?.lat !== null && user?.lat !== undefined && user?.lng !== null && user?.lng !== undefined
      ? { lat: user.lat, lng: user.lng }
      : null,
  );
  const [recipientGroups, setRecipientGroups] = useState<string[]>(user?.recipient_groups ?? []);
  const [purposeTh, setPurposeTh] = useState(user?.purpose_th ?? '');

  const [orgName, setOrgName] = useState(user?.org_name ?? '');
  const [orgType, setOrgType] = useState<OrgType | null>((user?.org_type as OrgType | null) ?? null);
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [registeredAddress, setRegisteredAddress] = useState('');
  const [beneficiaryCount, setBeneficiaryCount] = useState(
    user?.beneficiary_count !== null && user?.beneficiary_count !== undefined ? String(user.beneficiary_count) : '',
  );
  const [distributionMode, setDistributionMode] = useState<'self_use' | 'redistribute' | null>(
    user?.distribution_mode ?? null,
  );
  const [redistributePlace, setRedistributePlace] = useState('');
  const [redistributeFrequency, setRedistributeFrequency] = useState('');
  const [docs, setDocs] = useState<LocalDoc[]>([]);
  const [adminMessages, setAdminMessages] = useState<
    { action: string; reason: string | null; application_kind?: ApplicationKind | null }[]
  >([]);
  const [conflictExistingId, setConflictExistingId] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  /** Approved individuals / rejected applicants opt in to the form (upgrade to org / re-apply). */
  const [formOpened, setFormOpened] = useState(false);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, TextInput | null>>({});
  const bindInput = (name: string) => (el: TextInput | null): void => {
    inputRefs.current[name] = el;
  };

  const requested = useMemo(() => new Set(user?.requested_fields ?? []), [user?.requested_fields]);
  const hasOpenApplication =
    user !== null && OPEN_ORG_STATUSES.has(user.org_status);
  const fieldErr = (name: string): string | null => {
    if (errors[name]) {
      return errors[name] ?? null;
    }
    if (requested.has(name)) {
      return t.donorApply.adminRequestedFix;
    }
    return null;
  };

  const frequencyOptions = useMemo(() => {
    const labels: Record<(typeof FREQUENCY_KEYS)[number], string> = {
      daily: t.donorApply.freqDaily,
      weekly: t.donorApply.freqWeekly,
      monthly: t.donorApply.freqMonthly,
      irregular: t.donorApply.freqIrregular,
    };
    const opts = FREQUENCY_KEYS.map((key) => ({ key, label: labels[key] }));
    // Keep legacy free-text values (stored before chips existed) visible and selectable.
    const legacy = redistributeFrequency.trim();
    return legacy !== '' && !(FREQUENCY_KEYS as readonly string[]).includes(legacy)
      ? [...opts, { key: legacy, label: legacy }]
      : opts;
  }, [t, redistributeFrequency]);

  const steps =
    kind === null
      ? [t.donorApply.stepPickKind]
      : kind === 'individual'
        ? [t.donorApply.stepContact, t.donorApply.stepAreaRecipients, t.donorApply.stepSummary]
        : [
            t.donorApply.stepOrg,
            t.donorApply.stepOrgContact,
            t.donorApply.stepBeneficiaries,
            t.donorApply.stepDocuments,
            t.donorApply.stepSummary,
          ];
  const totalSteps = steps.length;

  useEffect(() => {
    void (async () => {
      try {
        const terms = await api.getDonorTerms();
        setTermsVersion(terms.version);
      } catch {
        setTermsVersion(null);
      }
    })();
  }, [api]);

  useEffect(() => {
    if (user === null || hydrated) {
      return;
    }
    void (async () => {
      try {
        const mine = await api.getMyDonorApplication();
        setAdminMessages(mine.admin_messages ?? []);
        const sections = mine.sections;
        if (sections?.organization !== null && sections?.organization !== undefined) {
          const org = sections.organization;
          if (typeof org.registered === 'boolean') {
            setRegistered(org.registered);
          }
          if (typeof org.registration_number === 'string') {
            setRegistrationNumber(org.registration_number);
          }
          if (typeof org.registered_address === 'string') {
            setRegisteredAddress(org.registered_address);
          }
        }
        if (sections?.contact !== null && sections?.contact !== undefined) {
          const contact = sections.contact;
          if (typeof contact.contact_title === 'string') {
            setContactTitle(contact.contact_title);
          }
        }
        if (sections?.beneficiaries !== null && sections?.beneficiaries !== undefined) {
          const b = sections.beneficiaries;
          if (typeof b.redistribute_place === 'string') {
            setRedistributePlace(b.redistribute_place);
          }
          if (typeof b.redistribute_frequency === 'string') {
            setRedistributeFrequency(b.redistribute_frequency);
          }
        }
        if (mine.documents.length > 0) {
          setDocs(
            mine.documents.map((doc) => ({
              id: `existing-${doc.id}`,
              name: doc.original_name,
              mime: (doc.mime === 'image/png' ? 'image/png' : doc.mime === 'application/pdf' ? 'application/pdf' : 'image/jpeg') as LocalDoc['mime'],
              base64: '',
              doc_category: (doc.doc_category as DocCategory) ?? 'other',
              existingId: doc.id,
            })),
          );
        }
        if (
          mine.user.application_kind !== null &&
          OPEN_ORG_STATUSES.has(mine.user.org_status)
        ) {
          setKind(mine.user.application_kind);
          if (mine.user.draft_step !== null && mine.user.draft_step !== undefined) {
            const maxStep = mine.user.application_kind === 'individual' ? 2 : 4;
            setStep(Math.min(Math.max(mine.user.draft_step, 0), maxStep));
          }
        }
      } catch {
        // fall back to user fields already hydrated
      } finally {
        setHydrated(true);
      }
    })();
  }, [api, user, hydrated]);

  useEffect(() => {
    if (
      hydrated &&
      user?.draft_step !== null &&
      user?.draft_step !== undefined &&
      user.draft_step > 0 &&
      kind !== null
    ) {
      setStep(Math.min(user.draft_step, totalSteps - 1));
    }
  }, [user?.draft_step, kind, totalSteps, hydrated]);

  useEffect(() => {
    if (pendingFocus === null) {
      return;
    }
    // Wait a tick so the target step has rendered and registered its layout.
    const id = setTimeout(() => {
      scrollToField(pendingFocus);
      inputRefs.current[pendingFocus]?.focus();
      setPendingFocus(null);
    }, 80);
    return () => clearTimeout(id);
  }, [pendingFocus, step, scrollToField]);

  const pickImage = async (category: DocCategory): Promise<void> => {
    const picked = await pickImages({
      labels: {
        title: '',
        takePhoto: t.sell.takePhoto,
        library: t.sell.photoLibrary,
        cancel: t.common.cancel,
      },
      sources: 'library',
      base64: true,
      quality: 0.8,
    });
    if (picked.status === 'denied') {
      setFormError(t.donorApply.photoDenied);
      return;
    }
    if (picked.status !== 'picked' || picked.assets[0] === undefined) {
      return;
    }
    const asset = picked.assets[0];
    if (asset.base64 == null || asset.base64 === '') {
      return;
    }
    const base64: string = asset.base64;
    const mime = asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    setDocs((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${prev.length}`,
        name: asset.fileName ?? `doc-${Date.now()}.jpg`,
        mime,
        base64,
        doc_category: category,
      },
    ]);
    clearField('documents');
  };

  /** Replace local docs with the server's rows so saved files are never re-uploaded. */
  const syncSavedDocs = async (): Promise<void> => {
    try {
      const mine = await api.getMyDonorApplication();
      setDocs(
        mine.documents.map((doc) => ({
          id: `existing-${doc.id}`,
          name: doc.original_name,
          mime: (doc.mime === 'image/png' ? 'image/png' : doc.mime === 'application/pdf' ? 'application/pdf' : 'image/jpeg') as LocalDoc['mime'],
          base64: '',
          doc_category: (doc.doc_category as DocCategory) ?? 'other',
          existingId: doc.id,
        })),
      );
    } catch {
      // Keep local docs; the server dedupes identical re-sent files.
    }
  };

  const saveDraft = async (nextStep: number): Promise<boolean> => {
    if (kind === null) {
      return true;
    }
    setBusy(true);
    setFormError(null);
    try {
      await api.saveDonorDraft({
        application_kind: kind,
        draft_step: nextStep,
        contact_name: contactName.trim() || null,
        contact_phone: phoneDigits(contactPhone) || null,
        contact_email: normalizeEmail(contactEmail) || null,
        contact_title: contactTitle.trim() || null,
        org_lat: coords?.lat ?? null,
        org_lng: coords?.lng ?? null,
        recipient_groups: recipientGroups.length > 0 ? recipientGroups : null,
        purpose_th: purposeTh.trim() || null,
        org_name: orgName.trim() || null,
        org_type: orgType,
        registered,
        registration_number: registrationNumber.trim() || null,
        registered_address: registeredAddress.trim() || null,
        beneficiary_count: beneficiaryCount.trim() === '' ? null : Number(beneficiaryCount),
        distribution_mode: distributionMode,
        redistribute_place: redistributePlace.trim() || null,
        redistribute_frequency: redistributeFrequency.trim() || null,
        ...(docs.some((d) => d.base64 !== '')
          ? {
              replace_documents: false,
              documents: docs
                .filter((d) => d.base64 !== '')
                .map((d) => ({
                  filename: d.name,
                  mime: d.mime,
                  base64: d.base64,
                  doc_category: d.doc_category,
                })),
            }
          : {}),
      });
      await refreshUser();
      if (docs.some((d) => d.base64 !== '')) {
        await syncSavedDocs();
      }
      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        applyServerFields(err.fields);
        const firstField = err.fields !== undefined ? Object.keys(err.fields)[0] ?? null : null;
        setFormError(firstField === null ? err.message : null);
        if (err.status === 409 && typeof err.details?.existing_id === 'number') {
          setConflictExistingId(err.details.existing_id);
        }
        if (firstField !== null) focusField(firstField, stepOfField(firstField));
      } else {
        setFormError(t.donorApply.draftFailed);
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  const collectErrors = (forStep: number): Record<string, string> => {
    const next: Record<string, string> = {};
    const digits = phoneDigits(contactPhone);
    const email = normalizeEmail(contactEmail);
    if (kind === null && forStep === 0) {
      next.application_kind = t.donorApply.needKind;
    }
    if (kind === 'individual') {
      if (forStep === 0) {
        if (contactName.trim() === '') next.contact_name = t.donorApply.needFullName;
        if (!/^\d{9,15}$/.test(digits)) next.contact_phone = t.donorApply.invalidPhone;
        if (email !== '' && !isValidEmail(email)) next.contact_email = t.donorApply.invalidEmail;
      }
      if (forStep === 1) {
        if (coords === null) next.org_lat = t.donorApply.needDistributeArea;
        if (recipientGroups.length === 0) next.recipient_groups = t.donorApply.needOneGroup;
        if (purposeTh.trim() === '') next.purpose_th = t.donorApply.needPurpose;
      }
      if (forStep === 2 && !termsAccepted) next.terms_accepted = t.donorApply.needTerms;
    }
    if (kind === 'organization') {
      if (forStep === 0) {
        if (orgName.trim() === '') next.org_name = t.donorApply.needOrgName;
        if (orgType === null) next.org_type = t.donorApply.needOrgType;
        if (registered === null) next.registered = t.donorApply.needRegistered;
        if (registeredAddress.trim() === '') next.registered_address = t.donorApply.needAddress;
        if (coords === null) next.org_lat = t.donorApply.needRealLocation;
      }
      if (forStep === 1) {
        if (contactName.trim() === '') next.contact_name = t.donorApply.needContactName;
        if (contactTitle.trim() === '') next.contact_title = t.donorApply.needTitle;
        if (!/^\d{9,15}$/.test(digits)) next.contact_phone = t.donorApply.invalidPhone;
        if (email === '') next.contact_email = t.donorApply.needEmail;
        else if (!isValidEmail(email)) next.contact_email = t.donorApply.invalidEmail;
      }
      if (forStep === 2) {
        if (beneficiaryCount.trim() === '' || Number(beneficiaryCount) <= 0) {
          next.beneficiary_count = t.donorApply.needBeneficiaryCount;
        }
        if (recipientGroups.length === 0) next.recipient_groups = t.donorApply.needOneGroup;
        if (distributionMode === null) next.distribution_mode = t.donorApply.needDistributionMode;
        if (distributionMode === 'redistribute' && redistributePlace.trim() === '') {
          next.redistribute_place = t.donorApply.needRedistributePlace;
        }
      }
      if (forStep === 3) {
        const certs = docs.filter((d) => d.doc_category === 'registration_cert' || d.doc_category === 'community_cert');
        const photos = docs.filter((d) => d.doc_category === 'site_photo');
        if (certs.length < 1) next.documents = t.donorApply.needCertFile;
        else if (photos.length < 1 || photos.length > 3) next.documents = t.donorApply.needSitePhotos;
      }
      if (forStep === 4 && !termsAccepted) next.terms_accepted = t.donorApply.needTerms;
    }
    return next;
  };

  /** Step that renders a given field, so server/submit errors can jump to it. */
  const stepOfField = (name: string): number => {
    const individualSteps: Record<string, number> = {
      contact_name: 0,
      contact_phone: 0,
      contact_email: 0,
      org_lat: 1,
      org_lng: 1,
      recipient_groups: 1,
      purpose_th: 1,
      terms_accepted: 2,
      terms_version: 2,
    };
    const orgSteps: Record<string, number> = {
      org_name: 0,
      org_type: 0,
      registered: 0,
      registration_number: 0,
      registered_address: 0,
      org_lat: 0,
      org_lng: 0,
      contact_name: 1,
      contact_title: 1,
      contact_phone: 1,
      contact_email: 1,
      beneficiary_count: 2,
      recipient_groups: 2,
      distribution_mode: 2,
      redistribute_place: 2,
      redistribute_frequency: 2,
      documents: 3,
      terms_accepted: 4,
      terms_version: 4,
    };
    const map = kind === 'organization' ? orgSteps : individualSteps;
    return map[name] ?? step;
  };

  const focusField = (name: string, targetStep: number): void => {
    setStep(targetStep);
    setPendingFocus(name);
  };

  const validateStep = (): boolean => {
    const next = collectErrors(step);
    setErrors(next);
    const first = Object.keys(next)[0] ?? null;
    if (first !== null) {
      focusField(first, step);
      return false;
    }
    return true;
  };

  /** Validate every step; on failure jump to the first invalid field's step and focus it. */
  const validateAll = (): boolean => {
    for (let s = 0; s < totalSteps; s += 1) {
      const next = collectErrors(s);
      const first = Object.keys(next)[0] ?? null;
      if (first !== null) {
        setErrors(next);
        focusField(first, s);
        return false;
      }
    }
    setErrors({});
    return true;
  };

  const goNext = async (): Promise<void> => {
    if (!validateStep()) {
      return;
    }
    const next = Math.min(step + 1, totalSteps - 1);
    const ok = await saveDraft(next);
    if (ok) {
      setStep(next);
    }
  };

  const goBack = (): void => {
    if (step === 0) {
      if (kind !== null && !hasOpenApplication) {
        setKind(null);
        return;
      }
      if (kind !== null && hasOpenApplication) {
        router.back();
        return;
      }
      router.back();
      return;
    }
    setStep((s) => s - 1);
  };

  const confirmWithdraw = (): void => {
    confirmAlert({
      title: t.donorApply.withdrawTitle,
      message: t.donorApply.withdrawBody,
      confirmText: t.donorApply.withdraw,
      cancelText: t.common.cancel,
      destructive: true,
      onConfirm: () => {
        void (async () => {
          setBusy(true);
          setFormError(null);
          try {
            await api.withdrawDonorApplication();
            setKind(null);
            setStep(0);
            setDocs([]);
            setAdminMessages([]);
            setHydrated(false);
            await refreshUser();
          } catch (err) {
            setFormError(err instanceof ApiError ? err.message : t.donorApply.withdrawFailed);
          } finally {
            setBusy(false);
          }
        })();
      },
    });
  };

  const selectKind = (next: ApplicationKind): void => {
    if (
      hasOpenApplication &&
      user?.application_kind === 'organization' &&
      next === 'individual'
    ) {
      confirmAlert({
        title: t.donorApply.switchTitle,
        message: t.donorApply.switchBody,
        confirmText: t.common.confirm,
        cancelText: t.common.cancel,
        onConfirm: () => {
          void (async () => {
            setBusy(true);
            try {
              await api.switchDonorApplicationKind('individual');
              setKind('individual');
              setStep(0);
              setDocs([]);
              setOrgName('');
              setOrgType(null);
              clearField('application_kind');
              await refreshUser();
            } catch (err) {
              setFormError(err instanceof ApiError ? err.message : t.donorApply.switchFailed);
            } finally {
              setBusy(false);
            }
          })();
        },
      });
      return;
    }
    if (hasOpenApplication && user?.application_kind === null) {
      void (async () => {
        setBusy(true);
        try {
          await api.saveDonorDraft({
            application_kind: next,
            draft_step: 0,
          });
          setKind(next);
          clearField('application_kind');
          await refreshUser();
        } catch (err) {
          setFormError(err instanceof ApiError ? err.message : t.donorApply.draftFailed);
        } finally {
          setBusy(false);
        }
      })();
      return;
    }
    setKind(next);
    clearField('application_kind');
    setStep(0);
  };

  const submit = async (): Promise<void> => {
    if (!validateAll()) {
      return;
    }
    if (kind === null || termsVersion === null) {
      setFormError(t.donorApply.termsLoadFailed);
      return;
    }
    setBusy(true);
    setFormError(null);
    setConflictExistingId(null);
    try {
      if (user?.org_status === 'needs_more_info' && kind === 'organization') {
        const ok = await saveDraft(step);
        if (!ok) {
          return;
        }
        await api.resubmitOrg();
        router.replace('/profile');
        return;
      }
      const payload: Record<string, unknown> = {
        application_kind: kind,
        terms_version: termsVersion,
        terms_accepted: true,
        contact_name: contactName.trim(),
        contact_phone: phoneDigits(contactPhone),
        contact_email: normalizeEmail(contactEmail) === '' ? null : normalizeEmail(contactEmail),
        org_lat: coords?.lat,
        org_lng: coords?.lng,
        recipient_groups: recipientGroups,
        // Only the individual flow has a purpose field; organizations describe themselves
        // through the beneficiaries step, so never send an empty purpose.
        ...(purposeTh.trim() !== '' ? { purpose_th: purposeTh.trim() } : {}),
      };
      if (kind === 'organization') {
        const freshDocs = docs.filter((d) => d.base64 !== '');
        Object.assign(payload, {
          org_name: orgName.trim(),
          org_type: orgType,
          registered,
          registration_number: registrationNumber.trim() || null,
          registered_address: registeredAddress.trim(),
          contact_title: contactTitle.trim(),
          beneficiary_count: Number(beneficiaryCount),
          distribution_mode: distributionMode,
          redistribute_place: redistributePlace.trim() || null,
          redistribute_frequency: redistributeFrequency.trim() || null,
          documents: freshDocs.map((d) => ({
            filename: d.name,
            mime: d.mime,
            base64: d.base64,
            doc_category: d.doc_category,
          })),
        });
      }
      await api.applyOrg(payload);
      router.replace('/profile');
    } catch (err) {
      if (err instanceof ApiError) {
        applyServerFields(err.fields);
        const first = err.fields !== undefined ? Object.keys(err.fields)[0] ?? null : null;
        setFormError(first === null ? err.message : null);
        if (err.status === 409 && typeof err.details?.existing_id === 'number') {
          setConflictExistingId(err.details.existing_id);
        }
        if (first !== null) focusField(first, stepOfField(first));
      } else {
        setFormError(t.donorApply.submitFailed);
      }
    } finally {
      setBusy(false);
    }
  };

  if (user === null) {
    return (
      <Screen>
        <Body>
          <Text style={styles.muted}>{t.donorApply.pleaseLogin}</Text>
        </Body>
      </Screen>
    );
  }

  const isApproved = user.org_status === 'approved';
  const isOrgApproved = isApproved && user.application_kind !== 'individual';
  if ((isOrgApproved || (isApproved && !formOpened))) {
    return (
      <Screen>
        <StackHeader title={t.donorApply.title} onBack={() => router.replace('/profile')} />
        <Body>
          <View style={styles.statusBanner}>
            <Text style={styles.statusTitle}>{t.donorApply.approvedTitle}</Text>
            <Text style={styles.muted}>{t.donorApply.approvedHint}</Text>
            <Text style={styles.summaryRow}>
              {t.donorApply.approvedKind}: {labelApplicationKind(user.application_kind ?? 'organization', t)}
            </Text>
            {user.application_kind !== 'individual' ? (
              <>
                <Text style={styles.summaryRow}>
                  {t.donorApply.approvedOrgName}: {user.org_name ?? t.common.dash}
                </Text>
                <Text style={styles.summaryRow}>
                  {t.donorApply.approvedOrgType}: {labelOrgType(user.org_type, t)}
                </Text>
              </>
            ) : null}
            <Text style={styles.summaryRow}>
              {t.donorApply.approvedOn}:{' '}
              {user.org_reviewed_at !== null ? formatDate(user.org_reviewed_at) : t.common.dash}
            </Text>
            <Text style={styles.summaryRow}>
              {t.donorApply.approvedTier}: {labelDonorTier(user.donor_tier, t)}
            </Text>
            <Text style={styles.summaryRow}>
              {t.donorApply.approvedQuota}:{' '}
              {user.donation_weekly_cap_kg !== null
                ? formatTemplate(t.donorApply.approvedQuotaValue, { cap: user.donation_weekly_cap_kg })
                : t.common.dash}
            </Text>
          </View>
          <PrimaryButton label={t.donorApply.backToProfile} onPress={() => router.replace('/profile')} />
          {!isOrgApproved ? (
            <SecondaryButton
              label={t.donorApply.upgradeToOrg}
              onPress={() => {
                setKind(null);
                setFormOpened(true);
              }}
            />
          ) : null}
        </Body>
      </Screen>
    );
  }

  if (user.org_status === 'rejected' && !formOpened) {
    return (
      <Screen>
        <StackHeader title={t.donorApply.title} onBack={() => router.replace('/profile')} />
        <Body>
          <View style={styles.statusBanner}>
            <Text style={styles.statusTitle}>{t.donorApply.rejectedTitle}</Text>
            <Text style={styles.muted}>
              {formatTemplate(t.donorApply.rejectedReason, { reason: user.org_reject_reason ?? t.common.dash })}
            </Text>
          </View>
          <PrimaryButton label={t.donorApply.reapply} onPress={() => setFormOpened(true)} />
          <SecondaryButton label={t.donorApply.backToProfile} onPress={() => router.replace('/profile')} />
        </Body>
      </Screen>
    );
  }

  return (
    <Screen>
      <StackHeader title={t.donorApply.title} onBack={() => router.replace('/profile')} />
      <Body scrollRef={scrollRef}>
        <ProgressBar step={step} total={totalSteps} />
        {user !== null ? (
          <StatusBanner
            orgStatus={user.org_status}
            applicationKind={user.application_kind}
            adminMessages={adminMessages}
            onEditDocs={() => {
              if (kind === 'organization') {
                setStep(3);
              } else if (kind === null && user.application_kind === 'organization') {
                setKind('organization');
                setStep(3);
              } else if (kind === null && user.application_kind === null) {
                setStep(0);
                scrollToField('application_kind');
              }
            }}
            onWithdraw={confirmWithdraw}
            onSwitchIndividual={() => selectKind('individual')}
            busy={busy}
            compact={step > 0}
            t={t}
          />
        ) : null}

        {kind === null ? (
          <ChipGroup
            label={t.donorApply.kindLabel}
            name="application_kind"
            options={[
              { key: 'individual', label: t.donorApply.kindIndividual },
              { key: 'organization', label: t.donorApply.kindOrganization },
            ]}
            value={null}
            onChange={(v) => {
              selectKind(v as ApplicationKind);
            }}
            error={fieldErr('application_kind')}
            fieldRef={registerY}
          />
        ) : null}

        {kind === 'individual' && step === 0 ? (
          <>
            <FormField
              label={t.donorApply.fullName}
              name="contact_name"
              inputRef={bindInput('contact_name')}
              value={contactName}
              onChangeText={(text) => {
                setContactName(text);
                clearField('contact_name');
              }}
              error={fieldErr('contact_name')}
              fieldRef={registerY}
              onBlurField={() => {
                if (contactName.trim() === '') setFieldError('contact_name', t.donorApply.needFullName);
              }}
            />
            <FormField
              label={t.donorApply.phone}
              name="contact_phone"
              inputRef={bindInput('contact_phone')}
              value={contactPhone}
              onChangeText={(text) => {
                setContactPhone((prev) => formatPhoneOnChange(prev, text));
                clearField('contact_phone');
              }}
              placeholder="099-999-9999"
              keyboardType="phone-pad"
              error={fieldErr('contact_phone')}
              fieldRef={registerY}
            />
            <FormField
              label={t.donorApply.emailOptional}
              name="contact_email"
              inputRef={bindInput('contact_email')}
              value={contactEmail}
              onChangeText={(text) => {
                setContactEmail(text);
                clearField('contact_email');
              }}
              autoCapitalize="none"
              keyboardType="email-address"
              error={fieldErr('contact_email')}
              fieldRef={registerY}
            />
          </>
        ) : null}

        {kind === 'individual' && step === 1 ? (
          <>
            <View onLayout={(e) => registerY('org_lat', e.nativeEvent.layout.y)}>
              <LocationPicker value={coords} onChange={setCoords} label={t.donorApply.distributeArea} />
              {fieldErr('org_lat') ? <Text style={styles.fieldError}>{fieldErr('org_lat')}</Text> : null}
            </View>
            <ChipGroup
              label={t.donorApply.recipientGroups}
              name="recipient_groups"
              options={recipientOpts}
              value={recipientGroups}
              multi
              onChange={(v) => {
                setRecipientGroups(v as string[]);
                clearField('recipient_groups');
              }}
              error={fieldErr('recipient_groups')}
              fieldRef={registerY}
            />
            <FormField
              label={t.donorApply.purposeShort}
              name="purpose_th"
              inputRef={bindInput('purpose_th')}
              value={purposeTh}
              onChangeText={(text) => {
                setPurposeTh(text);
                clearField('purpose_th');
              }}
              error={fieldErr('purpose_th')}
              fieldRef={registerY}
            />
          </>
        ) : null}

        {kind === 'organization' && step === 0 ? (
          <>
            <FormField
              label={t.donorApply.orgName}
              name="org_name"
              inputRef={bindInput('org_name')}
              value={orgName}
              onChangeText={(text) => {
                setOrgName(text);
                clearField('org_name');
              }}
              error={fieldErr('org_name')}
              fieldRef={registerY}
            />
            <ChipGroup
              label={t.donorApply.orgType}
              name="org_type"
              options={orgTypes}
              value={orgType}
              onChange={(v) => {
                setOrgType(v as OrgType);
                clearField('org_type');
              }}
              error={fieldErr('org_type')}
              fieldRef={registerY}
            />
            <ChipGroup
              label={t.donorApply.registeredLabel}
              name="registered"
              options={[
                { key: 'yes', label: t.donorApply.registeredYes },
                { key: 'no', label: t.donorApply.registeredNo },
              ]}
              value={registered === null ? null : registered ? 'yes' : 'no'}
              onChange={(v) => {
                setRegistered(v === 'yes');
                clearField('registered');
              }}
              error={fieldErr('registered')}
              fieldRef={registerY}
            />
            <FormField
              label={t.donorApply.registrationNumber}
              name="registration_number"
              inputRef={bindInput('registration_number')}
              value={registrationNumber}
              onChangeText={setRegistrationNumber}
              error={fieldErr('registration_number')}
              fieldRef={registerY}
            />
            <FormField
              label={t.donorApply.registeredAddress}
              name="registered_address"
              inputRef={bindInput('registered_address')}
              value={registeredAddress}
              onChangeText={(text) => {
                setRegisteredAddress(text);
                clearField('registered_address');
              }}
              error={fieldErr('registered_address')}
              fieldRef={registerY}
            />
            <View onLayout={(e) => registerY('org_lat', e.nativeEvent.layout.y)}>
              <LocationPicker value={coords} onChange={setCoords} label={t.donorApply.realLocation} />
              {fieldErr('org_lat') ? <Text style={styles.fieldError}>{fieldErr('org_lat')}</Text> : null}
            </View>
          </>
        ) : null}

        {kind === 'organization' && step === 1 ? (
          <>
            <FormField
              label={t.donorApply.contactName}
              name="contact_name"
              inputRef={bindInput('contact_name')}
              value={contactName}
              onChangeText={(text) => {
                setContactName(text);
                clearField('contact_name');
              }}
              error={fieldErr('contact_name')}
              fieldRef={registerY}
            />
            <FormField
              label={t.donorApply.contactTitle}
              name="contact_title"
              inputRef={bindInput('contact_title')}
              value={contactTitle}
              onChangeText={(text) => {
                setContactTitle(text);
                clearField('contact_title');
              }}
              error={fieldErr('contact_title')}
              fieldRef={registerY}
            />
            <FormField
              label={t.donorApply.phone}
              name="contact_phone"
              inputRef={bindInput('contact_phone')}
              value={contactPhone}
              onChangeText={(text) => {
                setContactPhone((prev) => formatPhoneOnChange(prev, text));
                clearField('contact_phone');
              }}
              placeholder="099-999-9999"
              keyboardType="phone-pad"
              error={fieldErr('contact_phone')}
              fieldRef={registerY}
            />
            <FormField
              label={t.donorApply.email}
              name="contact_email"
              inputRef={bindInput('contact_email')}
              value={contactEmail}
              onChangeText={(text) => {
                setContactEmail(text);
                clearField('contact_email');
              }}
              autoCapitalize="none"
              keyboardType="email-address"
              error={fieldErr('contact_email')}
              fieldRef={registerY}
            />
          </>
        ) : null}

        {kind === 'organization' && step === 2 ? (
          <>
            <FormField
              label={t.donorApply.beneficiaryCount}
              name="beneficiary_count"
              inputRef={bindInput('beneficiary_count')}
              value={beneficiaryCount}
              onChangeText={(text) => {
                setBeneficiaryCount(text);
                clearField('beneficiary_count');
              }}
              keyboardType="number-pad"
              error={fieldErr('beneficiary_count')}
              fieldRef={registerY}
            />
            <ChipGroup
              label={t.donorApply.recipientGroups}
              name="recipient_groups"
              options={recipientOpts}
              value={recipientGroups}
              multi
              onChange={(v) => {
                setRecipientGroups(v as string[]);
                clearField('recipient_groups');
              }}
              error={fieldErr('recipient_groups')}
              fieldRef={registerY}
            />
            <ChipGroup
              label={t.donorApply.distributionMode}
              name="distribution_mode"
              options={[
                { key: 'self_use', label: t.donorApply.modeSelfUse },
                { key: 'redistribute', label: t.donorApply.modeRedistribute },
              ]}
              value={distributionMode}
              onChange={(v) => {
                setDistributionMode(v as 'self_use' | 'redistribute');
                clearField('distribution_mode');
              }}
              error={fieldErr('distribution_mode')}
              fieldRef={registerY}
            />
            {distributionMode === 'redistribute' ? (
              <>
                <FormField
                  label={t.donorApply.redistributePlace}
                  name="redistribute_place"
                  inputRef={bindInput('redistribute_place')}
                  value={redistributePlace}
                  onChangeText={(text) => {
                    setRedistributePlace(text);
                    clearField('redistribute_place');
                  }}
                  error={fieldErr('redistribute_place')}
                  fieldRef={registerY}
                />
                <ChipGroup
                  label={t.donorApply.redistributeFrequencyOptional}
                  name="redistribute_frequency"
                  options={frequencyOptions}
                  value={redistributeFrequency === '' ? null : redistributeFrequency}
                  onChange={(v) => {
                    // Tapping the selected chip again clears the optional value.
                    setRedistributeFrequency(v === redistributeFrequency ? '' : (v as string));
                    clearField('redistribute_frequency');
                  }}
                  error={fieldErr('redistribute_frequency')}
                  fieldRef={registerY}
                />
              </>
            ) : null}
          </>
        ) : null}

        {kind === 'organization' && step === 3 ? (
          <>
            <FileField
              label={t.donorApply.certRegistration}
              name="documents"
              hint={t.donorApply.certHint}
              files={docs.filter((d) => d.doc_category === 'registration_cert').map((d) => ({ id: d.id, name: d.name }))}
              onAdd={() => void pickImage('registration_cert')}
              onRemove={(id) => setDocs((prev) => prev.filter((d) => d.id !== id))}
              error={null}
              fieldRef={registerY}
            />
            <FileField
              label={t.donorApply.certCommunity}
              name="documents_community"
              hint={t.donorApply.certCommunityHint}
              files={docs.filter((d) => d.doc_category === 'community_cert').map((d) => ({ id: d.id, name: d.name }))}
              onAdd={() => void pickImage('community_cert')}
              onRemove={(id) => setDocs((prev) => prev.filter((d) => d.id !== id))}
              error={null}
            />
            <FileField
              label={t.donorApply.sitePhotos}
              name="documents_photos"
              files={docs.filter((d) => d.doc_category === 'site_photo').map((d) => ({ id: d.id, name: d.name }))}
              onAdd={() => void pickImage('site_photo')}
              onRemove={(id) => setDocs((prev) => prev.filter((d) => d.id !== id))}
              error={fieldErr('documents')}
              fieldRef={registerY}
            />
            <FileField
              label={t.donorApply.otherDocs}
              name="documents_other"
              files={docs.filter((d) => d.doc_category === 'other').map((d) => ({ id: d.id, name: d.name }))}
              onAdd={() => void pickImage('other')}
              onRemove={(id) => setDocs((prev) => prev.filter((d) => d.id !== id))}
              error={null}
            />
          </>
        ) : null}

        {((kind === 'individual' && step === 2) || (kind === 'organization' && step === 4)) ? (
          <View>
            <Text style={styles.summaryTitle}>{t.donorApply.summaryTitle}</Text>
            <Text style={styles.summaryLine}>
              {formatTemplate(t.donorApply.summaryKind, { kind: labelApplicationKind(kind, t) })}
            </Text>
            <Text style={styles.summaryLine}>
              {formatTemplate(t.donorApply.summaryName, { name: contactName })}
            </Text>
            <Text style={styles.summaryLine}>
              {formatTemplate(t.donorApply.summaryPhone, { phone: contactPhone })}
            </Text>
            {kind === 'organization' ? (
              <>
                <Text style={styles.summaryLine}>
                  {formatTemplate(t.donorApply.summaryOrg, { name: orgName })}
                </Text>
                <Text style={styles.summaryLine}>
                  {formatTemplate(t.donorApply.summaryOrgType, { type: labelOrgType(orgType, t) })}
                </Text>
              </>
            ) : null}
            <Text style={styles.summaryLine}>
              {formatTemplate(t.donorApply.summaryGroups, {
                groups: labelRecipientGroups(recipientGroups, t),
              })}
            </Text>
            <Pressable
              style={styles.termsRow}
              onPress={() => {
                setTermsAccepted((v) => !v);
                clearField('terms_accepted');
              }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: termsAccepted }}
              aria-checked={termsAccepted}
            >
              <View style={[styles.checkbox, termsAccepted ? styles.checkboxOn : null]}>
                {termsAccepted ? <Feather name="check" size={16} color={C.white} /> : null}
              </View>
              <Text style={styles.termsText}>
                {t.donorApply.termsAcceptPrefix}
                <Text style={styles.link} onPress={() => router.push('/terms/donor')}>
                  {t.donorApply.termsAcceptLink}
                </Text>
              </Text>
            </Pressable>
            {fieldErr('terms_accepted') || fieldErr('terms_version') ? (
              <Text style={styles.fieldError}>{fieldErr('terms_accepted') ?? fieldErr('terms_version')}</Text>
            ) : null}
          </View>
        ) : null}

        {formError !== null ? (
          <View style={styles.conflictBox}>
            <Text style={styles.formError}>{formError}</Text>
            {conflictExistingId !== null ? (
              <PrimaryButton
                label={t.donorApply.goExisting}
                onPress={() => {
                  setConflictExistingId(null);
                  setFormError(null);
                  if (user?.application_kind !== null && user?.application_kind !== undefined) {
                    setKind(user.application_kind);
                    setStep(0);
                  }
                  setHydrated(false);
                }}
              />
            ) : null}
          </View>
        ) : null}

        <View style={styles.actions}>
          <SecondaryButton label={t.donorApply.goBack} onPress={goBack} />
          {kind !== null && step < totalSteps - 1 ? (
            <PrimaryButton label={t.donorApply.nextSaveDraft} onPress={() => void goNext()} loading={busy} />
          ) : null}
          {kind !== null && step === totalSteps - 1 ? (
            <PrimaryButton
              label={user?.org_status === 'needs_more_info' ? t.donorApply.resubmit : t.donorApply.submit}
              onPress={() => void submit()}
              loading={busy}
            />
          ) : null}
        </View>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progressWrap: { marginBottom: 16 },
  progressTrack: { height: 8, backgroundColor: C.line, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: C.leaf },
  progressLabel: { color: C.mute, marginTop: 6, fontSize: 13 },
  muted: { color: C.mute, marginBottom: 12 },
  warn: { color: C.chili, marginBottom: 12 },
  fieldError: { color: C.chili, marginTop: 4, marginBottom: 8 },
  formError: { color: C.chili, marginVertical: 8 },
  conflictBox: { gap: 8, marginVertical: 8 },
  statusBanner: {
    backgroundColor: C.leafSoft,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  summaryRow: { color: C.ink, fontSize: 14, marginTop: 4 },
  statusTitle: { color: C.ink, fontWeight: '700', fontSize: 15 },
  statusAdmin: { color: C.chili, lineHeight: 20 },
  statusActions: { gap: 8, marginTop: 4 },
  actions: { gap: 8, marginTop: 16, marginBottom: 40 },
  summaryTitle: { fontSize: 18, fontWeight: '800', color: C.ink, marginBottom: 8 },
  summaryLine: { color: C.ink, marginBottom: 4 },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 16 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: C.line,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: C.leaf, borderColor: C.leaf },
  statusCompact: { color: C.mute, fontSize: 13, marginBottom: 12 },
  termsText: { flex: 1, color: C.ink, lineHeight: 22 },
  link: { color: C.leaf, fontWeight: '700', textDecorationLine: 'underline' },
});
