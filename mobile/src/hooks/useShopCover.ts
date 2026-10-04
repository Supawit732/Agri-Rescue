import { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { resizeToBase64 } from '../lib/media';
import type { Shop } from '../api/types';

/** Banner is ~3:1; 1200px wide stays well under the 1MB server limit at jpeg 0.82. */
const COVER_MAX_EDGE = 1200;
export const COVER_ASPECT: [number, number] = [3, 1];

/** Pick (camera/library, cropped to 3:1) + upload / remove the signed-in seller's shop cover. */
export function useShopCover(onChanged: (shop: Shop) => void): {
  busy: boolean;
  error: string | null;
  change: () => void;
  remove: () => void;
} {
  const { api } = useAuth();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (job: () => Promise<Shop | null>): Promise<void> => {
      setBusy(true);
      setError(null);
      try {
        const shop = await job();
        if (shop !== null) onChanged(shop);
      } catch {
        setError(t.shop.coverFailed);
      } finally {
        setBusy(false);
      }
    },
    [onChanged, t],
  );

  const uploadFrom = useCallback(
    (launcher: typeof ImagePicker.launchCameraAsync): Promise<void> =>
      run(async () => {
        const permission =
          launcher === ImagePicker.launchCameraAsync
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setError(t.profile.photoDenied);
          return null;
        }
        const picked = await launcher({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: COVER_ASPECT,
          quality: 0.9,
        });
        const asset = picked.canceled ? undefined : picked.assets[0];
        if (asset === undefined) return null;
        const prepared = await resizeToBase64(asset.uri, asset.width, asset.height, COVER_MAX_EDGE);
        await api.ensureMyShop();
        return api.uploadShopCover({ base64: prepared.base64, mime: prepared.mime });
      }),
    [api, run, t],
  );

  const change = useCallback((): void => {
    // react-native-web's Alert.alert is a no-op, so go straight to the file picker there.
    if (Platform.OS === 'web') {
      void uploadFrom(ImagePicker.launchImageLibraryAsync);
      return;
    }
    Alert.alert(t.shop.coverChange, undefined, [
      { text: t.sell.takePhoto, onPress: () => void uploadFrom(ImagePicker.launchCameraAsync) },
      { text: t.sell.photoLibrary, onPress: () => void uploadFrom(ImagePicker.launchImageLibraryAsync) },
      { text: t.common.cancel, style: 'cancel' },
    ]);
  }, [t, uploadFrom]);

  const remove = useCallback((): void => {
    if (Platform.OS === 'web') {
      void run(() => api.updateMyShop({ cover: null }));
      return;
    }
    Alert.alert(t.shop.coverRemoveConfirm, undefined, [
      {
        text: t.shop.coverRemove,
        style: 'destructive',
        onPress: () => void run(() => api.updateMyShop({ cover: null })),
      },
      { text: t.common.cancel, style: 'cancel' },
    ]);
  }, [api, run, t]);

  return { busy, error, change, remove };
}
