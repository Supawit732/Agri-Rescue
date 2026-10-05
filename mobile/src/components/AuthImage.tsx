import { useEffect, useState } from 'react';
import { Image, Platform, type ImageStyle, type StyleProp } from 'react-native';

export interface AuthImageSource {
  uri: string;
  headers: Record<string, string>;
}

/**
 * Image behind a bearer-token endpoint. react-native-web's <Image> ignores `source.headers`
 * (it would render a bare <img> and get a 401), so on web the file is fetched and shown via a
 * blob URL; native passes the headers straight through.
 */
export function AuthImage({
  source,
  style,
  resizeMode,
}: {
  source: AuthImageSource;
  style: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain';
}): React.ReactElement | null {
  const [blobUri, setBlobUri] = useState<string | null>(null);
  const { uri, headers } = source;
  const auth = headers.Authorization;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setBlobUri(null);
    fetch(uri, { headers: auth !== undefined ? { Authorization: auth } : {} })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) URL.revokeObjectURL(objectUrl);
        else setBlobUri(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [uri, auth]);

  if (Platform.OS === 'web') {
    return blobUri === null ? (
      <Image source={{ uri: '' }} style={style} />
    ) : (
      <Image source={{ uri: blobUri }} style={style} resizeMode={resizeMode} />
    );
  }
  return <Image source={{ uri, headers }} style={style} resizeMode={resizeMode} />;
}
