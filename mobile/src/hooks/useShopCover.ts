import { useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { confirmAlert } from '../lib/confirm';
import { resizeToBase64 } from '../lib/media';
import { pickImages } from '../lib/pickImages';
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

  const change = useCallback((): void => {
    void (async () => {
      // Opens the file picker directly on web, the camera/library chooser on native.
      const picked = await pickImages({
        labels: {
          title: t.shop.coverChange,
          takePhoto: t.sell.takePhoto,
          library: t.sell.photoLibrary,
          cancel: t.common.cancel,
        },
        allowsEditing: true,
        aspect: COVER_ASPECT,
        quality: 0.9,
      });
      if (picked.status === 'denied') {
        setError(t.profile.photoDenied);
        return;
      }
      const asset = picked.status === 'picked' ? picked.assets[0] : undefined;
      if (asset === undefined) return;
      await run(async () => {
        const prepared = await resizeToBase64(asset.uri, asset.width, asset.height, COVER_MAX_EDGE);
        await api.ensureMyShop();
        return api.uploadShopCover({ base64: prepared.base64, mime: prepared.mime });
      });
    })();
  }, [api, run, t]);

  const remove = useCallback((): void => {
    void confirmAlert({
      title: t.shop.coverRemove,
      message: t.shop.coverRemoveConfirm,
      confirmText: t.shop.coverRemove,
      cancelText: t.common.cancel,
      destructive: true,
      onConfirm: () => void run(() => api.updateMyShop({ cover: null })),
    });
  }, [api, run, t]);

  return { busy, error, change, remove };
}
