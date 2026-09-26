import React, { useMemo, useState } from "react";
import { View, Pressable } from "react-native";

import { Screen, Section, Blueprint, Card, Group, Row, IconTile, T, Icon, StatusBadge, TradePill, CountPill, SyncChip, EmptyState, HStack, XMark, Avatar, colors } from "../ui";
import AccountMenu from "../components/AccountMenu";
import { EstimateRow } from "../features/EstimateRow";
import { summarize, greetingFor, money, moneyParts, plural, timeAgo } from "../features/estimates";
import { useSyncState } from "../features/sync";
import { useEstimates } from "../context/EstimatesContext";
import { useAuth } from "../context/AuthContext";
import { useCompany } from "../context/CompanyContext";
import { useInventory } from "../inventory/InventoryContext";
import { confirmAction } from "../utils/confirm";

// Home: greeting + sync, value card, the estimate to pick up, things that need attention, recent.
export default function HomeScreen({ navigation }) {
  const { estimates } = useEstimates();
  const { user, signOut } = useAuth();
  const { profile, company, canManageTeam } = useCompany();
  const { lines: stockLines, getAvailability } = useInventory();
  const sync = useSyncState();
  const [menuOpen, setMenuOpen] = useState(false);

  const rows = useMemo(() => estimates.map((e) => summarize(e, { getAvailability })), [estimates, getAvailability]);
  const month = new Date().toLocaleDateString("en-IN", { month: "long" });
  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = rows.filter(({ estimate }) => {
      const d = new Date(estimate.updatedAt || 0);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const count = (st) => estimates.filter((e) => e.status === st).length;
    return {
      value: thisMonth.reduce((a, r) => a + r.value, 0),
      estimates: thisMonth.length,
      items: thisMonth.reduce((a, r) => a + r.items, 0),
      Draft: count("Draft"),
      Ready: count("Ready"),
      Sent: count("Sent"),
    };
  }, [rows, estimates]);

  const pickUp = rows.find((r) => r.estimate.status === "Draft" && r.items > 0) || rows[0];
  const unpriced = rows.filter((r) => r.unpriced > 0);
  const unpricedCount = unpriced.reduce((a, r) => a + r.unpriced, 0);
  const low = stockLines.filter((l) => l.available > 0 && l.available < l.stock * 0.25).length;
  const out = stockLines.filter((l) => l.available <= 0).length;
  const recent = rows.filter((r) => r !== pickUp).slice(0, 3);
  const [whole, paise] = moneyParts(stats.value);
  const first = (user?.name || "").trim().split(/\s+/)[0] || "there";
  const open = (id) => navigation.navigate("EstimateDetail", { estimateId: id });
  const toList = (filter) => navigation.navigate("Estimates", { filter });

  async function handleSignOut() {
    setMenuOpen(false);
    if (await confirmAction({ title: "Sign out?", message: "You'll need an email code to sign in again.", confirmText: "Sign out", destructive: true })) signOut();
  }

  return (
    <Screen tabBar>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <View style={{ paddingTop: 4 }}>
          <XMark size={30} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T size={22} weight={600} color="navy" style={{ lineHeight: 28 }} numberOfLines={1}>
            {greetingFor()}, {first}
          </T>
          <T variant="sub" numberOfLines={1} style={{ marginTop: 2 }}>
            {company?.name || profile?.name || "Your workspace"}
          </T>
          <View style={{ marginTop: 10 }}>
            <SyncChip state={sync.state} pending={sync.pending} />
          </View>
        </View>
        <Pressable onPress={() => setMenuOpen(true)} accessibilityRole="button" accessibilityLabel="Account menu">
          <Avatar name={user?.name} />
        </Pressable>
      </View>

      {/* Value card */}
      <Blueprint radius={20} style={{ marginTop: 20, padding: 20, gap: 16 }}>
        <View>
          <T variant="label" weight={400} color="onNavyMuted">
            Estimated value · {month}
          </T>
          <T size={34} weight={600} color="white" num style={{ lineHeight: 42, marginTop: 4 }}>
            {whole}
            <T size={18} weight={600} color="onNavyMuted" num>
              {paise}
            </T>
          </T>
          <T variant="label" weight={400} color="onNavyMuted" style={{ marginTop: 2 }}>
            {plural(stats.estimates, "estimate")} · {plural(stats.items, "line item")}
          </T>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[
            ["Draft", "Drafts", colors.warning],
            ["Ready", "Ready", colors.blue500],
            ["Sent", "Sent", colors.onNavyMuted],
          ].map(([key, label, dot]) => (
            <Pressable key={key} onPress={() => toList(key)} accessibilityRole="button" accessibilityLabel={`${stats[key]} ${label}`} style={({ pressed }) => ({ flex: 1, minHeight: 60, gap: 2, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: pressed ? "rgba(255,255,255,0.14)" : colors.onNavyTile })}>
              <T size={20} weight={600} color="white" num style={{ lineHeight: 24 }}>
                {stats[key]}
              </T>
              <HStack gap={5}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} />
                <T variant="caption" weight={400} color="onNavyMuted">
                  {label}
                </T>
              </HStack>
            </Pressable>
          ))}
        </View>
      </Blueprint>

      {estimates.length === 0 ? (
        <EmptyState icon="fileText" title="No estimates yet" body="Walk the site, log what you see, and XMTO prices it for you." action="New estimate" onAction={() => navigation.navigate("NewEstimate")} style={{ marginTop: 24 }} />
      ) : null}

      {/* Pick up where you left off */}
      {pickUp ? (
        <Section title="Pick up where you left off">
          <Card onPress={() => open(pickUp.estimate.id)} style={{ gap: 10 }} accessibilityLabel={`Resume ${pickUp.estimate.name}`}>
            <HStack gap={8}>
              <T variant="caption" weight={600} num style={{ letterSpacing: 0.5 }}>
                {pickUp.estimate.estimateNumber}
              </T>
              <StatusBadge status={pickUp.estimate.status} />
              <HStack gap={4} style={{ marginLeft: "auto" }}>
                <Icon name="clock" size={14} color="muted" />
                <T variant="caption" weight={400}>
                  {timeAgo(pickUp.estimate.updatedAt)}
                </T>
              </HStack>
            </HStack>
            <View>
              <T variant="cardTitle" numberOfLines={2}>
                {pickUp.estimate.name}
              </T>
              <T variant="sub" style={{ marginTop: 2 }} numberOfLines={1}>
                {[pickUp.estimate.client, pickUp.estimate.site].filter(Boolean).join(" · ") || "No client yet"}
              </T>
            </View>
            {pickUp.trades.length ? (
              <HStack gap={6}>
                {pickUp.trades.map((t) => (
                  <TradePill key={t} trade={t} />
                ))}
              </HStack>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
              <T variant="label" weight={400}>
                {plural(pickUp.items, "item")}
                {pickUp.short ? (
                  <T variant="label" weight={500} color="danger">
                    {" · "}
                    {pickUp.short} out of stock
                  </T>
                ) : null}
              </T>
              <HStack gap={4}>
                <T variant="cardTitle" color="text" num>
                  {money(pickUp.value)}
                </T>
                <Icon name="chevronRight" size={20} color="blue700" />
              </HStack>
            </View>
          </Card>
        </Section>
      ) : null}

      {/* Needs attention */}
      {unpricedCount || low || out ? (
        <Section title="Needs attention">
          <Group>
            {unpricedCount ? (
              <Row key="rate" left={<IconTile icon="tag" bg={colors.warningTint} color="warningInk" />} onPress={() => open(unpriced[0].estimate.id)} minHeight={68}>
                <T variant="bodyStrong">{plural(unpricedCount, "line")} {unpricedCount === 1 ? "has" : "have"} no rate</T>
                <T variant="label" weight={400} numberOfLines={1}>
                  {unpriced[0].estimate.name} · price them before sending
                </T>
              </Row>
            ) : null}
            {low || out ? (
              <Row
                key="stock"
                left={<IconTile icon="box" />}
                onPress={() => navigation.navigate("Library", { section: "Stock" })}
                minHeight={68}
                right={
                  <HStack gap={4}>
                    {low ? <CountPill tone="warning">{low} low</CountPill> : null}
                    {out ? <CountPill tone="danger">{out} out</CountPill> : null}
                  </HStack>
                }
              >
                <T variant="bodyStrong">Stock alerts</T>
                <T variant="label" weight={400} numberOfLines={1}>
                  {canManageTeam ? "Top up before they block estimates" : "Some items are running out"}
                </T>
              </Row>
            ) : null}
          </Group>
        </Section>
      ) : null}

      {/* Recent */}
      {recent.length ? (
        <Section title="Recent" action="See all" onAction={() => toList("All")}>
          <Group>
            {recent.map((r) => (
              <EstimateRow key={r.estimate.id} s={r} onPress={() => open(r.estimate.id)} showBy={canManageTeam} />
            ))}
          </Group>
        </Section>
      ) : null}

      <AccountMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        user={user}
        companyName={company?.name || profile?.name}
        onSettings={() => {
          setMenuOpen(false);
          navigation.navigate("Settings");
        }}
        onSignOut={handleSignOut}
      />
    </Screen>
  );
}
