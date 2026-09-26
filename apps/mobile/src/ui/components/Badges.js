import React from "react";
import { View } from "react-native";

import { colors, radius, statusStyles, tradeStyles } from "../theme";
import { T } from "./Text";
import { Icon } from "./Icon";

// Estimate status: dot + word on a tint.  <StatusBadge status="Draft" />
export function StatusBadge({ status, size = "m" }) {
  const s = statusStyles[status] || statusStyles.Completed;
  const h = size === "l" ? 28 : 24;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, height: h, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: s.bg, alignSelf: "flex-start" }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: s.dot }} />
      <T variant="caption" weight={600} color={s.fg}>
        {status}
      </T>
    </View>
  );
}

// Trade pill with icon. iconOnly → 24px round.
export function TradePill({ trade, iconOnly }) {
  const s = tradeStyles[trade] || tradeStyles.Plumbing;
  if (iconOnly) {
    return (
      <View accessibilityLabel={trade} style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: s.bg, alignItems: "center", justifyContent: "center" }}>
        <Icon name={s.icon} size={14} color={s.fg} />
      </View>
    );
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 24, paddingLeft: 7, paddingRight: 9, borderRadius: radius.pill, backgroundColor: s.bg }}>
      <Icon name={s.icon} size={14} color={s.fg} />
      <T variant="caption" color={s.fg}>
        {trade}
      </T>
    </View>
  );
}

// Size / core spec chip ("40 mm", "4C").
export function SpecChip({ children }) {
  return (
    <View style={{ height: 26, paddingHorizontal: 9, borderRadius: radius.s, backgroundColor: colors.specChip, borderWidth: 1, borderColor: colors.border, justifyContent: "center" }}>
      <T variant="label" weight={600} color="blue700" num>
        {children}
      </T>
    </View>
  );
}

// Small uppercase tag ("EDITED").
export function Tag({ children, bg = colors.tintBlue, color = "#1F4E86" }) {
  return (
    <View style={{ height: 20, paddingHorizontal: 7, borderRadius: radius.xs, backgroundColor: bg, justifyContent: "center" }}>
      <T variant="tag" color={color}>
        {children}
      </T>
    </View>
  );
}

// Count pill ("2 low", "1 out").
export function CountPill({ children, tone = "warning" }) {
  const map = { warning: [colors.warningTint, colors.warningInk], danger: [colors.dangerTint, colors.dangerInk], success: [colors.successTint, colors.successInk], info: [colors.tintBlue, colors.blue700] };
  const [bg, fg] = map[tone] || map.info;
  return (
    <View style={{ height: 24, paddingHorizontal: 8, borderRadius: 12, backgroundColor: bg, justifyContent: "center" }}>
      <T variant="caption" weight={600} color={fg}>
        {children}
      </T>
    </View>
  );
}

// Role pill (Owner = navy solid, others soft).
export function RolePill({ role, label }) {
  const owner = role === "owner";
  return (
    <View style={{ height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: owner ? colors.navy : "#E9ECF2", justifyContent: "center" }}>
      <T variant="caption" weight={600} color={owner ? colors.white : colors.muted}>
        {label}
      </T>
    </View>
  );
}
