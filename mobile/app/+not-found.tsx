import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';

import { Text, View } from 'react-native';
import { PrimaryButton, Screen } from '../src/components/ui';
import { useI18n } from '../src/i18n';
import { C, fonts } from '../src/theme';

export default function NotFoundScreen() {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.title}>{t.empty.notFoundTitle}</Text>
        <Text style={styles.body}>{t.empty.notFoundBody}</Text>
        <PrimaryButton
          label={t.empty.goHome}
          block
          onPress={() => router.replace('/(tabs)')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: C.ink,
    fontFamily: fonts.titleBold,
  },
  body: {
    fontSize: 15,
    color: C.mute,
    fontFamily: fonts.body,
    marginBottom: 8,
    textAlign: 'center',
  },
});
