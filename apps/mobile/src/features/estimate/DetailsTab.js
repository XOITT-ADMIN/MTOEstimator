import React, { useState } from "react";
import { View, ScrollView, TextInput } from "react-native";

import { Section, Group, InlineField, Chip, ChipRow, HStack, T, Icon, Field, Button, inputText, colors, radius, tradeStyles } from "../../ui";
import { useProjects } from "../../context/ProjectsContext";
import { useCompany } from "../../context/CompanyContext";
import { notify } from "../../utils/confirm";

const TRADES = ["Plumbing", "Electrical"];

// Details tab: which project this MTO belongs to, trade scope, notes. Status now only ever
// changes through the Action Bar (see ActionBar.js) — there's no status grid here anymore.
export function DetailsTab({ estimate, update, canEdit }) {
  const { openProjects, getProject, create } = useProjects();
  const { canManageProjects } = useCompany();
  const [addingProject, setAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [busy, setBusy] = useState(false);

  const project = getProject(estimate.projectId);
  const toggleTrade = (t) => update({ trades: estimate.trades.includes(t) ? estimate.trades.filter((x) => x !== t) : [...estimate.trades, t] });
  const created = [estimate.createdBy?.name ? `Created by ${estimate.createdBy.name.split(" ")[0]}` : null, estimate.date, "Edits save automatically"].filter(Boolean).join(" · ");

  async function addProject() {
    const name = newProjectName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const p = await create({ name });
      update({ projectId: p.id });
      setAddingProject(false);
      setNewProjectName("");
    } catch (e) {
      notify("Couldn't create project", e?.message || "Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
      <Section title="Job" style={{ marginTop: 0 }} gap={8}>
        <Group>
          <InlineField label="MTO title" value={estimate.name} editable={canEdit} onChangeText={(v) => update({ name: v })} />
        </Group>
      </Section>

      <Section title="Project" style={{ marginTop: 20 }} gap={8}>
        {canEdit ? (
          <>
            <ChipRow>
              {openProjects.map((p) => (
                <Chip key={p.id} label={p.name} active={p.id === estimate.projectId} onPress={() => update({ projectId: p.id })} />
              ))}
              {canManageProjects ? <Chip label="+ New project" active={addingProject} onPress={() => setAddingProject((v) => !v)} /> : null}
            </ChipRow>
            {addingProject ? (
              <HStack gap={8} align="flex-start" style={{ paddingTop: 4 }}>
                <Field value={newProjectName} onChangeText={setNewProjectName} placeholder="Project name" autoFocus style={{ flex: 1 }} />
                <Button title="Add" compact compactText loading={busy} disabled={busy || !newProjectName.trim()} onPress={addProject} style={{ marginTop: 2 }} />
              </HStack>
            ) : null}
            {!project ? (
              <HStack gap={8} style={{ paddingHorizontal: 4, paddingTop: 2 }}>
                <Icon name="alert" size={16} color="warningInk" />
                <T variant="label" weight={400} style={{ flex: 1 }}>
                  Its project was closed or removed — pick another before submitting.
                </T>
              </HStack>
            ) : null}
          </>
        ) : (
          <Group>
            <InlineField label="Project" value={project?.name || "—"} editable={false} />
          </Group>
        )}
      </Section>

      <Section title="Trade scope" style={{ marginTop: 20 }} gap={8}>
        <HStack>
          {TRADES.map((t) => (
            <Chip key={t} label={t} icon={tradeStyles[t].icon} active={estimate.trades.includes(t)} onPress={canEdit ? () => toggleTrade(t) : undefined} />
          ))}
        </HStack>
      </Section>

      <Section title="Notes" style={{ marginTop: 20 }} gap={8}>
        <TextInput
          value={estimate.notes}
          onChangeText={(v) => update({ notes: v })}
          editable={canEdit}
          multiline
          accessibilityLabel="Notes"
          placeholder="Access, timings, anything the team should know"
          placeholderTextColor={colors.faint}
          style={[inputText, { fontSize: 15, lineHeight: 22, minHeight: 104, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: colors.surface, textAlignVertical: "top", outlineStyle: "none" }]}
        />
      </Section>

      <T variant="caption" weight={400} style={{ paddingHorizontal: 4, marginTop: 20 }}>
        {created}
      </T>
    </ScrollView>
  );
}
