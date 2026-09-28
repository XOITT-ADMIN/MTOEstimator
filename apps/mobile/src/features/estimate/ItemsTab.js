import React, { useMemo, useState } from "react";
import { View, ScrollView } from "react-native";

import { Card, T, SearchField, Segmented, Chip, ChipRow, EmptyState, colors } from "../../ui";
import { money, plural } from "../estimates";
import { LineCard } from "./LineCard";
import { calculateItemTotal } from "../../pricing/calculations";

// Items tab: trade totals, search + group-by, family chips, grouped line cards.
export function ItemsTab({ estimate, breakdown, getAvailability, canEdit, onEdit, onDuplicate, onRemove, onAdd }) {
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState("All");
  const [groupBy, setGroupBy] = useState("trade");
  const items = estimate.items;

  const families = useMemo(() => Array.from(new Set(items.map((it) => it.family))), [items]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = items.filter(
      (it) =>
        (family === "All" || it.family === family) &&
        (!q || [it.item, it.material, it.size, it.secondarySize, it.core, it.remarks].filter(Boolean).some((f) => String(f).toLowerCase().includes(q)))
    );
    const by = new Map();
    rows.forEach((it) => {
      const key = groupBy === "family" ? it.family : it.trade;
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(it);
    });
    return Array.from(by, ([key, list]) => ({ key, list, total: list.reduce((s, it) => s + calculateItemTotal(it), 0) }));
  }, [items, query, family, groupBy]);

  if (!items.length) {
    return (
      <EmptyState
        icon="box"
        title="No items yet"
        body="Log what you see on site. XMTO prices each line from your company's rates."
        action={canEdit ? "Add item" : undefined}
        onAction={onAdd}
        style={{ marginTop: 48, paddingHorizontal: 20 }}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 14 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: "row", gap: 10 }}>
        {breakdown.byTrade.map((t) => (
          <Card key={t.trade} style={{ flex: 1, minHeight: 72, paddingVertical: 12, paddingHorizontal: 14, gap: 4 }}>
            <T variant="label" weight={600} color={t.trade === "Plumbing" ? "#1F4E86" : "navy"}>
              {t.trade}
            </T>
            <T variant="cardTitle" color="text" num>
              {money(t.total)}
            </T>
            <T variant="caption" weight={400} num>
              {plural(items.filter((it) => it.trade === t.trade).length, "line")}
            </T>
          </Card>
        ))}
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Search lines" style={{ flex: 1 }} />
        <Segmented options={[{ key: "trade", label: "Trade" }, { key: "family", label: "Family" }]} value={groupBy} onChange={setGroupBy} />
      </View>

      {families.length > 1 ? (
        <ChipRow inset={16}>
          {["All", ...families].map((f) => (
            <Chip key={f} label={f} active={family === f} onPress={() => setFamily(f)} />
          ))}
        </ChipRow>
      ) : null}

      {groups.length === 0 ? (
        <EmptyState icon="search" title="Nothing matches" body="Try another word or pick All." action="Clear search" onAction={() => { setQuery(""); setFamily("All"); }} />
      ) : (
        groups.map((g) => (
          <View key={g.key} style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 6, paddingHorizontal: 4 }}>
              <T variant="overline">
                {g.key} · {g.list.length}
              </T>
              <T variant="label" weight={600} num>
                {money(g.total)}
              </T>
            </View>
            {g.list.map((it) => (
              <LineCard
                key={it.id}
                it={it}
                availability={getAvailability?.(it)}
                onPress={canEdit ? () => onEdit(it) : undefined}
                onDuplicate={canEdit ? () => onDuplicate(it) : undefined}
                onRemove={canEdit ? () => onRemove(it) : undefined}
              />
            ))}
          </View>
        ))
      )}
      {canEdit ? (
        <T variant="caption" weight={400} center style={{ color: colors.faint }}>
          Tap a line to edit · swipe left to duplicate or remove
        </T>
      ) : null}
    </ScrollView>
  );
}
