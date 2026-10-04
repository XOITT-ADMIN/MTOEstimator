import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, ActivityIndicator } from "react-native";

import { Section, Group, Row, T, HStack, EmptyState, colors } from "../../ui";
import { api, apiEnabled, events } from "../../api/client";
import { shortDate } from "../estimates";

const fmt = (n) => {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
};
const label = (stockKey) => {
  const p = stockKey.split("|");
  return [p[2], p[3], p[0]].filter(Boolean).join(" · ");
};

// Library › Returns: a report of material returned from closed MTOs and projects, grouped by the MTO (and project) it
// came from. Nothing to enter or maintain — material is recorded as returned when an MTO or a project is closed.
export function ReturnsTab() {
  const [state, setState] = useState({ loading: true, rows: [], error: null });

  const load = useCallback(() => {
    if (!apiEnabled) {
      setState({ loading: false, rows: [], error: null });
      return;
    }
    api("GET", "/stock/returns")
      .then((rows) => setState({ loading: false, rows, error: null }))
      .catch((e) => setState({ loading: false, rows: [], error: e?.message || "Could not load returns." }));
  }, []);

  useEffect(() => {
    load();
    return events.subscribe((msg) => {
      if (msg.type === "changed" && msg.resource === "stock") load();
    });
  }, [load]);

  // One block per MTO (or per project, for a leftover no single MTO accounts for).
  const groups = useMemo(() => {
    const by = new Map();
    for (const r of state.rows) {
      const key = r.estimateId || `project:${r.projectId}`;
      if (!by.has(key)) {
        by.set(key, {
          key,
          title: r.estimateNumber ? `${r.estimateNumber}${r.estimateName ? ` · ${r.estimateName}` : ""}` : "Other leftover",
          project: r.projectName,
          at: r.at,
          rows: [],
        });
      }
      by.get(key).rows.push(r);
    }
    return Array.from(by.values());
  }, [state.rows]);

  if (state.loading) return <View style={{ padding: 40, alignItems: "center" }}><ActivityIndicator color={colors.action} /></View>;
  if (state.error) return <EmptyState icon="alert" title="Couldn't load" body={state.error} />;
  if (!groups.length) {
    return (
      <EmptyState
        icon="box"
        title="Nothing returned yet"
        body="When an MTO or a project is closed, its unused material is recorded as returned and listed here, by MTO."
      />
    );
  }

  return (
    <View>
      <T variant="sub" style={{ marginBottom: 6 }}>
        Recorded automatically when an MTO or a project is closed.
      </T>
      {groups.map((g) => (
        <Section key={g.key} title={`${g.title}${g.project ? ` — ${g.project}` : ""}`}>
          <Group>
            {g.rows.map((r) => (
              <Row key={r.id} minHeight={52}>
                <HStack gap={8} style={{ alignItems: "center" }}>
                  <View style={{ flex: 1 }}>
                    <T variant="bodyStrong" numberOfLines={1}>{label(r.stockKey)}</T>
                    <T variant="caption" weight={400} style={{ color: colors.faint }}>{shortDate(r.at)}</T>
                  </View>
                  <T variant="bodyStrong" num>+{fmt(r.qty)}</T>
                </HStack>
              </Row>
            ))}
          </Group>
        </Section>
      ))}
    </View>
  );
}
