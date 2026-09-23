import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../src/api/client';
import type { ApplicationKind, DocCategory, OrgType, RecipientGroup } from '../src/api/types';
import { LocationPicker, type LatLng } from '../src/components/LocationPicker';
import {
  ChipGroup,
  FileField,
  FormField,
  useFieldErrors,
  useFieldScroll,
} from '../src/components/form';
import { Body, PrimaryButton, Screen, SecondaryButton, TopBar } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { C } from '../src/theme';

type LocalDoc = {
  id: string;
  name: string;
  mime: 'application/pdf' | 'image/jpeg' | 'image/png';
  base64: string;
  doc_category: DocCategory;
};

const ORG_TYPES: { key: OrgType; label: string }[] = [
  { key: 'foundation', label: 'มูลนิธิ' },
  { key: 'association', label: 'สมาคม' },
  { key: 'shelter', label: 'สถานสงเคราะห์' },
  { key: 'community_kitchen', label: 'โรงครัวชุมชน' },
  { key: 'community_enterprise', label: 'วิสาหกิจชุมชน' },
  { key: 'other', label: 'อื่น ๆ' },
];

const RECIPIENT_OPTS: { key: RecipientGroup; label: string }[] = [
  { key: 'elderly', label: 'ผู้สูงอายุ' },
  { key: 'children', label: 'เด็ก' },
  { key: 'community', label: 'ชุมชน' },
  { key: 'temple', label: 'วัด' },
  { key: 'other', label: 'อื่น ๆ' },
];

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

export default function DonorApplyScreen(): React.ReactElement {
  const { user, api, logout, refreshUser } = useAuth();
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

  const requested = useMemo(() => new Set(user?.requested_fields ?? []), [user?.requested_fields]);
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
    if (user?.draft_step !== null && user?.draft_step !== undefined && user.draft_step > 0 && kind !== null) {
      setStep(Math.min(user.draft_step, totalSteps - 1));
    }
  }, [user?.draft_step, kind, totalSteps]);

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
        ...(docs.length > 0
          ? {
              replace_documents: true,
              documents: docs.map((d) => ({
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
      if (kind !== null) {
        setKind(null);
        return;
      }
      router.back();
      return;
    }
    setStep((s) => s - 1);
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
    try {
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
          documents: docs.map((d) => ({
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
      <TopBar title="สมัครรับบริจาค" onLogout={logout} />
      <Body scrollRef={scrollRef}>
        <ProgressBar step={step} total={totalSteps} />
        {user.org_status === 'needs_more_info' ? (
          <Text style={styles.warn}>ผู้ดูแลขอข้อมูลเพิ่ม: {user.org_reject_reason ?? '-'}</Text>
        ) : null}

        {kind === null ? (
          <ChipGroup
            label="ประเภทผู้รับบริจาค"
            name="application_kind"
            options={[
              { key: 'individual', label: 'บุคคล (จิตอาสา)' },
              { key: 'organization', label: 'องค์กร' },
            ]}
            value={null}
            onChange={(v) => {
              setKind(v as ApplicationKind);
              clearField('application_kind');
              setStep(0);
            }}
            error={fieldErr('application_kind')}
            fieldRef={registerY}
          />
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
            <Text style={styles.summaryLine}>ประเภท: {kind === 'individual' ? 'บุคคล' : 'องค์กร'}</Text>
            <Text style={styles.summaryLine}>ชื่อ: {contactName}</Text>
            <Text style={styles.summaryLine}>เบอร์: {contactPhone}</Text>
            {kind === 'organization' ? <Text style={styles.summaryLine}>องค์กร: {orgName}</Text> : null}
            <Text style={styles.summaryLine}>กลุ่มผู้รับ: {recipientGroups.join(', ') || '-'}</Text>
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

        {formError !== null ? <Text style={styles.formError}>{formError}</Text> : null}

        <View style={styles.actions}>
          <SecondaryButton label="ย้อนกลับ" onPress={goBack} />
          {kind !== null && step < totalSteps - 1 ? (
            <PrimaryButton label="ถัดไป (บันทึกร่าง)" onPress={() => void goNext()} loading={busy} />
          ) : null}
          {kind !== null && step === totalSteps - 1 ? (
            <PrimaryButton label="ส่งคำขอ" onPress={() => void submit()} loading={busy} />
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
  muted: { color: C.mute },
  warn: { color: C.chili, marginBottom: 12 },
  fieldError: { color: C.chili, marginTop: 4, marginBottom: 8 },
  formError: { color: C.chili, marginVertical: 8 },
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
