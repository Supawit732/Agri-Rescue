import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { loadIdentityMode, saveIdentityMode, type IdentityMode } from '../api/storage';
import { useI18n } from '../i18n';
import {
  formatPhoneOnChange,
  isValidThaiPhone,
  normalizeEmail,
  normalizePhone,
  splitEmail,
  suggestDomainFix,
  suggestDomains,
} from '../lib/phoneEmail';
import { C, fonts, radius } from '../theme';
import { FieldErrorText } from './form';

type Shared = {
  label?: string;
  name: string;
  error?: string | null;
  onBlurField?: (name: string) => void;
  fieldRef?: (name: string, y: number) => void;
  /** Called with the value to send to the server (digits phone or lowercased email). */
  onValueChange: (value: string) => void;
  /** Controlled display value (formatted phone or raw email). */
  value: string;
  /** Optional: override initial mode before storage loads. */
  initialMode?: IdentityMode;
  /**
   * toggle (login default) | phone | email — when phone/email, hide the mode switch.
   * Register uses separate phone + email fields without toggle.
   */
  mode?: 'toggle' | 'phone' | 'email';
};

/**
 * Toggle «เบอร์โทร | อีเมล» + phone format / email domain chips.
 * Remembers last mode in device storage.
 */
export function PhoneEmailField({
  label,
  name,
  error,
  onBlurField,
  fieldRef,
  onValueChange,
  value,
  initialMode = 'phone',
  mode: modeOverride = 'toggle',
}: Shared): React.ReactElement {
  const { t } = useI18n();
  const [mode, setMode] = useState<IdentityMode>(
    modeOverride === 'toggle' ? initialMode : modeOverride,
  );
  const [ready, setReady] = useState(modeOverride !== 'toggle');
  const fieldLabel = label ?? t.identity.label;
  const showToggle = modeOverride === 'toggle';

  useEffect(() => {
    if (modeOverride !== 'toggle') {
      setMode(modeOverride);
      setReady(true);
      return;
    }
    let alive = true;
    void (async () => {
      const stored = await loadIdentityMode();
      if (alive && stored !== null) {
        setMode(stored);
      }
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [modeOverride]);

  const switchMode = (next: IdentityMode): void => {
    setMode(next);
    void saveIdentityMode(next);
    onValueChange('');
  };

  const { domainPart } = useMemo(() => {
    const at = value.lastIndexOf('@');
    return { domainPart: at >= 0 ? value.slice(at + 1) : null };
  }, [value]);

  const domainFix =
    mode === 'email' && domainPart !== null && domainPart !== ''
      ? suggestDomainFix(domainPart)
      : null;
  const domainChips =
    mode === 'email' && domainPart !== null
      ? suggestDomains(domainPart).filter((d) => d !== domainPart)
      : [];

  const handlePhoneChange = (next: string): void => {
    const formatted = formatPhoneOnChange(value, next);
    onValueChange(formatted);
  };

  const handleEmailChange = (next: string): void => {
    // No autocapitalize / autocorrect — keep raw; normalize on submit.
    onValueChange(next);
  };

  const submitValue = (): string =>
    mode === 'phone' ? normalizePhone(value) : normalizeEmail(value);

  const validate = (): string | null => {
    if (mode === 'phone') {
      return isValidThaiPhone(normalizePhone(value)) ? null : t.identity.phoneInvalid;
    }
    return normalizeEmail(value) !== '' &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value))
      ? null
      : t.identity.emailInvalid;
  };

  const inputProps: TextInputProps =
    mode === 'phone'
      ? {
          keyboardType: 'number-pad',
          value,
          onChangeText: handlePhoneChange,
          placeholder: t.identity.phonePlaceholder,
          autoCapitalize: 'none',
          autoCorrect: false,
        }
      : {
          keyboardType: 'email-address',
          value,
          onChangeText: handleEmailChange,
          placeholder: t.identity.emailPlaceholder,
          autoCapitalize: 'none',
          autoCorrect: false,
          textContentType: 'emailAddress',
        };

  if (!ready) {
    return <View style={styles.field} onLayout={() => fieldRef?.(name, 0)} />;
  }

  return (
    <View
      style={styles.field}
      onLayout={(e) => fieldRef?.(name, e.nativeEvent.layout.y)}
    >
      <Text style={styles.label}>{fieldLabel}</Text>
      {showToggle ? (
        <View style={styles.segment} accessibilityRole="tablist">
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === 'phone' }}
            onPress={() => switchMode('phone')}
            style={[styles.segmentBtn, mode === 'phone' ? styles.segmentBtnOn : null]}
          >
            <Text style={[styles.segmentText, mode === 'phone' ? styles.segmentTextOn : null]}>
              {t.identity.modePhone}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === 'email' }}
            onPress={() => switchMode('email')}
            style={[styles.segmentBtn, mode === 'email' ? styles.segmentBtnOn : null]}
          >
            <Text style={[styles.segmentText, mode === 'email' ? styles.segmentTextOn : null]}>
              {t.identity.modeEmail}
            </Text>
          </Pressable>
        </View>
      ) : null}
      <TextInput
        style={[styles.input, error ? styles.inputError : null]}
        placeholderTextColor={C.mute}
        onBlur={() => onBlurField?.(name)}
        {...inputProps}
        accessibilityState={error ? { selected: false } : undefined}
      />
      {mode === 'email' && domainChips.length > 0 ? (
        <View style={styles.chipRow}>
          {domainChips.map((d) => (
            <Pressable
              key={d}
              accessibilityRole="button"
              onPress={() => {
                const { local } = splitEmail(value);
                const next = `${local}@${d}`;
                onValueChange(next);
              }}
              style={styles.chip}
            >
              <Text style={styles.chipText}>{d}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {mode === 'email' && domainFix !== null ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            const { local } = splitEmail(value);
            onValueChange(`${local}@${domainFix}`);
          }}
          style={styles.fixRow}
        >
          <Text style={styles.fixText}>
            {formatTemplateSafe(t.identity.didYouMean, { domain: domainFix })}
          </Text>
        </Pressable>
      ) : null}
      <FieldErrorText message={error} />
      {/* expose submit helper via data attribute for tests / parent */}
      <Text style={styles.hidden} importantForAccessibility="no" testID={`${name}-submit`}>
        {ready ? submitValue() : ''}
      </Text>
    </View>
  );
}

function formatTemplateSafe(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, v),
    template,
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 4 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: C.ink,
    marginBottom: 6,
    fontFamily: fonts.bodySemi,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: C.leafSoft,
    borderRadius: 10,
    padding: 3,
    marginBottom: 8,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnOn: { backgroundColor: C.white },
  segmentText: { fontSize: 14, fontWeight: '600', color: C.mute, fontFamily: fonts.bodySemi },
  segmentTextOn: { color: C.leafDeep, fontWeight: '700' },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: C.lineStrong,
    borderRadius: radius.button,
    paddingHorizontal: 16,
    fontSize: 16,
    color: C.ink,
    backgroundColor: C.surface,
    fontFamily: fonts.body,
  },
  inputError: { borderColor: C.danger },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.surface,
    justifyContent: 'center',
  },
  chipText: { fontSize: 12, color: C.leaf, fontFamily: fonts.bodySemi, fontWeight: '600' },
  fixRow: { marginTop: 6, minHeight: 32, justifyContent: 'center' },
  fixText: { fontSize: 13, color: C.soonFg, fontFamily: fonts.bodySemi, fontWeight: '600' },
  hidden: { height: 0, opacity: 0 },
});
