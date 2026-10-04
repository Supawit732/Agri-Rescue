import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { OrgApplicationsPanel } from '../../src/admin/OldAdminPanels';
import { StackHeader } from '../../src/components/ui';
import { useI18n } from '../../src/i18n';
import { C } from '../../src/theme';

/** Org application review (hidden tab route) — reached from the admin inbox. */
export default function AdminOrgsScreen(): React.ReactElement {
  const { t } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<{ user?: string }>();
  const parsed = params.user !== undefined ? Number(params.user) : NaN;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StackHeader title={t.admin.queueOrg} onBack={() => router.navigate('/admin/inbox' as never)} />
      <OrgApplicationsPanel userId={Number.isFinite(parsed) ? parsed : undefined} />
    </View>
  );
}
