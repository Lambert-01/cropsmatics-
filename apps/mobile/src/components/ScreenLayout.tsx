import type { ReactElement, ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { spacing } from "../theme";
import { useTheme } from "../theme/theme-context";
import { AppHeader } from "./AppHeader";
import { BottomNav } from "./BottomNav";

/**
 * Shared screen chrome: safe area, compact header, optional bottom navigation,
 * optional pull-to-refresh and an optional floating action.
 */
export function ScreenLayout({
  children,
  active,
  back = false,
  scroll = true,
  showInfo = true,
  context,
  refreshControl,
  fab,
}: {
  children: ReactNode;
  /** When set, renders the bottom navigation with this tab highlighted. */
  active?: string;
  back?: boolean;
  scroll?: boolean;
  showInfo?: boolean;
  /** One-line data-context summary under the header, e.g. "2025 Season B • National". */
  context?: string | null;
  /** A `RefreshControl`, so analytics screens can pull to refresh. */
  refreshControl?: ReactElement;
  /** Floating action rendered above the bottom navigation. */
  fab?: ReactNode;
}) {
  const { colors } = useTheme();
  const body = scroll ? (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: spacing.md }}>{children}</View>
  );

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }}>
      <AppHeader back={back} showInfo={showInfo} context={context} />
      {body}
      {active ? <BottomNav active={active} /> : null}
      {fab}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
});
