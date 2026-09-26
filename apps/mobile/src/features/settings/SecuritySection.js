import React, { useEffect, useState } from "react";
import { View, Switch } from "react-native";

import { Section, Group, Row, IconTile, TextButton, T, colors } from "../../ui";
import { timeAgo } from "../estimates";
import { useAppLock } from "../../context/AppLockContext";
import { api } from "../../api/client";
import { confirmAction, notify } from "../../utils/confirm";

// Settings › Security: app lock + the devices signed in to this account.
export function SecuritySection({ serverMode }) {
  const lock = useAppLock();
  const [devices, setDevices] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!serverMode) return;
    try {
      setDevices(await api("GET", "/auth/sessions"));
    } catch {
      setDevices((d) => d || []);
    }
  }
  useEffect(() => {
    load();
  }, [serverMode]); // eslint-disable-line react-hooks/exhaustive-deps

  async function signOutDevice(d) {
    if (!(await confirmAction({ title: `Sign out ${d.deviceName}?`, message: "That device will need a new email code to sign in again.", confirmText: "Sign out", destructive: true }))) return;
    try {
      await api("DELETE", `/auth/sessions/${encodeURIComponent(d.id)}`);
      load();
    } catch (e) {
      notify("Could not sign out that device", e?.message);
    }
  }

  async function signOutOthers() {
    if (!(await confirmAction({ title: "Sign out all other devices?", message: "Every other phone or browser signed in to your account will need a new email code. This device stays signed in.", confirmText: "Sign out others", destructive: true }))) return;
    setBusy(true);
    try {
      const r = await api("POST", "/auth/sessions/revoke-others");
      notify("Done", r.signedOut ? `Signed out ${r.signedOut} other device${r.signedOut === 1 ? "" : "s"}.` : "No other devices were signed in.");
      load();
    } catch (e) {
      notify("Could not sign out other devices", e?.message);
    } finally {
      setBusy(false);
    }
  }

  const current = devices?.find((d) => d.current);
  const others = (devices || []).filter((d) => !d.current);
  const lockSub = !lock.supported ? "Available in the phone app." : lock.available ? `Ask for your ${lock.method} when XMTO opens.` : "Set a fingerprint, face or screen PIN on this phone first.";

  return (
    <Section title="Security">
      <Group>
        <Row left={<IconTile icon="lock" />} right={<Switch value={lock.enabled} onValueChange={(v) => lock.setAppLock(v)} disabled={!lock.supported || (!lock.available && !lock.enabled)} trackColor={{ true: colors.action, false: colors.border }} thumbColor={colors.white} accessibilityLabel="App lock" />}>
          <T variant="body" weight={500}>
            App lock
          </T>
          <T variant="label" weight={400}>
            {lockSub}
          </T>
        </Row>
        {serverMode ? (
          <Row left={<IconTile icon="checkSquare" bg={colors.successTint} color="successInk" />}>
            <T variant="body" weight={500} numberOfLines={1}>
              This device
            </T>
            <T variant="label" weight={400} numberOfLines={1}>
              {current?.deviceName || "Signed in"} · stays signed in while you use it
            </T>
          </Row>
        ) : null}
        {serverMode
          ? others.map((d) => (
              <Row key={d.id} left={<IconTile icon="users" bg={colors.specChip} color="muted" />} right={<TextButton title="Sign out" color="danger" size={14} onPress={() => signOutDevice(d)} />}>
                <T variant="body" weight={500} numberOfLines={1}>
                  {d.deviceName}
                </T>
                <T variant="label" weight={400}>
                  Last used {timeAgo(d.lastUsedAt)}
                </T>
              </Row>
            ))
          : null}
        {serverMode ? (
          <Row onPress={others.length && !busy ? signOutOthers : undefined} chevron={false} minHeight={56}>
            <T variant="body" weight={600} color={others.length ? "danger" : "muted"}>
              {others.length ? `Sign out all other devices (${others.length})` : "No other devices signed in"}
            </T>
          </Row>
        ) : null}
      </Group>
      {lock.error ? (
        <T variant="label" weight={400} color="danger" style={{ paddingHorizontal: 4 }}>
          {lock.error}
        </T>
      ) : null}
    </Section>
  );
}
