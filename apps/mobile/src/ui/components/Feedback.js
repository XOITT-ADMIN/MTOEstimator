import React, { useEffect, useRef } from "react";
import { View, Pressable, Animated } from "react-native";

import { colors, radius, shadow } from "../theme";
import { T } from "./Text";
import { Icon } from "./Icon";
import { Button } from "./Button";

// Red "NOT SAVED" toast. Tap to dismiss.
export function ErrorToast({ title = "NOT SAVED", message, onDismiss }) {
  return (
    <Pressable onPress={onDismiss} accessibilityRole="alert" style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.l, backgroundColor: colors.danger, ...shadow.toast }}>
      <Icon name="alert" size={22} color="white" />
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="overline" weight={700} color="white">
          {title}
        </T>
        <T variant="sub" color="white">
          {message}
        </T>
      </View>
      <T variant="caption" weight={400} color="rgba(255,255,255,0.85)">
        Tap to dismiss
      </T>
    </Pressable>
  );
}

// Navy success toast ("Added Pipe · PVC · 40 mm · 1 m").
export function SuccessToast({ message }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, minHeight: 56, borderRadius: radius.l, backgroundColor: colors.navy, ...shadow.raised }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" }}>
        <Icon name="check" size={16} color="white" />
      </View>
      <T variant="sub" color="white" style={{ flex: 1 }}>
        {message}
      </T>
    </View>
  );
}

// Amber offline banner ("Offline · 3 changes will sync when you're back online").
export function OfflineBanner({ pending = 0 }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.l, backgroundColor: colors.warningTint, borderWidth: 1, borderColor: colors.warningBorder }}>
      <Icon name="wifiOff" size={18} color="warningInk" />
      <T variant="label" color="warningInk" style={{ flex: 1 }}>
        <T variant="label" weight={600} color="warningInk">
          Offline
        </T>
        {pending ? ` · ${pending} change${pending === 1 ? "" : "s"} will sync when you're back online` : " · showing your last saved copy"}
      </T>
    </View>
  );
}

// Sync status chip ("All changes saved" / "Offline · 3 waiting" / "Saving…").
export function SyncChip({ state = "saved", pending = 0 }) {
  const map = {
    saved: { bg: colors.successTint, fg: colors.successInk, icon: "cloudCheck", text: "All changes saved" },
    saving: { bg: colors.tintBlue, fg: colors.blue700, icon: "refresh", text: `Saving ${pending} change${pending === 1 ? "" : "s"}…` },
    offline: { bg: colors.warningTint, fg: colors.warningInk, icon: "wifiOff", text: pending ? `Offline · ${pending} waiting` : "Offline" },
    local: { bg: "#E9ECF2", fg: colors.muted, icon: "lock", text: "On this device only" },
  };
  const s = map[state] || map.saved;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 28, paddingLeft: 8, paddingRight: 10, borderRadius: 14, backgroundColor: s.bg, alignSelf: "flex-start" }}>
      <Icon name={s.icon} size={16} color={s.fg} />
      <T variant="caption" weight={600} color={s.fg}>
        {s.text}
      </T>
    </View>
  );
}

// Soft blue info strip ("Set by your admin. You can look, not change.").
export function Notice({ icon = "lock", children, tone = "info", style }) {
  const t = tone === "warning" ? [colors.warningTint, colors.warningInk] : tone === "danger" ? [colors.dangerTint, colors.dangerInk] : ["#E9EFF7", colors.blue700];
  return (
    <View style={[{ flexDirection: "row", gap: 8, alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.m, backgroundColor: t[0] }, style]}>
      <Icon name={icon} size={18} color={t[1]} />
      <T variant="label" color={t[1]} style={{ flex: 1 }}>
        {children}
      </T>
    </View>
  );
}

// Friendly empty state: dashed icon tile, one line, one action.
export function EmptyState({ icon = "fileText", title, body, action, onAction, style }) {
  return (
    <View style={[{ alignItems: "center", gap: 10, paddingVertical: 28, paddingHorizontal: 20 }, style]}>
      <View style={{ width: 88, height: 88, borderRadius: 24, backgroundColor: colors.tintBlue, borderWidth: 1.5, borderStyle: "dashed", borderColor: "#9FBBDD", alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={38} color="blue700" />
      </View>
      <T variant="cardTitle" center style={{ marginTop: 6 }}>
        {title}
      </T>
      {body ? (
        <T variant="sub" center style={{ lineHeight: 21 }}>
          {body}
        </T>
      ) : null}
      {action ? <Button title={action} onPress={onAction} style={{ marginTop: 8, paddingHorizontal: 24 }} /> : null}
    </View>
  );
}

// Error state with retry.
export function ErrorState({ title, body, onRetry }) {
  return (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 28, paddingHorizontal: 20 }}>
      <View style={{ width: 88, height: 88, borderRadius: 24, backgroundColor: colors.dangerTint, alignItems: "center", justifyContent: "center" }}>
        <Icon name="alert" size={38} color="danger" />
      </View>
      <T variant="cardTitle" center style={{ marginTop: 6 }}>
        {title}
      </T>
      {body ? <T variant="sub" center>{body}</T> : null}
      {onRetry ? <Button title="Try again" icon="refresh" onPress={onRetry} style={{ marginTop: 8, paddingHorizontal: 24 }} /> : null}
    </View>
  );
}

// Pulsing grey block for loading states.
export function Skeleton({ width = "100%", height = 16, radius: r = 8, style }) {
  const a = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(a, { toValue: 0.45, duration: 700, useNativeDriver: true }), Animated.timing(a, { toValue: 1, duration: 700, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [a]);
  return <Animated.View style={[{ width, height, borderRadius: r, backgroundColor: colors.skeleton, opacity: a }, style]} />;
}

// Round initials avatar.
export function Avatar({ name, size = 48, tone = "navy" }) {
  const initials = (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const solid = tone === "navy";
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: solid ? colors.navy : colors.tintBlue, alignItems: "center", justifyContent: "center" }}>
      <T weight={600} size={size * 0.36} color={solid ? colors.white : colors.blue700}>
        {initials || "?"}
      </T>
    </View>
  );
}

// Initials in a rounded square (company tile).
export function InitialsTile({ name, size = 48, dark }) {
  const initials = (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  return (
    <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: dark ? "rgba(255,255,255,0.12)" : colors.tintBlue, alignItems: "center", justifyContent: "center" }}>
      <T weight={600} size={size * 0.34} color={dark ? colors.white : colors.blue700}>
        {initials}
      </T>
    </View>
  );
}
