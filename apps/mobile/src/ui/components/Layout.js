import React from "react";
import { View, ScrollView, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, sizes } from "../theme";
import { T } from "./Text";
import { IconButton } from "./Button";

// Full-screen page on the canvas background.
//   <Screen title="Estimates" count={3} right={…} footer={<BottomBar>…</BottomBar>}>…</Screen>
//   scroll=false when the page manages its own list.
//   loading=true shows a centered spinner instead of children.
export function Screen({ children, title, count, subtitle, right, header, footer, scroll = true, tabBar, padded = true, bg = colors.canvas, contentStyle, refreshControl, keyboard, loading }) {
  const insets = useSafeAreaInsets();
  const top = Math.max(insets.top, 12) + 12;
  const head = header ?? (title ? <LargeTitle title={title} count={count} subtitle={subtitle} right={right} /> : null);
  const bottomPad = (tabBar ? sizes.tabBar + 16 : 24) + (footer ? 0 : insets.bottom);

  if (loading) {
    const Wrap = keyboard ? KeyboardAvoidingView : View;
    return (
      <Wrap style={{ flex: 1, backgroundColor: bg }} {...(keyboard ? { behavior: Platform.OS === "ios" ? "padding" : undefined } : {})}>
        {head ? <View style={{ paddingTop: top, paddingHorizontal: padded ? sizes.screenX : 0 }}>{head}</View> : null}
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.action} />
        </View>
        {footer}
      </Wrap>
    );
  }

  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[{ paddingTop: title ? 0 : top, paddingHorizontal: padded ? sizes.screenX : 0, paddingBottom: bottomPad, gap: 0 }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      {title ? <View style={{ paddingTop: top }}>{head}</View> : head}
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, paddingTop: title || header ? 0 : top }, contentStyle]}>
      {title ? <View style={{ paddingTop: top, paddingHorizontal: sizes.screenX }}>{head}</View> : head}
      {children}
    </View>
  );
  const Wrap = keyboard ? KeyboardAvoidingView : View;
  return (
    <Wrap style={{ flex: 1, backgroundColor: bg }} {...(keyboard ? { behavior: Platform.OS === "ios" ? "padding" : undefined } : {})}>
      {body}
      {footer}
    </Wrap>
  );
}

// "Estimates 3" page title with optional subtitle and right slot.
export function LargeTitle({ title, count, subtitle, right }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <T variant="title" accessibilityRole="header">
            {title}
          </T>
          {count != null ? (
            <T variant="body" size={16} color="muted" num>
              {count}
            </T>
          ) : null}
        </View>
        {subtitle ? <T variant="sub">{subtitle}</T> : null}
      </View>
      {right}
    </View>
  );
}

// White top bar for pushed screens: back · eyebrow + title · action.
//   plain → on the canvas, no border, bigger title (Team).
export function TopBar({ title, eyebrow, onBack, right, children, border = true, plain }) {
  const insets = useSafeAreaInsets();
  if (plain) border = false;
  return (
    <View style={{ backgroundColor: plain ? colors.canvas : colors.surface, borderBottomWidth: border ? 1 : 0, borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 12) + 4, paddingHorizontal: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 56 }}>
        {onBack ? <IconButton icon="chevronLeft" label="Back" onPress={onBack} /> : <View style={{ width: 12 }} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          {eyebrow}
          {typeof title === "string" ? (
            <T variant={plain ? "heading" : "rowTitle"} size={plain ? undefined : 17} color="navy" numberOfLines={1}>
              {title}
            </T>
          ) : (
            title
          )}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

// Sticky footer on white with a hairline (totals + primary action).
export function BottomBar({ children, style }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: sizes.screenX, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 8, gap: 10 }, style]}>
      {children}
    </View>
  );
}

// Overline section label with an optional action on the right ("RECENT · See all").
export function Section({ title, action, onAction, children, style, gap = 10 }) {
  return (
    <View style={[{ gap, marginTop: 24 }, style]}>
      {title ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, minHeight: 24 }}>
          <T variant="overline">{title}</T>
          {action ? (
            <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button" style={{ minHeight: 40, justifyContent: "center" }}>
              <T variant="sub" weight={600} color="blue700">
                {action}
              </T>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function RowBetween({ children, style, align = "center" }) {
  return <View style={[{ flexDirection: "row", justifyContent: "space-between", alignItems: align, gap: 8 }, style]}>{children}</View>;
}

export function HStack({ children, gap = 8, style, align = "center", wrap }) {
  return <View style={[{ flexDirection: "row", alignItems: align, gap, flexWrap: wrap ? "wrap" : "nowrap" }, style]}>{children}</View>;
}

export function VStack({ children, gap = 8, style }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}
