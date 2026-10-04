import React, { useMemo, useState } from "react";
import { View, Pressable } from "react-native";

import { Group, Chip, ChipRow, Tag, EmptyState, Sheet, MoneyField, Button, TextButton, T, Icon, colors } from "../../ui";
import { money } from "../estimates";
import { useRates } from "../../pricing/RatesContext";

// Library › Rates: trade + family chips, one row per rate. Admins tap a row to change it.
export function RatesTab({ query = "" }) {
  const { allRates, setRate, resetRate, canEdit } = useRates();
  const [trade, setTrade] = useState("All");
  const [family, setFamily] = useState("All");
  const [editing, setEditing] = useState(null);

  const families = useMemo(() => Array.from(new Set((trade === "All" ? allRates : allRates.filter((r) => r.trade === trade)).map((r) => r.family))), [allRates, trade]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRates.filter((r) => (trade === "All" || r.trade === trade) && (family === "All" || r.family === family) && (!q || [r.item, r.material, r.family].filter(Boolean).some((f) => f.toLowerCase().includes(q))));
  }, [allRates, trade, family, query]);

  return (
    <View style={{ gap: 12 }}>
      <ChipRow>
        {["All", "Plumbing", "Electrical"].map((t) => (
          <Chip key={t} label={t} active={trade === t} onPress={() => { setTrade(t); setFamily("All"); }} />
        ))}
      </ChipRow>
      {families.length > 1 ? (
        <ChipRow>
          {["All", ...families].map((f) => (
            <Chip key={f} label={f === "All" ? "All families" : f} active={family === f} onPress={() => setFamily(f)} style={{ height: 40 }} />
          ))}
        </ChipRow>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon="tag" title="No budget rates match" body="Try another word or family." />
      ) : (
        <Group style={{ borderRadius: 14 }}>
          {rows.map((r) => (
            <Pressable
              key={r.key}
              disabled={!canEdit}
              onPress={() => setEditing(r)}
              accessibilityRole={canEdit ? "button" : undefined}
              accessibilityLabel={canEdit ? `Change rate for ${r.item} ${r.material || ""}` : undefined}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 76, paddingVertical: 12, paddingLeft: 16, paddingRight: 14, backgroundColor: pressed ? colors.tintBlueSoft : colors.surface })}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <T variant="rowTitle" size={15} numberOfLines={1} style={{ flexShrink: 1 }}>
                    {r.item}
                  </T>
                  {r.isCustom ? <Tag>Edited</Tag> : null}
                </View>
                <T variant="caption" weight={400} numberOfLines={1}>
                  {[r.trade, r.family, r.material].filter(Boolean).join(" · ")}
                </T>
                <T variant="label" weight={400} color="text" num>
                  Budget {money(r.materialRate)} · Labour (indicative) {money(r.labourRate)}
                </T>
              </View>
              {canEdit ? <Icon name="chevronRight" size={20} color="chevron" /> : null}
            </Pressable>
          ))}
        </Group>
      )}

      {editing ? (
        <RateEditorSheet
          key={editing.key}
          rate={editing}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            setRate(editing.trade, editing.family, editing.item, editing.material, next);
            setEditing(null);
          }}
          onReset={
            editing.isCustom
              ? () => {
                  resetRate(editing.trade, editing.family, editing.item, editing.material);
                  setEditing(null);
                }
              : null
          }
        />
      ) : null}
    </View>
  );
}

// Change one library rate. Estimates already saved keep the rate they were priced with.
function RateEditorSheet({ rate, onClose, onSave, onReset }) {
  const [materialRate, setMaterialRate] = useState(String(rate.materialRate));
  const [labourRate, setLabourRate] = useState(String(rate.labourRate));
  const clean = (set) => (v) => set(v.replace(/[^0-9.]/g, ""));
  return (
    <Sheet title={rate.item} subtitle={[rate.trade, rate.family, rate.material].filter(Boolean).join(" · ")} onClose={onClose} footer={<Button title="Save budget rates" icon="check" onPress={() => onSave({ materialRate: Number(materialRate) || 0, labourRate: Number(labourRate) || 0 })} />}>
      <View style={{ padding: 20, gap: 14 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <MoneyField label="Material (budget)" value={materialRate} onChangeText={clean(setMaterialRate)} unit={rate.unit} />
          <MoneyField label="Labour (indicative)" value={labourRate} onChangeText={clean(setLabourRate)} unit={rate.unit} />
        </View>
        <T variant="caption" weight={400}>
          These are budgetary and indicative figures. New lines use them; lines already in MTOs keep theirs.
        </T>
        {onReset ? <TextButton title="Reset to catalog default" icon="refresh" onPress={onReset} style={{ alignSelf: "flex-start", height: 44 }} /> : null}
      </View>
    </Sheet>
  );
}
