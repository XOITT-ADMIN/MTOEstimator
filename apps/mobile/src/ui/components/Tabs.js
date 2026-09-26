import React from "react";
import { Pressable, View, ScrollView } from "react-native";

import { colors, radius } from "../theme";
import { T } from "./Text";

// Underline tabs (Details · Items 4 · Summary). tabs: [{ key, label, count }]
export function Tabs({ tabs, active, onChange, scroll, style }) {
  const items = tabs.map((t) => {
    const on = t.key === active;
    return (
      <Pressable
        key={t.key}
        onPress={() => onChange(t.key)}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        style={{ height: 48, paddingHorizontal: scroll ? 12 : 0, flexGrow: scroll ? 0 : 1, flexShrink: scroll ? 0 : 1, flexBasis: scroll ? "auto" : 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderBottomWidth: 3, borderBottomColor: on ? colors.action : "transparent" }}
      >
        <T variant="body" weight={on ? 600 : 500} color={on ? "navy" : "muted"}>
          {t.label}
        </T>
        {t.count != null ? (
          <T variant="caption" weight={400} num>
            {t.count}
          </T>
        ) : null}
      </Pressable>
    );
  });
  if (scroll) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[{ flexGrow: 0 }, style]} contentContainerStyle={{ paddingHorizontal: 8, gap: 4 }}>
        {items}
      </ScrollView>
    );
  }
  return <View style={[{ flexDirection: "row" }, style]}>{items}</View>;
}

// Segmented toggle (Trade | Family, Plumbing | Electrical).
export function Segmented({ options, value, onChange, size = "m", style }) {
  const h = size === "l" ? 48 : 42;
  return (
    <View accessibilityRole="tablist" style={[{ flexDirection: "row", padding: 3, borderRadius: radius.m, backgroundColor: "#E3E9F2" }, style]}>
      {options.map((o) => {
        const key = o.key ?? o;
        const label = o.label ?? o;
        const on = key === value;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{
              flexGrow: size === "l" ? 1 : 0,
              flexBasis: size === "l" ? 0 : "auto",
              height: h,
              paddingHorizontal: 12,
              borderRadius: 9,
              backgroundColor: on ? colors.surface : "transparent",
              alignItems: size === "l" ? "flex-start" : "center",
              justifyContent: "center",
              shadowColor: colors.ink,
              shadowOpacity: on ? 0.15 : 0,
              shadowRadius: 3,
              shadowOffset: { width: 0, height: 1 },
              elevation: on ? 1 : 0,
            }}
          >
            <T variant={size === "l" ? "body" : "label"} weight={600} color={on ? "navy" : "muted"}>
              {label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}
