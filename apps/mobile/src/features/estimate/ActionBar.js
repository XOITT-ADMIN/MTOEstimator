import React, { useEffect, useState } from "react";
import { View, ScrollView } from "react-native";

import { Button, Sheet, Field, T, colors } from "../../ui";
import { availableTransitions } from "../mto/mtoStatus";
import { confirmAction, notify } from "../../utils/confirm";
import { api, apiEnabled } from "../../api/client";

// The row of "what can I do to this MTO right now" buttons — Submit, Approve, Reject, Mark
// budget OK, Send back, Deliver, Cancel, … — computed from the MTO's status and the
// signed-in person's permissions on the MTO's project. Nothing here is the final word: the server re-checks every move.
// `onTransition(to, comment)` does the API call.
// "Mark ready to dispatch" needs Procurement to be finished first: every line fully allocated.
// `refreshKey` changes when procurement is saved or the tab changes, so the check re-runs.
export function ActionBar({ estimate, perms, isOwnMto, onTransition, refreshKey }) {
  const [unallocated, setUnallocated] = useState(null); // lines still short, or null while unknown
  const [pending, setPending]           = useState(null); // action waiting for a comment
  const [comment, setComment]           = useState("");
  const [busy, setBusy]                 = useState(false);

  const actions = availableTransitions(estimate.status, perms, { isOwnMto });
  const needsProcurement = actions.some((a) => a.to === "READY_TO_DISPATCH");

  useEffect(() => {
    if (!needsProcurement || !apiEnabled || !estimate?.id) {
      setUnallocated(null);
      return undefined;
    }
    let cancelled = false;
    api("GET", `/mtos/${estimate.id}/lines`)
      .then((lines) => {
        if (cancelled) return;
        const short = (lines || []).filter((l) => Math.round(l.issuedQty * 100) < Math.round(l.qty * 100));
        setUnallocated(lines?.length ? short.length : 0);
      })
      .catch(() => !cancelled && setUnallocated(null)); // offline — the server still checks
    return () => {
      cancelled = true;
    };
  }, [needsProcurement, estimate?.id, refreshKey]);

  if (!actions.length) return null;

  const blockedReason = (a) =>
    a.to === "READY_TO_DISPATCH" && unallocated > 0
      ? `${unallocated} line${unallocated === 1 ? " is" : "s are"} not fully allocated yet. Complete Procurement (allocate from stock or buy) first.`
      : null;
  const blocked = actions.map(blockedReason).find(Boolean);

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
    const reason = blockedReason(action);
    if (reason) {
      notify("Procurement isn't complete", reason);
      return;
    }
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
          <Button key={a.to} title={a.label} tone={a.tone === "danger" ? "dangerSolid" : "primary"} compact compactText disabled={busy || !!blockedReason(a)} onPress={() => tap(a)} style={{ paddingHorizontal: 18 }} />
        ))}
      </ScrollView>
      {blocked ? (
        <T variant="caption" weight={500} style={{ color: colors.warningInk }}>
          {blocked}
        </T>
      ) : null}

      {/* Comment sheet for Reject / Send back / Cancel */}
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
