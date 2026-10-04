import React, { useCallback, useEffect, useState } from "react";
import { View, Pressable } from "react-native";

import { Screen, TopBar, Section, Group, Row, Button, T, Icon, HStack, StatusBadge, EmptyState, Chip, Field, Card, MultiSelect, colors } from "../ui";
import { useProjects } from "../context/ProjectsContext";
import { useCompany, roleLabel, rolesLabel } from "../context/CompanyContext";
import { normaliseEmail, isValidEmail } from "../context/AuthContext";
import { useEstimates } from "../context/EstimatesContext";
import { ProfileField } from "../features/settings/ProfileField";
import { DailyUseSheet } from "../features/project/DailyUseSheet";
import { confirmAction, notify } from "../utils/confirm";
import { saveTextFile } from "../utils/files";

function stockKeyLabel(stockKey) {
  const parts = stockKey.split("|");
  return [parts[2], parts[3], parts[0]].filter(Boolean).join(" · ");
}

function csvEscape(value) {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

const fmtDate = (ms) => ms ? new Date(ms).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";

function exportReturnsCsv(returns, projectName) {
  const header = ["Item", "Qty", "MTO No.", "MTO Name", "Reason", "Returned by", "Date"];
  const rows = returns.map((r) => [
    stockKeyLabel(r.stockKey),
    r.qty.toFixed(2),
    r.estimateNumber || "",
    r.estimateName || "",
    r.reason || "",
    r.createdByName || "",
    fmtDate(r.at),
  ]);
  const title = [["Project", projectName || ""], []];
  const csv = [...title, header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  const filename = `${(projectName || "project").replace(/[^a-z0-9-_]+/gi, "_")}_returns.csv`;
  saveTextFile(filename, csv, "text/csv");
}

function exportConsumptionCsv(entries, projectName) {
  const header = ["Item", "Qty", "Type", "Date", "Recorded by", "Note", "Logged at"];
  const rows = entries.map((e) => [
    stockKeyLabel(e.stockKey),
    e.qty.toFixed(2),
    e.kind,
    e.entryDate || "",
    e.createdByName || "",
    e.note || "",
    fmtDate(e.createdAt),
  ]);
  const title = [["Project", projectName || ""], []];
  const csv = [...title, header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  const filename = `${(projectName || "project").replace(/[^a-z0-9-_]+/gi, "_")}_consumption.csv`;
  saveTextFile(filename, csv, "text/csv");
}

function BalanceRow({ item }) {
  const label = stockKeyLabel(item.stockKey);
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
  const label = stockKeyLabel(entry.stockKey);
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
  const { getProject, getSiteBalance, getConsumption, getReturns, closeProject, rename, setProjectMemberRoles } = useProjects();
  const { can, roleDefs, members, invites, invite } = useCompany();
  const canEditProject = can("project.edit", projectId); // rename-level changes: notification email, close
  const canManageProjectTeam = can("project.team", projectId);
  const [openMember, setOpenMember] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addRoles, setAddRoles] = useState(["site_supervisor"]);
  const [adding, setAdding] = useState(false);

  // Add someone to this project by email. Already in the company → give them roles here;
  // otherwise invite them with these roles, applied when they first sign in.
  async function addPerson() {
    const email = normaliseEmail(addEmail);
    if (!isValidEmail(email) || !addRoles.length) return;
    setAdding(true);
    try {
      const existing = members.find((mem) => (mem.email || "").toLowerCase() === email);
      if (existing) {
        const current = (existing.projects || []).find((p) => p.projectId === projectId)?.roles || [];
        await setProjectMemberRoles(projectId, existing.id, [...new Set([...current, ...addRoles])]);
        notify("Added", `${existing.name || email} now has ${rolesLabel(addRoles)} on ${project?.name}.`);
      } else {
        const r = await invite({ email, name: addName, roles: [], projects: [{ projectId, roles: addRoles }] });
        notify("Invited", `${email} will join as ${rolesLabel(addRoles)} on ${project?.name} when they sign in with this email.` + (r?.emailed ? " We've emailed them too." : " Let them know — no email was sent."));
      }
      setAddEmail("");
      setAddName("");
      setAddRoles(["site_supervisor"]);
      setAddOpen(false);
    } catch (e) {
      notify("Couldn't add", e?.message || "Try again.");
    } finally {
      setAdding(false);
    }
  }
  const pendingHere = (invites || []).filter((inv) => (inv.projects || []).some((p) => p.projectId === projectId));

  async function toggleProjectRole(member, current, key) {
    const next = current.includes(key) ? current.filter((r) => r !== key) : [...current, key];
    try {
      await setProjectMemberRoles(projectId, member.id, next);
    } catch (e) {
      notify("Couldn't change role", e?.message || "Try again.");
    }
  }
  const { estimates } = useEstimates();

  const project = getProject(projectId);
  const [balance, setBalance] = useState([]);
  const [log, setLog] = useState([]);
  const [returns, setReturns] = useState([]); // what a closed project returned
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [dailyUseOpen, setDailyUseOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const projectMTOs = estimates.filter((e) => e.projectId === projectId);

  const reload = useCallback(async () => {
    try {
      const [bal, entries, back] = await Promise.all([getSiteBalance(projectId), getConsumption(projectId), getReturns(projectId).catch(() => [])]);
      setBalance(bal);
      setLog(entries);
      setReturns(Array.isArray(back) ? back : []);
    } catch (e) {
      // Network error — stay with cached state
    } finally {
      setLoadingBalance(false);
    }
  }, [projectId, getSiteBalance, getConsumption, getReturns]);

  useEffect(() => { reload(); }, [reload]);

  async function handleClose() {
    const hasBalance = balance.some((b) => b.balance > 0);
    const summary = hasBalance
      ? `${balance.filter((b) => b.balance > 0).length} item(s) with remaining balance will be recorded as returned.`
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
      notify("Project closed", result.returned?.length ? `${result.returned.length} item(s) recorded as returned.` : "No material to return.");
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
    <Screen header={<TopBar title={project.name} onBack={() => navigation.goBack()} />} loading={loadingBalance}>
      {/* Status + site name */}
      <HStack gap={8} style={{ marginBottom: 8 }}>
        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: isOpen ? colors.successTint : colors.border }}>
          <T variant="caption" weight={600} style={{ color: isOpen ? colors.successInk : colors.faint }}>
            {isOpen ? "Open" : "Closed"}
          </T>
        </View>
        {project.code ? <T variant="caption" weight={600}>{project.code}</T> : null}
        {project.siteName ? <T variant="sub">{project.siteName}</T> : null}
      </HStack>

      {/* Who gets emailed when one of this project's MTOs is Ready */}
      <Section title="Notifications">
        <Group>
          <ProfileField
            label="Notify by email when Ready"
            value={project.notificationEmail || ""}
            placeholder="Add an email address"
            editable={canEditProject && isOpen}
            keyboardType="email-address"
            autoCapitalize="none"
            onSave={async (v) => {
              const email = String(v || "").trim();
              if (email && !(email.includes("@") && email.split("@")[1]?.includes("."))) return; // autosaves while typing — wait for a full address
              try {
                await rename(projectId, { notificationEmail: email });
              } catch (e) {
                notify("Couldn't save", e?.message || "Try again.");
              }
            }}
          />
        </Group>
        <T variant="caption" weight={400} style={{ paddingHorizontal: 4 }}>
          {canEditProject ? "We'll email this address whenever an MTO in this project is Ready." : "Your role on this project can't change this."}
        </T>
      </Section>

      {/* Who works on this project, and as what — roles are per project */}
      <Section title="Team" gap={8}>
        <Group>
          {members.map((mem) => {
            const orgRoles = mem.roles || [];
            const mine = (mem.projects || []).find((p) => p.projectId === projectId)?.roles || [];
            const everywhere = orgRoles.length > 0;
            if (!everywhere && !mine.length && !canManageProjectTeam) return null;
            const open = canManageProjectTeam && !everywhere && openMember === mem.id;
            return (
              <View key={mem.id}>
                <Row minHeight={56} onPress={canManageProjectTeam && !everywhere ? () => setOpenMember(open ? null : mem.id) : undefined}>
                  <T variant="bodyStrong" numberOfLines={1}>{mem.name || mem.email}</T>
                  <T variant="caption" weight={400} numberOfLines={1}>
                    {everywhere ? `${rolesLabel(orgRoles)} · all projects` : mine.length ? rolesLabel(mine) : "Not on this project"}
                  </T>
                </Row>
                {open ? (
                  <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}>
                    {roleDefs.map(({ key }) => (
                      <Chip key={key} label={roleLabel(key)} active={mine.includes(key)} onPress={() => toggleProjectRole(mem, mine, key)} />
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </Group>
        {pendingHere.length ? (
          <Group>
            {pendingHere.map((inv) => (
              <Row key={inv.email} minHeight={52}>
                <T variant="bodyStrong" numberOfLines={1}>{inv.name || inv.email}</T>
                <T variant="caption" weight={400} numberOfLines={1}>
                  Invited · {rolesLabel(inv.projects.find((p) => p.projectId === projectId)?.roles)} · {inv.email}
                </T>
              </Row>
            ))}
          </Group>
        ) : null}
        {canManageProjectTeam ? (
          <T variant="caption" weight={400} style={{ paddingHorizontal: 4 }}>
            Tap a person to set their roles on this project. They can hold more than one.
          </T>
        ) : null}
        {canManageProjectTeam && isOpen ? (
          addOpen ? (
            <Card style={{ gap: 14 }}>
              <Field label="Name" value={addName} onChangeText={setAddName} placeholder="e.g. Meera" autoCapitalize="words" />
              <Field label="Email they sign in with" value={addEmail} onChangeText={(v) => setAddEmail(normaliseEmail(v))} placeholder="name@company.in" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
              <MultiSelect
                label="Roles on this project"
                placeholder="Select roles"
                options={roleDefs.map((r) => ({ key: r.key, label: r.name, hint: r.description }))}
                value={addRoles}
                onChange={setAddRoles}
              />
              <Button title="Add to project" icon="userPlus" loading={adding} disabled={adding || !isValidEmail(addEmail) || !addRoles.length} onPress={addPerson} />
              <Button title="Cancel" tone="secondary" onPress={() => setAddOpen(false)} />
            </Card>
          ) : (
            <Button title="Add person to this project" icon="userPlus" tone="secondary" onPress={() => setAddOpen(true)} />
          )
        ) : null}
      </Section>

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

      {/* Closed project: what was returned */}
      {!isOpen && returns.length ? (
        <Section title="Returned" action="Export CSV" onAction={() => exportReturnsCsv(returns, project.name)}>
          <Group>
            {returns.map((r) => (
              <Row key={r.stockKey} minHeight={52}>
                <HStack gap={6}>
                  <T variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>{stockKeyLabel(r.stockKey)}</T>
                  <T variant="bodyStrong" num>{r.qty.toFixed(2)}</T>
                </HStack>
              </Row>
            ))}
          </Group>
        </Section>
      ) : null}

      {/* Consumption log */}
      {recentLog.length ? (
        <Section title="Recent consumption" action="Export CSV" onAction={() => exportConsumptionCsv(log, project.name)}>
          <Group>
            {recentLog.map((e) => (
              <LogRow key={e.id} entry={e} />
            ))}
          </Group>
        </Section>
      ) : null}

      {!hasBalance && !recentLog.length && !returns.length && !loadingBalance ? (
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
          {canEditProject ? (
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
