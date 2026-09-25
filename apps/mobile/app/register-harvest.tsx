import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { ScreenLayout } from "../src/components/ScreenLayout";
import { StepProgress } from "../src/components/StepProgress";
import { CROPS, DISTRICTS } from "../src/constants/reference";
import { strings } from "../src/i18n";
import { useAppStore } from "../src/store/useAppStore";
import { saveHarvestOffline } from "../src/sync/queue";
import { colors, radius, shadow, spacing, typography } from "../src/theme";

type Step = 0 | 1 | 2 | 3 | 4;

function dateAfter(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function RegisterHarvestScreen() {
  const router = useRouter();
  const language = useAppStore((s) => s.language);
  const t = strings(language);

  const [step, setStep] = useState<Step>(0);
  const [district, setDistrict] = useState<string | null>(null);
  const [crop, setCrop] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [schedule, setSchedule] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const scheduleOptions = [
    { label: t.scheduleToday, days: 0 },
    { label: t.scheduleThreeDays, days: 3 },
    { label: t.scheduleWeek, days: 7 },
    { label: t.scheduleTwoWeeks, days: 14 },
  ];

  const steps = useMemo(
    () => [t.stepFarm, t.stepCrop, t.stepQuantity, t.stepSchedule, t.stepReview],
    [t],
  );

  const validQuantity = Number(quantity) > 0 && Number.isFinite(Number(quantity));
  const canAdvance = [Boolean(district), Boolean(crop), validQuantity, Boolean(schedule), true][
    step
  ];

  function onSave() {
    if (!district || !crop || !validQuantity || !schedule || saving) return;
    setSaving(true);
    saveHarvestOffline({
      district,
      crop,
      expectedQuantityKg: Number(quantity),
      expectedHarvestDate: schedule,
    });
    router.replace({ pathname: "/harvest-risk", params: { crop, district, quantity } });
  }

  return (
    <ScreenLayout back>
      <Text style={typography.h1}>{t.registerHarvest}</Text>
      <StepProgress labels={steps} current={step} />

      <View style={cardStyle}>
        {step === 0 ? (
          <Field label={t.district}>
            <ChipPicker options={DISTRICTS} value={district} onChange={setDistrict} />
          </Field>
        ) : null}

        {step === 1 ? (
          <Field label={t.crop}>
            <ChipPicker options={CROPS} value={crop} onChange={setCrop} />
          </Field>
        ) : null}

        {step === 2 ? (
          <Field label={t.quantity}>
            <TextInput
              value={quantity}
              onChangeText={(v) => setQuantity(v.replace(/[^0-9.]/g, ""))}
              keyboardType="numeric"
              placeholder="0"
              style={inputStyle}
            />
            <Text style={typography.caption}>kg</Text>
          </Field>
        ) : null}

        {step === 3 ? (
          <Field label={t.harvestDate}>
            <ChipPicker
              options={scheduleOptions.map((option) => option.label)}
              value={scheduleOptions.find((option) => dateAfter(option.days) === schedule)?.label ?? null}
              onChange={(label) => setSchedule(dateAfter(scheduleOptions.find((option) => option.label === label)?.days ?? 0))}
            />
            {schedule ? <Text style={typography.caption}>{schedule}</Text> : null}
          </Field>
        ) : null}

        {step === 4 ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={typography.h2}>{t.review}</Text>
            <ReviewRow label={t.district} value={district ?? "—"} />
            <ReviewRow label={t.crop} value={crop ?? "—"} />
            <ReviewRow label={t.quantity} value={quantity ? `${quantity} kg` : "—"} />
            <ReviewRow label={t.harvestDate} value={schedule ?? "—"} />
          </View>
        ) : null}
      </View>

      {/* Actions */}
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {step > 0 ? (
          <Pressable onPress={() => setStep((s) => (s - 1) as Step)} style={buttonStyle(false)}>
            <Text style={buttonTextStyle(false)}>{t.back}</Text>
          </Pressable>
        ) : null}
        {step < 4 ? (
          <Pressable
            onPress={() => canAdvance && setStep((s) => (s + 1) as Step)}
            disabled={!canAdvance}
            style={buttonStyle(canAdvance)}
          >
            <Text style={buttonTextStyle(canAdvance)}>{t.next}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={onSave} disabled={!district || !crop || !validQuantity || saving} style={buttonStyle(!saving)}>
            <Text style={buttonTextStyle(!saving)}>{saving ? t.saving : t.confirmSave}</Text>
          </Pressable>
        )}
      </View>

      <Text style={typography.caption}>{t.syncOnOpen}</Text>
    </ScreenLayout>
  );
}

const cardStyle = {
  backgroundColor: colors.surface,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: colors.border,
  padding: spacing.md,
  gap: spacing.sm,
  ...shadow.card,
} as const;

const inputStyle = {
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.md,
  padding: spacing.md,
  backgroundColor: colors.surface,
  color: colors.slate,
} as const;

function buttonStyle(active: boolean) {
  return {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: active ? colors.brandGreen : colors.border,
  } as const;
}

function buttonTextStyle(active: boolean) {
  return {
    textAlign: "center" as const,
    color: active ? colors.white : colors.muted,
    fontWeight: "600" as const,
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ fontWeight: "600", color: colors.forest }}>{label}</Text>
      {children}
    </View>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
      <Text style={typography.caption}>{label}</Text>
      <Text style={{ color: colors.slate, fontWeight: "600" }}>{value}</Text>
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
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={{
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: selected ? colors.brandGreen : colors.border,
              backgroundColor: selected ? colors.tint : colors.surface,
            }}
          >
            <Text style={{ color: colors.forest, fontSize: 13 }}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
