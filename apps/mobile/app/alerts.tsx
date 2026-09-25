import { Text } from "react-native";
import { ScreenLayout } from "../src/components/ScreenLayout";
import { strings } from "../src/i18n";
import { useAppStore } from "../src/store/useAppStore";
import { typography } from "../src/theme";

export default function AlertsScreen() {
  const t = strings(useAppStore((state) => state.language));
  return <ScreenLayout active="alerts"><Text style={typography.h1}>{t.alerts}</Text><Text style={typography.body}>{t.noAlerts}</Text></ScreenLayout>;
}
