import React from "react";
import { View, ScrollView, Pressable, TextInput } from "react-native";

import { Section, Group, InlineField, Chip, HStack, T, Icon, inputText, colors, radius, statusStyles, STATUSES, tradeStyles } from "../../ui";

const TRADES = ["Plumbing", "Electrical"];
// Field engineers move an estimate up to Sent; the admin sets the rest (the API enforces it too).
export const ENGINEER_STATUSES = ["Draft", "Ready", "Sent"];

// Details tab: job fields, trade scope, status grid, notes. Every edit saves as you type.
export function DetailsTab({ estimate, update, canApprove, canEdit }) {
  const statuses = canApprove ? STATUSES : STATUSES.filter((s) => ENGINEER_STATUSES.includes(s) || s === estimate.status);
  const toggleTrade = (t) => update({ trades: estimate.trades.includes(t) ? estimate.trades.filter((x) => x !== t) : [...estimate.trades, t] });
  const created = [estimate.createdBy?.name ? `Created by ${estimate.createdBy.name.split(" ")[0]}` : null, estimate.date, "Edits save automatically"].filter(Boolean).join(" · ");

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
      <Section title="Job" style={{ marginTop: 0 }} gap={8}>
        <Group>
          <InlineField label="Project" value={estimate.name} editable={canEdit} onChangeText={(v) => update({ name: v })} />
          <InlineField label="Client" value={estimate.client} editable={canEdit} onChangeText={(v) => update({ client: v })} autoCapitalize="words" />
          <InlineField label="Site" value={estimate.site} editable={canEdit} onChangeText={(v) => update({ site: v })} autoCapitalize="words" />
        </Group>
      </Section>

      <Section title="Trade scope" style={{ marginTop: 20 }} gap={8}>
        <HStack>
          {TRADES.map((t) => (
            <Chip key={t} label={t} icon={tradeStyles[t].icon} active={estimate.trades.includes(t)} onPress={canEdit ? () => toggleTrade(t) : undefined} />
          ))}
        </HStack>
      </Section>

      <Section title="Status" style={{ marginTop: 20 }} gap={8}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {statuses.map((s) => (
            <StatusTile key={s} status={s} active={estimate.status === s} onPress={canEdit && (canApprove || ENGINEER_STATUSES.includes(s)) ? () => update({ status: s }) : undefined} />
          ))}
        </View>
        {!canApprove ? (
          <HStack gap={8} style={{ paddingHorizontal: 4, paddingTop: 2 }}>
            <Icon name="lock" size={16} color="muted" />
            <T variant="label" weight={400} style={{ flex: 1 }}>
              Your admin approves it. Approved, Rejected and Completed are set by them.
            </T>
          </HStack>
        ) : null}
      </Section>

      <Section title="Notes" style={{ marginTop: 20 }} gap={8}>
        <TextInput
          value={estimate.notes}
          onChangeText={(v) => update({ notes: v })}
          editable={canEdit}
          multiline
          accessibilityLabel="Notes"
          placeholder="Access, timings, anything the team should know"
          placeholderTextColor={colors.faint}
          style={[inputText, { fontSize: 15, lineHeight: 22, minHeight: 104, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: colors.surface, textAlignVertical: "top", outlineStyle: "none" }]}
        />
      </Section>

      <T variant="caption" weight={400} style={{ paddingHorizontal: 4, marginTop: 20 }}>
        {created}
      </T>
    </ScrollView>
  );
}

// One cell of the 3-column status grid. Active = the status's own tint and a 2px border.
function StatusTile({ status, active, onPress }) {
  const s = statusStyles[status];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active, disabled: !onPress }}
      style={({ pressed }) => ({
        width: "31.6%",
        height: 48,
        borderRadius: radius.m,
        borderWidth: active ? 2 : 1,
        borderColor: active ? s.dot : colors.border,
        backgroundColor: active ? s.bg : colors.surface,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.dot }} />
      <T variant="sub" weight={600} color={active ? s.fg : "text"}>
        {status}
      </T>
    </Pressable>
  );
}
