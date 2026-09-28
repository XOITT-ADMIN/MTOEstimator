import React, { useState } from "react";
import { View, ScrollView } from "react-native";

import { Button, Sheet, Field, T, colors } from "../../ui";
import { availableTransitions } from "../mto/mtoStatus";
import { confirmAction, notify } from "../../utils/confirm";

// The row of "what can I do to this MTO right now" buttons — Submit, Approve, Reject, Mark
// budget OK, Send back, … — computed from its status and the signed-in person's roles (see
// src/features/mto/mtoStatus.js). Nothing here is the final word: the server re-checks every
// move and this just surfaces whatever it says. `onTransition(to, comment)` does the API call.
export function ActionBar({ estimate, roles, isOwnMto, onTransition }) {
  const [pending, setPending] = useState(null); // the action awaiting a required comment
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const actions = availableTransitions(estimate.status, roles, { isOwnMto });
  if (!actions.length) return null;

  async function run(action, withComment) {
    setBusy(true);
    try {
      await onTransition(action.to, withComment || "");
      setPending(null);
      setComment("");
    } catch (e) {
      notify("Couldn't do that", e?.message || "Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function tap(action) {
    if (busy) return;
    if (action.commentRequired) {
      setComment("");
      setPending(action);
      return;
    }
    if (await confirmAction({ title: `${action.label}?`, message: `${estimate.estimateNumber} · ${estimate.name}`, confirmText: action.label, destructive: action.tone === "danger" })) {
      run(action);
    }
  }

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
        {actions.map((a) => (
          <Button key={a.to} title={a.label} tone={a.tone === "danger" ? "dangerSolid" : "primary"} compact compactText disabled={busy} onPress={() => tap(a)} style={{ paddingHorizontal: 18 }} />
        ))}
      </ScrollView>
      <Sheet visible={!!pending} title={pending?.label} subtitle={`${estimate.estimateNumber} · ${estimate.name}`} onClose={() => setPending(null)} footer={<Button title={pending?.label || "Confirm"} tone={pending?.tone === "danger" ? "dangerSolid" : "primary"} disabled={!comment.trim() || busy} loading={busy} onPress={() => run(pending, comment)} />}>
        <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 }}>
          <Field label="Comment" value={comment} onChangeText={setComment} placeholder="Say why, so the team has the full trail" multiline autoFocus style={{ minHeight: 96 }} />
          <T variant="caption" weight={400} style={{ marginTop: 8, color: colors.faint }}>
            Required for this move.
          </T>
        </View>
      </Sheet>
    </>
  );
}
