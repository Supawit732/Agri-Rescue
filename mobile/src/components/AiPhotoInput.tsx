import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { SecondaryButton } from './ui';
import { C } from '../theme';

const MAX_BYTES_BEFORE_RESIZE = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
}

function validateFile(file: File): string | null {
  if (!ALLOWED_MIME.has(file.type)) {
    return 'รองรับเฉพาะไฟล์ JPEG, PNG หรือ WebP';
  }
  if (file.size > MAX_BYTES_BEFORE_RESIZE) {
    return 'ไฟล์ใหญ่เกิน 10MB';
  }
  return null;
}

async function fileToPickedImage(file: File): Promise<PickedImage> {
  const uri = URL.createObjectURL(file);
  const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('อ่านรูปไม่สำเร็จ'));
    image.src = uri;
  });
  return { uri, width: size.width, height: size.height };
}

export function AiPhotoInput({
  previewUri,
  assessing,
  disabled,
  onPickNative,
  onImageReady,
  onChangePress,
  onClear,
  onInvalid,
}: {
  previewUri: string | null;
  assessing: boolean;
  disabled: boolean;
  onPickNative: () => void;
  onImageReady: (image: PickedImage) => void;
  onChangePress: () => void;
  onClear: () => void;
  onInvalid: (message: string) => void;
}): React.ReactElement {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const acceptFile = useCallback(
    async (file: File | null | undefined): Promise<void> => {
      if (file == null) {
        return;
      }
      const invalid = validateFile(file);
      if (invalid !== null) {
        onInvalid(invalid);
        return;
      }
      try {
        const picked = await fileToPickedImage(file);
        onImageReady(picked);
      } catch {
        onInvalid('อ่านรูปไม่สำเร็จ');
      }
    },
    [onImageReady, onInvalid],
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || disabled || assessing) {
      return;
    }
    const onPaste = (event: ClipboardEvent): void => {
      const items = event.clipboardData?.items;
      if (items === undefined) {
        return;
      }
      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          event.preventDefault();
          void acceptFile(item.getAsFile());
          break;
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [acceptFile, assessing, disabled]);

  const openFileDialog = (): void => {
    inputRef.current?.click();
  };

  const fileInput =
    Platform.OS === 'web' ? (
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          void acceptFile(file);
          event.target.value = '';
        }}
      />
    ) : null;

  if (previewUri !== null) {
    return (
      <View style={styles.previewBlock}>
        <Image source={{ uri: previewUri }} style={styles.photoPreview} accessibilityLabel="รูปผลผลิต" />
        <View style={styles.previewActions}>
          <View style={styles.actionSlot}>
            <SecondaryButton
              label="เปลี่ยนรูป"
              onPress={() => {
                if (Platform.OS === 'web') {
                  openFileDialog();
                } else {
                  onChangePress();
                }
              }}
              disabled={disabled || assessing}
            />
          </View>
          <View style={styles.actionSlot}>
            <SecondaryButton label="ลบรูป" onPress={onClear} disabled={disabled || assessing} />
          </View>
        </View>
        {fileInput}
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webWrap}>
        <div
          onDragEnter={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!disabled && !assessing) {
              setDragging(true);
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!disabled && !assessing) {
              setDragging(true);
            }
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragging(false);
            if (disabled || assessing) {
              return;
            }
            void acceptFile(event.dataTransfer.files?.[0]);
          }}
          onClick={() => {
            if (!disabled && !assessing) {
              openFileDialog();
            }
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openFileDialog();
            }
          }}
          style={{
            borderWidth: 2,
            borderStyle: dragging ? 'dashed' : 'solid',
            borderColor: dragging ? C.leaf : C.line,
            backgroundColor: dragging ? C.leafSoft : C.white,
            borderRadius: 12,
            paddingTop: 28,
            paddingBottom: 28,
            paddingLeft: 16,
            paddingRight: 16,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: disabled || assessing ? 'not-allowed' : 'pointer',
            opacity: disabled || assessing ? 0.6 : 1,
            textAlign: 'center',
          }}
        >
          <Text style={styles.dropTitle}>
            {assessing ? 'กำลังประเมินจากภาพ…' : 'ลากรูปมาวาง หรือคลิกเพื่อเลือกรูป'}
          </Text>
          <Text style={styles.dropHint}>JPEG / PNG / WebP ไม่เกิน 10MB · วางด้วย Cmd/Ctrl+V ได้</Text>
        </div>
        {fileInput}
      </View>
    );
  }

  return (
    <View style={styles.nativeWrap}>
      <SecondaryButton
        label={assessing ? 'กำลังประเมินจากภาพ…' : 'ถ่ายรูปให้ AI ประเมิน'}
        onPress={onPickNative}
        disabled={disabled || assessing}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  webWrap: { marginBottom: 8 },
  nativeWrap: { marginBottom: 8 },
  dropTitle: { color: C.ink, fontWeight: '700', fontSize: 15, marginBottom: 6 },
  dropHint: { color: C.mute, fontSize: 13 },
  previewBlock: { marginBottom: 8 },
  photoPreview: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: C.line,
  },
  previewActions: { flexDirection: 'row', gap: 8 },
  actionSlot: { flex: 1 },
});
