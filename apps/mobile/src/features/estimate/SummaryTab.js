import React from "react";
import { View, ScrollView, TextInput } from "react-native";

import { Blueprint, Card, T, Icon, IconButton, AmountInput, TextButton, Chip, Segmented, EmptyState, inputText, colors } from "../../ui";
import { money, plural } from "../estimates";

const TAX_PRESETS = [0, 5, 12, 18, 28];
const COST_LABELS = ["Transportation", "Installation", "Miscellaneous", "Overhead", "Other"];
const COST_ICONS = { Transportation: "truck", Installation: "ruler", Overhead: "building" };

// Summary tab: grand total, per-trade split, then the money maths top to bottom:
// subtotal → additional costs → discount → taxable value → GST → grand total.
export function SummaryTab({ estimate, breakdown: b, update, canEdit }) {
  if (!estimate.items.length) {
    return <EmptyState icon="fileText" title="Nothing to total yet" body="Add items and the costing shows up here." style={{ marginTop: 48, paddingHorizontal: 20 }} />;
  }
  const tax = estimate.tax || { percent: 18, mode: "added" };
  const discount = estimate.discount || { mode: "percent", value: 0 };
  const costs = estimate.adjustments || [];

  const setCost = (id, patch) => update({ adjustments: costs.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  const removeCost = (id) => update({ adjustments: costs.filter((a) => a.id !== id) });
  const addCost = () => {
    const used = new Set(costs.map((a) => a.label));
    update({ adjustments: [...costs, { id: "adj-" + Date.now(), label: COST_LABELS.find((l) => !used.has(l)) || "Other", mode: "fixed", value: 0 }] });
  };
  const setDiscount = (patch) => update({ discount: { ...discount, ...patch } });
  const setTax = (patch) => update({ tax: { ...tax, ...patch } });
  const trades = Array.from(new Set(estimate.items.map((i) => i.trade)));

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 12 }} keyboardShouldPersistTaps="handled">
      <Blueprint radius={20} style={{ padding: 20, gap: 4 }}>
        <T variant="label" weight={400} color="onNavyMuted">
          Grand total
        </T>
        <T variant="display" color="white" num>
          {money(b.grandTotal)}
        </T>
        <T variant="label" weight={400} color="onNavyMuted" num>
          {tax.percent ? `${tax.mode === "included" ? "GST included" : "incl. GST"} ${tax.percent}% · ` : ""}
          {plural(b.lineItemCount, "item")} · {plural(trades.length, "trade")}
        </T>
      </Blueprint>

      {b.byTrade.filter((t) => t.total || estimate.items.some((i) => i.trade === t.trade)).map((t) => (
        <Card key={t.trade} style={{ gap: 8, paddingVertical: 14, paddingHorizontal: 16 }}>
          <Line label={t.trade} value={money(t.total)} strong />
          <Line label="Material" value={money(t.material)} />
          <Line label="Labour" value={money(t.labour)} />
        </Card>
      ))}

      <Card style={{ paddingTop: 10, paddingBottom: 14, paddingHorizontal: 16 }}>
        <MathRow label="Subtotal (material + labour)" value={money(b.overall.material + b.overall.labour)} />

        <T variant="overline" style={{ paddingTop: 10, paddingBottom: 4 }}>
          Additional costs
        </T>
        {costs.map((c) => (
          <View key={c.id} style={{ flexDirection: "row", alignItems: "center", minHeight: 52, gap: 8 }}>
            <Icon name={COST_ICONS[c.label] || "tag"} size={18} color="muted" />
            <TextInput
              value={c.label}
              editable={canEdit}
              onChangeText={(v) => setCost(c.id, { label: v })}
              accessibilityLabel="Cost name"
              style={[inputText, { flex: 1, minWidth: 0, fontSize: 15, outlineStyle: "none" }]}
            />
            <AmountInput label={`${c.label} amount`} mode={c.mode} onModeChange={canEdit ? (m) => setCost(c.id, { mode: m }) : undefined} value={c.value} onChange={(v) => setCost(c.id, { value: v })} />
            {canEdit ? <IconButton icon="close" label={`Remove ${c.label}`} size={40} color="muted" onPress={() => removeCost(c.id)} /> : null}
          </View>
        ))}
        {canEdit ? <TextButton icon="plus" title="Add cost" onPress={addCost} style={{ height: 48, alignSelf: "flex-start" }} /> : null}

        <View style={{ flexDirection: "row", alignItems: "center", minHeight: 52, gap: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
          <T variant="body" color="muted" style={{ flex: 1 }}>
            Discount
          </T>
          <AmountInput label="Discount" mode={discount.mode} onModeChange={canEdit ? (m) => setDiscount({ mode: m }) : undefined} value={discount.value} onChange={(v) => setDiscount({ value: v })} />
        </View>
        {b.discountAmount > 0 && discount.mode === "percent" ? <MathRow label={`Discount ${discount.value}%`} value={`− ${money(b.discountAmount)}`} /> : null}
        <MathRow label="Taxable value" value={money(tax.mode === "included" ? b.subtotalAfterDiscount - b.taxAmount : b.subtotalAfterDiscount)} />
        <MathRow label={`GST ${tax.percent}%${tax.mode === "included" ? " (included)" : ""}`} value={money(b.taxAmount)} />
        {canEdit ? (
          <View style={{ gap: 8, paddingVertical: 6 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {TAX_PRESETS.map((p) => (
                <Chip key={p} label={`${p}%`} active={tax.percent === p} onPress={() => setTax({ percent: p })} style={{ height: 40, paddingHorizontal: 12 }} />
              ))}
            </View>
            <Segmented options={[{ key: "added", label: "Added on top" }, { key: "included", label: "Included in rates" }]} value={tax.mode} onChange={(m) => setTax({ mode: m })} size="l" />
          </View>
        ) : null}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 10, borderTopWidth: 2, borderTopColor: colors.navy }}>
          <T variant="cardTitle" weight={700}>
            Grand total
          </T>
          <T variant="cardTitle" weight={700} num>
            {money(b.grandTotal)}
          </T>
        </View>
      </Card>
    </ScrollView>
  );
}

function Line({ label, value, strong }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <T variant={strong ? "bodyStrong" : "sub"} color={strong ? "navy" : "muted"}>
        {label}
      </T>
      <T variant={strong ? "rowTitle" : "sub"} color={strong ? "text" : "muted"} num>
        {value}
      </T>
    </View>
  );
}

function MathRow({ label, value }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 36, gap: 8 }}>
      <T variant="body" color="muted" style={{ flex: 1 }}>
        {label}
      </T>
      <T variant="body" num>
        {value}
      </T>
    </View>
  );
}
