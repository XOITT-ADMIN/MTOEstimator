import React from "react";
import { View, Pressable } from "react-native";

import { T, Icon, colors, radius, tradeStyles } from "../ui";

// Trade card with a checkbox (New estimate: "Trades in this job").
export function TradeToggle({ trade, on, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!on }}
      style={({ pressed }) => ({
        flex: 1,
        height: 64,
        paddingHorizontal: 14,
        borderRadius: radius.l,
        borderWidth: on ? 2 : 1.5,
        borderColor: on ? colors.action : colors.border,
        backgroundColor: on ? "#F4F8FD" : colors.surface,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.tintBlue, alignItems: "center", justifyContent: "center" }}>
        <Icon name={tradeStyles[trade]?.icon || "droplet"} size={20} color="blue700" />
      </View>
      <T variant="rowTitle" color="navy" style={{ flex: 1 }}>
        {trade}
      </T>
      <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: on ? colors.action : colors.surface, borderWidth: on ? 0 : 2, borderColor: "#9AA6BF", alignItems: "center", justifyContent: "center" }}>
        {on ? <Icon name="check" size={16} color="white" /> : null}
      </View>
    </Pressable>
  );
}
