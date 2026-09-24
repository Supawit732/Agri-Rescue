import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LogoMark, initialsOf } from '../src/components/LogoMark';
import { Body, DataState, Screen, StackHeader } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { useApiData } from '../src/hooks/useApiData';
import { useI18n } from '../src/i18n';
import { C, fonts, radius } from '../src/theme';

export default function FollowedShopsScreen(): React.ReactElement {
  const { user, api } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  const fetchShops = useCallback(() => api.listFollowedShops(), [api]);
  const { data, loading, error, reload } = useApiData(fetchShops, [user?.id ?? null]);

  if (user === null) {
    return (
      <Screen>
        <StackHeader title={t.shop.followedTitle} onBack={() => router.replace('/(tabs)')} />
        <Body>
          <Text style={styles.muted}>{t.loginPrompt.login}</Text>
          <Pressable
            style={styles.loginBtn}
            onPress={() =>
              router.push({ pathname: '/login', params: { returnTo: '/followed-shops' } })
            }
          >
            <Text style={styles.loginText}>{t.common.login}</Text>
          </Pressable>
        </Body>
      </Screen>
    );
  }

  return (
    <Screen>
      <StackHeader title={t.shop.followedTitle} onBack={() => router.replace('/(tabs)')} />
      <Body>
        <DataState
          loading={loading}
          error={error}
          data={data}
          onRetry={reload}
          isEmpty={(list) => list.length === 0}
          emptyText={t.shop.followedEmpty}
        >
          {(list) => (
            <View style={styles.list}>
              {list.map((shop) => (
                <Pressable
                  key={shop.user_id}
                  style={styles.row}
                  onPress={() => router.push({ pathname: '/shops/[userId]', params: { userId: String(shop.user_id) } })}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initialsOf(shop.name)}</Text>
                  </View>
                  <View style={styles.text}>
                    <Text style={styles.name} numberOfLines={1}>
                      {shop.name}
                    </Text>
                    {shop.description !== null && shop.description !== '' ? (
                      <Text style={styles.desc} numberOfLines={1}>
                        {shop.description}
                      </Text>
                    ) : null}
                  </View>
                  <Feather name="chevron-right" size={18} color={C.mute} />
                </Pressable>
              ))}
            </View>
          )}
        </DataState>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: { color: C.mute, marginBottom: 12, fontFamily: fonts.body },
  loginBtn: {
    minHeight: 48,
    borderRadius: radius.button,
    backgroundColor: C.leaf,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  loginText: { color: C.white, fontWeight: '600', fontFamily: fonts.bodySemi },
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: radius.card,
    padding: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.leafSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.titleBold, fontWeight: '700', color: C.leafDeep },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 15, fontWeight: '600', color: C.ink, fontFamily: fonts.bodySemi },
  desc: { fontSize: 12, color: C.mute, fontFamily: fonts.body },
});
