import React from "react";
import { Modal, View, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, sizes } from "../theme";
import { T } from "./Text";
import { IconButton } from "./Button";

// Bottom sheet: 24px top radius, grab handle, title + subtitle, close top-right.
//   <Sheet visible title="Add item" subtitle="Step 1 of 4 · Item" onClose={…} footer={…}>…</Sheet>
//   inline=true renders without a Modal (for screens that are themselves presented as a sheet).
export function Sheet({ visible = true, title, subtitle, onClose, children, footer, header, inline, maxHeight = "92%", full }) {
  const insets = useSafeAreaInsets();
  const card = (
    <View
      style={{
        backgroundColor: colors.canvas,
        borderTopLeftRadius: radius.sheet,
        borderTopRightRadius: radius.sheet,
        maxHeight: full ? "100%" : maxHeight,
        height: full ? "94%" : undefined,
        overflow: "hidden",
        shadowColor: colors.ink,
        shadowOpacity: 0.25,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: -8 },
        elevation: 16,
      }}
    >
      <View style={{ alignItems: "center", paddingTop: 8 }}>
        <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: "#C3CEDF" }} />
      </View>
      {title ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: sizes.screenX, paddingRight: 12, paddingTop: 2 }}>
          <View style={{ flex: 1 }}>
            <T variant="heading">{title}</T>
            {subtitle ? <T variant="label" weight={400}>{subtitle}</T> : null}
          </View>
          {onClose ? <IconButton icon="close" label="Close" onPress={onClose} /> : null}
        </View>
      ) : null}
      {header}
      <View style={full ? { flex: 1 } : { flexShrink: 1 }}>{children}</View>
      {footer ? (
        <View style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: sizes.screenX, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 10, gap: 10 }}>{footer}</View>
      ) : (
        <View style={{ height: Math.max(insets.bottom, 12) }} />
      )}
    </View>
  );
  if (inline) return <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: colors.backdrop }}>{card}</View>;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.backdrop }} onPress={onClose} accessibilityLabel="Close" />
        {card}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// 4-step progress for the Add item wizard. Tap a done step to go back to it.
export function StepProgress({ steps, current, onStep }) {
  return (
    <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: sizes.screenX }}>
      {steps.map((label, i) => {
        const done = i <= current;
        return (
          <Pressable key={label} onPress={() => i < current && onStep?.(i)} disabled={i >= current} accessibilityRole="button" accessibilityLabel={`Step ${i + 1}: ${label}`} style={{ flex: 1, height: 48, justifyContent: "center", gap: 6 }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: done ? colors.action : colors.border }} />
            <T variant="caption" weight={i === current ? 600 : 500} color={i === current ? "navy" : i < current ? "blue700" : "muted"} numberOfLines={1}>
              {label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}
