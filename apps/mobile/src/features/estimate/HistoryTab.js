import React, { useEffect, useState } from "react";
import { View, ScrollView, ActivityIndicator } from "react-native";

import { T, Icon, StatusBadge, EmptyState, colors } from "../../ui";
import { shortDate } from "../estimates";

function eventLine(e) {
  if (e.action === "created") return "Created";
  if (e.from && e.to) return null; // rendered as two badges instead
  return e.action || "Updated";
}

// The audit trail for one MTO — who moved it, from what to what, and why (the comment on a
// Reject or Send back). Comes from GET /mtos/:id/history; there's nothing to show without a
// shared workspace (see EstimatesContext.fetchHistory).
export function HistoryTab({ estimateId, fetchHistory }) {
  const [state, setState] = useState({ loading: true, events: null, error: null });

  useEffect(() => {
    let alive = true;
    setState({ loading: true, events: null, error: null });
    fetchHistory(estimateId)
      .then((events) => alive && setState({ loading: false, events, error: null }))
      .catch((e) => alive && setState({ loading: false, events: null, error: e?.message || "Could not load history." }));
    return () => {
      alive = false;
    };
  }, [estimateId, fetchHistory]);

  if (state.loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 }}>
        <ActivityIndicator color={colors.action} />
      </View>
    );
  }

  if (state.error) {
    return <EmptyState icon="alert" title="Couldn't load history" body={state.error} style={{ marginTop: 48, paddingHorizontal: 20 }} />;
  }

  if (!state.events?.length) {
    return <EmptyState icon="clock" title="No history yet" body="Nothing has happened to this MTO on a shared workspace yet." style={{ marginTop: 48, paddingHorizontal: 20 }} />;
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 4 }}>
      {state.events.map((e, i) => (
        <View key={e.id || i} style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ width: 22, alignItems: "center" }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.action, marginTop: 6 }} />
            {i < state.events.length - 1 ? <View style={{ flex: 1, width: 2, backgroundColor: colors.border, marginTop: 2 }} /> : null}
          </View>
          <View style={{ flex: 1, paddingBottom: 18, gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              <T variant="bodyStrong">{e.actorName || "Someone"}</T>
              {e.from && e.to ? (
                <>
                  <T variant="body" weight={400} color="muted">
                    moved this from
                  </T>
                  <StatusBadge status={e.from} />
                  <T variant="body" weight={400} color="muted">
                    to
                  </T>
                  <StatusBadge status={e.to} />
                </>
              ) : (
                <T variant="body" weight={400} color="muted">
                  {eventLine(e)}
                </T>
              )}
            </View>
            {e.comment ? (
              <View style={{ flexDirection: "row", gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.tintBlueSoft }}>
                <Icon name="chat" size={14} color="muted" />
                <T variant="label" weight={400} style={{ flex: 1 }}>
                  {e.comment}
                </T>
              </View>
            ) : null}
            <T variant="caption" weight={400}>
              {shortDate(e.at)}
            </T>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
