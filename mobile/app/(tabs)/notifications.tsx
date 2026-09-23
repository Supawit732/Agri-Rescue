import { useRouter } from 'expo-router';
import { EmptyState, Screen } from '../../src/components/ui';

export default function NotificationsTab(): React.ReactElement {
  const router = useRouter();
  return (
    <Screen>
      <EmptyState
        message="ยังไม่มีการแจ้งเตือน — ระบบแจ้งเตือนจะพร้อมในขั้นถัดไป"
        ctaLabel="ไปตลาด"
        onCta={() => router.push('/(tabs)')}
      />
    </Screen>
  );
}
