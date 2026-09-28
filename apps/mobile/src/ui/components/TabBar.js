import React from "react";
import { View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, sizes } from "../theme";
import { T } from "./Text";
import { Icon } from "./Icon";
import { Fab } from "./Button";

// Bottom tab bar: Inbox · MTOs · (+ FAB) · Library · Settings.
// Active tab: Blue 700 label on a Blue-500-tint pill. Works as a React Navigation tabBar.
// Route names stay as they were (Home, Estimates, …) — only the label shown here changed.
export const TAB_ICONS = { Home: "home", Estimates: "fileText", Library: "layers", Settings: "settings" };
export const TAB_LABELS = { Home: "Inbox", Estimates: "MTOs" };

export function TabBar({ state, navigation, onFab }) {
  const insets = useSafeAreaInsets();
  const routes = state.routes;
  const mid = Math.ceil(routes.length / 2);
  const item = (route, index) => {
    const focused = state.index === index;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={route.name}
        onPress={() => {
          const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
        }}
        style={{ flex: 1, height: 66, alignItems: "center", justifyContent: "center", gap: 2 }}
      >
        <View style={{ width: 52, height: 30, borderRadius: 15, backgroundColor: focused ? colors.tintBlue : "transparent", alignItems: "center", justifyContent: "center" }}>
          <Icon name={TAB_ICONS[route.name] || "home"} size={22} color={focused ? "blue700" : "muted"} />
        </View>
        <T variant="caption" weight={focused ? 600 : 500} color={focused ? "blue700" : "muted"}>
          {TAB_LABELS[route.name] || route.name}
        </T>
      </Pressable>
    );
  };
  return (
    <View style={{ height: sizes.tabBar - 22 + Math.max(insets.bottom, 12), paddingBottom: Math.max(insets.bottom, 12), paddingHorizontal: 4, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row" }}>
      {routes.slice(0, mid).map((r, i) => item(r, i))}
      <View style={{ flex: 1, alignItems: "center" }}>
        <Fab onPress={onFab} style={{ marginTop: -20 }} />
      </View>
      {routes.slice(mid).map((r, i) => item(r, i + mid))}
    </View>
  );
}
