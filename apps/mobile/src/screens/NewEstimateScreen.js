import React, { useMemo, useState } from "react";
import { View, ScrollView } from "react-native";

import { Sheet, Field, SuggestChip, Button, T, Icon, HStack } from "../ui";
import { TradeToggle } from "../features/TradeToggle";
import { useEstimates } from "../context/EstimatesContext";

const TRADES = ["Plumbing", "Electrical"];

// New estimate sheet. Recent clients and sites are one tap away.
export default function NewEstimateScreen({ navigation }) {
  const { addEstimate, estimates } = useEstimates();
  const recentClients = useMemo(() => Array.from(new Set(estimates.map((e) => e.client).filter(Boolean))).slice(0, 3), [estimates]);
  const recentSites = useMemo(() => Array.from(new Set(estimates.map((e) => e.site).filter(Boolean))).slice(0, 3), [estimates]);
  const [name, setName] = useState("");
  const [client, setClient] = useState(recentClients[0] || "");
  const [site, setSite] = useState(recentSites[0] || "");
  const [trades, setTrades] = useState(["Plumbing"]);
  const toggle = (t) => setTrades((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  const ready = name.trim().length > 0 && trades.length > 0;

  function create() {
    if (!ready) return;
    const id = addEstimate({
      name: name.trim(),
      client: client.trim(),
      site: site.trim(),
      date: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      trades,
    });
    navigation.replace("EstimateDetail", { estimateId: id });
  }

  return (
    <Sheet
      inline
      title="New estimate"
      onClose={() => navigation.goBack()}
      footer={<Button title={!name.trim() ? "Add a project name" : !trades.length ? "Pick a trade" : "Create estimate"} disabled={!ready} onPress={create} />}
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
        <Field label="Project name" value={name} onChangeText={setName} placeholder="e.g. Villa 14 — ground floor" autoFocus returnKeyType="next" />
        <View style={{ gap: 8 }}>
          <Field label="Client" value={client} onChangeText={setClient} placeholder="Client or builder" autoCapitalize="words" />
          {recentClients.length ? (
            <HStack wrap>
              {recentClients.map((c) => (
                <SuggestChip key={c} label={c} active={client === c} onPress={() => setClient(c)} />
              ))}
            </HStack>
          ) : null}
        </View>
        <View style={{ gap: 8 }}>
          <Field label="Site" value={site} onChangeText={setSite} placeholder="Area or address" autoCapitalize="words" />
          {recentSites.length ? (
            <HStack wrap>
              {recentSites.map((c) => (
                <SuggestChip key={c} label={c} active={site === c} onPress={() => setSite(c)} />
              ))}
            </HStack>
          ) : null}
        </View>
        <View style={{ gap: 8 }}>
          <T variant="label">Trades in this job</T>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {TRADES.map((t) => (
              <TradeToggle key={t} trade={t} on={trades.includes(t)} onPress={() => toggle(t)} />
            ))}
          </View>
        </View>
        {recentClients.length ? (
          <HStack gap={8} align="flex-start">
            <Icon name="info" size={18} color="muted" />
            <T variant="label" weight={400} style={{ flex: 1 }}>
              Client and site are remembered from your last estimate.
            </T>
          </HStack>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}
