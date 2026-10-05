import React, { useMemo, useState } from "react";
import { View, ScrollView } from "react-native";

import { Sheet, Field, Button, TextButton, Segmented, SearchField, Group, PickRow, ChoiceTile, StepProgress, SuggestChip, HStack, T, RowBetween, colors } from "../../ui";
import { tradeCatalog, findItem } from "../../data/catalog";
import { specLabel } from "../estimates";
import { formatINR } from "../../utils/currency";

const TRADES = ["Plumbing", "Electrical"];
const NONE = "__none__";
export const fmtQty = (n) => {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
};

const priceInput = (v) => v.replace(/[^0-9.]/g, "");

// Change stock on hand and unit price for one line (or remove it). onMovements opens the ledger.
export function LineEditorSheet({ line, onClose, onSave, onRemove, onMovements }) {
  const [qty, setQty] = useState(line ? String(line.stock) : "");
  const [price, setPrice] = useState(line && Number(line.price) ? String(line.price) : "");
  const n = Number(qty);
  const p = price === "" ? 0 : Number(price);
  const valid = qty !== "" && Number.isFinite(n) && n >= 0 && Number.isFinite(p) && p >= 0;
  if (!line) return null;
  const after = valid ? n - line.used : null;
  return (
    <Sheet
      title={line.item}
      subtitle={`${line.trade} · ${specLabel(line)} · ${line.unit}`}
      onClose={onClose}
      footer={
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button title="Remove" tone="danger" onPress={onRemove} style={{ paddingHorizontal: 18 }} />
          {onMovements ? <Button title="Ledger" tone="secondary" onPress={onMovements} style={{ paddingHorizontal: 18 }} /> : null}
          <Button title="Save" icon="check" disabled={!valid} onPress={() => onSave({ stock: n, price: p })} style={{ flex: 1 }} />
        </View>
      }
    >
      <View style={{ padding: 20, gap: 14 }}>
        <Field label={`Stock on hand (${line.unit})`} value={qty} onChangeText={(v) => setQty(v.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" selectTextOnFocus autoFocus />
        <Field label={`Unit price (₹ per ${line.unit})`} value={price} onChangeText={(v) => setPrice(priceInput(v))} keyboardType="decimal-pad" placeholder="0" selectTextOnFocus />
        <Group>
          <KV label="Used in estimates" value={`${fmtQty(line.used)} ${line.unit}`} />
          <KV label="Left after save" value={after == null ? "—" : `${fmtQty(after)} ${line.unit}`} danger={after != null && after < 0} />
          <KV label="Stock value" value={valid && p > 0 ? formatINR(n * p) : "—"} />
        </Group>
        {line.usedIn?.length ? (
          <T variant="caption" weight={400} numberOfLines={3}>
            Used in {line.usedIn.map((u) => `${u.estimateNumber} (${fmtQty(u.qty)})`).join(" · ")}
          </T>
        ) : null}
      </View>
    </Sheet>
  );
}

// Set / add / subtract the same amount on many lines at once.
export function BulkSheet({ count, onClose, onApply }) {
  const [mode, setMode] = useState("set");
  const [value, setValue] = useState("");
  const n = Number(value);
  const valid = value !== "" && Number.isFinite(n) && n >= 0;
  return (
    <Sheet title="Bulk update" subtitle={`${count} selected line${count === 1 ? "" : "s"}`} onClose={onClose} footer={<Button title={`Apply to ${count}`} icon="check" disabled={!valid} onPress={() => onApply({ mode, value: n })} />}>
      <View style={{ padding: 20, gap: 14 }}>
        <Segmented size="l" value={mode} onChange={setMode} options={[{ key: "set", label: "Set to" }, { key: "add", label: "Add" }, { key: "subtract", label: "Subtract" }]} />
        <Field label={mode === "set" ? "Set stock to" : mode === "add" ? "Add to each" : "Take off each"} value={value} onChangeText={(v) => setValue(v.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" placeholder="0" autoFocus hint="Stock never goes below 0. Used quantities stay the same." />
      </View>
    </Sheet>
  );
}

// New stock line — same taps as Add item: Item → Material → Size → (reduces to / core) → Stock.
export function AddLineSheet({ onClose, onSave }) {
  const [trade, setTrade] = useState("Plumbing");
  const [item, setItem] = useState(null);
  const [material, setMaterial] = useState(null);
  const [size, setSize] = useState(null);
  const [secondarySize, setSecondarySize] = useState(null);
  const [core, setCore] = useState(null);
  const [stock, setStock] = useState("");
  const [price, setPrice] = useState("");
  const [filter, setFilter] = useState("");
  const cat = tradeCatalog(trade);
  const found = item ? findItem(trade, item) : null;
  const isPlumbing = trade === "Plumbing";

  const step = !item ? "item" : !material ? "material" : !size ? "size" : isPlumbing && found?.needsSecondarySize && !secondarySize ? "secondarySize" : !isPlumbing && found?.needsCore && !core ? "core" : "stock";
  const STEPS = ["item", "material", "size", "stock"];
  const current = step === "secondarySize" || step === "core" ? 2 : STEPS.indexOf(step);

  function changeTrade(t) {
    setTrade(t);
    setItem(null);
    setMaterial(null);
    setSize(null);
    setSecondarySize(null);
    setCore(null);
  }
  function backTo(i) {
    if (i <= 0) setItem(null);
    if (i <= 1) setMaterial(null);
    if (i <= 2) {
      setSize(null);
      setSecondarySize(null);
      setCore(null);
    }
  }

  const sections = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return cat.families.map((f) => ({ family: f, items: cat.items[f].filter((i) => !q || i.name.toLowerCase().includes(q) || f.toLowerCase().includes(q)) })).filter((s) => s.items.length);
  }, [cat, filter]);

  const n = Number(stock);
  const p = price === "" ? 0 : Number(price);
  const valid = stock !== "" && Number.isFinite(n) && n >= 0 && Number.isFinite(p) && p >= 0;
  const tiles = (list, selected, pick) => (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {list.map((o) => (
        <ChoiceTile key={o.value} title={o.title} active={selected === o.value} onPress={() => pick(o.value)} style={{ width: "48.4%" }} />
      ))}
    </View>
  );
  const asTiles = (arr) => arr.map((v) => ({ value: v, title: v }));

  return (
    <Sheet
      full
      title="New stock line"
      subtitle={`Step ${current + 1} of 4`}
      onClose={onClose}
      header={<StepProgress steps={["Item", "Material", "Size", "Stock"]} current={current} onStep={backTo} />}
      footer={step === "stock" ? <Button title="Save stock line" icon="check" disabled={!valid} onPress={() => onSave({ trade, family: found.family, item, material, size, secondarySize: isPlumbing ? secondarySize : null, core: isPlumbing ? null : core, unit: found.unit, stock: n, price: p })} /> : null}
    >
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
        {item ? (
          <HStack wrap>
            {[item, material, size].filter(Boolean).map((c, i) => (
              <SuggestChip key={c} icon="check" active label={c} onPress={() => backTo(i)} />
            ))}
          </HStack>
        ) : null}
        {step === "item" ? (
          <>
            <Segmented size="l" options={TRADES} value={trade} onChange={changeTrade} />
            <SearchField value={filter} onChangeText={setFilter} placeholder={`Search ${trade.toLowerCase()} items…`} />
            {sections.map((s) => (
              <View key={s.family} style={{ gap: 6 }}>
                <T variant="overline" style={{ paddingHorizontal: 4 }}>
                  {s.family}
                </T>
                <Group style={{ borderRadius: 14 }}>
                  {s.items.map((i) => (
                    <PickRow key={i.name} title={i.name} tag={i.unit} onPress={() => setItem(i.name)} />
                  ))}
                </Group>
              </View>
            ))}
          </>
        ) : step === "material" ? (
          tiles(asTiles(cat.materials), material, setMaterial)
        ) : step === "size" ? (
          tiles(asTiles(cat.sizes), size, setSize)
        ) : step === "secondarySize" ? (
          tiles(asTiles(cat.sizes.filter((s) => s !== size)), secondarySize, setSecondarySize)
        ) : step === "core" ? (
          tiles(asTiles(cat.cores || []), core, setCore)
        ) : (
          <>
            {isPlumbing && !found?.needsSecondarySize ? (
              <OptionalPick label="Reduces to (optional)" options={cat.sizes.filter((s) => s !== size)} value={secondarySize} onChange={setSecondarySize} />
            ) : null}
            {!isPlumbing && !found?.needsCore ? <OptionalPick label="Core (optional)" options={cat.cores || []} value={core} onChange={setCore} /> : null}
            <Field label={`Stock on hand (${found?.unit})`} value={stock} onChangeText={(v) => setStock(v.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" placeholder="0" autoFocus />
            <Field label={`Unit price (₹ per ${found?.unit})`} value={price} onChangeText={(v) => setPrice(priceInput(v))} keyboardType="decimal-pad" placeholder="0" hint="Optional. Saved with this line and included in the CSV." />
          </>
        )}
      </ScrollView>
    </Sheet>
  );
}

function OptionalPick({ label, options, value, onChange }) {
  return (
    <View style={{ gap: 8 }}>
      <RowBetween>
        <T variant="label">{label}</T>
        {value ? <TextButton title="Clear" size={13} onPress={() => onChange(null)} /> : null}
      </RowBetween>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((o) => (
          <ChoiceTile key={o} title={o} active={value === o} onPress={() => onChange(value === o ? null : o)} style={{ minHeight: 48, width: "31.6%" }} />
        ))}
      </View>
    </View>
  );
}

function KV({ label, value, danger }) {
  return (
    <RowBetween style={{ minHeight: 52, paddingHorizontal: 16 }}>
      <T variant="body" color="muted">
        {label}
      </T>
      <T variant="bodyStrong" num color={danger ? colors.danger : "text"}>
        {value}
      </T>
    </RowBetween>
  );
}

export { NONE };
