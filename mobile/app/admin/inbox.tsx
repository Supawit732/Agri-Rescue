import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { AdminInboxItem } from "../../src/api/types";
import { DataState, SectionTitle } from "../../src/components/ui";
import { useAuth } from "../../src/context/AuthContext";
import { useApiData } from "../../src/hooks/useApiData";
import { useI18n } from "../../src/i18n";
import { C, fonts } from "../../src/theme";

type QueueKey = "org" | "support" | "weight" | "otp" | "proof";

export default function AdminInboxScreen(): React.ReactElement {
  const { api } = useAuth();
  const { t, formatDateTime } = useI18n();
  const router = useRouter();
  const [queue, setQueue] = useState<QueueKey | null>(null);
  const { data, loading, error, reload } = useApiData(
    () => api.getAdminInbox(),
    [api],
  );

  /** Route for an inbox item, or null when no target screen exists (item is not pressable). */
  const targetOf = (item: AdminInboxItem): string | null => {
    switch (item.kind) {
      case "org":
        return `/admin/orgs?user=${String(item.id)}`;
      case "support":
        return `/support/${String(item.id)}`;
      case "weight":
      case "otp":
        return "/admin/system";
      default:
        return null;
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <SectionTitle>{t.admin.tabInbox}</SectionTitle>
      <Pressable
        accessibilityRole="link"
        style={styles.card}
        onPress={() => router.push("/admin/org-list" as never)}
      >
        <Feather name="list" size={16} color={C.leaf} />
        <Text style={[styles.cardTitle, styles.cardText]} numberOfLines={2}>
          {t.admin.orgListLink}
        </Text>
        <Feather name="chevron-right" size={16} color={C.mute} />
      </Pressable>
      <DataState loading={loading} error={error} data={data} onRetry={reload}>
        {(payload) => {
          const filtered = payload.items.filter(
            (item) => queue === null || item.kind === queue,
          );
          const chips: Array<{
            key: QueueKey | null;
            label: string;
            count: number;
          }> = [
            {
              key: null,
              label: t.admin.statusAll,
              count: payload.items.length,
            },
            { key: "org", label: t.admin.queueOrg, count: payload.counts.org },
            {
              key: "support",
              label: t.admin.queueSupport,
              count: payload.counts.support,
            },
            {
              key: "weight",
              label: t.admin.queueWeight,
              count: payload.counts.weight,
            },
            { key: "otp", label: t.admin.queueOtp, count: payload.counts.otp },
            {
              key: "proof",
              label: t.admin.queueProof,
              count: payload.counts.proof,
            },
          ];
          return (
            <>
              <View style={styles.filters}>
                {chips.map((item) => {
                  const selected = queue === item.key;
                  return (
                    <Pressable
                      key={String(item.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={[styles.chip, selected ? styles.chipOn : null]}
                      onPress={() => setQueue(item.key)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selected ? styles.chipTextOn : null,
                        ]}
                      >
                        {item.label}
                        {item.count > 0 ? ` ${String(item.count)}` : ""}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.list}>
                {filtered.map((item) => {
                  const target = targetOf(item);
                  return (
                    <Pressable
                      key={`${item.kind}-${item.id}`}
                      style={styles.card}
                      disabled={target === null}
                      accessibilityRole={target === null ? undefined : "link"}
                      onPress={() => {
                        if (target !== null) router.push(target as never);
                      }}
                    >
                      <View
                        style={[
                          styles.dot,
                          {
                            backgroundColor:
                              item.kind === "support" || item.kind === "org"
                                ? C.leaf
                                : item.kind === "weight" || item.kind === "otp"
                                  ? C.urgentFg
                                  : C.soonAccent,
                          },
                        ]}
                      />
                      <View style={styles.cardText}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={styles.cardMeta} numberOfLines={1}>
                          {item.subtitle != null ? `${item.subtitle} · ` : ""}
                          {formatDateTime(item.updated_at)}
                        </Text>
                      </View>
                      {target !== null ? (
                        <Feather
                          name="chevron-right"
                          size={16}
                          color={C.mute}
                        />
                      ) : null}
                    </Pressable>
                  );
                })}
                {filtered.length === 0 ? (
                  <Text style={styles.muted}>{t.admin.inboxEmpty}</Text>
                ) : null}
              </View>
            </>
          );
        }}
      </DataState>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 32, gap: 10 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: C.leafDeep, borderColor: C.leafDeep },
  chipText: { fontSize: 13, color: C.ink, fontFamily: fonts.body },
  chipTextOn: { color: C.white, fontWeight: "600" },
  list: { gap: 8 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    padding: 14,
  },
  dot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  cardText: { flex: 1, gap: 3, minWidth: 0 },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: C.ink,
    fontFamily: fonts.bodySemi,
  },
  cardMeta: { fontSize: 12, color: C.mute, fontFamily: fonts.body },
  muted: { color: C.mute, fontFamily: fonts.body },
});
