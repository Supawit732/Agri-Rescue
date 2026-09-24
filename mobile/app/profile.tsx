import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { DonorIntroModal, type DonorIntroChoice } from '../components/DonorIntroModal';
import { ApiError } from '../src/api/client';
import { Body, Chip, Field, PrimaryButton, Screen, SectionTitle, SecondaryButton, StackHeader } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import {
  labelApplicationKind,
  labelDonorTier,
  labelOrgStatus,
} from '../src/donorLabels';
import { formatTemplate, useI18n } from '../src/i18n';
import { C } from '../src/theme';
import type { BuyerType } from '../src/api/types';

export default function ProfileScreen(): React.ReactElement {
  const { user, api, mode, setMode, refreshUser } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [lineId, setLineId] = useState(user?.line_id ?? '');
  const [buyerType, setBuyerType] = useState<BuyerType>(user?.buyer_type ?? 'vendor');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [introVisible, setIntroVisible] = useState(false);
  const [pendingEnableBuy, setPendingEnableBuy] = useState(false);

  const buyerTypes = useMemo(
    () =>
      (Object.entries(t.buyerType) as [BuyerType, string][]).map(([key, label]) => ({
        key,
        label,
      })),
    [t.buyerType],
  );

  if (user === null) {
    return (
      <Screen>
        <StackHeader title={t.profile.title} onBack={() => router.replace('/(tabs)/account')} />
        <Body>
          <Text style={styles.muted}>{t.profile.pleaseLogin}</Text>
        </Body>
      </Screen>
    );
  }

  const selectBuyerType = (key: BuyerType): void => {
    if (key === 'charity') {
      setIntroVisible(true);
      return;
    }
    setBuyerType(key);
  };

  const onIntroChoice = (choice: DonorIntroChoice): void => {
    setIntroVisible(false);
    if (choice === 'cancel') {
      if (buyerType === 'charity') {
        setBuyerType('vendor');
      }
      setPendingEnableBuy(false);
      return;
    }
    setBuyerType('charity');
    if (pendingEnableBuy) {
      void runEnableBuy(choice);
      setPendingEnableBuy(false);
    } else if (choice === 'now') {
      router.push('/donor-apply');
    } else if (choice === 'later') {
      void (async () => {
        setBusy(true);
        try {
          await api.saveDonorDraft({ draft_step: 0 });
          await refreshUser();
          setMessage(t.profile.draftSaved);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : t.profile.draftFailed);
        } finally {
          setBusy(false);
        }
      })();
    }
  };

  const runEnableBuy = async (intent: 'now' | 'later'): Promise<void> => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const auth = await api.updateProfile({
        can_buy: true,
        ...(user.buyer_type === null ? { buyer_type: 'charity' } : {}),
      });
      if (intent === 'later') {
        await api.saveDonorDraft({ draft_step: 0 });
        await refreshUser();
        setMessage(t.profile.buyEnabledDraft);
      } else {
        setMessage(
          auth.user.org_status === 'draft' || auth.user.org_status === 'pending'
            ? t.profile.buyEnabledNeedApply
            : t.profile.buyEnabled,
        );
        setMode('buy');
        router.replace('/donor-apply');
        return;
      }
      setMode('buy');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.profile.updateFailed);
    } finally {
      setBusy(false);
    }
  };

  const enableSell = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.updateProfile({ can_sell: true });
      setMessage(t.profile.sellEnabled);
      setMode('sell');
      router.replace('/(tabs)/sell');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.profile.updateFailed);
    } finally {
      setBusy(false);
    }
  };

  const enableBuy = async (): Promise<void> => {
    if (buyerType === 'charity') {
      setPendingEnableBuy(true);
      setIntroVisible(true);
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.updateProfile({
        can_buy: true,
        ...(user.buyer_type === null ? { buyer_type: buyerType } : {}),
      });
      setMessage(t.profile.buyEnabled);
      setMode('buy');
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.profile.updateFailed);
    } finally {
      setBusy(false);
    }
  };

  const saveLine = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.updateProfile({ line_id: lineId.trim() === '' ? null : lineId.trim() });
      setMessage(t.profile.lineSaved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.profile.updateFailed);
    } finally {
      setBusy(false);
    }
  };

  const rights = [
    user.can_sell ? t.account.rightSell : null,
    user.can_buy ? t.account.rightBuy : null,
    user.is_admin ? t.account.rightAdmin : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Screen>
      <DonorIntroModal visible={introVisible} onChoice={onIntroChoice} />
      <StackHeader title={t.profile.title} onBack={() => router.replace('/(tabs)/account')} />
      <Body>
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.muted}>{user.phone}</Text>
        <Text style={styles.muted}>
          {t.profile.rightsLabel}: {rights || t.account.rightsNone}
        </Text>
        {user.can_buy ? (
          <Text style={styles.muted}>
            {t.profile.buyerTypeLabel}:{' '}
            {buyerTypes.find((entry) => entry.key === user.buyer_type)?.label ?? t.common.dash}
            {user.donor_tier !== null
              ? formatTemplate(t.profile.donorTierSuffix, { tier: labelDonorTier(user.donor_tier, t) })
              : ''}
            {user.donation_suspended ? ` · ${t.profile.donationSuspended}` : ''}
          </Text>
        ) : null}

        {user.org_status === 'draft' ? (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>
              {formatTemplate(t.profile.requestStatus, {
                kind: labelApplicationKind(user.application_kind, t),
                status: labelOrgStatus('draft', t),
              })}
            </Text>
            <Text style={styles.bannerText}>{t.profile.draftBannerBody}</Text>
            <PrimaryButton label={t.profile.continueApplication} onPress={() => router.push('/donor-apply')} />
          </View>
        ) : null}

        {user.org_status === 'pending' ? (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>
              {formatTemplate(t.profile.requestStatus, {
                kind: labelApplicationKind(user.application_kind, t),
                status: labelOrgStatus('pending', t),
              })}
            </Text>
            <Text style={styles.bannerText}>{t.profile.pendingBannerBody}</Text>
            <PrimaryButton label={t.profile.openExisting} onPress={() => router.push('/donor-apply')} />
          </View>
        ) : null}
        {user.org_status === 'needs_more_info' ? (
          <>
            <Text style={styles.error}>
              {formatTemplate(t.profile.needsInfoLine, {
                kind: labelApplicationKind(user.application_kind, t),
                status: labelOrgStatus('needs_more_info', t),
                reason: user.org_reject_reason ?? t.common.dash,
              })}
            </Text>
            <PrimaryButton label={t.profile.editUploadDocs} onPress={() => router.push('/donor-apply')} />
            <PrimaryButton
              label={t.profile.uploadExtraPhoto}
              onPress={() => {
                void (async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
                    if (!permission.granted) {
                      setError(t.profile.photoDenied);
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
                    await api.addOrgDocuments([
                      {
                        filename: asset.fileName ?? `doc-${Date.now()}.jpg`,
                        mime,
                        base64,
                        doc_category: 'other',
                      },
                    ]);
                    setMessage(t.profile.uploadExtraOk);
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : t.profile.uploadFailed);
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              loading={busy}
            />
            <PrimaryButton
              label={t.profile.resubmit}
              onPress={() => {
                void (async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await api.resubmitOrg();
                    setMessage(t.profile.resubmitOk);
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : t.profile.resubmitFailed);
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              loading={busy}
            />
          </>
        ) : null}
        {user.org_status === 'rejected' ? (
          <>
            <Text style={styles.error}>
              {formatTemplate(t.profile.rejectedLine, {
                kind: labelApplicationKind(user.application_kind, t),
                status: labelOrgStatus('rejected', t),
                reason: user.org_reject_reason ?? t.common.dash,
              })}
            </Text>
            <PrimaryButton label={t.profile.applyAgain} onPress={() => router.push('/donor-apply')} />
          </>
        ) : null}
        {user.org_status === 'approved' && user.application_kind === 'organization' ? (
          <Text style={styles.ok}>
            {formatTemplate(t.profile.approvedOrg, {
              status: labelOrgStatus('approved', t),
              name: user.org_name ?? t.common.dash,
            })}
          </Text>
        ) : null}
        {user.org_status === 'approved' && user.application_kind === 'individual' ? (
          <Text style={styles.ok}>
            {formatTemplate(t.profile.approvedIndividual, {
              status: labelOrgStatus('approved', t),
            })}
          </Text>
        ) : null}

        <SectionTitle>{t.profile.lineId}</SectionTitle>
        <Field
          label={t.profile.lineId}
          value={lineId}
          onChangeText={setLineId}
          placeholder={t.profile.lineOptional}
          autoCapitalize="none"
        />
        <PrimaryButton label={t.profile.saveLine} onPress={saveLine} loading={busy} />

        {!user.can_sell ? (
          <>
            <SectionTitle>{t.profile.sectionEnableSell}</SectionTitle>
            <PrimaryButton label={t.profile.enableSell} onPress={enableSell} loading={busy} />
          </>
        ) : null}

        {!user.can_buy ? (
          <>
            <SectionTitle>{t.profile.sectionEnableBuy}</SectionTitle>
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
            <PrimaryButton label={t.profile.enableBuy} onPress={enableBuy} loading={busy} />
          </>
        ) : null}

        {user.is_admin ? (
          <>
            <SectionTitle>{t.profile.sectionAdmin}</SectionTitle>
            <SecondaryButton label={t.profile.viewOrgRequests} onPress={() => router.push('/admin')} />
          </>
        ) : null}

        {user.can_buy &&
        user.donor_tier === null &&
        user.org_status !== 'pending' &&
        user.org_status !== 'draft' &&
        user.org_status !== 'needs_more_info' ? (
          <>
            <SectionTitle>{t.profile.sectionDonate}</SectionTitle>
            <PrimaryButton
              label={t.profile.quickVolunteer}
              onPress={() => {
                void (async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await api.becomeVolunteer();
                    setMessage(t.profile.volunteerEnabled);
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : t.profile.enableFailed);
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              loading={busy}
            />
            <SecondaryButton
              label={t.profile.formalApply}
              onPress={() => {
                setIntroVisible(true);
              }}
            />
          </>
        ) : null}

        {user.can_sell && user.can_buy ? (
          <Text style={styles.hint}>
            {formatTemplate(t.profile.modeHint, {
              mode: mode === 'sell' ? t.profile.modeSell : t.profile.modeBuy,
            })}
          </Text>
        ) : null}

        {message !== null ? <Text style={styles.ok}>{message}</Text> : null}
        {error !== null ? <Text style={styles.error}>{error}</Text> : null}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 22, fontWeight: '800', color: C.ink, marginBottom: 4 },
  muted: { color: C.mute, marginBottom: 4 },
  hint: { color: C.mute, marginTop: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  ok: { color: C.leaf, marginTop: 12 },
  error: { color: C.chili, marginTop: 12 },
  banner: {
    backgroundColor: C.turmericSoft,
    borderRadius: 12,
    padding: 14,
    marginVertical: 12,
    gap: 8,
  },
  bannerTitle: { fontWeight: '800', color: C.ink },
  bannerText: { color: C.mute, marginBottom: 4 },
});
