import React from "react";
import { View } from "react-native";
import Svg, { Defs, Pattern, Path, Rect } from "react-native-svg";

import { colors, radius as R } from "../theme";

// Navy panel with the blueprint grid (96px major / 16px minor lines).
// Only used on navy hero areas: splash, sign-in, value card, grand total, team header.
export function Blueprint({ children, style, radius = 0, fill }) {
  const id = React.useId ? React.useId().replace(/:/g, "") : "bp";
  return (
    <View style={[{ backgroundColor: colors.navy, borderRadius: radius, overflow: "hidden" }, fill && { flex: 1 }, style]}>
      <Svg style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%" pointerEvents="none">
        <Defs>
          <Pattern id={`m${id}`} width={16} height={16} patternUnits="userSpaceOnUse">
            <Path d="M16 0H0V16" fill="none" stroke={colors.gridMinor} strokeWidth={1} />
          </Pattern>
          <Pattern id={`M${id}`} width={96} height={96} patternUnits="userSpaceOnUse">
            <Rect width={96} height={96} fill={`url(#m${id})`} />
            <Path d="M96 0H0V96" fill="none" stroke={colors.gridMajor} strokeWidth={1} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#M${id})`} />
      </Svg>
      {children}
    </View>
  );
}

export const heroRadius = R.xxl;
