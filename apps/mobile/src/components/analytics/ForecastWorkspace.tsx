import { useNetworkState } from "expo-network";
import { useState } from "react";
import { View } from "react-native";

import { useAllCrops, useAllDistricts, useForecastStatus } from "../../hooks/queries";
import { strings } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";
import { spacing } from "../../theme";
import type { ForecastScope } from "../../types";
import { MetricSelector } from "../data-view";
import { SingleSelectSheet } from "../terminal/SingleSelectSheet";
import { ErrorState, SecondaryButton } from "../ui";
import { PredictionsSection } from "./PredictionsSection";

export function ForecastWorkspace() {
  const t = strings(useAppStore((s) => s.language));
  const [scope, setScope] = useState<ForecastScope>({});
  const [picker, setPicker] = useState<"crop" | "district" | null>(null);
  const crops = useAllCrops();
  const districts = useAllDistricts();
  const forecast = useForecastStatus(scope);
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const options = picker === "crop"
    ? [{ id: "", label: t.filterAllCrops }, ...(crops.data ?? []).map((c) => ({ id: c.crop_name, label: c.crop_name }))]
    : [{ id: "", label: t.predictionsAllLocations }, ...(districts.data ?? []).map((d) => ({ id: d.district, label: d.district }))];
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}><SecondaryButton label={scope.crop ?? t.filterAllCrops} icon="leaf-outline" onPress={() => setPicker("crop")} /></View>
        <View style={{ flex: 1 }}><SecondaryButton label={scope.district ?? t.predictionsAllLocations} icon="location-outline" onPress={() => setPicker("district")} /></View>
      </View>
      <MetricSelector label={t.filterSeason} value={scope.season ?? "all"}
        options={[{ id: "all", label: t.filterAll }, ...["A", "B", "C"].map((id) => ({ id, label: id }))]}
        onChange={(season) => setScope({ ...scope, season: season === "all" ? undefined : season })} />
      {crops.isError || districts.isError ? <ErrorState message={t.errorGeneric} onRetry={() => { void crops.refetch(); void districts.refetch(); }} /> : null}
      <SingleSelectSheet visible={picker !== null} title={picker === "crop" ? t.crop : t.district}
        searchPlaceholder={picker === "crop" ? t.searchCrops : t.searchDistricts}
        options={options} selected={picker ? scope[picker] ?? "" : ""}
        onCancel={() => setPicker(null)}
        onApply={(value) => { if (picker) setScope({ ...scope, [picker]: value || undefined }); setPicker(null); }} />
      <PredictionsSection status={forecast.data} isLoading={forecast.isLoading} error={forecast.isError}
        isOffline={offline} onRetry={() => void forecast.refetch()} />
    </View>
  );
}
