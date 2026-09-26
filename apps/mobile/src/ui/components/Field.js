import React, { useState } from "react";
import { TextInput, View, Pressable } from "react-native";

import { colors, fonts, radius, sizes } from "../theme";
import { T } from "./Text";
import { Icon } from "./Icon";

export const inputText = { fontFamily: fonts[400], fontSize: 16, color: colors.text };

// Labelled 56px input.  <Field label="Work email" value onChangeText error="…" saved />
export const Field = React.forwardRef(function Field({ label, error, saved, hint, style, inputStyle, multiline, right, ...input }, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <T variant="label">{label}</T>
          {saved ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Icon name="check" size={14} color="success" />
              <T variant="caption" weight={600} color="success">
                Saved
              </T>
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={{ justifyContent: "center" }}>
        <TextInput
          ref={ref}
          placeholderTextColor={colors.faint}
          {...input}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          style={[
            inputText,
            {
              minHeight: multiline ? 104 : sizes.input,
              borderWidth: focused || error ? 2 : 1.5,
              borderColor: error ? colors.danger : focused ? colors.action : colors.border,
              borderRadius: radius.m,
              paddingHorizontal: focused || error ? 15.5 : 16,
              paddingVertical: multiline ? 14 : 0,
              paddingRight: right ? 48 : 16,
              backgroundColor: colors.surface,
              textAlignVertical: multiline ? "top" : "center",
              outlineStyle: "none",
            },
            inputStyle,
          ]}
        />
        {right ? <View style={{ position: "absolute", right: 8 }}>{right}</View> : null}
      </View>
      {error ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name="alert" size={16} color="danger" />
          <T variant="label" weight={400} color="danger">
            {error}
          </T>
        </View>
      ) : hint ? (
        <T variant="caption" weight={400}>
          {hint}
        </T>
      ) : null}
    </View>
  );
});

// 48px search box with a magnifier.
export function SearchField({ value, onChangeText, placeholder = "Search", style, onClear }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ justifyContent: "center" }, style]}>
      <View style={{ position: "absolute", left: 14, zIndex: 1 }}>
        <Icon name="search" size={20} color="muted" />
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        accessibilityLabel={placeholder}
        returnKeyType="search"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          inputText,
          {
            height: sizes.icon,
            borderWidth: focused ? 2 : 1.5,
            borderColor: focused ? colors.action : colors.border,
            borderRadius: radius.m,
            paddingLeft: 44,
            paddingRight: value ? 44 : 14,
            backgroundColor: colors.surface,
            outlineStyle: "none",
          },
        ]}
      />
      {value ? (
        <Pressable onPress={() => (onClear ? onClear() : onChangeText(""))} hitSlop={8} accessibilityLabel="Clear search" style={{ position: "absolute", right: 12 }}>
          <Icon name="close" size={18} color="muted" />
        </Pressable>
      ) : null}
    </View>
  );
}

// Label + borderless input, for fields stacked inside a <Group> card (Details › Job).
//   <Group><InlineField label="Project" value onChangeText /></Group>
export function InlineField({ label, style, inputStyle, multiline, ...input }) {
  return (
    <View style={[{ gap: 4, paddingHorizontal: 16, paddingVertical: 12 }, style]}>
      <T variant="caption">{label}</T>
      <TextInput
        placeholderTextColor={colors.faint}
        accessibilityLabel={label}
        multiline={multiline}
        {...input}
        style={[inputText, { minHeight: multiline ? 72 : 36, paddingVertical: multiline ? 6 : 0, textAlignVertical: multiline ? "top" : "center", outlineStyle: "none" }, inputStyle]}
      />
    </View>
  );
}

// Compact "₹ [2500]" box used on the Summary tab (costs, discount).
//   <AmountInput prefix="₹" value={2500} onChange={(n) => …} />
//   mode="fixed"|"percent" + onModeChange → the ₹ / % symbol becomes a tap-to-switch pill.
export function AmountInput({ value, onChange, prefix = "₹", suffix, width = 124, label, style, mode, onModeChange }) {
  const [text, setText] = useState(value ? String(value) : "");
  const [focused, setFocused] = useState(false);
  // Keep the box in sync when the value changes elsewhere (e.g. a remote edit), but not mid-typing.
  React.useEffect(() => {
    if (!focused) setText(value ? String(value) : "");
  }, [value, focused]);
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 2, height: 44, width, paddingHorizontal: 10, borderWidth: focused ? 2 : 1.5, borderColor: focused ? colors.action : colors.border, borderRadius: 10, backgroundColor: colors.surface }, style]}>
      {mode ? (
        <Pressable onPress={onModeChange ? () => onModeChange(mode === "percent" ? "fixed" : "percent") : undefined} disabled={!onModeChange} hitSlop={6} accessibilityRole="button" accessibilityLabel={mode === "percent" ? "Percent. Tap for a fixed amount" : "Fixed amount. Tap for percent"} style={{ minWidth: 28, height: 28, borderRadius: 7, backgroundColor: onModeChange ? colors.tintBlue : "transparent", alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
          <T variant="bodyStrong" size={14} color={onModeChange ? "blue700" : "muted"}>
            {mode === "percent" ? "%" : "₹"}
          </T>
        </Pressable>
      ) : prefix ? (
        <T variant="body" color="muted">{prefix}</T>
      ) : null}
      <TextInput
        value={text}
        keyboardType="decimal-pad"
        accessibilityLabel={label}
        placeholder="0"
        placeholderTextColor={colors.faint}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChangeText={(t) => {
          const clean = t.replace(/[^0-9.]/g, "");
          setText(clean);
          onChange?.(Number(clean) || 0);
        }}
        style={[inputText, { flex: 1, minWidth: 0, fontSize: 15, textAlign: "right", fontVariant: ["tabular-nums"], outlineStyle: "none" }]}
      />
      {suffix && !mode ? <T variant="body" color="muted">{suffix}</T> : null}
    </View>
  );
}
