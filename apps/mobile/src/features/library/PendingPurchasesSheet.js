import React, { useCallback, useEffect, useState } from "react";
import { View, ScrollView, ActivityIndicator } from "react-native";

import { Sheet, Field, Button, T, HStack, EmptyState, colors } from "../../ui";
import { api } from "../../api/client";
import { notify } from "../../utils/confirm";

const fmt = (n) => {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
};

// One MTO's slice of a pending purchase: "Receive & issue" does both steps — records the
// receipt into stock, then issues that qty straight to the MTO that's waiting on it — so a
// purchase earmarked for a specific line never sits in stock unissued and untracked.
function WaitingRow({ stockKey, mto, onDone }) {
  const [qty, setQty] = useState(String(mto.pending));
  const [busy, setBusy] = useState(false);

  async function receiveAndIssue() {
    const n = parseFloat(qty);
    if (!Number.isFinite(n) || n <= 0) return;
    setBusy(true);
    try {
      await api("POST", "/stock/receipts", { lines: [{ stockLineId: stockKey, qty: n, estimateId: mto.estimateId }] });
      await api("POST", `/mtos/${mto.estimateId}/procurement`, { lines: [{ lineId: mto.lineId, issueQty: n, purchaseQty: 0 }] });
      notify("Received & issued", `${fmt(n)} sent to ${mto.estimateNumber}.`);
      onDone();
    } catch (e) {
      notify("Couldn't finish this", e?.message || "Try again — if stock was received but not issued, finish it from the MTO's Procurement tab.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ paddingVertical: 10, gap: 8 }}>
      <HStack gap={8} style={{ justifyContent: "space-between" }}>
        <T variant="bodyStrong" numberOfLines={1}>{mto.estimateNumber} · {mto.name || "Untitled"}</T>
        <T variant="caption" weight={400} style={{ color: colors.faint }}>Waiting: {fmt(mto.pending)}</T>
      </HStack>
      <HStack gap={8}>
        <View style={{ flex: 1 }}>
          <Field value={qty} onChangeText={setQty} keyboardType="decimal-pad" placeholder="Qty" />
        </View>
        <Button title="Receive & issue" compact loading={busy} disabled={busy} onPress={receiveAndIssue} />
      </HStack>
    </View>
  );
}

function PendingGroup({ row, onDone }) {
  const label = [row.item, row.material, row.size].filter(Boolean).join(" · ");
  return (
    <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 4 }}>
      <HStack gap={8} style={{ justifyContent: "space-between" }}>
        <T variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>{label || row.stockKey}</T>
        <T variant="caption" weight={600}>{fmt(row.pending)} {row.unit} to buy</T>
      </HStack>
      <T variant="caption" weight={400} style={{ color: colors.faint }}>On hand: {fmt(row.onHand)} {row.unit}</T>
      <View style={{ marginTop: 4 }}>
        {row.mtos.map((mto) => (
          <WaitingRow key={`${row.stockKey}-${mto.lineId}`} stockKey={row.stockKey} mto={mto} onDone={onDone} />
        ))}
      </View>
    </View>
  );
}

// Closes the loop the Procurement tab leaves open: items marked "to buy" there are recorded
// (purchasedQty) but never added to stock automatically. This lists everything still short
// across every MTO waiting on a purchase, grouped by material, so Procurement can buy it once
// and receive + issue it from here instead of hunting through each MTO individually.
export function PendingPurchasesSheet({ onClose }) {
  const [state, setState] = useState({ loading: true, rows: null, error: null });

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    api("GET", "/stock/pending-purchases")
      .then((rows) => setState({ loading: false, rows, error: null }))
      .catch((e) => setState({ loading: false, rows: null, error: e?.message || "Could not load pending purchases." }));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Sheet visible title="Pending purchases" subtitle="Marked “to buy” during procurement, not yet received" onClose={onClose}>
      {state.loading ? (
        <View style={{ padding: 40, alignItems: "center" }}>
          <ActivityIndicator color={colors.action} />
        </View>
      ) : state.error ? (
        <EmptyState icon="alert" title="Couldn't load" body={state.error} style={{ paddingHorizontal: 20, paddingVertical: 24 }} />
      ) : !state.rows?.length ? (
        <EmptyState icon="truck" title="Nothing pending" body="Every purchase marked in procurement has been received and issued." style={{ paddingHorizontal: 20, paddingVertical: 24 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
          {state.rows.map((row) => (
            <PendingGroup key={row.stockKey} row={row} onDone={load} />
          ))}
        </ScrollView>
      )}
    </Sheet>
  );
}
