import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { DonorIntroModal, type DonorIntroChoice } from '../components/DonorIntroModal';
import { ApiError } from '../src/api/client';
import { LocationPicker, type LatLng } from '../src/components/LocationPicker';
import { PhoneEmailField } from '../src/components/PhoneEmailField';
import { FormField } from '../src/components/form';
import { Body, Chip, Field, PrimaryButton, Screen, SectionTitle } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { useI18n } from '../src/i18n';
import { isValidEmail, isValidThaiPhone, normalizeEmail, normalizePhone } from '../src/lib/phoneEmail';
import { C, fonts } from '../src/theme';
import type { BuyerType } from '../src/api/types';

export default function RegisterScreen(): React.ReactElement {
  const { register } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [canSell, setCanSell] = useState(true);
  const [canBuy, setCanBuy] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [lineId, setLineId] = useState('');
  const [buyerType, setBuyerType] = useState<BuyerType>('vendor');
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [introVisible, setIntroVisible] = useState(false);
  const [donorIntent, setDonorIntent] = useState<'now' | 'later' | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const normalizedPhone = normalizePhone(phone);
  const phoneValid = isValidThaiPhone(normalizedPhone);
  const emailTrim = normalizeEmail(email);
  const emailValid = emailTrim === '' || isValidEmail(emailTrim);

  const buyerTypes = useMemo(
    () =>
      (Object.entries(t.buyerType) as [BuyerType, string][]).map(([key, label]) => ({
        key,
        label,
      })),
    [t.buyerType],
  );

  const canSubmit =
    name.trim().length > 0 &&
    phoneValid &&
    emailValid &&
    password.length >= 8 &&
    coords !== null &&
    (canSell || canBuy);

  const missing: string[] = [];
  if (name.trim().length === 0) missing.push(t.register.missingName);
  if (!phoneValid) missing.push(t.register.missingPhone);
  if (password.length < 8) missing.push(t.register.missingPassword);
  if (coords === null) missing.push(t.register.missingLocation);
  if (!canSell && !canBuy) missing.push(t.register.missingRole);

  const selectBuyerType = (key: BuyerType): void => {
    if (key === 'charity') {
      setIntroVisible(true);
      return;
    }
    setBuyerType(key);
    setDonorIntent(null);
  };

  const onIntroChoice = (choice: DonorIntroChoice): void => {
    setIntroVisible(false);
    if (choice === 'cancel') {
      if (buyerType === 'charity') {
        setBuyerType('vendor');
      }
      setDonorIntent(null);
      return;
    }
    setBuyerType('charity');
    setDonorIntent(choice);
  };

  const onSubmit = async (): Promise<void> => {
    if (coords === null) {
      setError(t.register.needLocation);
      return;
    }
    if (!canSell && !canBuy) {
      setError(t.register.needRole);
      return;
    }
    if (!phoneValid) {
      setPhoneError(t.identity.phoneInvalid);
      scrollToSafe();
      return;
    }
    if (!emailValid) {
      setEmailError(t.identity.emailInvalid);
      scrollToSafe();
      return;
    }
    setPhoneError(null);
    setEmailError(null);
    setError(null);
    setSubmitting(true);
    try {
      await register({
        name: name.trim(),
        phone: normalizedPhone,
        ...(emailTrim !== '' ? { email: emailTrim } : {}),
        password,
        can_sell: canSell,
        can_buy: canBuy,
        buyer_type: canBuy ? buyerType : null,
        line_id: lineId.trim() === '' ? null : lineId.trim(),
        lat: coords.lat,
        lng: coords.lng,
      });
      if (canBuy && buyerType === 'charity' && donorIntent === 'now') {
        router.replace('/donor-apply');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.register.failed);
    } finally {
      setSubmitting(false);
    }
  };

  const scrollToSafe = (): void => {
    /* phone/email errors show inline under fields */
  };

  return (
    <Screen>
      <DonorIntroModal visible={introVisible} onChoice={onIntroChoice} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Body>
          <Text style={styles.brand}>{t.register.title}</Text>
          <SectionTitle>{t.register.roleSection}</SectionTitle>
          <View style={styles.row}>
            <Chip label={t.register.roleSell} selected={canSell} onPress={() => setCanSell((v) => !v)} />
            <Chip label={t.register.roleBuy} selected={canBuy} onPress={() => setCanBuy((v) => !v)} />
          </View>
          <Text style={styles.hint}>{t.register.roleHint}</Text>
          {canBuy ? (
            <>
              <SectionTitle>{t.register.buyerTypeSection}</SectionTitle>
              <View style={styles.row}>
                {buyerTypes.map((entry) => (
                  <Chip
                    key={entry.key}
                    label={entry.label}
                    selected={buyerType === entry.key}
                    onPress={() => selectBuyerType(entry.key)}
                  />
                ))}
              </View>
              {buyerType === 'charity' ? (
                <Text style={styles.hint}>
                  {donorIntent === 'later' ? t.register.charityDraftHint : t.register.charityContinueHint}
                </Text>
              ) : null}
            </>
          ) : null}
          <Field
            label={t.register.name}
            value={name}
            onChangeText={setName}
            placeholder={t.register.namePlaceholder}
          />
          {/* Phone always required — format 0XX-XXX-XXXX, no mode toggle */}
          <PhoneEmailField
            mode="phone"
            label={t.identity.modePhone}
            name="phone"
            value={phone}
            onValueChange={(next) => {
              setPhone(next);
              if (phoneError) setPhoneError(null);
            }}
            onBlurField={() => {
              if (!phoneValid && phone.trim() !== '') setPhoneError(t.identity.phoneInvalid);
              else setPhoneError(null);
            }}
            error={phoneError}
          />
          {/* Email optional — domain chips, no mode toggle */}
          <PhoneEmailField
            mode="email"
            label={`${t.identity.modeEmail} (${t.identity.optional})`}
            name="email"
            value={email}
            onValueChange={(next) => {
              setEmail(next);
              if (emailError) setEmailError(null);
            }}
            onBlurField={() => {
              if (emailTrim !== '' && !isValidEmail(emailTrim)) setEmailError(t.identity.emailInvalid);
              else setEmailError(null);
            }}
            error={emailError}
          />
          <FormField
            label={t.register.password}
            name="password"
            value={password}
            onChangeText={setPassword}
            secureToggle
            autoCapitalize="none"
            placeholder={t.register.passwordHint}
          />
          <Text style={styles.hint}>{t.register.passwordHint}</Text>
          <Field
            label={t.register.lineOptional}
            value={lineId}
            onChangeText={setLineId}
            placeholder={t.register.linePlaceholder}
            autoCapitalize="none"
          />
          <LocationPicker value={coords} onChange={setCoords} label={t.register.location} />
          {error !== null ? <Text style={styles.error}>{error}</Text> : null}
          {!canSubmit && missing.length > 0 ? (
            <View style={styles.missingBox}>
              <Text style={styles.missingTitle}>{t.register.missingTitle}</Text>
              {missing.map((item) => (
                <Text key={item} style={styles.missingItem}>
                  · {item}
                </Text>
              ))}
            </View>
          ) : null}
          <PrimaryButton
            label={t.register.submit}
            block
            onPress={onSubmit}
            loading={submitting}
            disabled={!canSubmit}
          />
          <View style={styles.footer}>
            <Text style={styles.footerText}>{t.register.haveAccount}</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push('/login')}>
              <Text style={styles.link}>{t.common.login}</Text>
            </Pressable>
          </View>
        </Body>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: {
    fontSize: 26,
    fontWeight: '800',
    color: C.leaf,
    marginTop: 12,
    marginBottom: 12,
    fontFamily: fonts.titleBold,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  hint: { color: C.mute, marginBottom: 8, fontFamily: fonts.body, fontSize: 12 },
  error: { color: C.chili, marginBottom: 8, fontFamily: fonts.body },
  missingBox: {
    backgroundColor: '#FBEFD6',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 4,
  },
  missingTitle: {
    fontWeight: '700',
    color: C.soonFg,
    marginBottom: 2,
    fontFamily: fonts.bodySemi,
  },
  missingItem: { color: C.soonFg, fontFamily: fonts.body, fontSize: 13 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  footerText: { color: C.mute, fontFamily: fonts.body },
  link: { color: C.leaf, fontWeight: '700', fontFamily: fonts.bodySemi, minHeight: 44, textAlignVertical: 'center' },
});
