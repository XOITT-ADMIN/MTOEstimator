import React from "react";
import { View } from "react-native";

import { Screen, Section, Group, Row, Card, Avatar, InitialsTile, RolePill, IconTile, Button, Logo, MadeByXoitt, T, Icon, colors } from "../ui";
import { ProfileField } from "../features/settings/ProfileField";
import { SecuritySection } from "../features/settings/SecuritySection";
import { plural, shortDate } from "../features/estimates";
import { useAuth } from "../context/AuthContext";
import { useCompany } from "../context/CompanyContext";
import { useEstimates } from "../context/EstimatesContext";
import { confirmAction } from "../utils/confirm";

const ROLE_LABEL = { owner: "Owner", admin: "Admin", estimator: "Field engineer", viewer: "Viewer" };
const APP_VERSION = "2.0";

// Settings: account, team, what's printed on quotations, data, security, sign out.
export default function SettingsScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const { profile, updateProfile, status, company, members, canManageTeam, role, serverMode } = useCompany();
  const { estimates, pending, online } = useEstimates();
  const connected = status === "member";
  const canEditCompany = !connected || canManageTeam;

  async function confirmSignOut() {
    const ok = await confirmAction({
      title: "Sign out?",
      message: connected ? (pending ? `${pending} change${pending === 1 ? " hasn't" : "s haven't"} reached the server yet. Sign out anyway?` : "Your work is saved to your company's workspace.") : "Your estimates stay on this device.",
      confirmText: "Sign out",
      destructive: true,
    });
    if (ok) signOut();
  }

  const save = (key) => (v) => {
    if (key === "name" && !String(v || "").trim()) return; // a company always needs a name
    updateProfile({ [key]: v });
  };

  const sync = !connected
    ? { dot: colors.faint, text: "On this device only" }
    : online === false
      ? { dot: colors.warning, text: pending ? `Offline · ${pending} waiting to sync` : "Offline · up to date when last online" }
      : pending
        ? { dot: colors.action, text: `Saving ${plural(pending, "change")}…` }
        : { dot: colors.success, text: "All changes saved" };

  const latest = estimates[0];
  const f = (key, label, placeholder, props) => <ProfileField key={key} label={label} value={profile[key]} placeholder={placeholder} onSave={save(key)} editable={canEditCompany} {...props} />;

  return (
    <Screen tabBar title="Settings">
      <Section title="Account" style={{ marginTop: 4 }}>
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Avatar name={user?.name || user?.email} size={52} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T variant="rowTitle" size={17} numberOfLines={1}>
              {user?.name || "Signed in"}
            </T>
            <T variant="sub" numberOfLines={1}>
              {user?.email || "—"}
            </T>
          </View>
          {connected && role ? <RolePill role={role} label={ROLE_LABEL[role] || role} /> : null}
        </Card>
      </Section>

      <Section title="Team">
        <Group>
          {connected ? (
            <Row left={<InitialsTile name={company?.name} size={48} />} onPress={() => navigation.navigate("Team")} accessibilityLabel="Open team">
              <T variant="rowTitle" numberOfLines={1}>
                {company?.name || "Your company"}
              </T>
              <T variant="label" weight={400} numberOfLines={1}>
                {plural(members.length, "member")}
                {canManageTeam ? " · add or manage people" : ""}
              </T>
            </Row>
          ) : (
            <Row left={<IconTile icon="building" />}>
              <T variant="rowTitle">This device only</T>
              <T variant="label" weight={400}>
                {serverMode ? "Sign in to a company to share work." : "Connect a server to share estimates, stock and rates."}
              </T>
            </Row>
          )}
        </Group>
      </Section>

      <Section title="On your quotations">
        <Group>
          {f("name", "Company name", "Add company name", { autoCapitalize: "words" })}
          {f("address", "Address", "Add address")}
          {f("phone", "Phone", "Add phone", { keyboardType: "phone-pad" })}
          {f("gstin", "GSTIN", "Add GSTIN", { autoCapitalize: "characters" })}
          {f("email", "Email", "Add email", { keyboardType: "email-address", autoCapitalize: "none" })}
          {f("termsAndConditions", "Terms & conditions", "Add terms", { multiline: true })}
          {latest ? (
            <Row left={<Icon name="fileText" size={20} color="blue700" />} onPress={() => navigation.navigate("PdfPreview", { estimateId: latest.id })} minHeight={56}>
              <T variant="body" weight={600} color="blue700">
                Preview a quotation
              </T>
            </Row>
          ) : null}
        </Group>
        <T variant="caption" weight={400} style={{ paddingHorizontal: 4 }}>
          {canEditCompany ? "Printed on every PDF. Changes save as you type." : "Only an owner or admin can change these details."}
        </T>
      </Section>

      <Section title="Notifications">
        <Group>
          {f("notificationEmail", "Notify by email when Ready", "Add an email address", { keyboardType: "email-address", autoCapitalize: "none" })}
        </Group>
        <T variant="caption" weight={400} style={{ paddingHorizontal: 4 }}>
          {canEditCompany ? "We'll email this address whenever a field engineer marks an estimate Ready. The engineer still shares the quotation itself, by email or WhatsApp." : "Only an owner or admin can change this."}
        </T>
      </Section>

      <Section title="Data">
        <Group>
          <Row left={<View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: sync.dot }} />}>
            <T variant="body" weight={500}>
              Sync
            </T>
            <T variant="label" weight={400}>
              {sync.text}
            </T>
          </Row>
          <Row left={<Icon name="layers" size={20} color="blue700" />} onPress={() => navigation.navigate("Library")}>
            <T variant="body" weight={500}>
              Library source
            </T>
            <T variant="label" weight={400}>
              {connected ? `Company library${company?.updatedAt ? ` · updated ${shortDate(company.updatedAt)}` : ""}` : "Built-in (MTO_Template.xlsx)"}
            </T>
          </Row>
        </Group>
      </Section>

      <SecuritySection serverMode={connected} />

      <Button title="Sign out" icon="signOut" tone="danger" onPress={confirmSignOut} style={{ marginTop: 28 }} />

      <View style={{ alignItems: "center", gap: 6, marginTop: 28 }}>
        <Logo size={26} align="center" />
        <T variant="caption" weight={400}>
          Version {APP_VERSION}
        </T>
        <MadeByXoitt />
      </View>
    </Screen>
  );
}
