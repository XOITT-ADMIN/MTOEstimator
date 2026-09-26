import React from "react";
import { Pressable, ScrollView, View } from "react-native";

import { colors, radius, sizes } from "../theme";
import { T } from "./Text";
import { Icon } from "./Icon";

// Filter chip, 48px tall. Selected = navy.  <Chip label="Draft" count={1} active onPress />
export function Chip({ label, count, active, onPress, icon, style }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => [
        {
          height: sizes.icon,
          paddingHorizontal: 16,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: active ? colors.navy : colors.border,
          backgroundColor: active ? colors.navy : colors.surface,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={16} color={active ? colors.white : colors.muted} /> : null}
      <T variant="sub" weight={500} color={active ? colors.white : colors.text}>
        {label}
      </T>
      {count != null ? (
        <T variant="caption" weight={400} num color={active ? "rgba(255,255,255,0.75)" : "rgba(21,24,51,0.6)"}>
          {count}
        </T>
      ) : null}
    </Pressable>
  );
}

// Horizontally scrolling chip row that bleeds to the screen edges.
export function ChipRow({ children, inset = 20, style }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[{ marginHorizontal: -inset, flexGrow: 0 }, style]} contentContainerStyle={{ paddingHorizontal: inset, gap: 8 }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

// Choice chip with a small icon, e.g. remembered client ("Aegis Builders").
//   tall → 48px blue "Log again" chip used in the Add item wizard.
export function SuggestChip({ label, icon = "clock", active, onPress, tall }) {
  const blue = active || tall;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        height: tall ? 48 : 40,
        paddingHorizontal: 14,
        borderRadius: tall ? 24 : 20,
        borderWidth: 1,
        borderColor: tall ? "#B8CBE3" : active ? "#8FB3DB" : colors.border,
        backgroundColor: tall ? colors.tintBlueSoft : active ? colors.tintBlue : colors.surface,
        flexDirection: "row",
        alignItems: "center",
        gap: tall ? 8 : 6,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Icon name={icon} size={tall ? 16 : 14} color={blue ? "#1F4E86" : colors.muted} />
      <T variant={tall ? "sub" : "label"} weight={500} color={blue ? "#1F4E86" : colors.text} numberOfLines={1}>
        {label}
      </T>
    </Pressable>
  );
}

// Large selectable card chip (material / size choices in the wizard).
export function ChoiceTile({ title, sub, subTone = "successInk", active, onPress, disabled, style }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      style={({ pressed }) => [
        {
          minHeight: sizes.row,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: radius.m,
          borderWidth: active ? 2 : 1.5,
          borderColor: active ? colors.action : colors.border,
          backgroundColor: active ? colors.tintBlueSoft : colors.surface,
          justifyContent: "center",
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <T variant="rowTitle" num>
        {title}
      </T>
      {sub ? (
        <T variant="caption" weight={400} color={subTone}>
          {sub}
        </T>
      ) : null}
    </Pressable>
  );
}

export function ChipWrap({ children, gap = 8, style }) {
  return <View style={[{ flexDirection: "row", flexWrap: "wrap", gap }, style]}>{children}</View>;
}
