import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "../src/components/AppHeader";
import { BottomNav } from "../src/components/BottomNav";
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  ListRow,
  LoadingSkeleton,
  PrimaryButton,
  SearchBar,
  SectionHeader,
  SecondaryButton,
  SourceCard,
  StatCard,
} from "../src/components/ui";
import { strings } from "../src/i18n";
import { homeApi } from "../src/services/api";
import { useAppStore } from "../src/store/useAppStore";
import { colors, radius, spacing, typography } from "../src/theme";

const EXPLORE_TILES = [
  { id: "crops", label: "crops", href: "/explore/crops", icon: "leaf-outline", desc: "Browse every crop" },
  { id: "districts", label: "districts", href: "/explore/districts", icon: "location-outline", desc: "All 30 districts" },
  { id: "indicators", label: "indicators", href: "/explore/indicators", icon: "analytics-outline", desc: "Inputs, irrigation, soil" },
  { id: "maps", label: "maps", href: "/maps", icon: "map-outline", desc: "District patterns" },
  { id: "postHarvest", label: "postHarvest", href: "/explore/post-harvest", icon: "cube-outline", desc: "From harvest to use" },
  { id: "compare", label: "compare", href: "/explore/compare", icon: "git-compare-outline", desc: "Side by side" },
  { id: "ask", label: "ask", href: "/ask", icon: "chatbubble-ellipses-outline", desc: "Ask a question" },
  { id: "sources", label: "dataSources", href: "/more/data-sources", icon: "shield-checkmark-outline", desc: "Trusted sources" },
] as const;

export default function HomeScreen() {
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["mobile-home"],
    queryFn: homeApi.get,
  });

  const cards = data?.summary_cards ?? [];

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }}>
      <AppHeader />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero */}
        <ImageBackground
          source={require("../assets/images/rwanda-farm-hero-mobile.jpg")}
          resizeMode="cover"
          style={styles.hero}
          imageStyle={{ borderRadius: radius.lg }}
        >
          <View style={styles.heroOverlay}>
            <Text style={styles.heroTitle}>{t.heroTitle}</Text>
            <Text style={styles.heroSubtitle}>{t.heroSubtitle}</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton label={t.exploreData} icon="compass-outline" onPress={() => router.push("/explore")} />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton label={t.askCropmatics} icon="chatbubble-ellipses-outline" onPress={() => router.push("/ask")} />
              </View>
            </View>
          </View>
        </ImageBackground>

        {/* Global search */}
        <SearchBar placeholder={t.searchPlaceholder} onFocus={() => router.push("/explore/search")} />

        {isError ? (
          <ErrorState message={t.errorGeneric} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <>
            <LoadingSkeleton height={64} />
            <LoadingSkeleton height={120} />
            <LoadingSkeleton height={160} />
          </>
        ) : (
          <>
            {/* Data coverage */}
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Ionicons name="calendar-outline" size={17} color={colors.primary} />
                <Text style={{ ...typography.h3, flex: 1 }}>{t.latestData}</Text>
                <Badge text="Official data" />
              </View>
              <Text style={{ ...typography.h2, fontSize: 20 }}>
                {data?.latest_period_label ?? t.noDataAvailable}
              </Text>
              <Text style={typography.caption}>
                {data?.latest_period_coverage === "district"
                  ? "District-level agricultural data"
                  : data?.latest_period_coverage
                    ? `${data.latest_period_coverage} level`
                    : "—"}
              </Text>
              <SecondaryButton label="View coverage" onPress={() => router.push("/more/data-sources")} />
            </Card>

            {/* Summary metrics */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {cards.map((card) => (
                <StatCard
                  key={card.id}
                  label={card.label}
                  value={String(card.value)}
                  unit={card.unit}
                  icon={
                    card.id === "crops"
                      ? "leaf-outline"
                      : card.id === "districts"
                        ? "location-outline"
                        : card.id === "indicators"
                          ? "analytics-outline"
                          : "shield-checkmark-outline"
                  }
                  onPress={() => (card.route ? router.push(card.route as never) : undefined)}
                />
              ))}
            </View>

            {/* Explore grid */}
            <SectionHeader title={t.exploreTitle} subtitle={t.exploreSubtitle} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {EXPLORE_TILES.map((tile) => (
                <Pressable
                  key={tile.id}
                  accessibilityRole="button"
                  accessibilityLabel={t[tile.label as keyof typeof t]}
                  onPress={() => router.push(tile.href as never)}
                  style={styles.tile}
                >
                  <View style={styles.tileIcon}>
                    <Ionicons name={tile.icon} size={20} color={colors.primary} />
                  </View>
                  <Text style={{ ...typography.h3, fontSize: 14 }}>{t[tile.label as keyof typeof t]}</Text>
                  <Text numberOfLines={2} style={styles.tileDesc}>
                    {tile.desc}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Featured insights */}
            <SectionHeader title="Featured insights" subtitle="Derived from real published observations" />
            {data?.featured_topics?.length ? (
              data.featured_topics.map((topic) => (
                <Card key={topic.id} onPress={() => router.push(topic.route as never)} accessibilityLabel={topic.title}>
                  <Text style={typography.h3}>{topic.title}</Text>
                  <Text style={typography.body}>{topic.summary}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                    <Badge text={topic.source_id ?? "Verified source"} tone="slate" />
                    {topic.period ? <Text style={typography.micro}>{topic.period}</Text> : null}
                    <Ionicons name="arrow-forward" size={15} color={colors.primary} style={{ marginLeft: "auto" }} />
                  </View>
                </Card>
              ))
            ) : (
              <EmptyState title={t.noDataAvailable} />
            )}

            {/* Popular questions */}
            <SectionHeader title={t.popularQuestions} />
            {data?.suggested_questions?.length ? (
              <Card style={{ paddingVertical: 0 }}>
                {data.suggested_questions.map((question) => (
                  <ListRow
                    key={question}
                    title={question}
                    icon="chatbubble-outline"
                    onPress={() => router.push({ pathname: "/ask", params: { q: question } })}
                  />
                ))}
              </Card>
            ) : (
              <EmptyState title={t.askNoHistory} />
            )}

            <SourceCard
              sourceLabel={data?.provenance?.method ?? undefined}
              period={data?.latest_period_label ?? undefined}
              coverage={data?.latest_period_coverage ?? undefined}
              limitations={data?.provenance?.limitations}
            />
          </>
        )}
      </ScrollView>
      <BottomNav active="home" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  hero: { height: 260, justifyContent: "flex-end" },
  heroOverlay: {
    backgroundColor: "rgba(3,45,35,0.62)",
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    padding: spacing.md,
    gap: 4,
  },
  heroTitle: { color: colors.white, fontSize: 24, fontWeight: "700" },
  heroSubtitle: { color: colors.mintLight, fontSize: 13 },
  tile: {
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 104,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 5,
  },
  tileIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  tileDesc: { ...typography.micro, color: colors.slate500 },
});
