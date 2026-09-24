import { useRouter } from 'expo-router';
import { EmptyState, Screen } from '../../src/components/ui';
import { useI18n } from '../../src/i18n';

export default function NotificationsTab(): React.ReactElement {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <Screen>
      <EmptyState
        message={t.notifications.empty}
        ctaLabel={t.notifications.goMarket}
        onCta={() => router.push('/(tabs)')}
      />
    </Screen>
  );
}
