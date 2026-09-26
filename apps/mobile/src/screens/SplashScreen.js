import React, { useEffect, useRef } from "react";
import { View, Animated, Easing } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Blueprint, Logo, T } from "../ui";

// Shown while the app restores the session. Navy blueprint, logo, one thin progress line.
export default function SplashScreen() {
  const insets = useSafeAreaInsets();
  const enter = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    Animated.loop(Animated.timing(bar, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.cubic), useNativeDriver: false })).start();
  }, [enter, bar]);

  return (
    <Blueprint fill>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 28 }}>
        <Animated.View style={{ alignItems: "center", gap: 22, opacity: enter, transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }, { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
          <Logo size={64} onDark align="center" />
          <T variant="body" color="onNavyMuted" center>
            Plumbing & electrical take-offs, on site
          </T>
        </Animated.View>
        <View style={{ width: 140, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.14)", overflow: "hidden" }}>
          <Animated.View style={{ height: 3, backgroundColor: "#4589CC", width: bar.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }} />
        </View>
      </View>
      <T variant="caption" weight={400} color="onNavyFaint" center style={{ position: "absolute", left: 0, right: 0, bottom: Math.max(insets.bottom, 16) + 28 }}>
        A XOITT Transformation product
      </T>
    </Blueprint>
  );
}
