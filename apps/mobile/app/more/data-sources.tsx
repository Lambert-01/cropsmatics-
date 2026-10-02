import { useQuery } from "@tanstack/react-query";
import { Linking, StyleSheet, Text, View } from "react-native";

import { ScreenLayout } from "../../src/components/ScreenLayout";
import { Badge, Card, ErrorState, LoadingSkeleton, SectionHeader } from "../../src/components/ui";
import { strings } from "../../src/i18n";
import { sourcesApi } from "../../src/services/api";
import { useAppStore } from "../../src/store/useAppStore";
import { colors, spacing, typography } from "../../src/theme";

export default function DataSourcesScreen() {
  const t = strings(useAppStore((s) => s.language));
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["sources"], queryFn: sourcesApi.list });

  return (
    <ScreenLayout back>
      <SectionHeader title={t.dataSourcesTitle} subtitle={t.dataSourcesSubtitle} />
      {isError ? (
        <ErrorState message={t.errorGeneric} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <>
          <LoadingSkeleton height={110} />
          <LoadingSkeleton height={110} />
        </>
      ) : (
        (data?.sources ?? []).map((source) => (
          <Card key={source.source_id} style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Text style={{ ...typography.h3, flex: 1 }}>{source.name}</Text>
              <Badge text={source.period ?? "—"} tone="slate" />
            </View>
            {source.description ? <Text style={typography.body}>{source.description}</Text> : null}
            <Text style={typography.micro}>
              {[source.coverage, source.source_id].filter(Boolean).join(" · ")}
            </Text>
            {source.limitations?.length ? (
              <Text style={typography.micro}>
                {t.dataSourcesLimitationsLabel}: {source.limitations.join("; ")}
              </Text>
            ) : null}
            {source.url ? (
              <Text
                accessibilityRole="link"
                accessibilityLabel={t.dataSourcesOpenSource.replace("{name}", source.name)}
                style={styles.link}
                onPress={() => void Linking.openURL(source.url as string)}
              >
                {t.viewSource}
              </Text>
            ) : null}
          </Card>
        ))
      )}
      <Card style={{ backgroundColor: colors.mintSoft }}>
        <Text style={typography.h3}>{t.dataSourcesHowWeUseTitle}</Text>
        <Text style={typography.caption}>{t.dataSourcesHowWeUseBody}</Text>
      </Card>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  link: { color: colors.primaryStrong, fontWeight: "600", fontSize: 13 },
});
