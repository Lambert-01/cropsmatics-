import type { ReactNode } from "react";
import { SafeAreaView, ScrollView } from "react-native";

import { colors, spacing } from "../theme";
import { AppHeader } from "./AppHeader";
import { BottomNav } from "./BottomNav";

export function ScreenLayout({ children, active = "home", back = false }: {
  children: ReactNode;
  active?: string;
  back?: boolean;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <AppHeader back={back} />
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: spacing.lg }}>
        {children}
      </ScrollView>
      <BottomNav active={active} />
    </SafeAreaView>
  );
}
