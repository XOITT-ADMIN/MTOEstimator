import React from "react";
import { View, Pressable } from "react-native";

import { T, Icon, SpecChip, SwipeRow, colors, radius } from "../../ui";
import { money, specChips } from "../estimates";
import { calculateItemMaterialTotal, calculateItemLabourTotal, calculateItemTotal } from "../../pricing/calculations";

// Stock problem for this line, or null. `availability.available` already counts this line.
export function stockProblem(it, availability) {
  if (!availability) return null;
  const qty = Number(it.qty) || 0;
  if (availability.available >= 0) return null;
  const had = Math.max(0, Math.round((availability.available + qty) * 100) / 100);
  return { out: had <= 0, text: `${had <= 0 ? "Out of stock" : "Not enough stock"} · ${had} of ${qty} ${it.unit} available` };
}

// One take-off line (Items tab). Tap to edit; swipe for Duplicate / Remove.
export function LineCard({ it, availability, onPress, onDuplicate, onRemove }) {
  const problem = stockProblem(it, availability);
  const labour = Number(it.labourRate) ? ` + ${money(it.labourRate)} labour` : "";
  const actions = onRemove
    ? [
        { label: "Duplicate", icon: "copy", onPress: onDuplicate },
        { label: "Remove", icon: "trash", tone: "danger", onPress: onRemove },
      ]
    : [];
  return (
    <View style={{ borderRadius: radius.l, borderWidth: 1, borderColor: problem ? colors.dangerBorder : colors.border, backgroundColor: colors.surface, overflow: "hidden" }}>
      <SwipeRow actions={actions}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${it.item} ${it.material}, ${money(calculateItemTotal(it))}`}
          style={({ pressed }) => ({ padding: 14, gap: 8, minHeight: 64, backgroundColor: pressed ? colors.tintBlueSoft : colors.surface })}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
            <T variant="rowTitle" numberOfLines={1} style={{ flex: 1 }}>
              {it.item} · {it.material}
            </T>
            <T variant="rowTitle" num>
              {money(calculateItemTotal(it))}
            </T>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <View style={{ flexDirection: "row", gap: 6, flexShrink: 1, flexWrap: "wrap" }}>
              {specChips(it).map((c) => (
                <SpecChip key={c}>{c}</SpecChip>
              ))}
            </View>
            <T variant="caption" weight={400} num>
              M {money(calculateItemMaterialTotal(it), false)} · L {money(calculateItemLabourTotal(it), false)}
            </T>
          </View>
          <T variant="label" weight={400} num>
            {it.qty} {it.unit} × {money(it.materialRate)}
            {labour}
          </T>
          {it.remarks ? (
            <T variant="caption" weight={400} numberOfLines={1} style={{ fontStyle: "italic" }}>
              {it.remarks}
            </T>
          ) : null}
          {problem ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.dangerTint }}>
              <Icon name="alert" size={16} color="dangerInk" />
              <T variant="label" weight={600} color="dangerInk" style={{ flex: 1 }}>
                {problem.text}
              </T>
            </View>
          ) : null}
        </Pressable>
      </SwipeRow>
    </View>
  );
}
