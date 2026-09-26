import React from "react";
import Svg, { Path, Circle, Rect } from "react-native-svg";

import { ICONS } from "../icons";
import { colors } from "../theme";

const EL = { path: Path, circle: Circle, rect: Rect };
const NUM = new Set(["cx", "cy", "r", "x", "y", "width", "height", "rx"]);

// <Icon name="plus" size={22} color="action" />  — 24×24 line icons, stroke 2.
export function Icon({ name, size = 22, color = "text", strokeWidth = 2, style }) {
  const parts = ICONS[name];
  if (!parts) return null;
  const stroke = colors[color] || color;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      {parts.map(([tag, attrs], i) => {
        const C = EL[tag];
        const props = {};
        Object.entries(attrs).forEach(([k, v]) => (props[k] = NUM.has(k) ? Number(v) : v));
        return <C key={i} {...props} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />;
      })}
    </Svg>
  );
}

export default Icon;
