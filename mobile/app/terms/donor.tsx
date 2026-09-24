import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Body, PrimaryButton, Screen, StackHeader } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useI18n } from '../../src/i18n';
import { C } from '../../src/theme';

export default function DonorTermsScreen(): React.ReactElement {
  const { user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  return (
    <Screen>
      <StackHeader
        title={t.termsDonor.headerTitle}
        onBack={() => router.replace(user !== null ? '/(tabs)/account' : '/(tabs)')}
      />
      <Body>
        {user === null ? <Text style={styles.brand}>Agri Rescue</Text> : null}
        <Text style={styles.title}>{t.termsDonor.title}</Text>
        <Text style={styles.meta}>{t.termsDonor.version}</Text>
        <Text style={styles.draftNote}>{t.termsDonor.draftNote}</Text>

        <Text style={styles.h2}>{t.termsDonor.h1}</Text>
        <Text style={styles.p}>{t.termsDonor.p1}</Text>

        <Text style={styles.h2}>{t.termsDonor.h2}</Text>
        <Text style={styles.p}>{t.termsDonor.p2}</Text>

        <Text style={styles.h2}>{t.termsDonor.h3}</Text>
        <Text style={styles.p}>{t.termsDonor.p3}</Text>

        <Text style={styles.h2}>{t.termsDonor.h4}</Text>
        <Text style={styles.p}>{t.termsDonor.p4}</Text>

        <Text style={styles.h2}>{t.termsDonor.h5}</Text>
        <Text style={styles.p}>{t.termsDonor.p5}</Text>

        <Text style={styles.h2}>{t.termsDonor.h6}</Text>
        <Text style={styles.p}>{t.termsDonor.p6}</Text>

        <Text style={styles.h2}>{t.termsDonor.h7}</Text>
        <Text style={styles.p}>{t.termsDonor.p7}</Text>

        <Text style={styles.h2}>{t.termsDonor.h8}</Text>
        <Text style={styles.p}>{t.termsDonor.p8}</Text>

        <View style={styles.footer}>
          {user !== null ? (
            <PrimaryButton label={t.termsDonor.back} onPress={() => router.back()} />
          ) : (
            <PrimaryButton label={t.termsDonor.backToRegister} onPress={() => router.replace('/register')} />
          )}
        </View>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { fontSize: 22, fontWeight: '800', color: C.leaf, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', color: C.ink, marginBottom: 4 },
  meta: { color: C.mute, marginBottom: 8 },
  draftNote: {
    color: C.turmeric,
    backgroundColor: C.turmericSoft,
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
    lineHeight: 20,
    fontWeight: '600',
  },
  h2: { fontSize: 16, fontWeight: '700', color: C.leaf, marginTop: 14, marginBottom: 6 },
  p: { color: C.ink, lineHeight: 22, marginBottom: 4 },
  footer: { marginTop: 24, marginBottom: 40 },
});
