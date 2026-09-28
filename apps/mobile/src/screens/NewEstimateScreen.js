import React, { useState } from "react";
import { View, ScrollView } from "react-native";

import { Sheet, Field, Chip, ChipRow, Button, T, Icon, HStack } from "../ui";
import { TradeToggle } from "../features/TradeToggle";
import { useEstimates } from "../context/EstimatesContext";
import { useProjects } from "../context/ProjectsContext";
import { useCompany } from "../context/CompanyContext";
import { notify } from "../utils/confirm";

const TRADES = ["Plumbing", "Electrical"];

// New MTO sheet: title, which project it's for (pick one or add a new one inline), trade scope.
export default function NewEstimateScreen({ navigation }) {
  const { addEstimate } = useEstimates();
  const { openProjects, create: createProject } = useProjects();
  const { canManageProjects } = useCompany();
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState(openProjects[0]?.id || null);
  const [addingProject, setAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [trades, setTrades] = useState(["Plumbing"]);
  const toggle = (t) => setTrades((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  const ready = name.trim().length > 0 && trades.length > 0 && !!projectId;

  async function addProject() {
    const n = newProjectName.trim();
    if (!n) return;
    setCreatingProject(true);
    try {
      const p = await createProject({ name: n });
      setProjectId(p.id);
      setAddingProject(false);
      setNewProjectName("");
    } catch (e) {
      notify("Couldn't create project", e?.message || "Try again.");
    } finally {
      setCreatingProject(false);
    }
  }

  function create() {
    if (!ready) return;
    const id = addEstimate({
      name: name.trim(),
      projectId,
      date: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      trades,
    });
    navigation.replace("EstimateDetail", { estimateId: id });
  }

  return (
    <Sheet
      inline
      title="New MTO"
      onClose={() => navigation.goBack()}
      footer={<Button title={!name.trim() ? "Add a title" : !projectId ? "Pick a project" : !trades.length ? "Pick a trade" : "Create MTO"} disabled={!ready} onPress={create} />}
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
        <Field label="Title" value={name} onChangeText={setName} placeholder="e.g. Villa 14 — ground floor" autoFocus returnKeyType="next" />
        <View style={{ gap: 8 }}>
          <T variant="label">Project</T>
          <ChipRow inset={20}>
            {openProjects.map((p) => (
              <Chip key={p.id} label={p.name} active={projectId === p.id} onPress={() => setProjectId(p.id)} />
            ))}
            {canManageProjects ? <Chip label="+ New project" active={addingProject} onPress={() => setAddingProject((v) => !v)} /> : null}
          </ChipRow>
          {addingProject ? (
            <HStack gap={8} align="flex-start" style={{ paddingTop: 4 }}>
              <Field value={newProjectName} onChangeText={setNewProjectName} placeholder="Project name" autoFocus style={{ flex: 1 }} />
              <Button title="Add" compact compactText loading={creatingProject} disabled={creatingProject || !newProjectName.trim()} onPress={addProject} style={{ marginTop: 2 }} />
            </HStack>
          ) : null}
          {!openProjects.length && !addingProject ? (
            <HStack gap={8} align="flex-start">
              <Icon name="info" size={18} color="muted" />
              <T variant="label" weight={400} style={{ flex: 1 }}>
                {canManageProjects ? "No open project yet — add one above." : "No open project yet — ask your project manager to add one."}
              </T>
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
      </ScrollView>
    </Sheet>
  );
}
