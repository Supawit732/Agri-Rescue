import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '../theme';

export function Screen({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {children}
    </SafeAreaView>
  );
}

export function TopBar({
  title,
  onImpact,
  onLogout,
}: {
  title: string;
  onImpact?: () => void;
  onLogout?: () => void;
}): React.ReactElement {
  return (
    <View style={styles.topBar}>
      <Text style={styles.topTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.topActions}>
        {onImpact !== undefined ? (
          <Pressable accessibilityRole="button" onPress={onImpact} style={styles.topLink}>
            <Text style={styles.topLinkText}>ผลลัพธ์</Text>
          </Pressable>
        ) : null}
        {onLogout !== undefined ? (
          <Pressable accessibilityRole="button" onPress={onLogout} style={styles.topLink}>
            <Text style={styles.topLinkText}>ออกจากระบบ</Text>
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
      <Text style={[styles.chipText, selected ? { color: C.white } : null]}>{label}</Text>
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
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: 'leaf' | 'turmeric' | 'chili';
}): React.ReactElement {
  const bg = tone === 'turmeric' ? C.turmeric : tone === 'chili' ? C.chili : C.leaf;
  const isDisabled = disabled === true || loading === true;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={[styles.button, { backgroundColor: isDisabled ? C.disabled : bg }]}
    >
      {loading === true ? (
        <ActivityIndicator color={C.white} />
      ) : (
        <Text style={styles.buttonText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled === true}
      style={[styles.secondaryButton, disabled === true ? { opacity: 0.5 } : null]}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, ...rest }: { label: string } & TextInputProps): React.ReactElement {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={C.mute} {...rest} />
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
  if (loading && data === null) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={C.leaf} />
        <Text style={styles.stateText}>กำลังโหลด…</Text>
      </View>
    );
  }
  if (error !== null && data === null) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.errorText}>{error}</Text>
        <PrimaryButton label="ลองใหม่" onPress={onRetry} />
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
        <Text style={styles.stateText}>{emptyText ?? 'ยังไม่มีข้อมูล'}</Text>
        <SecondaryButton label="รีเฟรช" onPress={onRetry} />
      </View>
    );
  }
  return <>{children(data)}</>;
}

export function Body({ children }: { children: React.ReactNode }): React.ReactElement {
  return <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: C.leaf,
  },
  topTitle: { color: C.white, fontSize: 18, fontWeight: '700', flex: 1 },
  topActions: { flexDirection: 'row', gap: 8 },
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
  },
  chipText: { color: C.ink, fontWeight: '600', fontSize: 14 },
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
  button: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonText: { color: C.white, fontWeight: '700', fontSize: 16 },
  secondaryButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.leaf,
    marginTop: 8,
  },
  secondaryButtonText: { color: C.leaf, fontWeight: '700', fontSize: 15 },
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
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: 'flex-start' },
  badgeText: { fontWeight: '700', fontSize: 13 },
  circle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  circleText: { color: C.white, fontWeight: '800', fontSize: 15 },
  bigStat: { alignItems: 'center', paddingVertical: 14, flexGrow: 1, minWidth: 140 },
  bigStatValue: { fontSize: 34, fontWeight: '800', color: C.leaf },
  bigStatUnit: { fontSize: 16, fontWeight: '700', color: C.mute },
  bigStatLabel: { fontSize: 14, color: C.mute, marginTop: 4 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  stateText: { color: C.mute, fontSize: 15, textAlign: 'center' },
  errorText: { color: C.chili, fontSize: 15, textAlign: 'center', marginBottom: 4 },
  body: { padding: 16, paddingBottom: 40 },
});
