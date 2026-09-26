import React, { useRef } from "react";
import { View, Pressable, Animated, PanResponder } from "react-native";

import { colors } from "../theme";
import { T } from "./Text";
import { Icon } from "./Icon";

const W = 84;

// Swipe a row left to reveal actions (Duplicate · Delete). The row itself stays tappable.
//   <SwipeRow actions={[{ label:"Duplicate", icon:"copy", onPress }, { label:"Delete", icon:"trash", tone:"danger", onPress }]}>
export function SwipeRow({ children, actions = [] }) {
  const x = useRef(new Animated.Value(0)).current;
  const open = useRef(false);
  const width = W * actions.length;
  const to = (v) => {
    open.current = v !== 0;
    Animated.spring(x, { toValue: v, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
  };
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => x.setValue(Math.max(-width, Math.min(0, (open.current ? -width : 0) + g.dx))),
      onPanResponderRelease: (_, g) => to((open.current ? -width : 0) + g.dx < -width / 2 ? -width : 0),
      onPanResponderTerminate: () => to(open.current ? -width : 0),
    })
  ).current;
  return (
    <View style={{ overflow: "hidden" }}>
      <View style={{ position: "absolute", top: 0, bottom: 0, right: 0, flexDirection: "row" }}>
        {actions.map((a) => (
          <Pressable
            key={a.label}
            onPress={() => {
              to(0);
              a.onPress?.();
            }}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            style={{ width: W, backgroundColor: a.tone === "danger" ? colors.danger : colors.blue700, alignItems: "center", justifyContent: "center", gap: 4 }}
          >
            <Icon name={a.icon} size={22} color="white" />
            <T variant="caption" weight={600} color="white">
              {a.label}
            </T>
          </Pressable>
        ))}
      </View>
      <Animated.View {...pan.panHandlers} style={{ backgroundColor: colors.surface, transform: [{ translateX: x }] }}>
        {children}
      </Animated.View>
    </View>
  );
}
