import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

/** Types the server accepts for photos; everything else (gif, heic, …) is dropped at pick time. */
const ACCEPTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface PickImagesLabels {
  /** Native chooser title. */
  title: string;
  takePhoto: string;
  library: string;
  cancel: string;
}

export interface PickImagesOptions {
  labels: PickImagesLabels;
  /** `library` skips the camera/library chooser on native. Default `both`. */
  sources?: 'both' | 'library';
  /** Max images this pick may return (multi-select when > 1). Default 1. */
  limit?: number;
  allowsEditing?: boolean;
  aspect?: [number, number];
  quality?: number;
  base64?: boolean;
}

export type PickImagesResult =
  | { status: 'picked'; assets: ImagePicker.ImagePickerAsset[]; rejected: number }
  | { status: 'canceled' }
  | { status: 'denied'; source: 'camera' | 'library' };

async function launch(
  source: 'camera' | 'library',
  options: PickImagesOptions,
): Promise<PickImagesResult> {
  const limit = Math.max(1, options.limit ?? 1);
  // Web has no permission prompt; asking first would also consume the click's user activation
  // and the browser would block the file dialog.
  if (Platform.OS !== 'web') {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return { status: 'denied', source };
  }
  const common = {
    mediaTypes: ['images'] as ImagePicker.MediaType[],
    quality: options.quality ?? 0.9,
    ...(options.allowsEditing === true ? { allowsEditing: true } : {}),
    ...(options.aspect !== undefined ? { aspect: options.aspect } : {}),
    ...(options.base64 === true ? { base64: true } : {}),
  };
  const picked =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(common)
      : await ImagePicker.launchImageLibraryAsync({
          ...common,
          // Multi-select can't be combined with cropping.
          ...(limit > 1 && options.allowsEditing !== true
            ? { allowsMultipleSelection: true, selectionLimit: limit }
            : {}),
        });
  if (picked.canceled || picked.assets.length === 0) return { status: 'canceled' };
  // Browsers ignore selectionLimit, so enforce it here.
  const withinLimit = picked.assets.slice(0, limit);
  const assets = withinLimit.filter((a) => a.mimeType == null || ACCEPTED_MIME.has(a.mimeType));
  if (assets.length === 0) return { status: 'picked', assets: [], rejected: withinLimit.length };
  return { status: 'picked', assets, rejected: withinLimit.length - assets.length };
}

/**
 * Shared image picker. On web it opens the browser file picker directly (react-native-web's
 * Alert.alert is a no-op, so a camera/library menu would never appear). On native it shows the
 * camera / library chooser first.
 */
export function pickImages(options: PickImagesOptions): Promise<PickImagesResult> {
  if (Platform.OS === 'web' || options.sources === 'library') {
    return launch('library', options);
  }
  return new Promise((resolve) => {
    const { labels } = options;
    const done = (source: 'camera' | 'library'): void => {
      launch(source, options).then(resolve, () => resolve({ status: 'canceled' }));
    };
    Alert.alert(
      labels.title,
      undefined,
      [
        { text: labels.takePhoto, onPress: () => done('camera') },
        { text: labels.library, onPress: () => done('library') },
        { text: labels.cancel, style: 'cancel', onPress: () => resolve({ status: 'canceled' }) },
      ],
      { cancelable: true, onDismiss: () => resolve({ status: 'canceled' }) },
    );
  });
}
