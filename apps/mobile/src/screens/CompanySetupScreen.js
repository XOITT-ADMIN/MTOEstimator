import React, { useState } from "react";
import { View } from "react-native";

import { Screen, BottomBar, Logo, T, Field, OptionCard, Button, TextButton, Notice } from "../ui";
import { useAuth } from "../context/AuthContext";
import { useCompany } from "../context/CompanyContext";
import { confirmAction } from "../utils/confirm";

// First sign-in, not in a company yet: start one (and own it) or join the one that invited you.
export default function CompanySetupScreen() {
  const { user, signOut } = useAuth();
  const { status, error, createCompany, recheckInvites } = useCompany();
  const [choice, setChoice] = useState("start");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState(null);
  const first = (user?.name || "").split(" ")[0];

  async function primary() {
    setLocalError(null);
    if (choice === "join") {
      recheckInvites();
      return;
    }
    setBusy(true);
    try {
      await createCompany(name);
    } catch (e) {
      setLocalError(e?.message || "Could not create the company.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    if (await confirmAction({ title: "Sign out?", confirmText: "Sign out", destructive: true })) signOut();
  }

  return (
    <Screen
      keyboard
      contentStyle={{ gap: 20 }}
      footer={
        <BottomBar>
          <Button
            title={choice === "start" ? "Create company" : "Check for my invite"}
            onPress={primary}
            loading={busy || status === "loading"}
            disabled={choice === "start" && name.trim().length < 2}
          />
        </BottomBar>
      }
    >
      <View style={{ gap: 4, marginTop: 4 }}>
        <Logo size={26} />
        <T variant="title" style={{ marginTop: 16 }}>
          {first ? `Welcome, ${first}` : "Welcome"}
        </T>
        <T variant="body" color="muted" style={{ marginTop: 4 }}>
          You're not in a company yet. Estimates, rates and stock live inside a company, so pick one to start.
        </T>
      </View>

      <OptionCard icon="building" title="Start a company" body="You'll be the owner. Set up rates and stock, then invite your team." selected={choice === "start"} onPress={() => setChoice("start")} />
      {choice === "start" ? (
        <Field label="Company name" value={name} onChangeText={setName} placeholder="e.g. Aqua MEP Contractors" autoCapitalize="words" hint="Printed on your quotations. You can change it later." style={{ marginTop: -6 }} error={localError || undefined} />
      ) : null}

      <OptionCard icon="userPlus" title="Join my company" body="Your owner or admin has invited you, or will soon." selected={choice === "join"} onPress={() => setChoice("join")} />
      {choice === "join" ? (
        <Notice icon="mail">
          Ask them to add <T variant="label" weight={600} color="blue700">{user?.email || "your email"}</T> in Settings › Team. You'll join as soon as they do.
        </Notice>
      ) : null}
      {error ? <Notice tone="danger" icon="alert">{error}</Notice> : null}

      <View style={{ alignItems: "center" }}>
        <TextButton title="Sign out" icon="signOut" color="muted" onPress={handleSignOut} />
      </View>
    </Screen>
  );
}
