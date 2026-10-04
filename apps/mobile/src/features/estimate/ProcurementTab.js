import React, { useEffect, useState, useCallback } from "react";
import { View, ScrollView, TextInput, ActivityIndicator } from "react-native";

import { T, Button, EmptyState, colors } from "../../ui";
import { api } from "../../api/client";
import { notify } from "../../utils/confirm";
import { stockKey } from "../../inventory/stockCsv";

const toFixed2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Short label from a stockKey ("trade|family|item|material|size|unit")
function labelFromKey(key) {
  const parts = key.split("|");
  return [parts[2], parts[3], parts[4]].filter(Boolean).join(" · ");
}

function IssueRow({ line, onIssueChange, onPurchaseChange }) {
  const needed = line.qty - line.issuedQty;
  // How much of what's still needed has already been flagged "to buy" — this much is out of
  // Procurement's hands here; it's waiting on Library → Stock → Purchases to be received.
  const waitingOnPurchase = Math.max(0, Math.min(line.purchasedQty || 0, needed));
  const unflagged = needed - waitingOnPurchase;
  const label = line.item
    ? `${line.item} · ${line.material} · ${line.size}`
    : labelFromKey(line.stockKey || "");

  return (
    <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 6 }}>
      <T variant="bodyStrong" numberOfLines={2}>{label}</T>
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        <T variant="caption" weight={400} style={{ color: colors.muted }}>
          Needed: {toFixed2(line.qty)} {line.unit || ""}
        </T>
        <T variant="caption" weight={400} style={{ color: colors.muted }}>
          · Allocated: {toFixed2(line.issuedQty)} {line.unit || ""}
        </T>
        {line.stockOnHand != null ? (
          <T variant="caption" weight={400} style={{ color: needed > line.stockOnHand ? colors.danger : colors.success }}>
            · In stock: {toFixed2(line.stockOnHand)} {line.unit || ""}
          </T>
        ) : null}
      </View>

      {needed <= 0 ? (
        <View style={{ paddingVertical: 4 }}>
          <T variant="caption" style={{ color: colors.success }}>Fully allocated</T>
        </View>
      ) : (
        <>
          {waitingOnPurchase > 0 ? (
            <View style={{ alignSelf: "flex-start", paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.warningTint }}>
              <T variant="caption" weight={600} style={{ color: colors.warningInk }}>
                Waiting for purchase — {toFixed2(waitingOnPurchase)} {line.unit || ""} marked to buy
              </T>
            </View>
          ) : null}

          {unflagged > 0 ? (
            <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
              <View style={{ flex: 1 }}>
                <T variant="caption" weight={500} style={{ marginBottom: 4 }}>Allocate from stock</T>
                <TextInput
                  style={inputStyle}
                  keyboardType="decimal-pad"
                  defaultValue={String(Math.max(0, Math.min(unflagged, line.stockOnHand ?? 0)))}
                  onChangeText={(v) => onIssueChange(line.lineId || line.id, v)}
                  accessibilityLabel="Allocate qty"
                />
              </View>
              <View style={{ flex: 1 }}>
                <T variant="caption" weight={500} style={{ marginBottom: 4 }}>To buy (ext.)</T>
                <TextInput
                  style={inputStyle}
                  keyboardType="decimal-pad"
                  defaultValue="0"
                  onChangeText={(v) => onPurchaseChange(line.lineId || line.id, v)}
                  accessibilityLabel="Purchase qty"
                />
              </View>
            </View>
          ) : (
            <T variant="caption" weight={400} style={{ color: colors.faint, marginTop: 2 }}>
              Add it to stock from Library → Stock → Purchases once it's bought.
            </T>
          )}
        </>
      )}
    </View>
  );
}

const inputStyle = {
  height: 44,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 10,
  paddingHorizontal: 12,
  fontSize: 15,
  color: colors.text,
  backgroundColor: colors.surface,
};

// Procurement sheet: shows each line's needed/issued/in-stock quantities and lets Procurement
// record how much to issue from stock and how much to buy externally.
export function ProcurementTab({ estimate, perms, onProcured }) {
  const [stockMap, setStockMap]   = useState({});
  // issuedQty/purchasedQty live on EstimateLine, not on the estimate's own `data.items` JSON —
  // procurement never writes the JSON back, so item.issuedQty would be permanently stale after
  // a reload. Load the real numbers from /mtos/:id/lines instead of trusting the item fields.
  const [lineStatus, setLineStatus] = useState({});
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [issueVals, setIssueVals]   = useState({});
  const [buyVals, setBuyVals]       = useState({});

  const isProcurement = !!perms?.has("mto.procure");
  const canProcure    = isProcurement && (estimate?.status === "BUDGET_OK" || estimate?.status === "READY_TO_DISPATCH");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stockResult, lines] = await Promise.all([
        api("GET", `/sync/stock?projectId=${encodeURIComponent(estimate?.projectId || "")}`),
        estimate?.id ? api("GET", `/mtos/${estimate.id}/lines`) : Promise.resolve([]),
      ]);
      const map = {};
      for (const l of (stockResult?.items || [])) map[l.key] = l.stock ?? l.onHand ?? 0;
      setStockMap(map);
      const status = {};
      for (const l of lines || []) status[l.lineId] = { issuedQty: l.issuedQty, purchasedQty: l.purchasedQty };
      setLineStatus(status);
    } catch (e) {
      // offline — show without stock/issued numbers
    } finally {
      setLoading(false);
    }
  }, [estimate?.id, estimate?.projectId]);

  useEffect(() => { load(); }, [load]);

  // What the "Issue from stock" box is pre-filled with: whatever's still needed (and not already
  // flagged to buy) that the store can cover.
  const suggestIssue = (l) => {
    const needed = l.qty - l.issuedQty;
    const unflagged = needed - Math.max(0, Math.min(l.purchasedQty || 0, needed));
    return Math.max(0, Math.min(unflagged, l.stockOnHand ?? 0));
  };

  const lines = (estimate?.items || []).map((item) => ({
    ...item,
    lineId:      item.id,
    issuedQty:   lineStatus[item.id]?.issuedQty ?? item.issuedQty ?? 0,
    purchasedQty: lineStatus[item.id]?.purchasedQty ?? item.purchasedQty ?? 0,
    // Items don't carry a stockKey of their own — derive it the same way the server does.
    stockKey:    item.stockKey || stockKey(item),
    stockOnHand: stockMap[item.stockKey || stockKey(item)] ?? null,
  }));

  // Lines with something left to decide (not yet allocated, and not already marked to buy). When
  // there are none, everything outstanding is waiting on a purchase — nothing to indent.
  const hasActionable = lines.some((l) => {
    const needed = l.qty - l.issuedQty;
    return needed - Math.max(0, Math.min(l.purchasedQty || 0, needed)) > 0.005;
  });
  const allIssued = lines.length > 0 && lines.every((l) => toFixed2(l.issuedQty) >= toFixed2(l.qty));

  async function handleSave() {
    const payload = lines
      .map((l) => ({
        lineId:      l.lineId,
        // An untouched box still shows the suggestion, so that's what gets issued.
        issueQty:    issueVals[l.lineId] != null ? parseFloat(issueVals[l.lineId]) || 0 : suggestIssue(l),
        purchaseQty: parseFloat(buyVals[l.lineId] ?? "0") || 0,
      }))
      .filter((e) => e.issueQty > 0 || e.purchaseQty > 0);

    if (!payload.length) { notify("Nothing to save", "Enter a quantity to allocate or purchase for at least one line."); return; }

    setSaving(true);
    try {
      const result = await api("POST", `/mtos/${estimate.id}/procurement`, { lines: payload });
      setLineStatus((prev) => {
        const next = { ...prev };
        for (const l of result?.lines || []) next[l.lineId] = { issuedQty: l.issuedQty, purchasedQty: l.purchasedQty };
        return next;
      });
      setIssueVals({});
      setBuyVals({});
      if (onProcured) onProcured();
    } catch (e) {
      notify("Could not save", e?.message || "Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.action} />
      </View>
    );
  }

  if (!lines.length) {
    return <EmptyState icon="box" title="No lines" body="This MTO has no items yet." style={{ marginTop: 48, paddingHorizontal: 20 }} />;
  }

  if (!canProcure && estimate?.status !== "BUDGET_OK" && estimate?.status !== "READY_TO_DISPATCH") {
    return (
      <EmptyState icon="box" title="Not ready for procurement" body="This MTO must reach Budget OK before procurement can allocate items." style={{ marginTop: 48, paddingHorizontal: 20 }} />
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
      {allIssued ? (
        <View style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.successTint, marginBottom: 12 }}>
          <T variant="bodyStrong" style={{ color: colors.successInk }}>All lines fully allocated — ready to dispatch.</T>
        </View>
      ) : null}

      {lines.map((l) => (
        <IssueRow
          key={l.lineId}
          line={l}
          onIssueChange={(id, v) => setIssueVals((p) => ({ ...p, [id]: v }))}
          onPurchaseChange={(id, v) => setBuyVals((p) => ({ ...p, [id]: v }))}
        />
      ))}

      {canProcure && !allIssued ? (
        <Button
          title="Purchase indent"
          icon="checkCircle"
          loading={saving}
          disabled={saving || !hasActionable}
          onPress={handleSave}
          style={{ marginTop: 20 }}
        />
      ) : null}
      {canProcure && !allIssued && !hasActionable ? (
        <T variant="caption" weight={500} style={{ color: colors.warningInk, marginTop: 8 }}>
          Everything outstanding is waiting for purchase. Add it to stock from Library → Stock → Purchases once it's bought, then allocate it here.
        </T>
      ) : null}
    </ScrollView>
  );
}
