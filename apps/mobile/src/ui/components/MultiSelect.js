import React, { useState } from "react";
import { View, Pressable, ScrollView } from "react-native";

import { colors, radius, sizes } from "../theme";
import { T } from "./Text";
import { Icon } from "./Icon";
import { Button } from "./Button";
import { Sheet } from "./Sheet";

// Mobile-friendly multi-select: a field that shows what's picked; tapping it opens a bottom
// sheet of big, checkable rows with a Done button.
//   <MultiSelect label="Roles" options={[{ key, label, hint? }]} value={["a"]} onChange={(keys) => …} />
export function MultiSelect({ label, placeholder = "Select…", options, value, onChange, title, doneLabel = "Done", style }) {
  const [open, setOpen] = useState(false);
  const selected = options.filter((o) => value.includes(o.key));
  const summary = selected.map((o) => o.label).join(", ");
  const toggle = (key) => onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);

  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? <T variant="label">{label}</T> : null}
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label || "Select"}: ${summary || "none selected"}`}
        style={({ pressed }) => ({
          minHeight: sizes.input,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: radius.m,
          borderWidth: 1.5,
          borderColor: colors.border,
          backgroundColor: pressed ? colors.tintBlueSoft : colors.surface,
        })}
      >
        <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {selected.length ? (
            selected.map((o) => (
              <View key={o.key} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.tintBlueSoft }}>
                <T variant="caption" weight={600} color="navy">
                  {o.label}
                </T>
              </View>
            ))
          ) : (
            <T variant="body" weight={400} color="muted">
              {placeholder}
            </T>
          )}
        </View>
        <View style={{ transform: [{ rotate: "90deg" }] }}>
          <Icon name="chevronRight" size={18} color="muted" />
        </View>
      </Pressable>

      <Sheet
        visible={open}
        title={title || label}
        subtitle="Tap to select — you can pick more than one"
        onClose={() => setOpen(false)}
        footer={<Button title={`${doneLabel}${value.length ? ` (${value.length})` : ""}`} onPress={() => setOpen(false)} />}
      >
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 8 }}>
          {options.map((o) => {
            const on = value.includes(o.key);
            return (
              <Pressable
                key={o.key}
                onPress={() => toggle(o.key)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  minHeight: sizes.row,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: radius.m,
                  borderWidth: on ? 2 : 1.5,
                  borderColor: on ? colors.action : colors.border,
                  backgroundColor: on ? colors.tintBlueSoft : colors.surface,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: on ? colors.action : colors.faint, backgroundColor: on ? colors.action : "transparent", alignItems: "center", justifyContent: "center" }}>
                  {on ? <Icon name="check" size={16} color="white" /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <T variant="bodyStrong">{o.label}</T>
                  {o.hint ? (
                    <T variant="caption" weight={400}>
                      {o.hint}
                    </T>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </Sheet>
    </View>
  );
}
