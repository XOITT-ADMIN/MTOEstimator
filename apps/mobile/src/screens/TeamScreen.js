import React, { useState } from "react";
import { View, ScrollView, Pressable } from "react-native";

import { TopBar, Blueprint, InitialsTile, Section, Group, Card, Avatar, RolePill, OptionCard, Field, Button, TextButton, EmptyState, T, Icon, colors, radius } from "../ui";
import { plural, shortDate } from "../features/estimates";
import { useAuth, normaliseEmail, isValidEmail } from "../context/AuthContext";
import { useCompany } from "../context/CompanyContext";
import { confirmAction, notify } from "../utils/confirm";

const ROLE_LABEL = { owner: "Owner", admin: "Admin", estimator: "Field engineer", viewer: "Viewer" };
const ROLE_OPTIONS = [
  { key: "estimator", label: "Field engineer", sub: "Makes their own estimates" },
  { key: "admin", label: "Admin", sub: "Library, team and approvals" },
  { key: "viewer", label: "Viewer", sub: "Can look, can’t change" },
];

// Team: who's in the company, their roles, adding people by email, pending invites.
export default function TeamScreen({ navigation }) {
  const { user } = useAuth();
  const { company, members, invites, isOwner, canManageTeam, role: myRole, invite, revokeInvite, setMemberRole, removeMember, status } = useCompany();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("estimator");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState(null); // member expanded to change role / remove

  async function add() {
    setBusy(true);
    try {
      const r = await invite({ email, name, role });
      setEmail("");
      setName("");
      notify("Added to the team", `${email} can now sign in with this email and will join ${company?.name} automatically.` + (r?.emailed ? " We've emailed them too." : " Let them know — no email was sent."));
    } catch (e) {
      notify("Could not add", e?.message || "Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(m) {
    if (!(await confirmAction({ title: "Remove from team?", message: `${m.name || m.email} will lose access to ${company?.name}.`, confirmText: "Remove", destructive: true }))) return;
    try {
      await removeMember(m.id);
      setOpenId(null);
    } catch (e) {
      notify("Could not remove", e?.message);
    }
  }

  async function changeRole(m, next) {
    if (next === m.role) return;
    try {
      await setMemberRole(m.id, next);
    } catch (e) {
      notify("Could not change role", e?.message);
    }
  }

  const back = <TopBar plain title="Team" onBack={() => navigation.goBack()} />;

  if (status !== "member") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        {back}
        <EmptyState icon="users" title="Team needs a shared workspace" body="Connect XMTO to your company's server to share estimates, stock and rates." style={{ marginTop: 40 }} />
      </View>
    );
  }

  const you = isOwner ? "you are the owner" : `you are ${myRole === "admin" ? "an admin" : `a ${(ROLE_LABEL[myRole] || "member").toLowerCase()}`}`;

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      {back}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Blueprint radius={18} style={{ padding: 18, flexDirection: "row", alignItems: "center", gap: 14 }}>
          <InitialsTile name={company?.name} size={52} dark />
          <View style={{ flex: 1 }}>
            <T variant="cardTitle" color="white" numberOfLines={2}>
              {company?.name}
            </T>
            <T variant="label" weight={400} color="onNavyMuted">
              {plural(members.length, "member")} · {you}
            </T>
          </View>
        </Blueprint>

        <Section title="Members" gap={8}>
          <Group>
            {members.map((m) => {
              const isYou = m.id === user?.uid;
              const editable = canManageTeam && m.role !== "owner" && !isYou;
              const open = editable && openId === m.id;
              return (
                <View key={m.id}>
                  <Pressable onPress={() => editable && setOpenId(open ? null : m.id)} disabled={!editable} accessibilityRole={editable ? "button" : undefined} accessibilityLabel={editable ? `Change role for ${m.name || m.email}` : undefined} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 72, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: pressed || open ? colors.tintBlueSoft : colors.surface })}>
                    <Avatar name={m.name || m.email} size={44} tone={isYou ? "navy" : "soft"} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <T variant="rowTitle" size={15} numberOfLines={1}>
                        {m.name || "Unnamed"}
                        {isYou ? " (you)" : ""}
                      </T>
                      <T variant="label" weight={400} numberOfLines={1}>
                        {m.email || "—"}
                      </T>
                    </View>
                    <RolePill role={m.role} label={ROLE_LABEL[m.role] || m.role} />
                  </Pressable>
                  {open ? (
                    <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8, backgroundColor: colors.tintBlueSoft }}>
                      {ROLE_OPTIONS.map((r) => (
                        <OptionCard key={r.key} compact title={r.label} body={r.sub} selected={m.role === r.key} onPress={() => changeRole(m, r.key)} />
                      ))}
                      <TextButton title="Remove from team" icon="trash" color="danger" onPress={() => remove(m)} style={{ height: 48, alignSelf: "flex-start" }} />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </Group>
          {canManageTeam && members.length > 1 ? (
            <T variant="caption" weight={400} style={{ paddingHorizontal: 4 }}>
              Tap a person to change their role.
            </T>
          ) : null}
        </Section>

        {canManageTeam ? (
          <Section title="Add to team" gap={8}>
            <Card style={{ gap: 14 }}>
              <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Meera" autoCapitalize="words" />
              <Field label="Email they sign in with" value={email} onChangeText={(v) => setEmail(normaliseEmail(v))} placeholder="name@company.in" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
              <View style={{ gap: 6 }}>
                <T variant="label">Role</T>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {ROLE_OPTIONS.map((r) => (
                    <RoleChoice key={r.key} label={r.label} active={role === r.key} onPress={() => setRole(r.key)} />
                  ))}
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Icon name="info" size={16} color="muted" />
                <T variant="caption" weight={400} style={{ flex: 1 }}>
                  They sign in with this email and join {company?.name} automatically. No link to send.
                </T>
              </View>
            </Card>
            <Button title="Add to team" icon="userPlus" onPress={add} loading={busy} disabled={busy || !isValidEmail(email)} />
          </Section>
        ) : null}

        {canManageTeam && invites.length ? (
          <Section title="Pending invites" gap={8}>
            <Group>
              {invites.map((inv) => (
                <View key={inv.id || inv.email} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingLeft: 16, paddingRight: 4 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T variant="body" weight={600} numberOfLines={1}>
                      {inv.name || "Unnamed"} · <T variant="body" weight={400} color="muted">{ROLE_LABEL[inv.role] || inv.role}</T>
                    </T>
                    <T variant="label" weight={400} numberOfLines={1}>
                      {inv.email}
                      {inv.createdAt ? ` · invited ${shortDate(inv.createdAt)}` : ""}
                    </T>
                  </View>
                  <TextButton title="Revoke" color="danger" size={14} onPress={() => revokeInvite(inv.email)} style={{ height: 48, paddingHorizontal: 12 }} />
                </View>
              ))}
            </Group>
          </Section>
        ) : null}
      </ScrollView>
    </View>
  );
}

function RoleChoice({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: active }} style={({ pressed }) => ({ flex: 1, height: 48, borderRadius: radius.m, borderWidth: 1, borderColor: active ? colors.navy : colors.border, backgroundColor: active ? colors.navy : colors.surface, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, opacity: pressed ? 0.85 : 1 })}>
      <T variant="label" weight={600} color={active ? "white" : "text"} numberOfLines={1}>
        {label}
      </T>
    </Pressable>
  );
}
