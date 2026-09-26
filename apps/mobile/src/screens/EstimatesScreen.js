import React, { useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import { Screen, SearchField, Chip, ChipRow, Group, SwipeRow, EmptyState, T, HStack, Icon } from "../ui";
import { EstimateRow } from "../features/EstimateRow";
import { summarize } from "../features/estimates";
import { useEstimates } from "../context/EstimatesContext";
import { useCompany } from "../context/CompanyContext";
import { useInventory } from "../inventory/InventoryContext";
import { confirmAction, notify } from "../utils/confirm";

const FILTERS = ["All", "Draft", "Ready", "Sent", "Approved", "Plumbing", "Electrical"];

// All estimates: search, filter chips with counts, swipe a row for Duplicate / Delete.
export default function EstimatesScreen({ navigation, route }) {
  const { estimates, deleteEstimate, duplicateEstimate } = useEstimates();
  const { canManageTeam, canEditEstimates } = useCompany();
  const { getAvailability, checkNewLines, stockPolicy } = useInventory();

  // A copy takes all its lines from stock again, so check them first.
  function duplicate(estimate) {
    const problems = checkNewLines(estimate.items || []);
    if (problems.length && stockPolicy === "block") {
      notify("Can't duplicate — not in stock", `${problems.slice(0, 8).join("\n")}${problems.length > 8 ? `\n…and ${problems.length - 8} more` : ""}`);
      return;
    }
    duplicateEstimate(estimate.id);
    if (problems.length) notify("Duplicated — stock is short", problems.slice(0, 8).join("\n"));
  }
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(route?.params?.filter || "All");

  // Home's tiles deep-link here with a filter; consume the param so chips work normally after.
  const routeFilter = route?.params?.filter;
  useEffect(() => {
    if (!routeFilter) return;
    setFilter(routeFilter);
    navigation.setParams({ filter: undefined });
  }, [routeFilter, navigation]);

  const counts = useMemo(() => {
    const c = { All: estimates.length };
    FILTERS.slice(1).forEach((f) => (c[f] = estimates.filter((e) => e.status === f || e.trades?.includes(f)).length));
    return c;
  }, [estimates]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return estimates
      .filter((e) => filter === "All" || e.status === filter || e.trades?.includes(filter))
      .filter((e) => !q || [e.name, e.client, e.site, e.estimateNumber].some((v) => String(v || "").toLowerCase().includes(q)))
      .map((e) => summarize(e, { getAvailability }));
  }, [estimates, query, filter, getAvailability]);

  async function remove(e) {
    if (await confirmAction({ title: `Delete ${e.name}?`, message: "Its lines and stock use are removed. This can't be undone.", confirmText: "Delete", destructive: true })) deleteEstimate(e.id);
  }

  const chips = FILTERS.filter((f) => f === "All" || counts[f] > 0 || f === filter);

  return (
    <Screen tabBar title="Estimates" count={estimates.length}>
      <View style={{ gap: 12 }}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Search name, client or site" />
        <ChipRow>
          {chips.map((f) => (
            <Chip key={f} label={f} count={counts[f]} active={filter === f} onPress={() => setFilter(f)} />
          ))}
        </ChipRow>
      </View>

      <View style={{ marginTop: 16, gap: 10 }}>
        {estimates.length === 0 ? (
          <EmptyState icon="fileText" title="No estimates yet" body="Walk the site, log what you see, and XMTO prices it for you." action="New estimate" onAction={() => navigation.navigate("NewEstimate")} style={{ marginTop: 40 }} />
        ) : rows.length === 0 ? (
          <EmptyState icon="search" title="Nothing matches" body="Try another word or clear the filter." action="Show all" onAction={() => { setQuery(""); setFilter("All"); }} />
        ) : (
          <>
            <Group>
              {rows.map((r) => (
                <SwipeRow
                  key={r.estimate.id}
                  actions={
                    canEditEstimates
                      ? [
                          { label: "Duplicate", icon: "copy", onPress: () => duplicate(r.estimate) },
                          { label: "Delete", icon: "trash", tone: "danger", onPress: () => remove(r.estimate) },
                        ]
                      : []
                  }
                >
                  <EstimateRow s={r} showBy={canManageTeam} onPress={() => navigation.navigate("EstimateDetail", { estimateId: r.estimate.id })} />
                </SwipeRow>
              ))}
            </Group>
            {canEditEstimates ? (
              <HStack gap={4} style={{ justifyContent: "center", marginTop: 4 }}>
                <Icon name="chevronLeft" size={14} color="muted" />
                <T variant="caption" weight={400}>
                  Swipe a row left to duplicate or delete
                </T>
              </HStack>
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}
