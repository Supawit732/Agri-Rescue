import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../src/api/client';
import type { ApplicationKind, DocCategory, OrgStatus, OrgType, RecipientGroup } from '../src/api/types';
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
  labelOrgStatus,
  labelOrgType,
  labelRecipientGroups,
  labelReviewAction,
  OPEN_ORG_STATUSES,
  ORG_TYPE_TH,
  RECIPIENT_GROUP_TH,
} from '../src/donorLabels';
import { C } from '../src/theme';

type LocalDoc = {
  id: string;
  name: string;
  mime: 'application/pdf' | 'image/jpeg' | 'image/png';
  base64: string;
  doc_category: DocCategory;
  existingId?: number;
};

const ORG_TYPES: { key: OrgType; label: string }[] = (
  Object.entries(ORG_TYPE_TH) as [OrgType, string][]
).map(([key, label]) => ({ key, label }));

const RECIPIENT_OPTS: { key: RecipientGroup; label: string }[] = (
  Object.entries(RECIPIENT_GROUP_TH) as [RecipientGroup, string][]
).map(([key, label]) => ({ key, label }));

function ProgressBar({ step, total }: { step: number; total: number }): React.ReactElement {
  const pct = Math.round(((step + 1) / total) * 100);
  return (
    <View style={styles.progressWrap}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.progressLabel}>
        ขั้นที่ {step + 1} / {total}
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
}: {
  orgStatus: OrgStatus;
  applicationKind: ApplicationKind | null;
  adminMessages: { action: string; reason: string | null; application_kind?: ApplicationKind | null }[];
  onEditDocs: () => void;
  onWithdraw: () => void;
  onSwitchIndividual: () => void;
  busy: boolean;
}): React.ReactElement | null {
  if (!OPEN_ORG_STATUSES.has(orgStatus) && orgStatus !== 'rejected') {
    return null;
  }
  return (
    <View style={styles.statusBanner}>
      <Text style={styles.statusTitle}>
        คำขอ{labelApplicationKind(applicationKind)} · สถานะ {labelOrgStatus(orgStatus)}
      </Text>
      {adminMessages.map((msg, index) => (
        <Text key={`${msg.action}-${index}`} style={styles.statusAdmin}>
          ข้อความจากผู้ดูแล ({labelReviewAction(msg.action)}
          {msg.application_kind !== undefined && msg.application_kind !== null
            ? ` · คำขอ${labelApplicationKind(msg.application_kind)}`
            : ''}
          ): {msg.reason ?? '—'}
        </Text>
      ))}
      {OPEN_ORG_STATUSES.has(orgStatus) ? (
        <View style={styles.statusActions}>
          <PrimaryButton label="ส่งเอกสารเพิ่ม/แก้ไข" onPress={onEditDocs} disabled={busy} />
          {applicationKind === 'organization' ? (
            <SecondaryButton label="เปลี่ยนเป็นบุคคล" onPress={onSwitchIndividual} disabled={busy} />
          ) : null}
          <SecondaryButton label="ถอนคำขอ" onPress={onWithdraw} disabled={busy} />
        </View>
      ) : null}
    </View>
  );
}

export default function DonorApplyScreen(): React.ReactElement {
  const { user, api, refreshUser } = useAuth();
  const router = useRouter();
  const { errors, setErrors, setFieldError, clearField, applyServerFields, firstErrorName } = useFieldErrors();
  const { scrollRef, registerY, scrollToField } = useFieldScroll();

  const [kind, setKind] = useState<ApplicationKind | null>(user?.application_kind ?? null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsVersion, setTermsVersion] = useState<string | null>(null);

  const [contactName, setContactName] = useState(user?.name ?? '');
  const [contactPhone, setContactPhone] = useState(user?.phone ?? '');
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

  const requested = useMemo(() => new Set(user?.requested_fields ?? []), [user?.requested_fields]);
  const hasOpenApplication =
    user !== null && OPEN_ORG_STATUSES.has(user.org_status);
  const fieldErr = (name: string): string | null => {
    if (errors[name]) {
      return errors[name] ?? null;
    }
    if (requested.has(name)) {
      return 'ผู้ดูแลขอให้แก้ไขช่องนี้';
    }
    return null;
  };

  const steps =
    kind === null
      ? ['เลือกประเภท']
      : kind === 'individual'
        ? ['ข้อมูลติดต่อ', 'พื้นที่และผู้รับ', 'สรุปและยอมรับ']
        : ['องค์กร', 'ผู้ติดต่อ', 'ผู้รับประโยชน์', 'เอกสาร', 'สรุปและยอมรับ'];
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

  const pickImage = async (category: DocCategory): Promise<void> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setFormError('ไม่ได้รับสิทธิ์เข้าถึงรูปภาพ');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.8,
    });
    if (picked.canceled || picked.assets[0] === undefined) {
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
        contact_phone: contactPhone.trim() || null,
        contact_email: contactEmail.trim() || null,
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
      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        applyServerFields(err.fields);
        setFormError(err.message);
        if (err.status === 409 && typeof err.details?.existing_id === 'number') {
          setConflictExistingId(err.details.existing_id);
        }
        scrollToField(firstErrorName());
      } else {
        setFormError('บันทึกร่างไม่สำเร็จ');
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  const validateStep = (): boolean => {
    const next: Record<string, string> = {};
    if (kind === null && step === 0) {
      next.application_kind = 'กรุณาเลือกประเภท';
    }
    if (kind === 'individual') {
      if (step === 0) {
        if (contactName.trim() === '') next.contact_name = 'กรุณากรอกชื่อ-นามสกุล';
        if (!/^\d{9,15}$/.test(contactPhone.trim())) next.contact_phone = 'เบอร์โทรไม่ถูกต้อง';
      }
      if (step === 1) {
        if (coords === null) next.org_lat = 'กรุณาเลือกพื้นที่แจก';
        if (recipientGroups.length === 0) next.recipient_groups = 'เลือกอย่างน้อยหนึ่งกลุ่ม';
        if (purposeTh.trim() === '') next.purpose_th = 'กรุณาระบุวัตถุประสงค์';
      }
      if (step === 2 && !termsAccepted) next.terms_accepted = 'ต้องยอมรับข้อกำหนด';
    }
    if (kind === 'organization') {
      if (step === 0) {
        if (orgName.trim() === '') next.org_name = 'กรุณากรอกชื่อองค์กร';
        if (orgType === null) next.org_type = 'กรุณาเลือกประเภท';
        if (registered === null) next.registered = 'กรุณาระบุ';
        if (registeredAddress.trim() === '') next.registered_address = 'กรุณากรอกที่อยู่';
        if (coords === null) next.org_lat = 'กรุณาเลือกที่ตั้งจริง';
      }
      if (step === 1) {
        if (contactName.trim() === '') next.contact_name = 'กรุณากรอกชื่อ';
        if (contactTitle.trim() === '') next.contact_title = 'กรุณากรอกตำแหน่ง';
        if (!/^\d{9,15}$/.test(contactPhone.trim())) next.contact_phone = 'เบอร์โทรไม่ถูกต้อง';
      }
      if (step === 2) {
        if (beneficiaryCount.trim() === '' || Number(beneficiaryCount) <= 0) {
          next.beneficiary_count = 'กรุณาระบุจำนวน';
        }
        if (recipientGroups.length === 0) next.recipient_groups = 'เลือกอย่างน้อยหนึ่งกลุ่ม';
        if (distributionMode === null) next.distribution_mode = 'กรุณาเลือกรูปแบบ';
        if (distributionMode === 'redistribute') {
          if (redistributePlace.trim() === '') next.redistribute_place = 'กรุณาระบุสถานที่แจก';
          if (redistributeFrequency.trim() === '') next.redistribute_frequency = 'กรุณาระบุความถี่';
        }
      }
      if (step === 3) {
        const certs = docs.filter((d) => d.doc_category === 'registration_cert' || d.doc_category === 'community_cert');
        const photos = docs.filter((d) => d.doc_category === 'site_photo');
        if (certs.length < 1) next.documents = 'ต้องมีหนังสือรับรองอย่างน้อย 1 ไฟล์';
        else if (photos.length < 1 || photos.length > 3) next.documents = 'ต้องมีรูปสถานที่ 1–3 รูป';
      }
      if (step === 4 && !termsAccepted) next.terms_accepted = 'ต้องยอมรับข้อกำหนด';
    }
    setErrors(next);
    const first = Object.keys(next)[0] ?? null;
    if (first !== null) {
      scrollToField(first);
      return false;
    }
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
    Alert.alert('ถอนคำขอ', 'ยืนยันถอนคำขอที่เปิดอยู่? หลังถอนแล้วสมัครแบบอื่นได้', [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ถอนคำขอ',
        style: 'destructive',
        onPress: () => {
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
              setFormError(err instanceof ApiError ? err.message : 'ถอนคำขอไม่สำเร็จ');
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  const selectKind = (next: ApplicationKind): void => {
    if (
      hasOpenApplication &&
      user?.application_kind === 'organization' &&
      next === 'individual'
    ) {
      Alert.alert(
        'เปลี่ยนเป็นบุคคล',
        'จะถอนคำขอองค์กรปัจจุบันแล้วทำต่อเป็นบุคคลในคำขอเดิม ยืนยันหรือไม่?',
        [
          { text: 'ยกเลิก', style: 'cancel' },
          {
            text: 'ยืนยัน',
            onPress: () => {
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
                  setFormError(err instanceof ApiError ? err.message : 'เปลี่ยนประเภทไม่สำเร็จ');
                } finally {
                  setBusy(false);
                }
              })();
            },
          },
        ],
      );
      return;
    }
    setKind(next);
    clearField('application_kind');
    setStep(0);
  };

  const submit = async (): Promise<void> => {
    if (!validateStep()) {
      return;
    }
    if (kind === null || termsVersion === null) {
      setFormError('โหลดข้อกำหนดไม่สำเร็จ กรุณาลองใหม่');
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
        contact_phone: contactPhone.trim(),
        contact_email: contactEmail.trim() === '' ? null : contactEmail.trim(),
        org_lat: coords?.lat,
        org_lng: coords?.lng,
        recipient_groups: recipientGroups,
        purpose_th: purposeTh.trim(),
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
        setFormError(err.message);
        if (err.status === 409 && typeof err.details?.existing_id === 'number') {
          setConflictExistingId(err.details.existing_id);
        }
        const first = err.fields !== undefined ? Object.keys(err.fields)[0] ?? null : null;
        scrollToField(first);
      } else {
        setFormError('ส่งคำขอไม่สำเร็จ');
      }
    } finally {
      setBusy(false);
    }
  };

  if (user === null) {
    return (
      <Screen>
        <Body>
          <Text style={styles.muted}>กรุณาเข้าสู่ระบบ</Text>
        </Body>
      </Screen>
    );
  }

  return (
    <Screen>
      <StackHeader title="สมัครรับบริจาค" onBack={() => router.replace('/(tabs)/account')} />
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
              }
            }}
            onWithdraw={confirmWithdraw}
            onSwitchIndividual={() => selectKind('individual')}
            busy={busy}
          />
        ) : null}

        {kind === null && !hasOpenApplication ? (
          <ChipGroup
            label="ประเภทผู้รับบริจาค"
            name="application_kind"
            options={[
              { key: 'individual', label: 'บุคคล (จิตอาสา)' },
              { key: 'organization', label: 'องค์กร' },
            ]}
            value={null}
            onChange={(v) => {
              selectKind(v as ApplicationKind);
            }}
            error={fieldErr('application_kind')}
            fieldRef={registerY}
          />
        ) : null}

        {kind === null && hasOpenApplication ? (
          <Text style={styles.muted}>กำลังเปิดคำขอเดิม — ใช้แถบสถานะด้านบนเพื่อแก้ไขหรือถอน</Text>
        ) : null}

        {kind === 'individual' && step === 0 ? (
          <>
            <FormField
              label="ชื่อ-นามสกุล"
              name="contact_name"
              value={contactName}
              onChangeText={(t) => {
                setContactName(t);
                clearField('contact_name');
              }}
              error={fieldErr('contact_name')}
              fieldRef={registerY}
              onBlurField={() => {
                if (contactName.trim() === '') setFieldError('contact_name', 'กรุณากรอกชื่อ-นามสกุล');
              }}
            />
            <FormField
              label="เบอร์โทร"
              name="contact_phone"
              value={contactPhone}
              onChangeText={(t) => {
                setContactPhone(t);
                clearField('contact_phone');
              }}
              keyboardType="phone-pad"
              error={fieldErr('contact_phone')}
              fieldRef={registerY}
            />
            <FormField
              label="อีเมล (ไม่บังคับ)"
              name="contact_email"
              value={contactEmail}
              onChangeText={setContactEmail}
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
              <LocationPicker value={coords} onChange={setCoords} label="พื้นที่ที่จะแจก" />
              {fieldErr('org_lat') ? <Text style={styles.fieldError}>{fieldErr('org_lat')}</Text> : null}
            </View>
            <ChipGroup
              label="กลุ่มผู้รับ"
              name="recipient_groups"
              options={RECIPIENT_OPTS}
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
              label="วัตถุประสงค์สั้น ๆ"
              name="purpose_th"
              value={purposeTh}
              onChangeText={(t) => {
                setPurposeTh(t);
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
              label="ชื่อองค์กรตามเอกสาร"
              name="org_name"
              value={orgName}
              onChangeText={(t) => {
                setOrgName(t);
                clearField('org_name');
              }}
              error={fieldErr('org_name')}
              fieldRef={registerY}
            />
            <ChipGroup
              label="ประเภทองค์กร"
              name="org_type"
              options={ORG_TYPES}
              value={orgType}
              onChange={(v) => {
                setOrgType(v as OrgType);
                clearField('org_type');
              }}
              error={fieldErr('org_type')}
              fieldRef={registerY}
            />
            <ChipGroup
              label="จดทะเบียนหรือไม่"
              name="registered"
              options={[
                { key: 'yes', label: 'จดทะเบียน' },
                { key: 'no', label: 'ยังไม่จด' },
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
              label="เลขทะเบียน (ถ้ามี)"
              name="registration_number"
              value={registrationNumber}
              onChangeText={setRegistrationNumber}
              error={fieldErr('registration_number')}
              fieldRef={registerY}
            />
            <FormField
              label="ที่อยู่ตามทะเบียน"
              name="registered_address"
              value={registeredAddress}
              onChangeText={(t) => {
                setRegisteredAddress(t);
                clearField('registered_address');
              }}
              error={fieldErr('registered_address')}
              fieldRef={registerY}
            />
            <View onLayout={(e) => registerY('org_lat', e.nativeEvent.layout.y)}>
              <LocationPicker value={coords} onChange={setCoords} label="ที่ตั้งจริง" />
              {fieldErr('org_lat') ? <Text style={styles.fieldError}>{fieldErr('org_lat')}</Text> : null}
            </View>
          </>
        ) : null}

        {kind === 'organization' && step === 1 ? (
          <>
            <FormField
              label="ชื่อผู้ติดต่อ"
              name="contact_name"
              value={contactName}
              onChangeText={(t) => {
                setContactName(t);
                clearField('contact_name');
              }}
              error={fieldErr('contact_name')}
              fieldRef={registerY}
            />
            <FormField
              label="ตำแหน่ง"
              name="contact_title"
              value={contactTitle}
              onChangeText={(t) => {
                setContactTitle(t);
                clearField('contact_title');
              }}
              error={fieldErr('contact_title')}
              fieldRef={registerY}
            />
            <FormField
              label="เบอร์โทร"
              name="contact_phone"
              value={contactPhone}
              onChangeText={(t) => {
                setContactPhone(t);
                clearField('contact_phone');
              }}
              keyboardType="phone-pad"
              error={fieldErr('contact_phone')}
              fieldRef={registerY}
            />
            <FormField
              label="อีเมล"
              name="contact_email"
              value={contactEmail}
              onChangeText={setContactEmail}
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
              label="จำนวนผู้รับประโยชน์"
              name="beneficiary_count"
              value={beneficiaryCount}
              onChangeText={(t) => {
                setBeneficiaryCount(t);
                clearField('beneficiary_count');
              }}
              keyboardType="number-pad"
              error={fieldErr('beneficiary_count')}
              fieldRef={registerY}
            />
            <ChipGroup
              label="กลุ่มผู้รับ"
              name="recipient_groups"
              options={RECIPIENT_OPTS}
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
              label="รูปแบบ"
              name="distribution_mode"
              options={[
                { key: 'self_use', label: 'ใช้เอง' },
                { key: 'redistribute', label: 'แจกจ่ายต่อ' },
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
                  label="สถานที่แจกประจำ"
                  name="redistribute_place"
                  value={redistributePlace}
                  onChangeText={(t) => {
                    setRedistributePlace(t);
                    clearField('redistribute_place');
                  }}
                  error={fieldErr('redistribute_place')}
                  fieldRef={registerY}
                />
                <FormField
                  label="ความถี่"
                  name="redistribute_frequency"
                  value={redistributeFrequency}
                  onChangeText={(t) => {
                    setRedistributeFrequency(t);
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
              label="หนังสือรับรองจดทะเบียน"
              name="documents"
              hint="PDF หรือรูป"
              files={docs.filter((d) => d.doc_category === 'registration_cert').map((d) => ({ id: d.id, name: d.name }))}
              onAdd={() => void pickImage('registration_cert')}
              onRemove={(id) => setDocs((prev) => prev.filter((d) => d.id !== id))}
              error={null}
              fieldRef={registerY}
            />
            <FileField
              label="หนังสือรับรองจากชุมชน/อบต."
              name="documents_community"
              hint="ใช้แทนหรือร่วมกับหนังสือจดทะเบียน"
              files={docs.filter((d) => d.doc_category === 'community_cert').map((d) => ({ id: d.id, name: d.name }))}
              onAdd={() => void pickImage('community_cert')}
              onRemove={(id) => setDocs((prev) => prev.filter((d) => d.id !== id))}
              error={null}
            />
            <FileField
              label="รูปสถานที่ (1–3 รูป)"
              name="documents_photos"
              files={docs.filter((d) => d.doc_category === 'site_photo').map((d) => ({ id: d.id, name: d.name }))}
              onAdd={() => void pickImage('site_photo')}
              onRemove={(id) => setDocs((prev) => prev.filter((d) => d.id !== id))}
              error={fieldErr('documents')}
              fieldRef={registerY}
            />
            <FileField
              label="เอกสารอื่น (ไม่บังคับ)"
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
            <Text style={styles.summaryTitle}>สรุปก่อนส่ง</Text>
            <Text style={styles.summaryLine}>ประเภท: {labelApplicationKind(kind)}</Text>
            <Text style={styles.summaryLine}>ชื่อ: {contactName}</Text>
            <Text style={styles.summaryLine}>เบอร์: {contactPhone}</Text>
            {kind === 'organization' ? (
              <>
                <Text style={styles.summaryLine}>องค์กร: {orgName}</Text>
                <Text style={styles.summaryLine}>ประเภทองค์กร: {labelOrgType(orgType)}</Text>
              </>
            ) : null}
            <Text style={styles.summaryLine}>กลุ่มผู้รับ: {labelRecipientGroups(recipientGroups)}</Text>
            <Pressable
              style={styles.termsRow}
              onPress={() => {
                setTermsAccepted((v) => !v);
                clearField('terms_accepted');
              }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: termsAccepted }}
            >
              <View style={[styles.checkbox, termsAccepted ? styles.checkboxOn : null]} />
              <Text style={styles.termsText}>
                ข้าพเจ้ายอมรับ{' '}
                <Text style={styles.link} onPress={() => router.push('/terms/donor')}>
                  ข้อกำหนดและนโยบายผู้รับบริจาค
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
                label="ไปที่คำขอเดิม"
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
          <SecondaryButton label="ย้อนกลับ" onPress={goBack} />
          {kind !== null && step < totalSteps - 1 ? (
            <PrimaryButton label="ถัดไป (บันทึกร่าง)" onPress={() => void goNext()} loading={busy} />
          ) : null}
          {kind !== null && step === totalSteps - 1 ? (
            <PrimaryButton
              label={user?.org_status === 'needs_more_info' ? 'ส่งตรวจอีกครั้ง' : 'ส่งคำขอ'}
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
  },
  checkboxOn: { backgroundColor: C.leaf, borderColor: C.leaf },
  termsText: { flex: 1, color: C.ink, lineHeight: 22 },
  link: { color: C.leaf, fontWeight: '700', textDecorationLine: 'underline' },
});
