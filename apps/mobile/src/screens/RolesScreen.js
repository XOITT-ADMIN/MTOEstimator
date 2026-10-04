import React, { useCallback, useEffect, useState } from "react";
import { View, ScrollView, Switch, ActivityIndicator } from "react-native";

import { TopBar, Section, Group, Row, Button, TextButton, Field, Sheet, EmptyState, T, Icon, colors } from "../ui";
import { api } from "../api/client";
import { useCompany } from "../context/CompanyContext";
import { confirmAction, notify } from "../utils/confirm";

// Roles & permissions (owner/admin): define the company's roles, rename them and choose what each
// one may do. A role is handed to people per project (project screen › Team) and applies the same
// everywhere it's used.
export default function RolesScreen({ navigation }) {
  const { canManageTeam, refresh } = useCompany();
  const [roles, setRoles] = useState(null);
  const [catalogue, setCatalogue] = useState([]);
  const [editing, setEditing] = useState(null); // role being edited, or { isNew: true }

  const load = useCallback(async () => {
    try {
      const r = await api("GET", "/roles");
      setRoles(r.roles);
      setCatalogue(r.catalogue);
    } catch (e) {
      setRoles((prev) => prev || []);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save(draft) {
    try {
      const body = { name: draft.name.trim(), description: draft.description.trim(), permissions: draft.permissions };
      if (editing?.isNew) await api("POST", "/roles", body);
      else await api("PATCH", `/roles/${encodeURIComponent(editing.id)}`, body);
      setEditing(null);
      await Promise.all([load(), refresh()]);
    } catch (e) {
      notify("Couldn't save the role", e?.message || "Try again.");
    }
  }

  async function remove(role) {
    if (!(await confirmAction({ title: "Delete role?", message: `${role.name} will be removed from the company.`, confirmText: "Delete", destructive: true }))) return;
    try {
      await api("DELETE", `/roles/${encodeURIComponent(role.id)}`);
      setEditing(null);
      await Promise.all([load(), refresh()]);
    } catch (e) {
      notify("Couldn't delete", e?.message || "Try again.");
    }
  }

  const back = <TopBar plain title="Roles & permissions" onBack={() => navigation.goBack()} />;

  if (!canManageTeam) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        {back}
        <EmptyState icon="lock" title="Owners and admins only" body="Ask an owner or admin to change roles and permissions." style={{ marginTop: 40 }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      {back}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }}>
        <T variant="sub" style={{ marginBottom: 12 }}>
          Roles are defined once for the whole company and applied on every project. You choose who holds a role on each project, in that project's Team section. Owners and admins always have every permission.
        </T>
        {roles === null ? (
          <ActivityIndicator color={colors.action} style={{ marginTop: 30 }} />
        ) : (
          <Section title="Roles" gap={8}>
            <Group>
              {roles.map((r) => (
                <Row key={r.id} minHeight={64} right={<Icon name="chevronRight" size={16} color="muted" />} onPress={() => setEditing(r)}>
                  <T variant="bodyStrong" numberOfLines={1}>
                    {r.name}
                    {r.builtIn ? <T variant="caption" weight={400} color="muted">{"  built-in"}</T> : null}
                  </T>
                  <T variant="caption" weight={400} numberOfLines={1}>
                    {r.permissions.length} permission{r.permissions.length === 1 ? "" : "s"}
                    {r.inUse ? ` · ${r.inUse} ${r.inUse === 1 ? "person" : "people"}` : ""}
                  </T>
                </Row>
              ))}
            </Group>
            <Button title="Add a role" icon="plus" tone="secondary" onPress={() => setEditing({ isNew: true })} />
          </Section>
        )}
      </ScrollView>

      {editing ? <RoleEditor role={editing} catalogue={catalogue} onClose={() => setEditing(null)} onSave={save} onDelete={remove} /> : null}
    </View>
  );
}

function RoleEditor({ role, catalogue, onClose, onSave, onDelete }) {
  const [name, setName] = useState(role.name || "");
  const [description, setDescription] = useState(role.description || "");
  const [perms, setPerms] = useState(role.permissions || []);
  const [busy, setBusy] = useState(false);
  const toggle = (key) => setPerms((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  const groups = [...new Set(catalogue.map((p) => p.group))];
  const valid = name.trim().length >= 2;

  return (
    <Sheet
      visible
      title={role.isNew ? "New role" : "Edit role"}
      subtitle={role.builtIn ? "Built-in — can be renamed and changed, not deleted" : undefined}
      onClose={onClose}
      footer={
        <View style={{ flexDirection: "row", gap: 10 }}>
          {!role.isNew && !role.builtIn ? <Button title="Delete" tone="danger" onPress={() => onDelete(role)} style={{ paddingHorizontal: 18 }} /> : null}
          <Button
            title="Save"
            icon="check"
            loading={busy}
            disabled={!valid || busy}
            onPress={async () => {
              setBusy(true);
              await onSave({ name, description, permissions: perms });
              setBusy(false);
            }}
            style={{ flex: 1 }}
          />
        </View>
      }
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Field label="Role name" value={name} onChangeText={setName} placeholder="e.g. Site Engineer" autoCapitalize="words" />
        <Field label="What this role is for (optional)" value={description} onChangeText={setDescription} placeholder="Shown when picking roles" />
        {groups.map((g) => (
          <View key={g} style={{ gap: 6 }}>
            <T variant="label">{g}</T>
            <Group>
              {catalogue
                .filter((p) => p.group === g)
                .map((p) => (
                  <Row
                    key={p.key}
                    minHeight={60}
                    right={<Switch value={perms.includes(p.key)} onValueChange={() => toggle(p.key)} trackColor={{ true: colors.action }} />}
                    onPress={() => toggle(p.key)}
                  >
                    <T variant="bodyStrong">{p.label}</T>
                    <T variant="caption" weight={400}>
                      {p.hint}
                    </T>
                  </Row>
                ))}
            </Group>
          </View>
        ))}
      </ScrollView>
    </Sheet>
  );
}
