import React, { useCallback, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type LayoutChangeEvent,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useI18n } from '../i18n';
import { C, fonts } from '../theme';
import { Chip } from './ui';

export const INPUT_HEIGHT = 52;

export type FieldErrors = Record<string, string>;

export function ErrorIcon(): React.ReactElement {
  const { t } = useI18n();
  return (
    <View style={styles.errorIcon} accessibilityLabel={t.form.errorA11y}>
      <Text style={styles.errorIconText}>!</Text>
    </View>
  );
}

export function FieldErrorText({ message }: { message: string | null | undefined }): React.ReactElement | null {
  if (message === null || message === undefined || message === '') {
    return null;
  }
  return (
    <View style={styles.errorRow}>
      <ErrorIcon />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

type FormFieldProps = {
  label: string;
  name: string;
  error?: string | null;
  onBlurField?: (name: string) => void;
  fieldRef?: (name: string, y: number) => void;
  /** Show eye toggle inside the field (password fields). */
  secureToggle?: boolean;
} & TextInputProps;

export function FormField({
  label,
  name,
  error,
  onBlurField,
  fieldRef,
  onBlur,
  style,
  secureToggle,
  secureTextEntry,
  ...rest
}: FormFieldProps): React.ReactElement {
  const { t } = useI18n();
  const [revealed, setRevealed] = useState(false);
  const hasError = error !== null && error !== undefined && error !== '';
  const isSecure = secureToggle === true || secureTextEntry === true;
  const hideText = isSecure && !revealed;
  return (
    <View
      style={styles.field}
      onLayout={(e: LayoutChangeEvent) => {
        fieldRef?.(name, e.nativeEvent.layout.y);
      }}
    >
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrap, hasError ? styles.inputError : null, style as object]}>
        <TextInput
          style={styles.inputInner}
          placeholderTextColor={C.mute}
          accessibilityState={hasError ? { selected: false } : undefined}
          secureTextEntry={hideText}
          onBlur={(event) => {
            onBlurField?.(name);
            onBlur?.(event);
          }}
          {...rest}
        />
        {secureToggle === true ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? t.login.hidePassword : t.login.showPassword}
            onPress={() => setRevealed((v) => !v)}
            style={styles.eyeBtn}
            hitSlop={4}
          >
            <Feather name={revealed ? 'eye-off' : 'eye'} size={20} color={C.mute} />
          </Pressable>
        ) : null}
      </View>
      <FieldErrorText message={error} />
    </View>
  );
}

/** Alias used by screens that prefer TextField naming. */
export const TextField = FormField;

export function ChipGroup({
  label,
  name,
  options,
  value,
  onChange,
  error,
  multi = false,
  fieldRef,
}: {
  label: string;
  name: string;
  options: { key: string; label: string }[];
  value: string | string[] | null;
  onChange: (next: string | string[]) => void;
  error?: string | null;
  multi?: boolean;
  fieldRef?: (name: string, y: number) => void;
}): React.ReactElement {
  const hasError = error !== null && error !== undefined && error !== '';
  const selected = new Set(Array.isArray(value) ? value : value !== null ? [value] : []);
  return (
    <View
      style={[styles.field, hasError ? styles.chipGroupError : null]}
      onLayout={(e) => fieldRef?.(name, e.nativeEvent.layout.y)}
    >
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipRow}>
        {options.map((opt) => {
          const isOn = selected.has(opt.key);
          return (
            <Chip
              key={opt.key}
              label={opt.label}
              selected={isOn}
              onPress={() => {
                if (multi) {
                  const next = new Set(selected);
                  if (next.has(opt.key)) {
                    next.delete(opt.key);
                  } else {
                    next.add(opt.key);
                  }
                  onChange([...next]);
                } else {
                  onChange(opt.key);
                }
              }}
            />
          );
        })}
      </View>
      <FieldErrorText message={error} />
    </View>
  );
}

export function FileField({
  label,
  name,
  hint,
  files,
  error,
  onAdd,
  onRemove,
  fieldRef,
}: {
  label: string;
  name: string;
  hint?: string;
  files: { id: string; name: string }[];
  error?: string | null;
  onAdd: () => void;
  onRemove: (id: string) => void;
  fieldRef?: (name: string, y: number) => void;
}): React.ReactElement {
  const { t } = useI18n();
  const hasError = error !== null && error !== undefined && error !== '';
  return (
    <View
      style={[styles.field, hasError ? styles.fileError : null]}
      onLayout={(e) => fieldRef?.(name, e.nativeEvent.layout.y)}
    >
      <Text style={styles.label}>{label}</Text>
      {hint !== undefined ? <Text style={styles.hint}>{hint}</Text> : null}
      {files.map((file) => (
        <View key={file.id} style={styles.fileRow}>
          <Text style={styles.fileName} numberOfLines={1}>
            {file.name}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => onRemove(file.id)}
            style={styles.removeHit}
            hitSlop={4}
          >
            <Text style={styles.remove}>{t.form.removeFile}</Text>
          </Pressable>
        </View>
      ))}
      <Pressable accessibilityRole="button" onPress={onAdd} style={styles.addFile}>
        <Text style={styles.addFileText}>{t.form.attachFile}</Text>
      </Pressable>
      <FieldErrorText message={error} />
    </View>
  );
}

export function useFieldErrors(initial: FieldErrors = {}): {
  errors: FieldErrors;
  setErrors: React.Dispatch<React.SetStateAction<FieldErrors>>;
  setFieldError: (name: string, message: string | null) => void;
  clearField: (name: string) => void;
  applyServerFields: (fields: Record<string, string> | undefined) => void;
  firstErrorName: () => string | null;
} {
  const { translateFieldError } = useI18n();
  const [errors, setErrors] = useState<FieldErrors>(initial);
  const setFieldError = useCallback((name: string, message: string | null) => {
    setErrors((prev) => {
      const next = { ...prev };
      if (message === null || message === '') {
        delete next[name];
      } else {
        next[name] = message;
      }
      return next;
    });
  }, []);
  const clearField = useCallback((name: string) => {
    setFieldError(name, null);
  }, [setFieldError]);
  const applyServerFields = useCallback(
    (fields: Record<string, string> | undefined) => {
      if (fields === undefined) {
        return;
      }
      const translated: FieldErrors = {};
      for (const [key, value] of Object.entries(fields)) {
        translated[key] = translateFieldError(value);
      }
      setErrors((prev) => ({ ...prev, ...translated }));
    },
    [translateFieldError],
  );
  const firstErrorName = useCallback(() => {
    const keys = Object.keys(errors);
    return keys[0] ?? null;
  }, [errors]);
  return { errors, setErrors, setFieldError, clearField, applyServerFields, firstErrorName };
}

export function useFieldScroll(): {
  scrollRef: React.RefObject<ScrollView | null>;
  registerY: (name: string, y: number) => void;
  scrollToField: (name: string | null) => void;
} {
  const scrollRef = useRef<ScrollView | null>(null);
  const yMap = useRef<Record<string, number>>({});
  const registerY = useCallback((name: string, y: number) => {
    yMap.current[name] = y;
  }, []);
  const scrollToField = useCallback((name: string | null) => {
    if (name === null) {
      return;
    }
    const y = yMap.current[name];
    if (y === undefined) {
      return;
    }
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
  }, []);
  return { scrollRef, registerY, scrollToField };
}

const styles = StyleSheet.create({
  field: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: C.ink, marginBottom: 4, fontFamily: fonts.bodySemi },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.lineStrong,
    borderRadius: 14,
    paddingHorizontal: 12,
    minHeight: INPUT_HEIGHT,
    backgroundColor: C.white,
  },
  inputInner: {
    flex: 1,
    minHeight: INPUT_HEIGHT - 4,
    fontSize: 16,
    color: C.ink,
    fontFamily: fonts.body,
    paddingVertical: Platform.OS === 'web' ? 10 : 12,
  },
  eyeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputError: { borderColor: C.chili, borderWidth: 1.5 },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 },
  errorIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.chili,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  errorIconText: { color: C.white, fontSize: 11, fontWeight: '800' },
  errorText: { color: C.chili, flex: 1, fontSize: 13 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipGroupError: {
    borderWidth: 1.5,
    borderColor: C.chili,
    borderRadius: 10,
    padding: 8,
  },
  hint: { color: C.mute, fontSize: 12, marginBottom: 6 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  fileName: { flex: 1, color: C.ink, marginRight: 8 },
  removeHit: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  remove: { color: C.chili, fontWeight: '700', fontFamily: fonts.bodySemi },
  addFile: {
    borderWidth: 1,
    borderColor: C.leaf,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  addFileText: { color: C.leaf, fontWeight: '700' },
  fileError: {
    borderWidth: 1.5,
    borderColor: C.chili,
    borderRadius: 10,
    padding: 8,
  },
});
