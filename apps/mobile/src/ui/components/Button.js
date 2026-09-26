import React from "react";
import { Pressable, View, ActivityIndicator } from "react-native";

import { colors, radius, sizes, shadow } from "../theme";
import { T } from "./Text";
import { Icon } from "./Icon";

const TONES = {
  primary: { bg: colors.action, fg: colors.white, border: null },
  secondary: { bg: colors.surface, fg: colors.blue700, border: colors.border },
  danger: { bg: colors.surface, fg: colors.danger, border: colors.dangerBorder },
  dangerSolid: { bg: colors.danger, fg: colors.white, border: null },
  soft: { bg: colors.tintBlue, fg: colors.blue700, border: null },
  onNavy: { bg: "rgba(255,255,255,0.12)", fg: colors.white, border: null },
};

// Big 56px button. One primary per screen, at the bottom.
//   <Button title="Add to estimate" icon="check" onPress={…} />
//   <Button title="Save + add another" tone="secondary" />
//   compactText → 15px label (two buttons side by side)
export function Button({ title, onPress, tone = "primary", icon, iconRight, disabled, loading, compact, compactText, style, accessibilityLabel }) {
  const t = TONES[tone] || TONES.primary;
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: !!off }}
      style={({ pressed }) => [
        {
          height: compact ? sizes.icon : sizes.button,
          borderRadius: radius.l,
          paddingHorizontal: compact ? 16 : 20,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          backgroundColor: disabled ? colors.disabledBg : t.bg,
          borderWidth: t.border && !disabled ? 1.5 : 0,
          borderColor: t.border || "transparent",
          opacity: pressed ? 0.88 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={t.fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={20} color={disabled ? colors.muted : t.fg} /> : null}
          <T variant="bodyStrong" size={compact || compactText ? 15 : 16} color={disabled ? colors.muted : t.fg} numberOfLines={1}>
            {title}
          </T>
          {iconRight ? <Icon name={iconRight} size={20} color={disabled ? colors.muted : t.fg} /> : null}
        </>
      )}
    </Pressable>
  );
}

// 48px round icon button (Back, Close) or 56px square outlined (Share).
export function IconButton({ icon, onPress, label, color = "text", size = 48, variant = "ghost", disabled, style }) {
  const outlined = variant === "outlined";
  const solid = variant === "solid";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        {
          width: outlined ? sizes.button : size,
          height: outlined ? sizes.button : size,
          borderRadius: outlined ? radius.l : size / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: solid ? colors.action : outlined ? colors.surface : pressed ? colors.tintBlue : "transparent",
          borderWidth: outlined ? 1.5 : 0,
          borderColor: colors.border,
          opacity: disabled ? 0.4 : pressed && !outlined ? 0.9 : 1,
        },
        style,
      ]}
    >
      <Icon name={icon} size={24} color={solid ? "white" : outlined ? "blue700" : color} />
    </Pressable>
  );
}

// Plain text action ("See all", "Change", "Add cost").
export function TextButton({ title, onPress, icon, color = "blue700", size = 15, style, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      style={({ pressed }) => [{ minHeight: 40, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4, opacity: disabled ? 0.45 : pressed ? 0.6 : 1 }, style]}
    >
      {icon ? <Icon name={icon} size={18} color={color} /> : null}
      <T variant="bodyStrong" size={size} color={color}>
        {title}
      </T>
    </Pressable>
  );
}

// Round floating action button (New estimate).
export function Fab({ icon = "plus", onPress, label = "New estimate", style }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        { width: sizes.fab, height: sizes.fab, borderRadius: sizes.fab / 2, backgroundColor: colors.action, alignItems: "center", justifyContent: "center", ...shadow.raised, transform: [{ scale: pressed ? 0.95 : 1 }] },
        style,
      ]}
    >
      <Icon name={icon} size={30} color="white" />
    </Pressable>
  );
}

export function ButtonRow({ children, style }) {
  return <View style={[{ flexDirection: "row", gap: 10 }, style]}>{children}</View>;
}
