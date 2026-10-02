import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ScreenLayout } from "../../src/components/ScreenLayout";
import { Card, EmptyState, FilterChip, SectionHeader } from "../../src/components/ui";
import { listSaved, removeSavedItem } from "../../src/database";
import { strings } from "../../src/i18n";
import { useAppStore } from "../../src/store/useAppStore";
import type { SavedItem } from "../../src/types";
import { spacing } from "../../src/theme";
import type { Palette } from "../../src/theme";
import { useThemedStyles, useTheme } from "../../src/theme/theme-context";

type Filter = "all" | SavedItem["type"];

const ICONS: Record<SavedItem["type"], keyof typeof Ionicons.glyphMap> = {
  crop: "leaf-outline",
  district: "location-outline",
  question: "chatbubble-outline",
  indicator: "analytics-outline",
};

export default function SavedScreen() {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<SavedItem[]>(() => {
    try {
      return listSaved();
    } catch {
      return [];
    }
  });

  const reload = useCallback(() => {
    try {
      setItems(listSaved());
    } catch {
      setItems([]);
    }
  }, []);

  const filtered = filter === "all" ? items : items.filter((item) => item.type === filter);

  const open = (item: SavedItem) => {
    if (item.type === "crop") router.push(("/explore/crop/" + item.entity_key) as never);
    else if (item.type === "district") router.push(("/explore/district/" + item.entity_key) as never);
    else if (item.type === "indicator") router.push(("/explore/indicators?id=" + item.entity_key) as never);
  };

  return (
    <ScreenLayout back>
      <SectionHeader title={t.savedTitle} subtitle={t.savedSubtitle} />
      <View style={styles.chips}>
        {(["all", "crop", "district", "question", "indicator"] as const).map((value) => (
          <FilterChip
            key={value}
            label={
              value === "all"
                ? t.allCategories
                : value === "crop"
                  ? t.savedCrop
                  : value === "district"
                    ? t.savedDistrict
                    : value === "question"
                      ? t.savedQuestion
                      : t.savedIndicator
            }
            selected={filter === value}
            onPress={() => setFilter(value)}
          />
        ))}
      </View>

      {filtered.length ? (
        filtered.map((item) => (
          <Card
            key={item.id}
            accessibilityLabel={item.title}
            onPress={item.type === "question" ? undefined : () => open(item)}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
          >
            <View style={styles.icon}>
              <Ionicons name={ICONS[item.type]} size={19} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={typography.h3}>{item.title}</Text>
              {item.subtitle ? (
                <Text numberOfLines={2} style={typography.caption}>
                  {item.subtitle}
                </Text>
              ) : null}
              <Text style={typography.micro}>{item.created_at?.slice(0, 10)}</Text>
            </View>
            <Ionicons
              name="trash-outline"
              size={18}
              color={colors.danger}
              onPress={() => {
                try {
                  removeSavedItem(item.type, item.entity_key);
                } catch {
                  // storage unavailable
                }
                reload();
              }}
            />
          </Card>
        ))
      ) : (
        <EmptyState title={t.savedEmpty} message={t.exploreSubtitle} icon="bookmark-outline" />
      )}
    </ScreenLayout>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
  },
});
