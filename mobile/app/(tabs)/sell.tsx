import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../src/api/client';
import { LoginPrompt, PrimaryButton, CtaStack, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useI18n } from '../../src/i18n';
import { C } from '../../src/theme';
import SellScreen from '../../src/screens/SellScreen';

export default function SellTab(): React.ReactElement {
  const { user, api, refreshUser } = useAuth();
  const { t, translateError } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user === null) {
    return (
      <Screen>
        <LoginPrompt
          title={t.sell.loginTitle}
          message={t.sell.loginMessage}
          returnTo="/(tabs)/sell"
        />
      </Screen>
    );
  }

  if (!user.can_sell) {
    const enableSell = async (): Promise<void> => {
      setBusy(true);
      setError(null);
      try {
        await api.updateProfile({ can_sell: true });
        await refreshUser();
      } catch (err) {
        setError(
          err instanceof ApiError
            ? translateError(err.code, err.message)
            : t.account.updateFailed,
        );
      } finally {
        setBusy(false);
      }
    };
    return (
      <Screen>
        <View style={styles.box}>
          <Text style={styles.title}>{t.account.enableSell}</Text>
          <Text style={styles.body}>{t.sell.enableHint}</Text>
          {error !== null ? <Text style={styles.error}>{error}</Text> : null}
          <CtaStack>
            <PrimaryButton
              label={t.account.enableSell}
              block
              onPress={() => void enableSell()}
              loading={busy}
            />
          </CtaStack>
        </View>
      </Screen>
    );
  }

  return <SellScreen />;
}

const styles = StyleSheet.create({
  box: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 24, gap: 12 },
  title: { fontSize: 22, fontWeight: '800', color: C.ink, textAlign: 'center', paddingHorizontal: 8 },
  body: {
    fontSize: 15,
    color: C.mute,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  error: { color: C.chili, textAlign: 'center', paddingHorizontal: 8 },
});
