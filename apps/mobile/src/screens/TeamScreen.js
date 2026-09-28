import React, { useState } from "react";
import { View, ScrollView, Pressable } from "react-native";

import { TopBar, Blueprint, InitialsTile, Section, Group, Card, Avatar, RolePill, OptionCard, Field, Button, TextButton, EmptyState, T, Icon, colors, radius } from "../ui";
import { plural, shortDate } from "../features/estimates";
import { useAuth, normaliseEmail, isValidEmail } from "../context/AuthContext";
import { useCompany, ASSIGNABLE_ROLES, roleLabel, rolesLabel } from "../context/CompanyContext";
import { confirmAction, notify } from "../utils/confirm";

// A person can hold more than one role at once (e.g. Project Manager + Procurement).
function toggled(list, key) {
  return list.includes(key) ? list.filter((r) => r !== key) : [...list, key];
}

// Team: who's in the company, their roles, adding people by email, pending invites.
export default function TeamScreen({ navigation }) {
  const { user } = useAuth();
  const { company, members, invites, isOwner, canManageTeam, roles: myRoles, invite, revokeInvite, setMemberRoles, removeMember, status } = useCompany();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [inviteRoles, setInviteRoles] = useState(["site_supervisor"]);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState(null); // member expanded to change roles / remove

  async function add() {
    setBusy(true);
    try {
      const r = await invite({ email, name, roles: inviteRoles });
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

  async function toggleRole(m, key) {
    const next = toggled(m.roles || [], key);
    if (!next.length) return; // must keep at least one role
    try {
      await setMemberRoles(m.id, next);
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

  const you = isOwner ? "you are the owner" : `you are ${(myRoles.length ? rolesLabel(myRoles) : "a member").toLowerCase()}`;

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
              const mRoles = m.roles || [];
              const editable = canManageTeam && !mRoles.includes("owner") && !isYou;
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
                    <RolePill roles={mRoles} label={rolesLabel(mRoles)} />
                  </Pressable>
                  {open ? (
                    <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8, backgroundColor: colors.tintBlueSoft }}>
                      <T variant="caption" weight={400}>
                        Tap to give or remove a role. They can hold more than one.
                      </T>
                      {ASSIGNABLE_ROLES.map((key) => (
                        <OptionCard key={key} compact title={roleLabel(key)} selected={mRoles.includes(key)} onPress={() => toggleRole(m, key)} />
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
                <T variant="label">Roles</T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {ASSIGNABLE_ROLES.map((key) => (
                    <RoleChoice key={key} label={roleLabel(key)} active={inviteRoles.includes(key)} onPress={() => setInviteRoles((prev) => toggled(prev, key))} />
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
            <Button title="Add to team" icon="userPlus" onPress={add} loading={busy} disabled={busy || !isValidEmail(email) || !inviteRoles.length} />
          </Section>
        ) : null}

        {canManageTeam && invites.length ? (
          <Section title="Pending invites" gap={8}>
            <Group>
              {invites.map((inv) => (
                <View key={inv.id || inv.email} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingLeft: 16, paddingRight: 4 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T variant="body" weight={600} numberOfLines={1}>
                      {inv.name || "Unnamed"} · <T variant="body" weight={400} color="muted">{rolesLabel(inv.roles)}</T>
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
