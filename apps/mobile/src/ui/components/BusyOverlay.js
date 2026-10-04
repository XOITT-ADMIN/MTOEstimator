import React, { useEffect, useRef, useState } from "react";
import { View, Animated, Easing, Modal } from "react-native";

import { busy } from "../../api/client";
import { T } from "./Text";

const BARS = 5;
const MIN_VISIBLE_MS = 350; // once shown, stay long enough to be read, not flash

// The app's loader: a row of bars that rise and fall in a wave (not a circle).
export function WaveBars({ color = "#FFFFFF" }) {
  const values = useRef(Array.from({ length: BARS }, () => new Animated.Value(0.35))).current;

  useEffect(() => {
    const loops = values.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 110),
          Animated.timing(v, { toValue: 1, duration: 360, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.35, duration: 360, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.delay((BARS - 1 - i) * 110),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [values]);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", height: 40, gap: 6 }}>
      {values.map((v, i) => (
        <Animated.View key={i} style={{ width: 6, height: 40, borderRadius: 3, backgroundColor: color, transform: [{ scaleY: v }] }} />
      ))}
    </View>
  );
}

// One loader for the whole app, centred over everything (sheets and dialogs included). Shown
// from the moment any API request starts — see `busy` in api/client.js — and blocks taps so an
// action can't be fired twice.
export function BusyOverlay() {
  const [active, setActive] = useState(busy.isBusy());
  const [show, setShow] = useState(busy.isBusy());
  const shownAt = useRef(busy.isBusy() ? Date.now() : 0);

  useEffect(() => busy.subscribe(setActive), []);
  useEffect(() => {
    if (active) {
      if (!show) shownAt.current = Date.now();
      setShow(true);
      return undefined;
    }
    const left = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt.current));
    const t = setTimeout(() => setShow(false), left);
    return () => clearTimeout(t);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!show) return null;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => {}}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15, 30, 55, 0.25)" }}>
        <View style={{ alignItems: "center", gap: 14, paddingHorizontal: 34, paddingVertical: 26, borderRadius: 16, backgroundColor: "rgba(15, 30, 55, 0.9)" }}>
          <WaveBars />
          <T variant="label" weight={600} color="white">
            Please wait…
          </T>
        </View>
      </View>
    </Modal>
  );
}
