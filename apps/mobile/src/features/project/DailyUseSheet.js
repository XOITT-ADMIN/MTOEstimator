import React, { useEffect, useState } from "react";
import { View, ScrollView } from "react-native";

import { Sheet, Field, Button, T, HStack, Chip, ChipRow, colors } from "../../ui";
import { useProjects } from "../../context/ProjectsContext";
import { notify } from "../../utils/confirm";

// One editable row per item in the site balance
function ItemRow({ item, entry, onUpdate }) {
  const [qty, setQty] = useState(entry?.qty != null ? String(entry.qty) : "");
  const [kind, setKind] = useState(entry?.kind || "USED");
  const [note, setNote] = useState(entry?.note || "");

  useEffect(() => {
    const q = parseFloat(qty);
    if (!qty.trim() || isNaN(q) || q <= 0) {
      onUpdate(item.stockKey, null);
      return;
    }
    onUpdate(item.stockKey, { stockKey: item.stockKey, qty: q, kind, note: note.trim() || undefined });
  }, [qty, kind, note]); // eslint-disable-line react-hooks/exhaustive-deps

  const parts = item.stockKey.split("|");
  const label = [parts[2], parts[3], parts[0]].filter(Boolean).join(" · ");

  return (
    <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 8 }}>
      <HStack gap={6} style={{ justifyContent: "space-between" }}>
        <T variant="bodyStrong" style={{ flex: 1 }} numberOfLines={2}>{label}</T>
        <T variant="caption" weight={400} style={{ color: colors.faint }}>Balance: {item.balance.toFixed(2)}</T>
      </HStack>
      <ChipRow>
        <Chip label="Used" active={kind === "USED"} onPress={() => setKind("USED")} />
        <Chip label="Wasted" active={kind === "WASTED"} onPress={() => setKind("WASTED")} />
      </ChipRow>
      <HStack gap={8}>
        <View style={{ flex: 1 }}>
          <Field
            label="Qty"
            value={qty}
            onChangeText={setQty}
            keyboardType="decimal-pad"
            placeholder={`max ${item.balance.toFixed(2)}`}
          />
        </View>
        <View style={{ flex: 2 }}>
          <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. main run" />
        </View>
      </HStack>
    </View>
  );
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function DailyUseSheet({ projectId, balance, visible, onClose, onSaved }) {
  const { addConsumption } = useProjects();
  const [date, setDate] = useState(todayISO());
  const [entries, setEntries] = useState({});
  const [busy, setBusy] = useState(false);

  const activeItems = balance.filter((b) => b.balance > 0);

  function updateEntry(stockKey, entry) {
    setEntries((prev) => {
      const next = { ...prev };
      if (entry) next[stockKey] = entry;
      else delete next[stockKey];
      return next;
    });
  }

  const entryList = Object.values(entries);

  async function save() {
    if (!entryList.length) return;
    setBusy(true);
    try {
      await addConsumption(projectId, { date, entries: entryList });
      onSaved();
      onClose();
    } catch (e) {
      notify("Couldn't save", e?.message || "Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      title="Record site use"
      subtitle={`${activeItems.length} item${activeItems.length !== 1 ? "s" : ""} on site`}
      onClose={onClose}
      footer={
        <Button
          title="Save"
          disabled={!entryList.length || busy}
          loading={busy}
          onPress={save}
        />
      }
    >
      <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
        <Field label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
      </View>
      <ScrollView style={{ maxHeight: 440 }}>
        <View style={{ paddingHorizontal: 20 }}>
          {activeItems.length === 0 ? (
            <T variant="sub" style={{ textAlign: "center", marginTop: 24, marginBottom: 24 }}>
              No material balance on site yet.
            </T>
          ) : (
            activeItems.map((item) => (
              <ItemRow key={item.stockKey} item={item} entry={entries[item.stockKey]} onUpdate={updateEntry} />
            ))
          )}
        </View>
      </ScrollView>
    </Sheet>
  );
}
