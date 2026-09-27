import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, spacing } from "../theme";
import { AppHeader } from "./AppHeader";
import { BottomNav } from "./BottomNav";

export function ScreenLayout({
  children,
  active,
  back = false,
  scroll = true,
  showInfo = true,
}: {
  children: ReactNode;
  /** When set, renders the bottom navigation with this tab highlighted. */
  active?: string;
  back?: boolean;
  scroll?: boolean;
  showInfo?: boolean;
}) {
  const body = scroll ? (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: spacing.md }}>{children}</View>
  );

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }}>
      <AppHeader back={back} showInfo={showInfo} />
      {body}
      {active ? <BottomNav active={active} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
});
