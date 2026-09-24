import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ApiError } from '../src/api/client';
import { initialsOf } from '../src/components/LogoMark';
import { FormField, useFieldErrors, useFieldScroll } from '../src/components/form';
import { LocationPicker, type LatLng } from '../src/components/LocationPicker';
import { PhoneEmailField } from '../src/components/PhoneEmailField';
import { Body, PrimaryButton, Screen, StackHeader } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { donorStatusLabel } from '../src/donorLabels';
import { formatTemplate, useI18n } from '../src/i18n';
import { formatPhone, isValidEmail, normalizeEmail } from '../src/lib/phoneEmail';
import { mediaUri, resizeToBase64 } from '../src/lib/media';
import { C, fonts, radius } from '../src/theme';

export default function ProfileScreen(): React.ReactElement {
  const { user, api, refreshUser, logout } = useAuth();
  const { t, formatDate, translateError, locale, setLocale } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState(user?.email ?? '');
  const [lineId, setLineId] = useState(user?.line_id ?? '');
  const [shopName, setShopName] = useState(user?.name ?? '');
  const [coords, setCoords] = useState<LatLng | null>(() =>
    user?.lat != null && user?.lng != null ? { lat: user.lat, lng: user.lng } : null,
  );
  const { errors, setErrors, setFieldError, applyServerFields } = useFieldErrors();
  const { scrollRef, registerY, scrollToField } = useFieldScroll();

  if (user === null) {
    return (
      <Screen>
        <StackHeader title={t.profile.title} onBack={() => router.replace('/(tabs)')} />
        <Body>
          <Text style={styles.muted}>{t.account.loginMessage}</Text>
          <PrimaryButton
            label={t.common.login}
            onPress={() => router.push({ pathname: '/login', params: { returnTo: '/profile' } })}
          />
        </Body>
      </Screen>
    );
  }

  const enableSell = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api.updateProfile({ can_sell: true });
      await refreshUser();
      setMessage(t.account.sellEnabled);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(err.code, err.message) : t.account.updateFailed);
    } finally {
      setBusy(false);
    }
  };

  const enableBuy = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api.updateProfile({
        can_buy: true,
        ...(user.buyer_type === null ? { buyer_type: 'vendor' as const } : {}),
      });
      await refreshUser();
      setMessage(t.account.buyEnabled);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(err.code, err.message) : t.account.updateFailed);
    } finally {
      setBusy(false);
    }
  };

  const saveContact = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setMessage(null);
    const nextErrors: Record<string, string> = {};
    const emailTrim = normalizeEmail(email);
    if (emailTrim !== '' && !isValidEmail(emailTrim)) {
      nextErrors.email = t.identity.emailInvalid;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setBusy(false);
      return;
    }
    try {
      await api.updateProfile({
        email: emailTrim === '' ? '' : emailTrim,
        line_id: lineId.trim() === '' ? null : lineId.trim(),
      });
      await refreshUser();
      setMessage(t.profile.saved);
    } catch (err) {
      if (err instanceof ApiError) {
        applyServerFields(err.fields);
        if (err.fields !== undefined && Object.keys(err.fields).length > 0) {
          scrollToField(Object.keys(err.fields)[0] ?? null);
        } else {
          setError(translateError(err.code, err.message));
        }
      } else {
        setError(t.profile.saveFailed);
      }
    } finally {
      setBusy(false);
    }
  };

  const saveLocation = async (): Promise<void> => {
    if (coords === null) {
      setErrors({ lat: t.profile.pickupRequired });
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    setErrors({});
    try {
      await api.updateProfile({ lat: coords.lat, lng: coords.lng });
      await refreshUser();
      setMessage(t.profile.saved);
    } catch (err) {
      if (err instanceof ApiError) {
        applyServerFields(err.fields);
        if (err.fields !== undefined && Object.keys(err.fields).length > 0) {
          scrollToField(Object.keys(err.fields)[0] ?? null);
        } else {
          setError(translateError(err.code, err.message));
        }
      } else {
        setError(t.profile.saveFailed);
      }
    } finally {
      setBusy(false);
    }
  };

  const pickAndUploadAvatar = (): void => {
    Alert.alert(t.profile.takePhoto, undefined, [
      {
        text: t.sell.takePhoto,
        onPress: () => {
          void uploadFrom(ImagePicker.launchCameraAsync);
        },
      },
      {
        text: t.sell.photoLibrary,
        onPress: () => {
          void uploadFrom(ImagePicker.launchImageLibraryAsync);
        },
      },
      { text: t.common.cancel, style: 'cancel' },
    ]);
  };

  const uploadFrom = async (
    launcher: typeof ImagePicker.launchCameraAsync,
  ): Promise<void> => {
    try {
      const permission =
        launcher === ImagePicker.launchCameraAsync
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError(t.profile.photoDenied);
        return;
      }
      const picked = await launcher({ mediaTypes: ['images'], quality: 0.9 });
      if (picked.canceled || picked.assets[0] === undefined) {
        return;
      }
      const asset = picked.assets[0];
      setBusy(true);
      setError(null);
      setMessage(null);
      const prepared = await resizeToBase64(asset.uri, asset.width, asset.height, 512);
      await api.uploadAvatar({ base64: prepared.base64, mime: prepared.mime });
      await refreshUser();
      setMessage(t.profile.saved);
    } catch {
      setError(t.profile.photoFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <StackHeader title={t.profile.title} onBack={() => router.replace('/(tabs)')} />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.body}>
        <View style={styles.hero}>
          <Pressable onPress={pickAndUploadAvatar} accessibilityRole="button" accessibilityLabel={t.profile.takePhoto}>
            <View>
              <View style={styles.avatar}>
                {mediaUri(user.avatar) !== null ? (
                  <Image source={{ uri: mediaUri(user.avatar)! }} style={styles.avatarImg} />
                ) : (
                  <Text style={styles.avatarText}>{initialsOf(user.name)}</Text>
                )}
              </View>
              <View style={styles.cameraBadge}>
                <Feather name="camera" size={16} color={C.white} />
              </View>
            </View>
          </Pressable>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.muted}>
            {formatTemplate(t.profile.memberSince, {
              date: formatDate(user.created_at != null ? user.created_at : new Date()),
            })}
          </Text>
        </View>

        {message !== null ? <Text style={styles.ok}>{message}</Text> : null}
        {error !== null ? <Text style={styles.err}>{error}</Text> : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t.account.sectionAccount}</Text>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.rowTitle}>{t.profile.roleSeller}</Text>
              <Text style={styles.muted}>{t.profile.roleSellerDesc}</Text>
            </View>
            <Switch
              value={user.can_sell}
              onValueChange={() => {
                if (!user.can_sell) void enableSell();
              }}
              trackColor={{ true: C.leaf, false: C.line }}
              thumbColor={C.white}
            />
          </View>
          <View style={styles.hr} />
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.rowTitle}>{t.profile.roleBuyer}</Text>
              <Text style={styles.muted}>{t.profile.roleBuyerDesc}</Text>
            </View>
            <Switch
              value={user.can_buy}
              onValueChange={() => {
                if (!user.can_buy) void enableBuy();
              }}
              trackColor={{ true: C.leaf, false: C.line }}
              thumbColor={C.white}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t.profile.myShop}</Text>
          <Pressable
            style={styles.linkRow}
            onPress={() => router.push({ pathname: '/shops/[userId]', params: { userId: String(user.id) } })}
          >
            <View style={styles.shopIcon}>
              <Text style={styles.shopIconText}>{initialsOf(user.name)}</Text>
            </View>
            <View style={styles.switchText}>
              <Text style={styles.rowTitle}>{user.name}</Text>
              <Text style={styles.muted}>{t.shop.editShopNameHint}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={C.mute} />
          </Pressable>
          <FormField
            label={t.shop.editShopName}
            name="shop_name"
            value={shopName}
            onChangeText={setShopName}
            onBlurField={() => undefined}
            fieldRef={registerY}
            placeholder={user.name}
          />
          <PrimaryButton
            label={t.profile.saveShop}
            block
            onPress={() => {
              void (async () => {
                setBusy(true);
                setError(null);
                try {
                  await api.ensureMyShop();
                  await api.updateMyShop({ name: shopName.trim() || user.name });
                  setMessage(t.profile.saved);
                } catch (err) {
                  setError(err instanceof ApiError ? translateError(err.code, err.message) : t.profile.saveFailed);
                } finally {
                  setBusy(false);
                }
              })();
            }}
            loading={busy}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t.profile.contactTitle}</Text>
          <Text style={styles.muted}>{t.profile.contactHint}</Text>
          <FormField
            label={t.profile.phone}
            name="phone"
            value={formatPhone(user.phone)}
            onChangeText={() => undefined}
            onBlurField={() => undefined}
            fieldRef={registerY}
            editable={false}
          />
          <PhoneEmailField
            initialMode="email"
            label={t.profile.email}
            name="email"
            value={email}
            onValueChange={setEmail}
            onBlurField={(n) => setFieldError(n, null)}
            fieldRef={registerY}
            error={errors.email}
          />
          <FormField
            label={t.profile.lineId}
            name="line_id"
            value={lineId ?? ''}
            onChangeText={setLineId}
            onBlurField={(name) => setFieldError(name, null)}
            fieldRef={registerY}
            placeholder={t.profile.lineIdPlaceholder}
            autoCapitalize="none"
          />
          <PrimaryButton
            label={t.profile.saveContact}
            block
            onPress={() => void saveContact()}
            loading={busy}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t.profile.pickupLocation}</Text>
          <Text style={styles.muted}>{t.profile.pickupHint}</Text>
          <LocationPicker
            value={coords}
            onChange={setCoords}
            label={t.profile.pickupLocation}
            error={errors.lat ?? null}
          />
          <PrimaryButton
            label={t.profile.saveLocation}
            block
            disabled={coords === null}
            onPress={() => void saveLocation()}
            loading={busy}
          />
        </View>

        <Pressable style={styles.card} onPress={() => router.push('/donor-apply')}>
          <View style={styles.linkRow}>
            <View style={styles.donorIcon}>
              <Feather name="gift" size={22} color={C.soonFg} />
            </View>
            <View style={styles.switchText}>
              <Text style={styles.rowTitle}>
                {t.profile.donorCardTitle} · {donorStatusLabel(user, t)}
              </Text>
              <Text style={styles.muted}>
                {formatTemplate(t.profile.donorWeekUsage, {
                  used: user.donation_remaining_kg != null && user.donation_weekly_cap_kg != null
                    ? String(user.donation_weekly_cap_kg - user.donation_remaining_kg)
                    : '0',
                  cap: user.donation_weekly_cap_kg != null ? String(user.donation_weekly_cap_kg) : '—',
                })}
              </Text>
              <Text style={styles.link}>{t.profile.donorUpgradeOrg}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={C.mute} />
          </View>
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t.common.language}</Text>
          <View style={styles.langRow}>
            <Pressable
              onPress={() => setLocale('th')}
              style={[styles.langBtn, locale === 'th' ? styles.langBtnOn : null]}
            >
              <Text style={[styles.langText, locale === 'th' ? styles.langTextOn : null]}>TH</Text>
            </Pressable>
            <Pressable
              onPress={() => setLocale('en')}
              style={[styles.langBtn, locale === 'en' ? styles.langBtnOn : null]}
            >
              <Text style={[styles.langText, locale === 'en' ? styles.langTextOn : null]}>EN</Text>
            </Pressable>
          </View>
        </View>

        <PrimaryButton label={t.account.impact} block onPress={() => router.push('/impact')} />
        <Pressable
          style={styles.logout}
          onPress={() => {
            logout();
            router.replace('/(tabs)');
          }}
        >
          <Text style={styles.logoutText}>{t.common.logout}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40, gap: 12 },
  hero: { alignItems: 'center', gap: 8, marginBottom: 8 },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: C.leafSoft,
    borderWidth: 3,
    borderColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.leaf,
    borderWidth: 2,
    borderColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.titleBold, fontSize: 32, fontWeight: '700', color: C.leafDeep },
  name: { fontFamily: fonts.titleBold, fontSize: 22, fontWeight: '700', color: C.ink },
  muted: { fontSize: 12, color: C.mute, fontFamily: fonts.body, marginBottom: 4 },
  ok: { color: C.leafDeep, fontWeight: '600', fontFamily: fonts.bodySemi },
  err: { color: C.danger, fontFamily: fonts.body },
  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: radius.cardLg,
    padding: 16,
    gap: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: C.ink, fontFamily: fonts.bodySemi },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  switchText: { flex: 1, gap: 2, minWidth: 0 },
  rowTitle: { fontSize: 15, color: C.ink, fontFamily: fonts.body },
  hr: { height: 1, backgroundColor: C.line },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  shopIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.leaf,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopIconText: { color: C.white, fontWeight: '700', fontFamily: fonts.titleBold },
  donorIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: C.soonBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: { color: C.leaf, fontWeight: '600', fontSize: 12, fontFamily: fonts.bodySemi },
  langRow: { flexDirection: 'row', gap: 8 },
  langBtn: {
    height: 36,
    minWidth: 56,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langBtnOn: { backgroundColor: C.leafSoft, borderColor: C.leaf },
  langText: { color: C.mute, fontWeight: '600', fontFamily: fonts.bodySemi },
  langTextOn: { color: C.leafDeep },
  logout: { minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  logoutText: { color: C.danger, fontWeight: '600', fontSize: 15, fontFamily: fonts.bodySemi },
});
