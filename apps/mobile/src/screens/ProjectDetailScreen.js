import React, { useCallback, useEffect, useState } from "react";
import { View, Pressable } from "react-native";

import { Screen, TopBar, Section, Group, Row, Button, T, Icon, HStack, StatusBadge, EmptyState, colors } from "../ui";
import { useProjects } from "../context/ProjectsContext";
import { useCompany } from "../context/CompanyContext";
import { useEstimates } from "../context/EstimatesContext";
import { DailyUseSheet } from "../features/project/DailyUseSheet";
import { confirmAction, notify } from "../utils/confirm";

function BalanceRow({ item }) {
  const parts = item.stockKey.split("|");
  const label = [parts[2], parts[3], parts[0]].filter(Boolean).join(" · ");
  const balanceColor = item.balance <= 0 ? colors.faint : colors.ink;
  return (
    <Row minHeight={56}>
      <T variant="bodyStrong" numberOfLines={1}>{label}</T>
      <HStack gap={16} style={{ marginTop: 2 }}>
        <T variant="caption" weight={400}><T variant="caption" weight={600}>Delivered</T> {item.delivered.toFixed(2)}</T>
        <T variant="caption" weight={400}><T variant="caption" weight={600}>Used</T> {item.used.toFixed(2)}</T>
        {item.wasted > 0 ? <T variant="caption" weight={400}><T variant="caption" weight={600}>Wasted</T> {item.wasted.toFixed(2)}</T> : null}
        <T variant="caption" weight={600} style={{ color: balanceColor }}>Balance {item.balance.toFixed(2)}</T>
      </HStack>
    </Row>
  );
}

function LogRow({ entry }) {
  const parts = entry.stockKey.split("|");
  const label = [parts[2], parts[3], parts[0]].filter(Boolean).join(" · ");
  const kindColor = entry.kind === "WASTED" ? colors.warning : colors.success;
  return (
    <Row minHeight={52}>
      <HStack gap={6}>
        <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 5, backgroundColor: kindColor }} />
        <View style={{ flex: 1 }}>
          <T variant="bodyStrong" numberOfLines={1}>{label}</T>
          {entry.note ? <T variant="caption" weight={400} numberOfLines={1}>{entry.note}</T> : null}
        </View>
        <T variant="bodyStrong" num>{entry.qty.toFixed(2)}</T>
      </HStack>
    </Row>
  );
}

export default function ProjectDetailScreen({ navigation, route }) {
  const { projectId } = route.params;
  const { getProject, getSiteBalance, getConsumption, closeProject } = useProjects();
  const { canManageTeam } = useCompany();
  const { estimates } = useEstimates();

  const project = getProject(projectId);
  const [balance, setBalance] = useState([]);
  const [log, setLog] = useState([]);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [dailyUseOpen, setDailyUseOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const projectMTOs = estimates.filter((e) => e.projectId === projectId);

  const reload = useCallback(async () => {
    try {
      const [bal, entries] = await Promise.all([getSiteBalance(projectId), getConsumption(projectId)]);
      setBalance(bal);
      setLog(entries);
    } catch (e) {
      // Network error — stay with cached state
    } finally {
      setLoadingBalance(false);
    }
  }, [projectId, getSiteBalance, getConsumption]);

  useEffect(() => { reload(); }, [reload]);

  async function handleClose() {
    const hasBalance = balance.some((b) => b.balance > 0);
    const summary = hasBalance
      ? `${balance.filter((b) => b.balance > 0).length} item(s) with remaining balance will be returned to stock.`
      : "No material balance to return.";
    if (
      !(await confirmAction({
        title: "Close project?",
        message: `${project?.name}\n\n${summary}\n\nAll DELIVERED and IN_USE MTOs will be marked CLOSED.`,
        confirmText: "Close project",
        destructive: true,
      }))
    ) return;

    setClosing(true);
    try {
      const result = await closeProject(projectId);
      notify("Project closed", result.returned?.length ? `${result.returned.length} item(s) returned to stock.` : "No material to return.");
      navigation.goBack();
    } catch (e) {
      notify("Couldn't close", e?.message || "Try again.");
    } finally {
      setClosing(false);
    }
  }

  if (!project) return null;

  const isOpen = project.status === "open";
  const recentLog = log.slice(0, 20);
  const hasBalance = balance.some((b) => b.delivered > 0);

  return (
    <Screen header={<TopBar title={project.name} onBack={() => navigation.goBack()} />}>
      {/* Status + site name */}
      <HStack gap={8} style={{ marginBottom: 8 }}>
        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: isOpen ? colors.successTint : colors.border }}>
          <T variant="caption" weight={600} style={{ color: isOpen ? colors.successInk : colors.faint }}>
            {isOpen ? "Open" : "Closed"}
          </T>
        </View>
        {project.siteName ? <T variant="sub">{project.siteName}</T> : null}
      </HStack>

      {/* MTO summary */}
      {projectMTOs.length ? (
        <Section title="MTOs">
          <Group>
            {projectMTOs.slice(0, 5).map((e) => (
              <Row
                key={e.id}
                minHeight={52}
                right={<Icon name="chevronRight" size={16} color="muted" />}
                onPress={() => navigation.navigate("EstimateDetail", { estimateId: e.id })}
              >
                <HStack gap={8}>
                  <T variant="caption" weight={600} num>{e.estimateNumber}</T>
                  <StatusBadge status={e.status} />
                </HStack>
                <T variant="sub" numberOfLines={1}>{e.name}</T>
              </Row>
            ))}
            {projectMTOs.length > 5 ? (
              <Row minHeight={44} onPress={() => navigation.navigate("Estimates")}>
                <T variant="sub" style={{ color: colors.action }}>See all {projectMTOs.length} MTOs</T>
              </Row>
            ) : null}
          </Group>
        </Section>
      ) : null}

      {/* Site balance */}
      {hasBalance ? (
        <Section title="Site balance">
          <Group>
            {balance.filter((b) => b.delivered > 0).map((b) => (
              <BalanceRow key={b.stockKey} item={b} />
            ))}
          </Group>
        </Section>
      ) : null}

      {/* Consumption log */}
      {recentLog.length ? (
        <Section title="Recent consumption">
          <Group>
            {recentLog.map((e) => (
              <LogRow key={e.id} entry={e} />
            ))}
          </Group>
        </Section>
      ) : null}

      {!hasBalance && !recentLog.length && !loadingBalance ? (
        <EmptyState
          icon="box"
          title="No material on site yet"
          body="Material shows here once MTOs are delivered."
          style={{ marginTop: 24 }}
        />
      ) : null}

      {/* Actions */}
      {isOpen ? (
        <View style={{ marginTop: 20, gap: 12 }}>
          {hasBalance ? (
            <Button title="Record daily use" onPress={() => setDailyUseOpen(true)} />
          ) : null}
          {canManageTeam ? (
            <Button title="Close project" tone="dangerSolid" loading={closing} disabled={closing} onPress={handleClose} />
          ) : null}
        </View>
      ) : null}

      <DailyUseSheet
        projectId={projectId}
        balance={balance}
        visible={dailyUseOpen}
        onClose={() => setDailyUseOpen(false)}
        onSaved={reload}
      />
    </Screen>
  );
}
