import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { DonorIntroModal, type DonorIntroChoice } from '../components/DonorIntroModal';
import { ApiError } from '../src/api/client';
import { LocationPicker, type LatLng } from '../src/components/LocationPicker';
import { Body, Chip, Field, PrimaryButton, Screen, SectionTitle } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { useI18n } from '../src/i18n';
import { C } from '../src/theme';
import type { BuyerType } from '../src/api/types';

export default function RegisterScreen(): React.ReactElement {
  const { register } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [canSell, setCanSell] = useState(true);
  const [canBuy, setCanBuy] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [lineId, setLineId] = useState('');
  const [buyerType, setBuyerType] = useState<BuyerType>('vendor');
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [introVisible, setIntroVisible] = useState(false);
  const [donorIntent, setDonorIntent] = useState<'now' | 'later' | null>(null);

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
    phone.trim().length > 0 &&
    password.length >= 8 &&
    coords !== null &&
    (canSell || canBuy);

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
    setError(null);
    setSubmitting(true);
    try {
      await register({
        name: name.trim(),
        phone: phone.trim(),
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
          <Field
            label={t.register.phone}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder={t.register.phonePlaceholder}
          />
          <Field label={t.register.password} value={password} onChangeText={setPassword} secureTextEntry />
          <Field
            label={t.register.lineOptional}
            value={lineId}
            onChangeText={setLineId}
            placeholder={t.register.linePlaceholder}
            autoCapitalize="none"
          />
          <LocationPicker value={coords} onChange={setCoords} label={t.register.location} />
          {error !== null ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton
            label={t.register.submit}
            onPress={onSubmit}
            loading={submitting}
            disabled={!canSubmit}
          />
          <View style={styles.footer}>
            <Text style={styles.footerText}>{t.register.haveAccount}</Text>
            <Text style={styles.link} onPress={() => router.push('/login')}>
              {t.common.login}
            </Text>
          </View>
        </Body>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { fontSize: 26, fontWeight: '800', color: C.leaf, marginTop: 12, marginBottom: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  hint: { color: C.mute, marginBottom: 8 },
  error: { color: C.chili, marginBottom: 8 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  footerText: { color: C.mute },
  link: { color: C.leaf, fontWeight: '700' },
});
