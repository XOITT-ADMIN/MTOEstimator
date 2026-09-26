import React from "react";
import { View, Image, Pressable, Linking } from "react-native";
import Svg, { Polygon } from "react-native-svg";

import { brand, colors } from "../theme";
import { T } from "./Text";

const XOITT = require("../../../assets/brand/xoitt-logo.png");

// The XOITT "X": a diagonal band plus two wedges.
export function XMark({ size = 30, onDark }) {
  const band = onDark ? colors.white : colors.navy;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Polygon points="68,4 98,4 34,96 4,96" fill={band} />
      <Polygon points="5,4 34,4 41,14 26,33" fill={colors.blue500} />
      <Polygon points="95,96 66,96 59,86 74,67" fill={colors.blue500} />
    </Svg>
  );
}

// "X MTO / MEP MATERIAL TAKE-OFF" lock-up, drawn (crisp at any size).
//   size = height of the X in px (splash 64, sign-in 40, small 28)
export function Logo({ size = 40, onDark, tagline = true, align = "flex-start" }) {
  const word = size * 0.93;
  return (
    <View style={{ alignItems: align, gap: size * 0.15 }} accessibilityLabel={`${brand.name} — ${brand.tagline}`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: size * 0.12 }}>
        <XMark size={size} onDark={onDark} />
        <T weight={700} size={word} style={{ lineHeight: word * 1.05, letterSpacing: word * 0.01 }} color={onDark ? colors.white : colors.navy}>
          MT<T weight={700} size={word} color={colors.blue500}>O</T>
        </T>
      </View>
      {tagline ? (
        <T weight={600} size={Math.max(9, size * 0.23)} color={onDark ? colors.onNavyFaint : colors.blue700} style={{ letterSpacing: Math.max(9, size * 0.23) * 0.26, lineHeight: Math.max(12, size * 0.3) }}>
          MEP MATERIAL TAKE-OFF
        </T>
      ) : null}
    </View>
  );
}

// "A product of XOIT" footer (links to xoitt.com).
export function MadeByXoitt({ style, onDark }) {
  return (
    <Pressable
      onPress={() => Linking.openURL(brand.makerUrl).catch(() => {})}
      accessibilityRole="link"
      accessibilityLabel={`A product of ${brand.maker}`}
      style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 6, opacity: pressed ? 0.7 : 1 }, style]}
    >
      <T variant="caption" weight={400} color={onDark ? colors.onNavyFaint : colors.faint}>
        A product of
      </T>
      <Image source={XOITT} style={{ height: 18, width: 18 * (545 / 206) }} resizeMode="contain" />
    </Pressable>
  );
}
