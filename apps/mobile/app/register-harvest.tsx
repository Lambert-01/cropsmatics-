import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { CROPS, DISTRICTS } from "../src/constants/reference";
import { strings } from "../src/i18n";
import { useAppStore } from "../src/store/useAppStore";
import { saveHarvestOffline } from "../src/sync/queue";
import { colors, radius, spacing } from "../src/theme";

export default function RegisterHarvestScreen() {
  const language = useAppStore((s) => s.language);
  const t = strings(language);

  const [district, setDistrict] = useState<string | null>(null);
  const [crop, setCrop] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [saved, setSaved] = useState(false);

  const canSave = Boolean(district && crop) && !saved;

  function onSave() {
    if (!district || !crop) return;
    saveHarvestOffline({
      district,
      crop,
      expectedQuantityKg: quantity ? Number(quantity) : null,
      expectedHarvestDate: null,
    });
    setSaved(true);
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
      <Field label={t.district}>
        <ChipPicker options={DISTRICTS} value={district} onChange={setDistrict} />
      </Field>

      <Field label={t.crop}>
        <ChipPicker options={CROPS} value={crop} onChange={setCrop} />
      </Field>

      <Field label={t.quantity}>
        <TextInput
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="numeric"
          placeholder="0"
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            padding: spacing.md,
            backgroundColor: colors.surface,
          }}
        />
      </Field>

      <Pressable
        onPress={onSave}
        disabled={!canSave}
        style={{
          padding: spacing.md,
          borderRadius: radius.md,
          backgroundColor: canSave ? colors.brandGreen : colors.border,
        }}
      >
        <Text style={{ textAlign: "center", color: colors.white, fontWeight: "600" }}>
          {saved ? t.savedOffline : t.save}
        </Text>
      </Pressable>

      {saved ? (
        <Text style={{ color: colors.forest }} accessibilityRole="text">
          ✓ {t.savedOffline}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ fontWeight: "600", color: colors.forest }}>{label}</Text>
      {children}
    </View>
  );
}

function ChipPicker({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            style={{
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: selected ? colors.brandGreen : colors.border,
              backgroundColor: selected ? "#e6f4ef" : colors.surface,
            }}
          >
            <Text style={{ color: colors.forest }}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
