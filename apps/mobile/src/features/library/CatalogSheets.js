import React, { useState } from "react";
import { View, ScrollView } from "react-native";

import { Sheet, Field, Button, Segmented, ChoiceTile, T } from "../../ui";

const FLAG = { Plumbing: "needsSecondarySize", Electrical: "needsCore" };
const FLAG_LABEL = { Plumbing: "Needs a “reduces to” size?", Electrical: "Needs a core (1C, 4C …)?" };
const FLAG_HINT = { Plumbing: "Yes for reducers and reducing tees.", Electrical: "Yes for cables." };

// Add or edit one item: name, family, unit, and whether it needs a second size / a core.
export function ItemSheet({ trade, item, families, units, busy, onClose, onSave, onRemove }) {
  const editing = !!item;
  const [name, setName] = useState(item?.name || "");
  const [family, setFamily] = useState(item?.family || families[0] || "");
  const [newFamily, setNewFamily] = useState("");
  const [addingFamily, setAddingFamily] = useState(!families.length);
  const [unit, setUnit] = useState(item?.unit || "");
  const [flag, setFlag] = useState(item ? !!item[FLAG[trade]] : false);

  const chosenFamily = addingFamily ? newFamily.trim() : family;
  const valid = name.trim() && chosenFamily && unit.trim();

  return (
    <Sheet
      full
      title={editing ? item.name : `New ${trade.toLowerCase()} item`}
      subtitle={editing ? `${trade} · ${item.family}` : "Shows up in Add item and Stock straight away"}
      onClose={onClose}
      footer={
        <View style={{ flexDirection: "row", gap: 10 }}>
          {editing ? <Button title="Delete" tone="danger" disabled={busy} onPress={onRemove} style={{ paddingHorizontal: 18 }} /> : null}
          <Button
            title={editing ? "Save" : "Add item"}
            icon="check"
            loading={busy}
            disabled={!valid || busy}
            onPress={() => onSave({ name: name.trim(), family: chosenFamily, unit: unit.trim(), [FLAG[trade]]: flag })}
            style={{ flex: 1 }}
          />
        </View>
      }
    >
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
        <Field label="Item name" value={name} onChangeText={setName} placeholder="e.g. Butterfly Valve" autoFocus={!editing} maxLength={120} />

        <View style={{ gap: 8 }}>
          <T variant="label">Family</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {families.map((f) => (
              <ChoiceTile key={f} title={f} active={!addingFamily && family === f} onPress={() => { setFamily(f); setAddingFamily(false); }} style={{ minHeight: 48, width: "48.4%" }} />
            ))}
            <ChoiceTile title="+ New family" active={addingFamily} onPress={() => setAddingFamily(true)} style={{ minHeight: 48, width: "48.4%" }} />
          </View>
          {addingFamily ? <Field label="New family name" value={newFamily} onChangeText={setNewFamily} placeholder="e.g. Pump" maxLength={120} /> : null}
        </View>

        <View style={{ gap: 8 }}>
          <T variant="label">Unit</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {units.map((u) => (
              <ChoiceTile key={u} title={u} active={unit === u} onPress={() => setUnit(u)} style={{ minHeight: 44, width: "23%" }} />
            ))}
          </View>
          <Field label="Or type a unit" value={units.includes(unit) ? "" : unit} onChangeText={setUnit} placeholder="e.g. Pair" maxLength={20} />
        </View>

        <View style={{ gap: 8 }}>
          <T variant="label">{FLAG_LABEL[trade]}</T>
          <Segmented size="l" value={flag ? "Yes" : "No"} onChange={(v) => setFlag(v === "Yes")} options={["No", "Yes"]} />
          <T variant="caption" weight={400}>
            {FLAG_HINT[trade]}
          </T>
        </View>
      </ScrollView>
    </Sheet>
  );
}

// Add, rename or remove one material / size / core.
export function OptionSheet({ trade, listLabel, value, busy, onClose, onSave, onRemove }) {
  const editing = value != null;
  const [text, setText] = useState(value || "");
  const valid = text.trim() && text.trim() !== value;
  return (
    <Sheet
      title={editing ? value : `New ${listLabel}`}
      subtitle={`${trade} ${listLabel}s`}
      onClose={onClose}
      footer={
        <View style={{ flexDirection: "row", gap: 10 }}>
          {editing ? <Button title="Remove" tone="danger" disabled={busy} onPress={onRemove} style={{ paddingHorizontal: 18 }} /> : null}
          <Button title={editing ? "Rename" : "Add"} icon="check" loading={busy} disabled={!valid || busy} onPress={() => onSave(text.trim())} style={{ flex: 1 }} />
        </View>
      }
    >
      <View style={{ padding: 20, gap: 12 }}>
        <Field label={`${listLabel[0].toUpperCase()}${listLabel.slice(1)}`} value={text} onChangeText={setText} autoFocus maxLength={120} placeholder={listLabel === "size" ? "e.g. 65 mm" : listLabel === "core" ? "e.g. 6C" : "e.g. MS"} />
        {editing ? (
          <T variant="caption" weight={400}>
            Renaming or removing is blocked while a stock line uses it. Estimates already made keep the old name.
          </T>
        ) : null}
      </View>
    </Sheet>
  );
}
