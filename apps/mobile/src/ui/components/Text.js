import React from "react";
import { Text as RNText } from "react-native";

import { colors, fonts, type } from "../theme";

// <T variant="rowTitle">Pipe · PVC</T>
//   variant  one of theme.type (display, title, heading, cardTitle, rowTitle, body, sub, label, caption, overline, tag)
//   color    a colors.* key ("muted", "danger", "onNavy") or any colour string
//   weight   400 | 500 | 600 | 700 to override the variant
//   size     font size override
//   num      tabular figures for money and quantities
export function T({ variant = "body", color, weight, size, num, center, upper, style, children, ...rest }) {
  const v = type[variant] || type.body;
  const w = weight || v.weight;
  const c = color ? colors[color] || color : colors[v.color] || colors.text;
  const fs = size || v.size;
  return (
    <RNText
      {...rest}
      style={[
        {
          fontFamily: fonts[w] || fonts[400],
          fontSize: fs,
          lineHeight: size ? Math.round(size * 1.35) : v.line,
          color: c,
          letterSpacing: v.letterSpacing || 0,
        },
        num && { fontVariant: ["tabular-nums"] },
        center && { textAlign: "center" },
        style,
      ]}
    >
      {upper || v.upper ? (typeof children === "string" ? children.toUpperCase() : children) : children}
    </RNText>
  );
}

export default T;
