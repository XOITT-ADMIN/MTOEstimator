import React, { useState } from "react";
import { View, ScrollView } from "react-native";

import { Button, Sheet, Field, T, colors } from "../../ui";
import { availableTransitions } from "../mto/mtoStatus";
import { DispatchSheet, DeliverSheet } from "./DispatchSheet";
import { confirmAction, notify } from "../../utils/confirm";

// The row of "what can I do to this MTO right now" buttons — Submit, Approve, Reject, Mark
// budget OK, Send back, Dispatch, Deliver, Cancel, … — computed from the MTO's status and the
// signed-in person's roles. Nothing here is the final word: the server re-checks every move.
// `onTransition(to, comment)` does the API call; special actions (dispatch/deliver) open their
// own sheets that handle the API calls themselves.
export function ActionBar({ estimate, roles, isOwnMto, onTransition, dispatches = [] }) {
  const [pending, setPending]           = useState(null); // action waiting for a comment
  const [comment, setComment]           = useState("");
  const [busy, setBusy]                 = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [deliverOpen, setDeliverOpen]   = useState(false);

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
    // Dispatch and Deliver open their own sheets
    if (action.to === "DISPATCHED") { setDispatchOpen(true); return; }
    if (action.to === "DELIVERED")  { setDeliverOpen(true);  return; }
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

      {/* Comment sheet for Reject / Send back / Cancel */}
      <Sheet visible={!!pending} title={pending?.label} subtitle={`${estimate.estimateNumber} · ${estimate.name}`} onClose={() => setPending(null)} footer={<Button title={pending?.label || "Confirm"} tone={pending?.tone === "danger" ? "dangerSolid" : "primary"} disabled={!comment.trim() || busy} loading={busy} onPress={() => run(pending, comment)} />}>
        <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 }}>
          <Field label="Comment" value={comment} onChangeText={setComment} placeholder="Say why, so the team has the full trail" multiline autoFocus style={{ minHeight: 96 }} />
          <T variant="caption" weight={400} style={{ marginTop: 8, color: colors.faint }}>
            Required for this move.
          </T>
        </View>
      </Sheet>

      {/* Phase 4: Dispatch sheet */}
      {dispatchOpen ? (
        <DispatchSheet
          estimate={estimate}
          onClose={() => setDispatchOpen(false)}
          onDispatched={() => onTransition("DISPATCHED", "")}
        />
      ) : null}

      {/* Phase 4: Deliver sheet */}
      {deliverOpen ? (
        <DeliverSheet
          estimate={estimate}
          dispatches={dispatches}
          onClose={() => setDeliverOpen(false)}
          onDelivered={() => onTransition("DELIVERED", "")}
        />
      ) : null}
    </>
  );
}
