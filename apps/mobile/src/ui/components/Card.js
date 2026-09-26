import React from "react";
import { View, Pressable } from "react-native";

import { colors, radius, shadow, sizes } from "../theme";
import { Icon } from "./Icon";
import { T } from "./Text";

// White rounded card. Pass onPress to make the whole card the tap target.
export function Card({ children, onPress, style, padded = true, tone = "surface", accessibilityLabel }) {
  const base = [
    {
      backgroundColor: tone === "surface" ? colors.surface : colors[tone] || tone,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: padded ? 16 : 0,
      ...shadow.card,
    },
    style,
  ];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [base, pressed && { backgroundColor: colors.tintBlueSoft }]}>
      {children}
    </Pressable>
  );
}

// A card holding rows separated by hairlines (lists, settings groups).
export function Group({ children, style }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }, style]}>
      {items.map((child, i) => (
        <View key={child.key ?? i} style={i < items.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.border } : null}>
          {child}
        </View>
      ))}
    </View>
  );
}

// One list row (≥ 64px). Whole row is the tap target; chevron shown when tappable.
//   <Row left={<IconTile/>} right={<T>₹1,86,420</T>} onPress={…}>…content…</Row>
export function Row({ children, left, right, onPress, chevron = !!onPress, minHeight = sizes.row, style, accessibilityLabel, disabled }) {
  const content = (
    <>
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
      {right}
      {chevron ? <Icon name="chevronRight" size={20} color="chevron" /> : null}
    </>
  );
  const s = [{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight }, style];
  if (!onPress) return <View style={s}>{content}</View>;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [s, pressed && { backgroundColor: colors.tintBlueSoft }]}>
      {content}
    </Pressable>
  );
}

// 40px rounded square with an icon (list leading element).
export function IconTile({ icon, size = 40, bg = colors.tintBlue, color = "blue700", iconSize = 22, style }) {
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 4, backgroundColor: colors[bg] || bg, alignItems: "center", justifyContent: "center" }, style]}>
      <Icon name={icon} size={iconSize} color={color} />
    </View>
  );
}

export function Divider({ style }) {
  return <View style={[{ height: 1, backgroundColor: colors.border }, style]} />;
}

export function Spacer({ h = 16 }) {
  return <View style={{ height: h }} />;
}

// Radio-style option card (Start a company / Join my company, role choices).
export function OptionCard({ title, body, icon, selected, onPress, compact, style }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          gap: 14,
          alignItems: compact ? "center" : "flex-start",
          padding: compact ? 12 : 18,
          borderRadius: compact ? radius.m : radius.xl,
          backgroundColor: selected && compact ? colors.tintBlueSoft : colors.surface,
          borderWidth: selected ? 2 : 1.5,
          borderColor: selected ? colors.action : colors.border,
          opacity: pressed ? 0.9 : 1,
        },
        style,
      ]}
    >
      {compact ? <Radio on={selected} /> : null}
      {icon ? <IconTile icon={icon} size={48} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <T variant={compact ? "bodyStrong" : "rowTitle"} size={compact ? 15 : 17} color={compact ? "text" : "navy"}>
          {title}
        </T>
        {body ? (
          <T variant={compact ? "caption" : "sub"} weight={400} style={compact ? null : { lineHeight: 20 }}>
            {body}
          </T>
        ) : null}
      </View>
      {!compact ? <Radio on={selected} style={{ marginTop: 2 }} /> : null}
    </Pressable>
  );
}

export function Radio({ on, style }) {
  return <View style={[{ width: 24, height: 24, borderRadius: 12, borderWidth: on ? 7 : 2, borderColor: on ? colors.action : "#9AA6BF", backgroundColor: colors.surface }, style]} />;
}

// Tappable pick row: title · optional grey tag (unit) · chevron (✓ when selected).
//   <Group><PickRow title="Pipe" tag="m" selected onPress /></Group>
export function PickRow({ title, sub, tag, selected, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!selected }} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: sizes.row, paddingLeft: 16, paddingRight: 14, paddingVertical: 8, backgroundColor: selected || pressed ? colors.tintBlueSoft : colors.surface })}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T variant="rowTitle" weight={500} numberOfLines={1}>
          {title}
        </T>
        {sub ? (
          <T variant="caption" weight={400} numberOfLines={1}>
            {sub}
          </T>
        ) : null}
      </View>
      {tag ? (
        <View style={{ height: 26, paddingHorizontal: 9, borderRadius: radius.s, backgroundColor: colors.specChip, justifyContent: "center" }}>
          <T variant="caption" weight={600}>
            {tag}
          </T>
        </View>
      ) : null}
      <Icon name={selected ? "check" : "chevronRight"} size={20} color={selected ? "action" : "chevron"} />
    </Pressable>
  );
}
