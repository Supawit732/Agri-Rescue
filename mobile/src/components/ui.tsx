import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../i18n';
import { C } from '../theme';

export function Screen({
  children,
  fullWidth,
  skipTopSafeArea,
}: {
  children: React.ReactNode;
  fullWidth?: boolean;
  /** When true, do not apply SafeArea top inset (header owns insets.top). */
  skipTopSafeArea?: boolean;
}): React.ReactElement {
  return (
    <SafeAreaView
      style={styles.screen}
      edges={skipTopSafeArea === true ? ['left', 'right'] : ['top', 'left', 'right']}
    >
      <View style={[styles.screenInner, fullWidth === true ? styles.screenInnerWide : null]}>{children}</View>
    </SafeAreaView>
  );
}

export function StackHeader({
  title,
  onBack,
}: {
  title: string;
  onBack?: () => void;
}): React.ReactElement {
  const { t } = useI18n();
  const router = useRouter();
  const goBack = (): void => {
    if (onBack !== undefined) {
      onBack();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)');
  };
  return (
    <View style={styles.stackHeader}>
      <Pressable accessibilityRole="button" onPress={goBack} style={styles.backBtn} hitSlop={8}>
        <Text style={styles.backBtnText}>‹ {t.common.back}</Text>
      </Pressable>
      <Text style={styles.stackTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.backBtnSpacer} />
    </View>
  );
}

export function SubScreen({
  title,
  children,
  onBack,
}: {
  title: string;
  children: React.ReactNode;
  onBack?: () => void;
}): React.ReactElement {
  return (
    <Screen>
      <StackHeader title={title} onBack={onBack} />
      {children}
    </Screen>
  );
}

/** Stack of equal-width primary CTAs (empty / login invite / success). */
export function CtaStack({ children }: { children: React.ReactNode }): React.ReactElement {
  return <View style={styles.ctaStack}>{children}</View>;
}

export function LoginPrompt({
  title,
  message,
  returnTo,
  primaryLabel,
}: {
  title: string;
  message: string;
  returnTo: string;
  primaryLabel?: string;
}): React.ReactElement {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <View style={styles.centerState}>
      <Text style={styles.promptTitle}>{title}</Text>
      <Text style={styles.stateText}>{message}</Text>
      <CtaStack>
        <PrimaryButton
          label={primaryLabel ?? t.loginPrompt.login}
          block
          onPress={() =>
            router.push({ pathname: '/login', params: { returnTo } })
          }
        />
        <SecondaryButton
          label={t.loginPrompt.register}
          block
          onPress={() => router.push('/register')}
        />
      </CtaStack>
    </View>
  );
}

export function EmptyState({
  message,
  ctaLabel,
  onCta,
}: {
  message: string;
  ctaLabel?: string;
  onCta?: () => void;
}): React.ReactElement {
  return (
    <View style={styles.centerState}>
      <Text style={styles.stateText}>{message}</Text>
      {ctaLabel !== undefined && onCta !== undefined ? (
        <CtaStack>
          <PrimaryButton label={ctaLabel} block onPress={onCta} />
        </CtaStack>
      ) : null}
    </View>
  );
}

export function TopBar({
  title,
  onImpact,
  onLogout,
  onProfile,
  mode,
  onModeChange,
  showModeToggle,
}: {
  title: string;
  onImpact?: () => void;
  onLogout?: () => void;
  onProfile?: () => void;
  mode?: 'sell' | 'buy';
  onModeChange?: (mode: 'sell' | 'buy') => void;
  showModeToggle?: boolean;
}): React.ReactElement {
  const { t } = useI18n();
  return (
    <View style={styles.topBar}>
      <View style={styles.topLeft}>
        <Text style={styles.topTitle} numberOfLines={1}>
          {title}
        </Text>
        {showModeToggle === true && onModeChange !== undefined ? (
          <View style={styles.modeRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => onModeChange('sell')}
              style={[styles.modeChip, mode === 'sell' ? styles.modeChipOn : null]}
            >
              <Text style={[styles.modeChipText, mode === 'sell' ? styles.modeChipTextOn : null]}>
                {t.chrome.sellMode}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => onModeChange('buy')}
              style={[styles.modeChip, mode === 'buy' ? styles.modeChipOn : null]}
            >
              <Text style={[styles.modeChipText, mode === 'buy' ? styles.modeChipTextOn : null]}>
                {t.chrome.buyMode}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      <View style={styles.topActions}>
        {onProfile !== undefined ? (
          <Pressable accessibilityRole="button" onPress={onProfile} style={styles.topLink}>
            <Text style={styles.topLinkText}>{t.account.profile}</Text>
          </Pressable>
        ) : null}
        {onImpact !== undefined ? (
          <Pressable accessibilityRole="button" onPress={onImpact} style={styles.topLink}>
            <Text style={styles.topLinkText}>{t.account.impact}</Text>
          </Pressable>
        ) : null}
        {onLogout !== undefined ? (
          <Pressable accessibilityRole="button" onPress={onLogout} style={styles.topLink}>
            <Text style={styles.topLinkText}>{t.common.logout}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: object }): React.ReactElement {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Chip({
  label,
  selected,
  onPress,
  color,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  color?: string;
}): React.ReactElement {
  const active = color ?? C.leaf;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.chip, selected ? { backgroundColor: active, borderColor: active } : null]}
    >
      <Text style={[styles.chipText, selected ? { color: C.white } : null]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Segmented({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}): React.ReactElement {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            onPress={() => onChange(option.key)}
            style={[styles.segment, selected ? styles.segmentActive : null]}
          >
            <Text style={[styles.segmentText, selected ? styles.segmentTextActive : null]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  tone,
  block,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: 'leaf' | 'turmeric' | 'chili';
  /** Stretch to parent width (use inside CtaStack). */
  block?: boolean;
}): React.ReactElement {
  const bg = tone === 'turmeric' ? C.turmeric : tone === 'chili' ? C.chili : C.leaf;
  const isDisabled = disabled === true || loading === true;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.button,
        block === true ? styles.buttonBlock : null,
        { backgroundColor: isDisabled ? C.disabled : bg },
      ]}
    >
      {loading === true ? (
        <ActivityIndicator color={C.white} />
      ) : (
        <Text style={styles.buttonText} numberOfLines={2}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
  block,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  block?: boolean;
}): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled === true}
      style={[
        styles.secondaryButton,
        block === true ? styles.buttonBlock : null,
        disabled === true ? { opacity: 0.5 } : null,
      ]}
    >
      <Text style={styles.secondaryButtonText} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  error,
  ...rest
}: { label: string; error?: string | null } & TextInputProps): React.ReactElement {
  const hasError = error !== null && error !== undefined && error !== '';
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, hasError ? styles.inputError : null]}
        placeholderTextColor={C.mute}
        accessibilityState={hasError ? { selected: false } : undefined}
        {...rest}
      />
      {hasError ? (
        <View style={styles.fieldErrorRow}>
          <View style={styles.fieldErrorIcon}>
            <Text style={styles.fieldErrorIconText}>!</Text>
          </View>
          <Text style={styles.fieldErrorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function Badge({ text, fg, bg }: { text: string; fg: string; bg: string }): React.ReactElement {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{text}</Text>
    </View>
  );
}

export function CircleSeq({ seq, color }: { seq: number; color: string }): React.ReactElement {
  return (
    <View style={[styles.circle, { backgroundColor: color }]}>
      <Text style={styles.circleText}>{seq}</Text>
    </View>
  );
}

export function BigStat({ value, unit, label }: { value: string; unit?: string; label: string }): React.ReactElement {
  return (
    <View style={styles.bigStat}>
      <Text style={styles.bigStatValue}>
        {value}
        {unit !== undefined ? <Text style={styles.bigStatUnit}> {unit}</Text> : null}
      </Text>
      <Text style={styles.bigStatLabel}>{label}</Text>
    </View>
  );
}

interface DataStateProps<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
  onRetry: () => void;
  isEmpty?: (data: T) => boolean;
  emptyText?: string;
  children: (data: T) => React.ReactNode;
}

export function DataState<T>({
  loading,
  error,
  data,
  onRetry,
  isEmpty,
  emptyText,
  children,
}: DataStateProps<T>): React.ReactElement {
  const { t } = useI18n();
  if (loading && data === null) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={C.leaf} />
        <Text style={styles.stateText}>{t.common.loading}</Text>
      </View>
    );
  }
  if (error !== null && data === null) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.errorText}>{error}</Text>
        <CtaStack>
          <PrimaryButton label={t.common.retry} block onPress={onRetry} />
        </CtaStack>
      </View>
    );
  }
  if (data === null) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={C.leaf} />
      </View>
    );
  }
  if (isEmpty !== undefined && isEmpty(data)) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.stateText}>{emptyText ?? t.empty.noData}</Text>
        <CtaStack>
          <SecondaryButton label={t.empty.refresh} block onPress={onRetry} />
        </CtaStack>
      </View>
    );
  }
  return <>{children(data)}</>;
}

export function Body({
  children,
  scrollRef,
}: {
  children: React.ReactNode;
  scrollRef?: React.RefObject<ScrollView | null>;
}): React.ReactElement {
  return (
    <ScrollView ref={scrollRef} contentContainerStyle={styles.body}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
    ...(Platform.OS === 'web' ? { alignItems: 'center' as const } : {}),
  },
  screenInner: {
    flex: 1,
    width: '100%',
    ...(Platform.OS === 'web' ? { maxWidth: 480 } : {}),
  },
  screenInnerWide: {
    maxWidth: undefined,
  },
  stackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: C.leaf,
    gap: 8,
  },
  backBtn: { paddingHorizontal: 8, paddingVertical: 6, minWidth: 64 },
  backBtnSpacer: { minWidth: 64 },
  backBtnText: { color: C.white, fontWeight: '700', fontSize: 16 },
  stackTitle: { flex: 1, color: C.white, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  promptTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: C.ink,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: C.leaf,
    gap: 8,
  },
  topLeft: { flex: 1, minWidth: 0 },
  topTitle: { color: C.white, fontSize: 18, fontWeight: '700' },
  modeRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  modeChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  modeChipOn: { backgroundColor: C.white },
  modeChipText: { color: C.white, fontSize: 12, fontWeight: '700' },
  modeChipTextOn: { color: C.leaf },
  topActions: { flexDirection: 'row', gap: 8, flexShrink: 0 },
  topLink: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.18)' },
  topLinkText: { color: C.white, fontWeight: '600', fontSize: 13 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: C.ink, marginBottom: 8, marginTop: 4 },
  card: {
    backgroundColor: C.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: C.line,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.white,
    marginRight: 8,
    marginBottom: 8,
    maxWidth: '100%',
    flexShrink: 1,
  },
  chipText: { color: C.ink, fontWeight: '600', fontSize: 14, flexShrink: 1 },
  segmented: {
    flexDirection: 'row',
    backgroundColor: C.leafSoft,
    borderRadius: 12,
    padding: 4,
    margin: 16,
    marginBottom: 4,
  },
  segment: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  segmentActive: { backgroundColor: C.white },
  segmentText: { color: C.mute, fontWeight: '600' },
  segmentTextActive: { color: C.leaf },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    minWidth: 160,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonBlock: {
    alignSelf: 'stretch',
    width: '100%',
  },
  buttonText: {
    color: C.white,
    fontWeight: '700',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  secondaryButton: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    minWidth: 160,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.leaf,
    marginTop: 8,
  },
  secondaryButtonText: {
    color: C.leaf,
    fontWeight: '700',
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  ctaStack: {
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
    gap: 10,
    marginTop: 4,
  },
  field: { marginBottom: 12 },
  fieldLabel: { color: C.ink, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: C.white,
    color: C.ink,
    fontSize: 16,
  },
  inputError: { borderColor: C.chili, borderWidth: 1.5 },
  fieldErrorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 },
  fieldErrorIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.chili,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  fieldErrorIconText: { color: C.white, fontSize: 11, fontWeight: '800' },
  fieldErrorText: { color: C.chili, flex: 1, fontSize: 13 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: 'flex-start' },
  badgeText: { fontWeight: '700', fontSize: 13 },
  circle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  circleText: { color: C.white, fontWeight: '800', fontSize: 15 },
  bigStat: { alignItems: 'center', paddingVertical: 14, flexGrow: 1, minWidth: 140 },
  bigStatValue: { fontSize: 34, fontWeight: '800', color: C.leaf },
  bigStatUnit: { fontSize: 16, fontWeight: '700', color: C.mute },
  bigStatLabel: { fontSize: 14, color: C.mute, marginTop: 4 },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
    gap: 12,
  },
  stateText: {
    color: C.mute,
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 8,
    lineHeight: 22,
  },
  errorText: {
    color: C.chili,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 4,
    paddingHorizontal: 8,
  },
  body: { padding: 16, paddingBottom: 40 },
});
