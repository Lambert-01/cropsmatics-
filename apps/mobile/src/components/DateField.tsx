import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { parseIsoDate, toIsoDate, todayIso } from "../utils/dates";
import { colors, radius, spacing, typography } from "../theme";

/**
 * Native date field.
 *
 * Uses the platform picker rather than relative shortcuts so a real business
 * date can be recorded. The value is always an ISO `YYYY-MM-DD` string.
 */
export function DateField({
  label,
  value,
  onChange,
  placeholder,
  clearLabel,
  error,
  minimumDate,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder: string;
  clearLabel: string;
  error?: string | null;
  minimumDate?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const parsed = parseIsoDate(value) ?? new Date();

  function handleChange(event: DateTimePickerEvent, selected?: Date) {
    // Android fires once and closes; iOS keeps the spinner inline.
    if (Platform.OS !== "ios") setOpen(false);
    if (event.type === "dismissed") return;
    if (selected) onChange(toIsoDate(selected));
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ fontWeight: "600", color: colors.forest }}>{label}</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? placeholder}`}
        onPress={() => setOpen((shown) => !shown)}
        style={{
          borderWidth: 1,
          borderColor: error ? colors.danger : colors.border,
          borderRadius: radius.md,
          padding: spacing.md,
          backgroundColor: colors.surface,
        }}
      >
        <Text style={{ color: value ? colors.slate : colors.muted }}>
          {value ?? placeholder}
        </Text>
      </Pressable>

      {value ? (
        <Pressable accessibilityRole="button" onPress={() => onChange(null)}>
          <Text style={{ ...typography.caption, color: colors.info }}>{clearLabel}</Text>
        </Pressable>
      ) : null}

      {error ? (
        <Text style={{ ...typography.caption, color: colors.danger }}>{error}</Text>
      ) : null}

      {open ? (
        <DateTimePicker
          value={parsed}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          minimumDate={minimumDate ? (parseIsoDate(minimumDate) ?? undefined) : undefined}
          onChange={handleChange}
        />
      ) : null}
    </View>
  );
}

export const defaultMinimumDate = todayIso;
