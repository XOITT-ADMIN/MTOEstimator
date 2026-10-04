import React, { useEffect, useState } from "react";
import { View, ScrollView, ActivityIndicator } from "react-native";

import { Sheet, T, EmptyState, colors } from "../../ui";
import { api, apiEnabled } from "../../api/client";
import { shortDate } from "../estimates";

const TYPE_LABEL = { RECEIPT: "Stock in", ISSUE: "Allocated", RETURN: "Return", ADJUST: "Adjust" };
const TYPE_COLOR = { RECEIPT: "success", ISSUE: "danger", RETURN: "success", ADJUST: "muted" };
const TYPE_SIGN  = { RECEIPT: "+", ISSUE: "−", RETURN: "+", ADJUST: "±" };

// Movements ledger sheet for a single stock line — shows every RECEIPT / ISSUE / RETURN / ADJUST
// with who did it and when. Only available when connected to a shared workspace (API required).
export function StockMovementsSheet({ projectId, stockLineId, lineLabel, onClose }) {
  const [state, setState] = useState({ loading: true, rows: null, error: null });

  useEffect(() => {
    if (!stockLineId || !apiEnabled) {
      setState({ loading: false, rows: [], error: apiEnabled ? null : "Connect to a workspace to see movements." });
      return;
    }
    let alive = true;
    setState({ loading: true, rows: null, error: null });
    api("GET", `/stock/movements?stockLineId=${encodeURIComponent(stockLineId)}&projectId=${encodeURIComponent(projectId || "")}`)
      .then((rows) => alive && setState({ loading: false, rows, error: null }))
      .catch((e) => alive && setState({ loading: false, rows: null, error: e?.message || "Could not load movements." }));
    return () => { alive = false; };
  }, [stockLineId, projectId]);

  return (
    <Sheet visible title="Stock movements" subtitle={lineLabel} onClose={onClose}>
      {state.loading ? (
        <View style={{ padding: 40, alignItems: "center" }}>
          <ActivityIndicator color={colors.action} />
        </View>
      ) : state.error ? (
        <EmptyState icon="alert" title="Couldn't load" body={state.error} style={{ paddingHorizontal: 20, paddingVertical: 24 }} />
      ) : !state.rows?.length ? (
        <EmptyState icon="arrowUpDown" title="No movements yet" body="Stock in, allocate or adjust this stock line to see the ledger." style={{ paddingHorizontal: 20, paddingVertical: 24 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 2 }}>
          {state.rows.map((r) => (
            <View key={r.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 12 }}>
              <View style={{ width: 68, alignItems: "center", paddingVertical: 6, paddingHorizontal: 4, borderRadius: 8, backgroundColor: r.type === "ISSUE" ? colors.dangerTint : colors.successTint }}>
                <T variant="caption" weight={700} color={TYPE_COLOR[r.type]}>
                  {TYPE_LABEL[r.type] || r.type}
                </T>
              </View>
              <View style={{ flex: 1 }}>
                <T variant="bodyStrong">
                  {TYPE_SIGN[r.type]}{Math.abs(r.qty)}
                </T>
                {r.reason ? <T variant="caption" weight={400} numberOfLines={2}>{r.reason}</T> : null}
                {r.estimateId ? <T variant="caption" weight={400} color="muted" numberOfLines={1}>MTO: {r.estimateId}</T> : null}
                <T variant="caption" weight={400} color="muted">{shortDate(r.at)}</T>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </Sheet>
  );
}
