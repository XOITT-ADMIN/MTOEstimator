import React, { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { colors, fonts, radius } from "../theme";
import { T } from "./Text";
import { Icon } from "./Icon";

const fmt = (n) => (Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "");

// Big −/value/+ stepper (64px) with optional quick-add buttons (+5, +10, +25).
export function Stepper({ value, onChange, unit, min = 0, quick = [5, 10, 25], label = "Quantity" }) {
  const [text, setText] = useState(fmt(value));
  useEffect(() => setText(fmt(value)), [value]);
  const set = (n) => onChange(Math.max(min, Math.round(n * 100) / 100));
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable
          onPress={() => set((Number(value) || 0) - 1)}
          accessibilityLabel={`Decrease ${label.toLowerCase()}`}
          style={({ pressed }) => ({ width: 64, height: 64, borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.border, backgroundColor: pressed ? colors.tintBlue : colors.surface, alignItems: "center", justifyContent: "center" })}
        >
          <Icon name="minus" size={28} color="blue700" />
        </Pressable>
        <View style={{ flex: 1, height: 64, borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <TextInput
            value={text}
            onChangeText={(v) => {
              const clean = v.replace(/[^0-9.]/g, "");
              setText(clean);
              const n = parseFloat(clean);
              if (Number.isFinite(n)) onChange(Math.max(min, n));
              else if (clean === "") onChange(0);
            }}
            keyboardType="decimal-pad"
            accessibilityLabel={label}
            selectTextOnFocus
            style={{ minWidth: 60, maxWidth: 150, fontFamily: fonts[600], fontSize: 30, color: colors.text, textAlign: "right", fontVariant: ["tabular-nums"], outlineStyle: "none", padding: 0 }}
          />
          {unit ? (
            <T variant="body" size={16} weight={500} color="muted">
              {unit}
            </T>
          ) : null}
        </View>
        <Pressable
          onPress={() => set((Number(value) || 0) + 1)}
          accessibilityLabel={`Increase ${label.toLowerCase()}`}
          style={({ pressed }) => ({ width: 64, height: 64, borderRadius: radius.xl, backgroundColor: colors.action, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.88 : 1 })}
        >
          <Icon name="plus" size={28} color="white" />
        </Pressable>
      </View>
      {quick?.length ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {quick.map((q) => (
            <Pressable
              key={q}
              onPress={() => set((Number(value) || 0) + q)}
              accessibilityLabel={`Add ${q}`}
              style={({ pressed }) => ({ flex: 1, height: 48, borderRadius: radius.m, backgroundColor: colors.tintBlue, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}
            >
              <T variant="bodyStrong" color="#1F4E86" num>
                +{q}
              </T>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ₹ amount input with a unit suffix ("₹ 65 / m").
export function MoneyField({ label, value, onChangeText, unit, style }) {
  return (
    <View style={[{ flex: 1, gap: 6 }, style]}>
      <T variant="label">{label}</T>
      <View style={{ height: 56, paddingHorizontal: 14, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.m, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 2 }}>
        <T variant="body" color="muted">
          ₹
        </T>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          accessibilityLabel={label}
          selectTextOnFocus
          style={{ flex: 1, minWidth: 0, fontFamily: fonts[600], fontSize: 17, color: colors.text, fontVariant: ["tabular-nums"], outlineStyle: "none", paddingVertical: 0, paddingHorizontal: 4 }}
        />
        {unit ? (
          <T variant="label" weight={400}>
            / {unit}
          </T>
        ) : null}
      </View>
    </View>
  );
}
