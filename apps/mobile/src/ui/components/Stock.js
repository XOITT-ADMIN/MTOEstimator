import React from "react";
import { View } from "react-native";

import { colors, radius } from "../theme";
import { T } from "./Text";
import { Icon } from "./Icon";
import { formatINR } from "../../utils/currency";

// Stock health for one line: "out" (0 left), "low" (< 25% left) or "ok".
export function stockLevel(available, stock) {
  if (available <= 0) return "out";
  if (stock > 0 && available < stock * 0.25) return "low";
  return "ok";
}

const BAR = { ok: colors.blue600, low: colors.warning, out: colors.danger };
const TEXT = { ok: colors.text, low: colors.warningText, out: colors.dangerInk };

// Thin progress bar (share of stock still available).
export function StockBar({ available, stock, height = 6 }) {
  const level = stockLevel(available, stock);
  const pct = stock > 0 ? Math.max(0, Math.min(1, available / stock)) : 0;
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: "#E3E9F2", overflow: "hidden", flexDirection: "row" }}>
      <View style={{ width: `${pct * 100}%`, backgroundColor: BAR[level] }} />
    </View>
  );
}

// Stock-library row: "PVC · 40 mm" / "4 m left" / bar / "stock 10 · used 6".
export function StockLine({ title, available, stock, used, unit, price }) {
  const level = stockLevel(available, stock);
  const fmt = (n) => String(Math.round(n * 100) / 100);
  return (
    <View style={{ gap: 6, paddingVertical: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <T variant="rowTitle" size={15} num numberOfLines={1} style={{ flex: 1 }}>
          {title}
        </T>
        <T variant="rowTitle" size={15} num color={TEXT[level]}>
          {level === "out" ? "OUT OF STOCK" : `${fmt(available)} ${unit} left`}
        </T>
      </View>
      <StockBar available={available} stock={stock} />
      <T variant="caption" weight={400} num>
        stock {fmt(stock)} · used {fmt(used)}
        {Number(price) > 0 ? ` · ${formatINR(price, { decimals: !Number.isInteger(Number(price)) })}/${unit}` : ""}
        {level === "low" ? " · under 25%" : ""}
      </T>
    </View>
  );
}

// Stock card on the quantity step: shows what's left after this line.
export function StockCard({ label, available, used, stock, unit, qty }) {
  const after = Math.round((available - (Number(qty) || 0)) * 100) / 100;
  const short = after < 0;
  const tone = short
    ? { border: colors.dangerBorder, bg: "#FCF1EF", fg: colors.dangerInk, title: "NOT ENOUGH" }
    : after < stock * 0.25
      ? { border: colors.warningBorder, bg: "#FFF8EC", fg: colors.warningInk, title: "RUNNING LOW" }
      : { border: "#BFE0D1", bg: "#F1FAF6", fg: colors.successInk, title: "IN STOCK" };
  const usedPct = stock > 0 ? Math.min(1, used / stock) : 0;
  const thisPct = stock > 0 ? Math.max(0, Math.min(1 - usedPct, (Number(qty) || 0) / stock)) : 0;
  const fmt = (n) => String(Math.round(n * 100) / 100);
  return (
    <View style={{ borderRadius: radius.l, borderWidth: 1.5, borderColor: tone.border, backgroundColor: tone.bg, padding: 14, gap: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="overline" color={tone.fg}>
            {`${label} · ${tone.title}`}
          </T>
          <T variant="sub" color="text" num>
            {fmt(Math.max(0, available))} {unit} available · {fmt(used)} used of {fmt(stock)}
          </T>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <T size={22} weight={700} color={tone.fg} num style={{ lineHeight: 26 }}>
            {fmt(after)}
          </T>
          <T variant="overline" size={11} color={tone.fg}>
            LEFT AFTER
          </T>
        </View>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: "#E3E9F2", overflow: "hidden", flexDirection: "row" }}>
        <View style={{ width: `${usedPct * 100}%`, backgroundColor: "#8A94AD" }} />
        <View style={{ width: `${(short ? 1 - usedPct : thisPct) * 100}%`, backgroundColor: short ? colors.danger : colors.success }} />
      </View>
      {short ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name="alert" size={16} color="danger" />
          <T variant="label" weight={600} color="dangerInk">
            Only {fmt(Math.max(0, available))} {unit} left — you asked for {fmt(Number(qty) || 0)}.
          </T>
        </View>
      ) : null}
    </View>
  );
}
