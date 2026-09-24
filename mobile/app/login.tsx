import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../src/api/client';
import { FormField, useFieldErrors, useFieldScroll } from '../src/components/form';
import { LogoMark } from '../src/components/LogoMark';
import { PrimaryButton, Screen } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { useI18n } from '../src/i18n';
import { C, fonts, radius } from '../src/theme';

export default function LoginScreen(): React.ReactElement {
  const { login } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { errors, setErrors, setFieldError, applyServerFields } = useFieldErrors();
  const { scrollRef, registerY, scrollToField } = useFieldScroll();
  const touched = useRef<Record<string, boolean>>({});

  const validateField = (name: string): string | null => {
    if (name === 'phone') {
      const value = identity.trim();
      const isPhone = /^\d{9,15}$/.test(value);
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      if (!isPhone && !isEmail) {
        return t.login.phoneInvalid;
      }
      return null;
    }
    if (name === 'password') {
      if (password.length < 1) {
        return t.login.passwordRequired;
      }
      return null;
    }
    return null;
  };

  const onBlurField = (name: string): void => {
    touched.current[name] = true;
    setFieldError(name, validateField(name));
  };

  const onSubmit = async (): Promise<void> => {
    const next: Record<string, string> = {};
    for (const name of ['phone', 'password']) {
      const msg = validateField(name);
      if (msg !== null) {
        next[name] = msg;
      }
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      scrollToField(Object.keys(next)[0] ?? null);
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await login(identity.trim(), password);
      const target =
        typeof returnTo === 'string' && returnTo.length > 0 && returnTo.startsWith('/')
          ? returnTo
          : '/(tabs)';
      router.replace(target as never);
    } catch (err) {
      if (err instanceof ApiError) {
        applyServerFields(err.fields);
        if (err.fields !== undefined && Object.keys(err.fields).length > 0) {
          scrollToField(Object.keys(err.fields)[0] ?? null);
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError(t.login.failed);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.body}>
          <View style={styles.langRow}>
            <View style={styles.langToggle}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setLocale('th')}
                style={[styles.langBtn, locale === 'th' ? styles.langBtnOn : null]}
              >
                <Text style={[styles.langText, locale === 'th' ? styles.langTextOn : null]}>TH</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setLocale('en')}
                style={[styles.langBtn, locale === 'en' ? styles.langBtnOn : null]}
              >
                <Text style={[styles.langText, locale === 'en' ? styles.langTextOn : null]}>EN</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.brandBlock}>
            <LogoMark size={60} />
            <Text style={styles.welcome}>{t.login.welcomeBack}</Text>
            <Text style={styles.tagline}>{t.login.tagline}</Text>
          </View>

          <FormField
            label={t.login.phone}
            name="phone"
            value={identity}
            onChangeText={(text) => {
              setIdentity(text);
              if (touched.current.phone) {
                setFieldError('phone', validateField('phone'));
              }
            }}
            onBlurField={onBlurField}
            fieldRef={registerY}
            error={errors.phone}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder={t.login.phonePlaceholder}
          />
          <FormField
            label={t.login.password}
            name="password"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (touched.current.password) {
                setFieldError('password', text.length < 1 ? t.login.passwordRequired : null);
              }
            }}
            onBlurField={onBlurField}
            fieldRef={registerY}
            error={errors.password}
            secureTextEntry={!showPassword}
            placeholder={t.login.password}
          />
          <View style={styles.eyeRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showPassword ? t.login.hidePassword : t.login.showPassword}
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={8}
            >
              <Text style={styles.link}>
                {showPassword ? t.login.hidePassword : t.login.showPassword}
              </Text>
            </Pressable>
            <Text style={styles.muted}>{t.login.forgotPassword}</Text>
          </View>
          {formError !== null ? (
            <Text style={styles.error}>{formError}</Text>
          ) : null}
          <PrimaryButton label={t.login.submit} onPress={() => void onSubmit()} loading={submitting} />

          <View style={styles.footer}>
            <Text style={styles.footerText}>{t.login.noAccount} </Text>
            <Link href="/register" style={styles.link}>
              {t.login.register}
            </Link>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/(tabs)')}
            style={styles.guest}
          >
            <Feather name="shopping-bag" size={18} color={C.leaf} />
            <Text style={styles.link}>{t.login.browseGuest}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 24, paddingBottom: 40 },
  langRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  langToggle: {
    flexDirection: 'row',
    backgroundColor: C.leafSoft,
    borderRadius: 10,
    padding: 3,
  },
  langBtn: {
    height: 32,
    minWidth: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langBtnOn: { backgroundColor: C.white },
  langText: { fontSize: 13, fontWeight: '600', color: C.mute, fontFamily: fonts.bodySemi },
  langTextOn: { color: C.leafDeep, fontWeight: '700' },
  brandBlock: { marginTop: 12, gap: 10, marginBottom: 28 },
  welcome: {
    fontFamily: fonts.titleBold,
    fontSize: 30,
    fontWeight: '700',
    color: C.ink,
  },
  tagline: { fontSize: 15, color: C.mute, lineHeight: 22, fontFamily: fonts.body },
  eyeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  muted: { fontSize: 14, color: C.mute, fontFamily: fonts.body },
  link: { color: C.leaf, fontWeight: '600', fontFamily: fonts.bodySemi, fontSize: 14 },
  error: { color: C.danger, marginBottom: 8, fontFamily: fonts.body },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 22 },
  footerText: { color: C.mute, fontFamily: fonts.body },
  guest: {
    marginTop: 18,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
});

export const loginRadius = radius;
