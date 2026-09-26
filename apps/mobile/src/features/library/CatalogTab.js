import React, { useMemo, useState } from "react";
import { View, Pressable } from "react-native";

import { Group, Section, ChipWrap, EmptyState, T, RowBetween, TextButton, Icon, colors, radius } from "../../ui";
import { upsertItem, removeItem, upsertOption, removeOption, mergeCatalogs, CatalogError } from "@mto/shared/catalogTools";
import { DEFAULT_CATALOG } from "../../data/catalog";
import { useCatalog } from "../../library/CatalogContext";
import { buildCatalogCsv, parseCatalogCsv, replaceFromCsv, CatalogCsvError } from "../../library/catalogCsv";
import { useInventory } from "../../inventory/InventoryContext";
import { saveTextFile, pickTextFile } from "../../utils/files";
import { confirmAction, notify } from "../../utils/confirm";
import { ActionTile } from "./StockTab";
import { ItemSheet, OptionSheet } from "./CatalogSheets";

// Library › Plumbing / Electrical / Materials / Sizes — the company's item library.
// Owners and admins can add, edit and remove entries here, or upload the whole list as a CSV.
// Everyone else sees it read-only.
export function CatalogTab({ section, query = "" }) {
  const { catalog, canEdit, save, saving, version } = useCatalog();
  const { lines: stock } = useInventory();
  const [itemSheet, setItemSheet] = useState(null); // { trade, item|null }
  const [optionSheet, setOptionSheet] = useState(null); // { trade, list, value|null }
  const [busy, setBusy] = useState(false);
  const q = query.trim().toLowerCase();
  const working = busy || saving;

  // Runs one change; closes the sheet on success, explains why on failure.
  async function run(change, note, after) {
    try {
      setBusy(true);
      await save(change, { note, stock });
      after?.();
    } catch (e) {
      notify("Not saved", e?.message || "Could not save the library.");
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    try {
      setBusy(true);
      await saveTextFile(`item-library-${new Date().toISOString().slice(0, 10)}.csv`, buildCatalogCsv(catalog), "text/csv");
    } catch (e) {
      notify("Download failed", e?.message || "Could not create the CSV.");
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    let picked;
    let parsed;
    try {
      picked = await pickTextFile();
      if (!picked) return;
      parsed = parseCatalogCsv(picked.text);
    } catch (e) {
      if (e instanceof CatalogCsvError) return notify("Upload rejected", `${picked?.name || ""}\n\n${e.message}\n\nNothing was imported. Download the current list to get the exact format.`);
      return notify("Upload failed", e?.message || "Could not read that file.");
    }
    const { counts, trades } = parsed;
    const summary = `${counts.Item} items, ${counts.Material} materials, ${counts.Size} sizes, ${counts.Core} cores (${trades.join(" + ")}).`;
    const replace = await confirmAction({
      title: "Import item library",
      message: `${summary}\n\nReplace the ${trades.join(" and ")} library with this file?\n\nChoose Merge to keep what you have and only add or update what's in the file.`,
      confirmText: "Replace",
      cancelText: "Merge",
    });
    await run(
      (current) => (replace ? replaceFromCsv(current, parsed) : mergeCatalogs(current, parsed.catalog)),
      `CSV ${replace ? "replace" : "merge"}: ${picked.name}`,
      () => notify("Library updated", `${summary}\n\n${replace ? "Replaced" : "Merged"} from ${picked.name}.`)
    );
  }

  async function restoreDefault() {
    const ok = await confirmAction({
      title: "Restore the built-in list?",
      message: "Every item, material, size and core goes back to the original list that came with the app. Your changes are replaced.",
      confirmText: "Restore",
      destructive: true,
    });
    if (ok) await run(DEFAULT_CATALOG, "Restored built-in list");
  }

  const tools = (
    <View style={{ gap: 10, marginBottom: 14 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {canEdit && (section === "Plumbing" || section === "Electrical") ? <ActionTile icon="plus" label="Add item" onPress={() => setItemSheet({ trade: section, item: null })} disabled={working} /> : null}
        {canEdit ? <ActionTile icon="upload" label="Upload CSV" onPress={upload} disabled={working} /> : null}
        <ActionTile icon="download" label="Download CSV" onPress={download} disabled={working} />
      </View>
    </View>
  );

  const footer = canEdit ? (
    <View style={{ alignItems: "center", marginTop: 24, gap: 4 }}>
      <T variant="caption" weight={400} center>
        Library version {version || "built-in"}
      </T>
      <TextButton title="Restore the built-in list" size={13} onPress={restoreDefault} disabled={working} />
    </View>
  ) : null;

  const sheets = (
    <>
      {itemSheet ? (
        <ItemSheet
          key={`${itemSheet.trade}|${itemSheet.item?.name || "new"}`}
          trade={itemSheet.trade}
          item={itemSheet.item}
          families={catalog[itemSheet.trade.toLowerCase()].families}
          units={catalog.units || []}
          busy={working}
          onClose={() => setItemSheet(null)}
          onSave={(next) =>
            run(
              (c) => upsertItem(c, itemSheet.trade, next, itemSheet.item?.name || null),
              itemSheet.item ? `Edited ${itemSheet.trade} item ${itemSheet.item.name}` : `Added ${itemSheet.trade} item ${next.name}`,
              () => setItemSheet(null)
            )
          }
          onRemove={async () => {
            const it = itemSheet.item;
            if (!(await confirmAction({ title: `Delete ${it.name}?`, message: "It won't be offered in new estimates or stock lines. Estimates already made keep it.", confirmText: "Delete", destructive: true }))) return;
            run((c) => removeItem(c, itemSheet.trade, it.name), `Deleted ${itemSheet.trade} item ${it.name}`, () => setItemSheet(null));
          }}
        />
      ) : null}
      {optionSheet ? (
        <OptionSheet
          key={`${optionSheet.trade}|${optionSheet.list}|${optionSheet.value || "new"}`}
          trade={optionSheet.trade}
          listLabel={optionSheet.list.slice(0, -1)}
          value={optionSheet.value}
          busy={working}
          onClose={() => setOptionSheet(null)}
          onSave={(text) =>
            run(
              (c) => upsertOption(c, optionSheet.trade, optionSheet.list, text, optionSheet.value),
              `${optionSheet.value ? "Renamed" : "Added"} ${optionSheet.trade} ${optionSheet.list.slice(0, -1)} ${text}`,
              () => setOptionSheet(null)
            )
          }
          onRemove={() => run((c) => removeOption(c, optionSheet.trade, optionSheet.list, optionSheet.value), `Removed ${optionSheet.trade} ${optionSheet.list.slice(0, -1)} ${optionSheet.value}`, () => setOptionSheet(null))}
        />
      ) : null}
    </>
  );

  if (section === "Materials" || section === "Sizes") {
    const groups =
      section === "Materials"
        ? [
            { trade: "Plumbing", list: "materials", title: "Plumbing materials" },
            { trade: "Electrical", list: "materials", title: "Electrical materials" },
          ]
        : [
            { trade: "Plumbing", list: "sizes", title: "Plumbing sizes" },
            { trade: "Electrical", list: "sizes", title: "Electrical sizes" },
            { trade: "Electrical", list: "cores", title: "Cable cores" },
          ];
    return (
      <View>
        {tools}
        {groups.map((g, i) => {
          const all = catalog[g.trade.toLowerCase()][g.list] || [];
          const shown = all.filter((v) => !q || v.toLowerCase().includes(q));
          return (
            <OptionChips
              key={g.title}
              first={i === 0}
              title={`${g.title} · ${all.length}`}
              items={shown}
              canEdit={canEdit && !working}
              onPick={(value) => setOptionSheet({ trade: g.trade, list: g.list, value })}
              onAdd={() => setOptionSheet({ trade: g.trade, list: g.list, value: null })}
            />
          );
        })}
        {footer}
        {sheets}
      </View>
    );
  }

  return <ItemsView section={section} q={q} catalog={catalog} canEdit={canEdit && !working} tools={tools} footer={footer} sheets={sheets} onPick={(item) => setItemSheet({ trade: section, item })} />;
}

function ItemsView({ section, q, catalog, canEdit, tools, footer, sheets, onPick }) {
  const cat = section === "Electrical" ? catalog.electrical : catalog.plumbing;
  const families = useMemo(
    () => cat.families.map((f) => ({ family: f, items: cat.items[f].filter((i) => !q || i.name.toLowerCase().includes(q) || f.toLowerCase().includes(q)) })).filter((g) => g.items.length),
    [cat, q]
  );
  const flagKey = section === "Electrical" ? "needsCore" : "needsSecondarySize";
  const flagTag = section === "Electrical" ? "core" : "reduces to";
  return (
    <View>
      {tools}
      {!families.length ? (
        <EmptyState icon="search" title="No items match" body="Try another item or family." />
      ) : (
        <View style={{ gap: 14 }}>
          {families.map((g) => (
            <View key={g.family} style={{ gap: 6 }}>
              <RowBetween style={{ paddingTop: 4, paddingHorizontal: 4 }}>
                <T variant="overline">{g.family}</T>
                <T variant="overline">{g.items.length}</T>
              </RowBetween>
              <Group style={{ borderRadius: 14 }}>
                {g.items.map((i) => (
                  <ItemRow key={i.name} name={i.name} unit={i.unit} tag={i[flagKey] ? flagTag : null} onPress={canEdit ? () => onPick({ ...i, family: g.family }) : undefined} />
                ))}
              </Group>
            </View>
          ))}
        </View>
      )}
      {footer}
      {sheets}
    </View>
  );
}

function ItemRow({ name, unit, tag, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 56, paddingHorizontal: 16, backgroundColor: pressed ? colors.tintBlueSoft : colors.surface })}
    >
      <T variant="body" weight={500} numberOfLines={1} style={{ flex: 1 }}>
        {name}
      </T>
      {tag ? (
        <T variant="caption" weight={400}>
          {tag}
        </T>
      ) : null}
      <View style={{ height: 26, paddingHorizontal: 9, borderRadius: radius.s, backgroundColor: colors.specChip, justifyContent: "center" }}>
        <T variant="caption" weight={600}>
          {unit}
        </T>
      </View>
      {onPress ? <Icon name="chevronRight" size={18} color="muted" /> : null}
    </Pressable>
  );
}

function OptionChips({ title, items, first, canEdit, onPick, onAdd }) {
  const chip = { height: 40, paddingHorizontal: 14, borderRadius: radius.m, borderWidth: 1, justifyContent: "center" };
  return (
    <Section title={title} style={first ? { marginTop: 0 } : { marginTop: 20 }} gap={8}>
      <ChipWrap>
        {items.map((s) => (
          <Pressable key={s} disabled={!canEdit} onPress={() => onPick(s)} accessibilityRole={canEdit ? "button" : undefined} style={({ pressed }) => ({ ...chip, borderColor: colors.border, backgroundColor: pressed ? colors.tintBlueSoft : colors.surface })}>
            <T variant="label" weight={600} color="text" num>
              {s}
            </T>
          </Pressable>
        ))}
        {canEdit ? (
          <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel={`Add to ${title}`} style={({ pressed }) => ({ ...chip, borderStyle: "dashed", borderColor: colors.action, backgroundColor: pressed ? colors.tintBlueSoft : colors.surface })}>
            <T variant="label" weight={600} color="blue700">
              + Add
            </T>
          </Pressable>
        ) : null}
      </ChipWrap>
    </Section>
  );
}
