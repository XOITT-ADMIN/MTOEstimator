import React, { useState } from "react";
import { View, Pressable } from "react-native";

import { Screen, Section, Group, Row, Chip, ChipRow, EmptyState, T, Icon, Button, Sheet, Field, HStack, colors } from "../ui";
import { useProjects } from "../context/ProjectsContext";
import { useCompany } from "../context/CompanyContext";
import { notify } from "../utils/confirm";

const STATUS_FILTERS = ["All", "Open", "Closed"];

function ProjectRow({ project, onPress }) {
  const isOpen = project.status === "open";
  return (
    <Row
      onPress={onPress}
      minHeight={64}
      right={<Icon name="chevronRight" size={18} color="muted" />}
    >
      <HStack gap={8} style={{ alignItems: "center" }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isOpen ? colors.success : colors.faint }} />
        <T variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>{project.name}</T>
      </HStack>
      {project.siteName ? (
        <T variant="sub" numberOfLines={1} style={{ marginTop: 2, marginLeft: 16 }}>{project.siteName}</T>
      ) : null}
    </Row>
  );
}

export default function ProjectsScreen({ navigation }) {
  const { projects, loaded, error, create } = useProjects();
  const { canManageTeam } = useCompany();
  const [filter, setFilter] = useState("All");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSite, setNewSite] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = projects.filter((p) => {
    if (filter === "Open") return p.status === "open";
    if (filter === "Closed") return p.status === "closed";
    return true;
  });

  async function handleCreate() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await create({ name: newName.trim(), siteName: newSite.trim() });
      setCreating(false);
      setNewName("");
      setNewSite("");
    } catch (e) {
      notify("Couldn't create project", e?.message || "Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen tabBar title="Projects" count={projects.length}>
      <View style={{ gap: 12 }}>
        <ChipRow>
          {STATUS_FILTERS.map((f) => (
            <Chip
              key={f}
              label={f}
              count={f === "All" ? projects.length : projects.filter((p) => p.status === f.toLowerCase()).length}
              active={filter === f}
              onPress={() => setFilter(f)}
            />
          ))}
        </ChipRow>
      </View>

      <View style={{ marginTop: 16 }}>
        {!loaded ? null : filtered.length === 0 ? (
          <EmptyState
            icon="map"
            title={filter === "All" ? "No projects yet" : `No ${filter.toLowerCase()} projects`}
            body={filter === "All" && canManageTeam ? "Create a project to start raising MTOs against a site." : undefined}
            action={filter === "All" && canManageTeam ? "New project" : undefined}
            onAction={filter === "All" && canManageTeam ? () => setCreating(true) : undefined}
            style={{ marginTop: 40 }}
          />
        ) : (
          <Section>
            <Group>
              {filtered.map((p) => (
                <ProjectRow key={p.id} project={p} onPress={() => navigation.navigate("ProjectDetail", { projectId: p.id })} />
              ))}
            </Group>
          </Section>
        )}
        {error ? <T variant="sub" style={{ color: colors.danger, marginTop: 8, textAlign: "center" }}>{error}</T> : null}
      </View>

      {canManageTeam && filtered.length > 0 ? (
        <View style={{ marginTop: 16 }}>
          <Button title="New project" tone="secondary" onPress={() => setCreating(true)} />
        </View>
      ) : null}

      <Sheet
        visible={creating}
        title="New project"
        onClose={() => { setCreating(false); setNewName(""); setNewSite(""); }}
        footer={
          <Button title="Create" disabled={!newName.trim() || busy} loading={busy} onPress={handleCreate} />
        }
      >
        <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16, gap: 16 }}>
          <Field label="Project name" value={newName} onChangeText={setNewName} placeholder="e.g. Tower B — Block 4" autoFocus />
          <Field label="Site name" value={newSite} onChangeText={setNewSite} placeholder="Optional" />
        </View>
      </Sheet>
    </Screen>
  );
}
