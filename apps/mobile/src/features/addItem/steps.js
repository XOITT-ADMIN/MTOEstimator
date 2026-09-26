import React from "react";
import { View, Pressable } from "react-native";

import { Segmented, SuggestChip, SearchField, Chip, ChipRow, Group, Section, ChoiceTile, Stepper, MoneyField, StockCard, Notice, Field, T, Icon, HStack, EmptyState, PickRow, colors } from "../../ui";
import { NONE, comboKey } from "./useAddItemWizard";

// The Add item wizard's step bodies. Each takes the wizard object from useAddItemWizard.

// Step 1 — trade, "Log again", search, family chips, item list.
export function ItemStep({ w }) {
  const showQuick = !w.isEditing && w.quickPicks.length > 0 && !w.itemFilter && w.familyFilter === "All";
  return (
    <View style={{ gap: 14 }}>
      {!w.tradeLocked ? <Segmented size="l" options={w.estimateTrades} value={w.trade} onChange={w.changeTrade} style={{ padding: 4, borderRadius: 14 }} /> : null}

      {showQuick ? (
        <Section title="Log again" style={{ marginTop: 0 }} gap={8}>
          <ChipRow>
            {w.quickPicks.map((p) => (
              <SuggestChip key={comboKey(p)} tall icon="refresh" label={[p.item, p.material, p.secondarySize ? `${p.size} × ${p.secondarySize}` : p.size, p.core].filter(Boolean).join(" · ")} onPress={() => w.applyQuickPick(p)} />
            ))}
          </ChipRow>
        </Section>
      ) : null}

      <SearchField value={w.itemFilter} onChangeText={w.setItemFilter} placeholder={`Search ${w.itemCount} ${w.trade.toLowerCase()} items…`} />

      <ChipRow>
        {["All", ...w.catalog.families].map((f) => (
          <Chip key={f} label={f} active={w.familyFilter === f} onPress={() => w.setFamilyFilter(f)} />
        ))}
      </ChipRow>

      {w.itemSections.length === 0 ? (
        <EmptyState icon="search" title="No items match" body={`Nothing called "${w.itemFilter}" in ${w.trade}.`} />
      ) : (
        w.itemSections.map((s) => (
          <View key={s.family} style={{ gap: 6 }}>
            <T variant="overline" style={{ paddingTop: 4, paddingHorizontal: 4 }}>
              {s.family}
            </T>
            <Group style={{ borderRadius: 14 }}>
              {s.items.map((i) => (
                <PickRow key={i.name} title={i.name} tag={i.unit} selected={w.itemName === i.name} onPress={() => w.pickItem(i.name)} />
              ))}
            </Group>
          </View>
        ))
      )}
    </View>
  );
}

// Material, size, secondary size and core are all "tap one tile" grids.
export function TileStep({ w }) {
  const k = w.stepKey;
  let options = [];
  let selected = null;
  let onPick = () => {};
  if (k === "material") {
    options = w.catalog.materials.map((m) => {
      const left = w.materialAvailability[m];
      return { value: m, title: m, sub: left == null ? "Not in stock" : left <= 0 ? "Out of stock" : "In stock", subTone: left == null || left <= 0 ? "dangerInk" : "successInk" };
    });
    selected = w.material;
    onPick = w.pickMaterial;
  } else if (k === "size") {
    options = w.catalog.sizes.map((s) => {
      const left = w.sizeAvailability[s];
      return { value: s, title: s, sub: left == null ? "Not in stock" : left <= 0 ? "Out of stock" : `${Math.round(left * 100) / 100} ${w.unit || ""} left`, subTone: left == null || left <= 0 ? "dangerInk" : "successInk" };
    });
    selected = w.size;
    onPick = w.pickSize;
  } else if (k === "secondarySize") {
    options = [...(w.secondaryRequired ? [] : [{ value: NONE, title: "None", sub: "Same size" }]), ...w.catalog.sizes.filter((s) => s !== w.size).map((s) => ({ value: s, title: s }))];
    selected = w.secondarySize;
    onPick = w.pickSecondarySize;
  } else if (k === "core") {
    options = [...(w.coreRequired ? [] : [{ value: NONE, title: "None", sub: "No core count" }]), ...(w.catalog.cores || []).map((c) => ({ value: c, title: c }))];
    selected = w.core;
    onPick = w.pickCore;
  }
  const crumbs = [w.itemName, k !== "material" && w.material, (k === "secondarySize" || k === "core") && w.size].filter(Boolean);
  return (
    <View style={{ gap: 14 }}>
      {crumbs.length ? (
        <HStack wrap>
          {crumbs.map((c, i) => (
            <SuggestChip key={c} icon="check" active label={c} onPress={() => w.goToIndex(i)} />
          ))}
        </HStack>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {options.map((o) => (
          <ChoiceTile key={o.value} title={o.title} sub={o.sub} subTone={o.subTone} active={selected === o.value} onPress={() => onPick(o.value)} style={{ width: "48.4%" }} />
        ))}
      </View>
    </View>
  );
}

// Last step — what you picked (tap Change), quantity, stock, rates, remarks.
export function QtyStep({ w }) {
  const summary = [
    { key: "item", label: "Item", value: `${w.itemName} (${w.trade})` },
    { key: "material", label: "Material", value: w.material },
    { key: "size", label: "Size", value: w.size },
    w.isPlumbing && (w.secondarySize || w.secondaryRequired) ? { key: "secondarySize", label: "Reduces to", value: w.secondarySize || "Required" } : null,
    !w.isPlumbing && (w.core || w.coreRequired) ? { key: "core", label: "Core", value: w.core || "Required" } : null,
  ].filter(Boolean);
  const a = w.availability;
  return (
    <View style={{ gap: 14 }}>
      <Group style={{ borderRadius: 14 }}>
        {summary.map((r) => (
          <Pressable key={r.key} onPress={() => w.goTo(r.key)} accessibilityRole="button" accessibilityLabel={`Change ${r.label}`} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingLeft: 16, paddingRight: 12, backgroundColor: pressed ? colors.tintBlueSoft : colors.surface })}>
            <T variant="label" weight={400} style={{ width: 80 }}>
              {r.label}
            </T>
            <T variant="rowTitle" num style={{ flex: 1 }} numberOfLines={1}>
              {r.value}
            </T>
            <T variant="label" weight={600} color="blue700">
              Change
            </T>
          </Pressable>
        ))}
        {!w.isPlumbing && !w.core && !w.coreRequired ? <AddOptional label="Add core" onPress={() => w.goTo("core")} /> : null}
        {w.isPlumbing && !w.secondarySize && !w.secondaryRequired ? <AddOptional label="Add a reducing size" onPress={() => w.goTo("secondarySize")} /> : null}
      </Group>

      <Section title="Quantity" style={{ marginTop: 0 }} gap={8}>
        <Stepper value={w.qty} onChange={w.setQty} unit={w.unit} min={0} />
        {w.errors.qty ? (
          <T variant="label" weight={400} color="danger">
            {w.errors.qty}
          </T>
        ) : null}
      </Section>

      {a ? <StockCard label={`${w.material} ${w.size}`.toUpperCase()} available={a.available} used={a.used} stock={a.stock} unit={a.unit || w.unit} qty={w.qty} /> : null}
      {w.stockProblem ? (
        <Notice icon="alert" tone={w.stockPolicy === "block" ? "danger" : "warning"}>
          {w.stockProblem.message}
          {w.stockPolicy === "block" ? "" : " Your company allows it, so you can still add the line."}
        </Notice>
      ) : null}

      <Section title="Rates" style={{ marginTop: 0 }} gap={8}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <MoneyField label="Material" value={w.materialRate} onChangeText={w.setMaterialRate} unit={w.unit} />
          <MoneyField label="Labour" value={w.labourRate} onChangeText={w.setLabourRate} unit={w.unit} />
        </View>
        <HStack gap={6}>
          <Icon name={w.rateTouched ? "tag" : "info"} size={14} color="muted" />
          <T variant="caption" weight={400}>
            {w.rateTouched ? "Your rate for this estimate — the library stays the same" : "Pre-filled from your company library"}
          </T>
        </HStack>
      </Section>

      <Field label="Remarks (optional)" value={w.remarks} onChangeText={w.setRemarks} placeholder="e.g. riser 2nd floor, near shaft" />
    </View>
  );
}

function AddOptional({ label, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 52, paddingHorizontal: 16, backgroundColor: pressed ? colors.tintBlueSoft : colors.surface })}>
      <Icon name="plus" size={18} color="blue700" />
      <T variant="label" weight={600} color="blue700">
        {label}
      </T>
    </Pressable>
  );
}
