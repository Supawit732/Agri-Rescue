import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { ApiError } from '../api/client';
import { resolveMapsLink, reverseGeocode } from '../api/geo';
import { isInThailandApprox, isShortGoogleMapsUrl, parseCoordsFromMapsUrl, type LatLng } from '../geo/mapsLink';
import { C } from '../theme';
import { Field, PrimaryButton, SecondaryButton } from './ui';

export type { LatLng };

function formatCoords(coords: LatLng): string {
  return `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
}

export function LocationPicker({
  value,
  onChange,
  label = 'ตำแหน่ง',
  error: externalError = null,
}: {
  value: LatLng | null;
  onChange: (coords: LatLng | null) => void;
  label?: string;
  /** Parent form validation error (shown with icon; not color-only). */
  error?: string | null;
}): React.ReactElement {
  const [mapsLink, setMapsLink] = useState('');
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [latText, setLatText] = useState('');
  const [lngText, setLngText] = useState('');
  const [busy, setBusy] = useState<'gps' | 'link' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);

  useEffect(() => {
    if (value === null) {
      setPlaceName(null);
      setLatText('');
      setLngText('');
      return;
    }
    setLatText(String(value.lat));
    setLngText(String(value.lng));
    let active = true;
    setLookupBusy(true);
    void (async () => {
      try {
        const result = await reverseGeocode(value.lat, value.lng);
        if (active) {
          setPlaceName(result.display_name);
        }
      } catch {
        if (active) {
          setPlaceName(null);
        }
      } finally {
        if (active) {
          setLookupBusy(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [value?.lat, value?.lng]);

  const applyCoords = (coords: LatLng): void => {
    setError(null);
    onChange({ lat: Number(coords.lat.toFixed(6)), lng: Number(coords.lng.toFixed(6)) });
  };

  const onUseCurrent = async (): Promise<void> => {
    setError(null);
    setBusy('gps');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setError('ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง กรุณาเปิดสิทธิ์ตำแหน่งในการตั้งค่าแล้วลองใหม่');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      applyCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
    } catch {
      setError(
        Platform.OS === 'web'
          ? 'หาตำแหน่งปัจจุบันไม่ได้ กรุณาอนุญาตตำแหน่งในเบราว์เซอร์ หรือวางลิงก์ Google Maps แทน'
          : 'หาตำแหน่งปัจจุบันไม่ได้ กรุณาลองใหม่ หรือวางลิงก์ Google Maps แทน',
      );
    } finally {
      setBusy(null);
    }
  };

  const onApplyLink = async (): Promise<void> => {
    setError(null);
    const trimmed = mapsLink.trim();
    if (trimmed.length === 0) {
      setError('กรุณาวางลิงก์ Google Maps');
      return;
    }

    const local = parseCoordsFromMapsUrl(trimmed);
    if (local !== null) {
      applyCoords(local);
      return;
    }

    if (!isShortGoogleMapsUrl(trimmed) && !trimmed.includes('google.') && !trimmed.includes('goo.gl')) {
      setError('ไม่พบพิกัดในลิงก์นี้ กรุณาใช้ลิงก์ Google Maps ที่แชร์ตำแหน่ง');
      return;
    }

    setBusy('link');
    try {
      const resolved = await resolveMapsLink(trimmed);
      applyCoords(resolved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ตามลิงก์ไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setBusy(null);
    }
  };

  const onManualApply = (): void => {
    const lat = Number(latText);
    const lng = Number(lngText);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setError('พิกัดไม่ถูกต้อง');
      return;
    }
    applyCoords({ lat, lng });
  };

  const outsideThailand = value !== null && !isInThailandApprox(value.lat, value.lng);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label} *</Text>
      <SecondaryButton
        label={busy === 'gps' ? 'กำลังหาตำแหน่ง…' : 'ใช้ตำแหน่งปัจจุบัน'}
        onPress={() => {
          void onUseCurrent();
        }}
        disabled={busy !== null}
      />

      <View style={styles.linkRow}>
        <View style={styles.linkField}>
          <Field
            label="หรือวางลิงก์ Google Maps"
            value={mapsLink}
            onChangeText={setMapsLink}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="https://maps.app.goo.gl/… หรือลิงก์เต็ม"
          />
        </View>
        <View style={styles.linkButton}>
          <PrimaryButton
            label={busy === 'link' ? '…' : 'ใช้ลิงก์'}
            onPress={() => {
              void onApplyLink();
            }}
            disabled={busy !== null}
            loading={busy === 'link'}
          />
        </View>
      </View>

      {value !== null ? (
        <View style={styles.placeBox}>
          <Text style={styles.placeText}>
            {lookupBusy
              ? 'กำลังค้นหาชื่อสถานที่…'
              : placeName !== null && placeName.length > 0
                ? placeName
                : formatCoords(value)}
          </Text>
          {placeName !== null && placeName.length > 0 ? (
            <Text style={styles.coordsHint}>{formatCoords(value)}</Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.requiredHint}>ยังไม่ได้เลือกตำแหน่ง — ต้องมีพิกัดก่อนดำเนินการต่อ</Text>
      )}

      {outsideThailand ? (
        <Text style={styles.warn}>พิกัดนี้อยู่นอกประเทศไทยคร่าว ๆ กรุณาตรวจสอบอีกครั้ง</Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => setManualOpen((open) => !open)}
        style={styles.manualToggle}
      >
        <Text style={styles.manualToggleText}>{manualOpen ? 'ซ่อนการแก้พิกัดเอง' : 'แก้พิกัดเอง'}</Text>
      </Pressable>

      {manualOpen ? (
        <View style={styles.manualRow}>
          <View style={styles.half}>
            <Field label="ละติจูด" value={latText} onChangeText={setLatText} keyboardType="numeric" />
          </View>
          <View style={styles.half}>
            <Field label="ลองจิจูด" value={lngText} onChangeText={setLngText} keyboardType="numeric" />
          </View>
          <PrimaryButton label="ใช้พิกัดนี้" onPress={onManualApply} />
        </View>
      ) : null}

      {error !== null ? (
        <View style={styles.errorRow}>
          <View style={styles.errorIcon}>
            <Text style={styles.errorIconText}>!</Text>
          </View>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}
      {externalError !== null && externalError !== '' ? (
        <View style={[styles.errorRow, error !== null ? { marginTop: 4 } : null]}>
          <View style={styles.errorIcon}>
            <Text style={styles.errorIconText}>!</Text>
          </View>
          <Text style={styles.error}>{externalError}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { color: C.mute, fontSize: 13, marginBottom: 6, fontWeight: '600' },
  linkRow: { marginTop: 4 },
  linkField: {},
  linkButton: { marginTop: 4 },
  placeBox: {
    marginTop: 8,
    padding: 12,
    backgroundColor: C.leafSoft,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
  },
  placeText: { color: C.ink, fontSize: 14, fontWeight: '600' },
  coordsHint: { color: C.mute, fontSize: 12, marginTop: 4 },
  requiredHint: { color: C.mute, fontSize: 13, marginTop: 8 },
  warn: { color: C.turmeric, marginTop: 8, fontSize: 13 },
  manualToggle: { marginTop: 10, alignSelf: 'flex-start' },
  manualToggleText: { color: C.leaf, fontWeight: '700', fontSize: 14 },
  manualRow: { marginTop: 4, gap: 0 },
  half: {},
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8 },
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
  error: { color: C.chili, flex: 1, fontSize: 13 },
});
