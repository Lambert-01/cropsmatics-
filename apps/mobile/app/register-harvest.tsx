import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";

import { AttachmentFields, toAttachmentRows, type PendingAttachment } from "../src/components/AttachmentFields";
import { DateField } from "../src/components/DateField";
import { ScreenLayout } from "../src/components/ScreenLayout";
import { StepProgress } from "../src/components/StepProgress";
import { CROPS, DISTRICTS } from "../src/constants/reference";
import { insertAttachment, listFarms } from "../src/database";
import { strings } from "../src/i18n";
import { useAppStore } from "../src/store/useAppStore";
import { saveFarmOffline, saveHarvestOffline } from "../src/sync/queue";
import { colors, radius, shadow, spacing, typography } from "../src/theme";
import type { LocalFarm, QuantityUnit } from "../src/types";
import { todayIso, validateHarvestDates } from "../src/utils/dates";
import { QUANTITY_UNITS, formatQuantity, parseQuantity, toKilograms } from "../src/utils/units";
import { uuidv4 } from "../src/utils/uuid";

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

const LAST_STEP: Step = 7;

export default function RegisterHarvestScreen() {
  const router = useRouter();
  const language = useAppStore((s) => s.language);
  const t = strings(language);

  const [step, setStep] = useState<Step>(0);
  const [farms, setFarms] = useState<LocalFarm[]>(() => {
    try {
      return listFarms();
    } catch {
      return [];
    }
  });
  const [farmClientUuid, setFarmClientUuid] = useState<string | null>(null);
  const [addingFarm, setAddingFarm] = useState(false);
  const [farmName, setFarmName] = useState("");
  const [farmDistrict, setFarmDistrict] = useState<string | null>(null);
  const [farmSizeHa, setFarmSizeHa] = useState("");

  const [crop, setCrop] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<QuantityUnit>("kg");
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [needsStorage, setNeedsStorage] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [saving, setSaving] = useState(false);

  const selectedFarm = useMemo(
    () => farms.find((farm) => farm.clientUuid === farmClientUuid) ?? null,
    [farms, farmClientUuid],
  );

  const steps = useMemo(
    () => [
      t.stepFarm,
      t.stepCrop,
      t.stepQuantity,
      t.stepSchedule,
      t.location,
      t.notes,
      t.stepAttachments,
      t.stepReview,
    ],
    [t],
  );

  const parsedQuantity = parseQuantity(quantity);
  const quantityKg = parsedQuantity === null ? null : toKilograms(parsedQuantity, unit);
  const dateCheck = validateHarvestDates(startDate, endDate);
  const locationDistrict = selectedFarm?.district ?? farmDistrict ?? null;

  const canAdvance: boolean[] = [
    Boolean(farmClientUuid),
    Boolean(crop),
    quantityKg !== null && quantityKg > 0,
    dateCheck.ok && Boolean(startDate),
    true, // location is optional
    true, // notes are optional
    true, // attachments are optional
    true,
  ];

  const refreshFarms = useCallback(() => {
    setFarms(listFarms());
  }, []);

  function onSaveFarm() {
    if (!farmName.trim() || !farmDistrict) return;
    const size = parseQuantity(farmSizeHa);
    const farm = saveFarmOffline({
      name: farmName.trim(),
      district: farmDistrict,
      sector: null,
      farmSizeHa: size,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
    });
    refreshFarms();
    setFarmClientUuid(farm.clientUuid);
    setAddingFarm(false);
    setFarmName("");
    setFarmSizeHa("");
  }

  async function captureLocation() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationNote(t.locationPermissionDenied);
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      setLocationNote(t.locationCaptured);
    } catch {
      setLocationNote(t.locationUnavailable);
    }
  }

  function onSave() {
    if (!crop || quantityKg === null || saving) return;
    const district = locationDistrict;
    if (!district) {
      Alert.alert(t.district, t.noFarms);
      return;
    }
    setSaving(true);
    const record = saveHarvestOffline({
      farmClientUuid,
      district,
      crop,
      expectedQuantityKg: quantityKg,
      harvestStartDate: startDate,
      harvestEndDate: endDate,
      expectedHarvestDate: startDate,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      notes: notes.trim() ? notes.trim() : null,
      needsStorageAssistance: needsStorage,
    });

    // Attachments are written only once the harvest exists, so a cancelled
    // wizard never leaves orphan rows behind.
    for (const row of toAttachmentRows(attachments, record.clientUuid)) {
      insertAttachment({ ...row, clientUuid: row.clientUuid || uuidv4() });
    }

    router.replace({
      pathname: "/harvest-risk",
      params: {
        harvestClientUuid: record.clientUuid,
        crop,
        district,
        quantity: String(quantityKg),
      },
    });
  }

  return (
    <ScreenLayout back>
      <Text style={typography.h1}>{t.registerHarvest}</Text>
      <StepProgress labels={steps} current={step} />

      <View style={cardStyle}>
        {/* 0. Farm -------------------------------------------------------- */}
        {step === 0 ? (
          <Field label={t.farm}>
            {farms.length === 0 && !addingFarm ? (
              <Text style={typography.caption}>{t.noFarms}</Text>
            ) : null}

            {farms.map((farm) => {
              const selected = farm.clientUuid === farmClientUuid;
              return (
                <Pressable
                  key={farm.clientUuid}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setFarmClientUuid(farm.clientUuid)}
                  style={selectableStyle(selected)}
                >
                  <Text style={{ fontWeight: "600", color: colors.forest }}>{farm.name}</Text>
                  <Text style={typography.caption}>
                    {farm.district}
                    {farm.farmSizeHa ? ` · ${farm.farmSizeHa} ha` : ""}
                  </Text>
                </Pressable>
              );
            })}

            {addingFarm ? (
              <View style={{ gap: spacing.sm }}>
                <TextInput
                  value={farmName}
                  onChangeText={setFarmName}
                  placeholder={t.farmName}
                  style={inputStyle}
                />
                <Text style={typography.caption}>{t.district}</Text>
                <ChipPicker options={DISTRICTS} value={farmDistrict} onChange={setFarmDistrict} />
                <TextInput
                  value={farmSizeHa}
                  onChangeText={(v) => setFarmSizeHa(v.replace(/[^0-9.]/g, ""))}
                  keyboardType="numeric"
                  placeholder={t.farmSizeHa}
                  style={inputStyle}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={onSaveFarm}
                  style={buttonStyle(Boolean(farmName.trim() && farmDistrict))}
                >
                  <Text style={buttonTextStyle(Boolean(farmName.trim() && farmDistrict))}>
                    {t.saveFarm}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => setAddingFarm(true)}
                style={secondaryButtonStyle}
              >
                <Ionicons name="add-circle-outline" size={16} color={colors.forest} />
                <Text style={{ color: colors.forest, fontSize: 13 }}>{t.addFarm}</Text>
              </Pressable>
            )}
          </Field>
        ) : null}

        {/* 1. Crop -------------------------------------------------------- */}
        {step === 1 ? (
          <Field label={t.crop}>
            <ChipPicker options={CROPS} value={crop} onChange={setCrop} />
          </Field>
        ) : null}

        {/* 2. Quantity (+ unit) ------------------------------------------- */}
        {step === 2 ? (
          <Field label={t.quantity}>
            <TextInput
              value={quantity}
              onChangeText={(v) => setQuantity(v.replace(/[^0-9.,]/g, ""))}
              keyboardType="numeric"
              placeholder="0"
              style={inputStyle}
            />
            <ChipPicker
              options={QUANTITY_UNITS.map((u) => u.label)}
              value={QUANTITY_UNITS.find((u) => u.code === unit)?.label ?? null}
              onChange={(label) =>
                setUnit(QUANTITY_UNITS.find((u) => u.label === label)?.code ?? "kg")
              }
            />
            {quantityKg !== null ? (
              <Text style={typography.caption}>
                {t.quantity}: {formatQuantity(quantityKg, "kg")}
              </Text>
            ) : quantity ? (
              <Text style={{ ...typography.caption, color: colors.danger }}>
                {t.quantityInvalid}
              </Text>
            ) : null}
          </Field>
        ) : null}

        {/* 3. Dates ------------------------------------------------------- */}
        {step === 3 ? (
          <Field label={t.harvestDate}>
            <DateField
              label={t.harvestStartDate}
              value={startDate}
              onChange={setStartDate}
              placeholder={t.pickDate}
              clearLabel={t.clearDate}
              error={
                dateCheck.field === "start"
                  ? dateCheck.error
                  : !dateCheck.ok && dateCheck.field === "end"
                    ? null
                    : dateCheck.ok
                      ? null
                      : dateCheck.error
              }
            />
            <DateField
              label={t.harvestEndDate}
              value={endDate}
              onChange={setEndDate}
              placeholder={t.pickDate}
              clearLabel={t.clearDate}
              minimumDate={startDate ?? todayIso()}
              error={dateCheck.field === "end" ? dateCheck.error : null}
            />
            <Text style={typography.caption}>
              {t.endBeforeStart.replace(/\.$/, "")} — {t.optional}
            </Text>
          </Field>
        ) : null}

        {/* 4. Location ---------------------------------------------------- */}
        {step === 4 ? (
          <Field label={t.location}>
            <Pressable
              accessibilityRole="button"
              onPress={captureLocation}
              style={secondaryButtonStyle}
            >
              <Ionicons name="location-outline" size={16} color={colors.forest} />
              <Text style={{ color: colors.forest, fontSize: 13 }}>{t.captureLocation}</Text>
            </Pressable>
            {location ? (
              <Text style={typography.caption}>
                {t.locationCaptured}: {location.latitude.toFixed(5)},{" "}
                {location.longitude.toFixed(5)}
              </Text>
            ) : (
              <Text style={typography.caption}>
                {locationNote ?? t.locationOptional} · {t.useDistrictOnly}
              </Text>
            )}
          </Field>
        ) : null}

        {/* 5. Notes + storage assistance ---------------------------------- */}
        {step === 5 ? (
          <Field label={`${t.notes} (${t.optional})`}>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={t.notesPlaceholder}
              multiline
              numberOfLines={4}
              style={{ ...inputStyle, minHeight: 92, textAlignVertical: "top" }}
            />
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: needsStorage }}
              onPress={() => setNeedsStorage((value) => !value)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                padding: spacing.sm,
                borderWidth: 1,
                borderColor: needsStorage ? colors.brandGreen : colors.border,
                borderRadius: radius.md,
                backgroundColor: needsStorage ? colors.tint : colors.surface,
              }}
            >
              <Ionicons
                name={needsStorage ? "checkbox" : "square-outline"}
                size={18}
                color={needsStorage ? colors.brandGreen : colors.muted}
              />
              <Text style={{ color: colors.forest }}>{t.needsStorageAssistance}</Text>
            </Pressable>
            <Text style={typography.caption}>{t.notAReservation}</Text>
          </Field>
        ) : null}

        {/* 6. Attachments ------------------------------------------------- */}
        {step === 6 ? (
          <Field label={`${t.attachments} (${t.optional})`}>
            <AttachmentFields
              attachments={attachments}
              onChange={setAttachments}
              labels={{
                addPhoto: t.addPhoto,
                addDocument: t.addDocument,
                remove: t.removeAttachment,
                tooLarge: t.attachmentTooLarge,
                limitReached: t.attachmentLimitReached,
                permissionDenied: t.attachmentPermissionDenied,
                none: t.noAttachments,
              }}
            />
          </Field>
        ) : null}

        {/* 7. Review ------------------------------------------------------ */}
        {step === 7 ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={typography.h2}>{t.review}</Text>
            <ReviewRow label={t.stepFarm} value={selectedFarm?.name ?? "—"} />
            <ReviewRow label={t.district} value={locationDistrict ?? "—"} />
            <ReviewRow label={t.crop} value={crop ?? "—"} />
            <ReviewRow
              label={t.quantity}
              value={quantityKg !== null ? formatQuantity(quantityKg, "kg") : "—"}
            />
            <ReviewRow label={t.harvestStartDate} value={startDate ?? "—"} />
            <ReviewRow label={t.harvestEndDate} value={endDate ?? "—"} />
            <ReviewRow
              label={t.location}
              value={location ? "GPS captured" : t.useDistrictOnly}
            />
            <ReviewRow label={t.notes} value={notes.trim() ? notes.trim() : "—"} />
            <ReviewRow
              label={t.needsStorageAssistance}
              value={needsStorage ? t.yes : t.no}
            />
            <ReviewRow label={t.attachments} value={String(attachments.length)} />
          </View>
        ) : null}
      </View>

      <View style={offlineNotice}>
        <Ionicons name="cloud-offline-outline" size={15} color={colors.amber} />
        <Text style={{ ...typography.caption, flex: 1 }}>{t.savedOffline}</Text>
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {step > 0 ? (
          <Pressable onPress={() => setStep((s) => (s - 1) as Step)} style={buttonStyle(true)}>
            <Text style={buttonTextStyle(true)}>{t.back}</Text>
          </Pressable>
        ) : null}
        {step < LAST_STEP ? (
          <Pressable
            onPress={() => canAdvance[step] && setStep((s) => (s + 1) as Step)}
            disabled={!canAdvance[step]}
            style={buttonStyle(canAdvance[step])}
          >
            <Text style={buttonTextStyle(canAdvance[step])}>{t.next}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={onSave} disabled={saving} style={buttonStyle(!saving)}>
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

const offlineNotice = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: spacing.sm,
  padding: spacing.sm,
  borderRadius: radius.md,
  backgroundColor: "#fdf3e3",
} as const;

const secondaryButtonStyle = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  gap: spacing.xs,
  padding: spacing.sm,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.surface,
} as const;

function selectableStyle(selected: boolean) {
  return {
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: selected ? colors.brandGreen : colors.border,
    backgroundColor: selected ? colors.tint : colors.surface,
    gap: 2,
  } as const;
}

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
      <Text style={{ color: colors.slate, fontWeight: "600", flex: 1, textAlign: "right" }}>
        {value}
      </Text>
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
