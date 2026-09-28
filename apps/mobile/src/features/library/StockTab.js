import React, { useMemo, useState } from "react";
import { View, Pressable } from "react-native";

import { Card, Group, Chip, ChipRow, StockLine, stockLevel, EmptyState, Button, T, Icon, RowBetween, colors, radius } from "../../ui";
import { specLabel } from "../estimates";
import { useInventory } from "../../inventory/InventoryContext";
import { parseStockCsv, StockCsvError } from "../../inventory/stockCsv";
import { saveTextFile, pickTextFile } from "../../utils/files";
import { confirmAction, notify } from "../../utils/confirm";
import { LineEditorSheet, BulkSheet, AddLineSheet } from "./StockSheets";
import { StockMovementsSheet } from "./StockMovementsSheet";

const UNIT_WORDS = { m: "Metres", Nos: "Nos", Set: "Sets", Kg: "Kg", L: "Litres" };

// Library › Stock: health summary, actions, filters, and one card per item with its lines.
export function StockTab({ query = "" }) {
  const { lines, updateLine, removeLine, bulkUpdate, upsertLine, exportCsv, importCsv, canEdit = true } = useInventory();
  const [filter, setFilter] = useState("All");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [editing, setEditing] = useState(null);
  const [movementsLine, setMovementsLine] = useState(null); // key + label for ledger sheet
  const [bulkOpen, setBulkOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const health = useMemo(() => {
    const h = { ok: 0, low: 0, out: 0 };
    lines.forEach((l) => h[stockLevel(l.available, l.stock)]++);
    return h;
  }, [lines]);

  const counts = useMemo(() => ({ All: lines.length, Plumbing: lines.filter((l) => l.trade === "Plumbing").length, Electrical: lines.filter((l) => l.trade === "Electrical").length, Low: health.low + health.out }), [lines, health]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lines.filter((l) => {
      if (filter === "Low" && stockLevel(l.available, l.stock) === "ok") return false;
      if ((filter === "Plumbing" || filter === "Electrical") && l.trade !== filter) return false;
      return !q || [l.item, l.family, l.material, l.size, l.secondarySize, l.core].filter(Boolean).some((f) => String(f).toLowerCase().includes(q));
    });
  }, [lines, filter, query]);

  const groups = useMemo(() => {
    const by = new Map();
    filtered.forEach((l) => {
      const k = `${l.trade}|${l.item}`;
      if (!by.has(k)) by.set(k, { key: k, trade: l.trade, item: l.item, unit: l.unit, rows: [] });
      by.get(k).rows.push(l);
    });
    return Array.from(by.values());
  }, [filtered]);

  const toggle = (key) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  async function download() {
    try {
      setBusy(true);
      await saveTextFile(`stock-library-${new Date().toISOString().slice(0, 10)}.csv`, exportCsv(), "text/csv");
    } catch (e) {
      notify("Download failed", e?.message || "Could not create the CSV.");
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    try {
      setBusy(true);
      const picked = await pickTextFile();
      if (!picked) return;
      let entries;
      try {
        entries = parseStockCsv(picked.text);
      } catch (e) {
        if (e instanceof StockCsvError) return notify("Upload rejected", `${picked.name}\n\n${e.message}\n\nNothing was imported. Download the current list to get the exact format.`);
        throw e;
      }
      const replace = await confirmAction({
        title: `Import ${entries.length} line${entries.length === 1 ? "" : "s"}`,
        message: "Replace the whole stock library with this file?\n\nChoose Merge to keep your lines and only add or update the ones in the file.",
        confirmText: "Replace all",
        cancelText: "Merge",
      });
      const count = importCsv(picked.text, { merge: !replace });
      notify("Stock updated", `${count} line${count === 1 ? "" : "s"} ${replace ? "imported" : "merged"} from ${picked.name}.`);
    } catch (e) {
      notify("Upload failed", e?.message || "Could not read that file.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(line) {
    if (await confirmAction({ title: "Remove stock line?", message: `${line.item} · ${specLabel(line)}`, confirmText: "Remove", destructive: true })) {
      removeLine(line.key);
      setEditing(null);
    }
  }

  const total = lines.length || 1;
  return (
    <View style={{ gap: 14 }}>
      <Card style={{ gap: 12 }}>
        <RowBetween align="baseline">
          <T variant="bodyStrong" color="navy">
            Stock health
          </T>
          <T variant="label" weight={400} num>
            {lines.length} lines
          </T>
        </RowBetween>
        <View style={{ flexDirection: "row", height: 10, borderRadius: 5, gap: 2, overflow: "hidden", backgroundColor: colors.skeleton }}>
          {health.ok ? <View style={{ width: `${(health.ok / total) * 100}%`, backgroundColor: colors.success }} /> : null}
          {health.low ? <View style={{ width: `${(health.low / total) * 100}%`, backgroundColor: colors.warning }} /> : null}
          {health.out ? <View style={{ width: `${(health.out / total) * 100}%`, backgroundColor: colors.danger }} /> : null}
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <HealthTile n={health.ok} label="Healthy" bg={colors.successTint} fg={colors.successInk} onPress={() => setFilter("All")} />
          <HealthTile n={health.low} label="Low" bg={colors.warningTint} fg={colors.warningInk} onPress={() => setFilter("Low")} />
          <HealthTile n={health.out} label="Out" bg={colors.dangerTint} fg={colors.dangerInk} onPress={() => setFilter("Low")} />
        </View>
      </Card>

      {selecting ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button title={`All (${filtered.length})`} tone="secondary" compact onPress={() => setSelected(new Set(filtered.map((l) => l.key)))} />
          <Button title={`Bulk update${selected.size ? ` · ${selected.size}` : ""}`} compact disabled={!selected.size} onPress={() => setBulkOpen(true)} style={{ flex: 1 }} />
          <Button title="Done" tone="secondary" compact onPress={exitSelect} />
        </View>
      ) : (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {canEdit ? <ActionTile icon="plus" label="Add line" onPress={() => setAddOpen(true)} /> : null}
          {canEdit ? <ActionTile icon="upload" label="Upload CSV" onPress={upload} disabled={busy} /> : null}
          <ActionTile icon="download" label="Download CSV" onPress={download} disabled={busy} />
          {canEdit ? <ActionTile icon="checkSquare" label="Select" onPress={() => setSelecting(true)} disabled={!lines.length} /> : null}
        </View>
      )}

      <ChipRow>
        {["All", "Plumbing", "Electrical", "Low"].map((f) => (
          <Chip key={f} label={f === "Low" ? "Low stock" : f} count={f === "All" ? undefined : counts[f] || undefined} active={filter === f} onPress={() => setFilter(f)} />
        ))}
      </ChipRow>

      {groups.length === 0 ? (
        <EmptyState icon="box" title={lines.length ? "Nothing matches" : "No stock lines yet"} body={lines.length ? "Try another filter." : canEdit ? "Add a line, or upload a CSV of what's in the store." : "Your admin hasn't added stock yet."} action={!lines.length && canEdit ? "Add line" : undefined} onAction={() => setAddOpen(true)} />
      ) : (
        groups.map((g) => (
          <View key={g.key} style={{ gap: 6 }}>
            <RowBetween style={{ paddingTop: 4, paddingHorizontal: 4 }}>
              <T variant="overline" numberOfLines={1} style={{ flex: 1 }}>
                {g.trade} · {g.item}
              </T>
              <T variant="overline">{UNIT_WORDS[g.unit] || g.unit}</T>
            </RowBetween>
            <Group style={{ borderRadius: 14 }}>
              {g.rows.map((l) => (
                <Pressable
                  key={l.key}
                  disabled={!canEdit}
                  onPress={() => (selecting ? toggle(l.key) : setEditing(l))}
                  accessibilityRole={canEdit ? "button" : undefined}
                  style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 72, paddingHorizontal: 16, backgroundColor: pressed || selected.has(l.key) ? colors.tintBlueSoft : colors.surface })}
                >
                  {selecting ? <Check on={selected.has(l.key)} /> : null}
                  <View style={{ flex: 1 }}>
                    <StockLine title={specLabel(l)} available={l.available} stock={l.stock} used={l.used} unit={l.unit} price={l.price} />
                  </View>
                </Pressable>
              ))}
            </Group>
          </View>
        ))
      )}

      {editing ? <LineEditorSheet key={editing.key} line={lines.find((l) => l.key === editing.key) || editing} onClose={() => setEditing(null)} onSave={(patch) => { updateLine(editing.key, patch); setEditing(null); }} onRemove={() => remove(editing)} onMovements={() => { setMovementsLine({ key: editing.key, label: `${editing.item} · ${specLabel(editing)}` }); setEditing(null); }} /> : null}
      {movementsLine ? <StockMovementsSheet stockLineId={movementsLine.key} lineLabel={movementsLine.label} onClose={() => setMovementsLine(null)} /> : null}
      {bulkOpen ? <BulkSheet count={selected.size} onClose={() => setBulkOpen(false)} onApply={(patch) => { bulkUpdate(Array.from(selected), patch); setBulkOpen(false); exitSelect(); }} /> : null}
      {addOpen ? <AddLineSheet onClose={() => setAddOpen(false)} onSave={(entry) => { upsertLine(entry); setAddOpen(false); }} /> : null}
    </View>
  );
}

function HealthTile({ n, label, bg, fg, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${n} ${label}`} style={({ pressed }) => ({ flex: 1, minHeight: 56, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: bg, opacity: pressed ? 0.85 : 1 })}>
      <T size={20} weight={600} color={fg} num>
        {n}
      </T>
      <T variant="caption" color={fg}>
        {label}
      </T>
    </Pressable>
  );
}

export function ActionTile({ icon, label, onPress, disabled }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={({ pressed }) => ({ flex: 1, minHeight: 68, paddingHorizontal: 4, paddingVertical: 8, borderRadius: radius.l, backgroundColor: pressed ? colors.tintBlueSoft : colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", gap: 4, opacity: disabled ? 0.45 : 1 })}>
      <Icon name={icon} size={22} color="blue700" />
      <T variant="caption" weight={600} color="blue700" center numberOfLines={2}>
        {label}
      </T>
    </Pressable>
  );
}

function Check({ on }) {
  return (
    <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: on ? colors.action : colors.surface, borderWidth: on ? 0 : 2, borderColor: "#9AA6BF", alignItems: "center", justifyContent: "center" }}>
      {on ? <Icon name="check" size={16} color="white" /> : null}
    </View>
  );
}
