import React, { useEffect, useRef, useState } from "react";
import { Modal, View, Pressable, Animated, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius } from "../theme";
import { T } from "./Text";
import { Icon } from "./Icon";

const BACKDROP_COLOR = "rgba(21,24,51,0.55)";

const listeners = new Set();
let pending = null;

export function showDialog(config) {
  return new Promise((resolve) => {
    pending = { ...config, resolve };
    listeners.forEach((fn) => fn(pending));
  });
}

export function ConfirmDialog() {
  const [dialog, setDialog] = useState(null);
  const insets = useSafeAreaInsets();
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const handler = (d) => setDialog(d);
    listeners.add(handler);
    return () => listeners.delete(handler);
  }, []);

  useEffect(() => {
    if (dialog) {
      scaleAnim.setValue(0.9);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 300 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [dialog, scaleAnim, opacityAnim]);

  if (!dialog) return null;

  const { title, message, confirmText = "OK", cancelText = "Cancel", destructive = false, mode = "confirm", resolve } = dialog;
  const isNotify = mode === "notify";

  function dismiss(result) {
    Animated.parallel([
      Animated.timing(scaleAnim, { toValue: 0.92, duration: 150, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      setDialog(null);
      resolve(result);
    });
  }

  const iconName = destructive ? "alert" : isNotify ? "info" : "info";
  const accentColor = destructive ? colors.danger : colors.action;
  const accentTint = destructive ? colors.dangerTint : colors.tintBlue;
  const accentInk = destructive ? colors.dangerInk : colors.blue700;
  const screenWidth = Dimensions.get("window").width;
  const dialogWidth = Math.min(screenWidth - 48, 340);

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => dismiss(isNotify ? true : false)}>
      <Animated.View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: BACKDROP_COLOR, opacity: opacityAnim, paddingBottom: insets.bottom }}>
        <Pressable style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => dismiss(isNotify ? true : false)} />

        <Animated.View style={{ width: dialogWidth, backgroundColor: colors.surface, borderRadius: 20, overflow: "hidden", transform: [{ scale: scaleAnim }], shadowColor: colors.navy, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 28, elevation: 20 }}>
          {/* Icon header */}
          <View style={{ alignItems: "center", paddingTop: 28, paddingBottom: 4 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: accentTint, alignItems: "center", justifyContent: "center" }}>
              <Icon name={iconName} size={28} color={accentInk} />
            </View>
          </View>

          {/* Content */}
          <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24, alignItems: "center" }}>
            <T variant="cardTitle" center style={{ lineHeight: 24 }}>{title}</T>
            {message ? (
              <T variant="sub" center style={{ marginTop: 8, lineHeight: 21 }}>{message}</T>
            ) : null}
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: colors.borderSoft }} />

          {/* Buttons */}
          {isNotify ? (
            <DialogButton label="OK" color={colors.action} onPress={() => dismiss(true)} />
          ) : (
            <View>
              <DialogButton label={confirmText} color={accentColor} bold onPress={() => dismiss(true)} />
              <View style={{ height: 1, backgroundColor: colors.borderSoft }} />
              <DialogButton label={cancelText} color={colors.muted} onPress={() => dismiss(false)} />
            </View>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function DialogButton({ label, color, bold, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        minHeight: 52,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 20,
        backgroundColor: pressed ? colors.tintBlueSoft : "transparent",
      })}
    >
      <T size={16} weight={bold ? 600 : 500} style={{ color }}>{label}</T>
    </Pressable>
  );
}
