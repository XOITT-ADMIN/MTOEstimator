import React, { useState } from "react";
import { View, Switch } from "react-native";

import { Sheet, Field, Button, T, colors } from "../../ui";
import { api } from "../../api/client";
import { notify } from "../../utils/confirm";

// Logistics dispatch sheet: loading check, cost, vehicle, driver, notes.
// Opened from the Action Bar when status is READY_TO_DISPATCH.
// On save it creates the dispatch record (POST /mtos/:id/dispatch) then the caller
// calls transition to DISPATCHED so both happen in one user action.
export function DispatchSheet({ estimate, onClose, onDispatched }) {
  const [loadingCheck, setLoadingCheck] = useState(false);
  const [loadingCost, setLoadingCost]   = useState("");
  const [vehicle, setVehicle]           = useState("");
  const [driver, setDriver]             = useState("");
  const [notes, setNotes]               = useState("");
  const [busy, setBusy]                 = useState(false);

  async function handleDispatch() {
    setBusy(true);
    try {
      const { dispatch } = await api("POST", `/mtos/${estimate.id}/dispatch`, {
        loadingCheck,
        loadingCost: parseFloat(loadingCost) || 0,
        vehicle:     vehicle.trim(),
        driver:      driver.trim(),
        notes:       notes.trim(),
      });
      // Transition to DISPATCHED immediately
      await api("POST", `/mtos/${estimate.id}/transition`, { to: "DISPATCHED" });
      if (onDispatched) onDispatched(dispatch);
      onClose();
    } catch (e) {
      notify("Dispatch failed", e?.message || "Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible
      title="Dispatch details"
      subtitle={`${estimate.estimateNumber} · ${estimate.name}`}
      onClose={onClose}
      footer={
        <Button
          title="Mark dispatched"
          icon="truck"
          loading={busy}
          disabled={busy}
          onPress={handleDispatch}
        />
      }
    >
      <View style={{ padding: 20, gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
          <T variant="bodyStrong">Loading check done</T>
          <Switch
            value={loadingCheck}
            onValueChange={setLoadingCheck}
            trackColor={{ true: colors.action }}
            thumbColor={colors.surface}
          />
        </View>

        <Field
          label="Loading cost (₹)"
          value={loadingCost}
          onChangeText={(v) => setLoadingCost(v.replace(/[^0-9.]/g, ""))}
          keyboardType="decimal-pad"
          placeholder="0"
        />

        <Field
          label="Vehicle / truck no."
          value={vehicle}
          onChangeText={setVehicle}
          placeholder="e.g. KA 01 AB 1234"
          autoCapitalize="characters"
        />

        <Field
          label="Driver name"
          value={driver}
          onChangeText={setDriver}
          placeholder="Optional"
        />

        <Field
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Any special instructions"
          multiline
          style={{ minHeight: 72 }}
        />
      </View>
    </Sheet>
  );
}

// Simplified "Mark delivered" sheet — just a confirm with dispatch id.
export function DeliverSheet({ estimate, dispatches = [], onClose, onDelivered }) {
  const [busy, setBusy] = useState(false);
  const dispatch = dispatches[dispatches.length - 1]; // most recent dispatch

  async function handleDeliver() {
    if (!dispatch) { notify("No dispatch", "Create a dispatch record first."); return; }
    setBusy(true);
    try {
      await api("PATCH", `/dispatches/${dispatch.id}`, { delivered: true });
      // Transition is handled server-side when delivered=true is set, but also call it explicitly
      // in case the MTO hasn't moved yet (belt-and-suspenders)
      try { await api("POST", `/mtos/${estimate.id}/transition`, { to: "DELIVERED" }); } catch (_) {}
      if (onDelivered) onDelivered();
      onClose();
    } catch (e) {
      notify("Could not mark delivered", e?.message || "Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible
      title="Confirm delivery"
      subtitle={`${estimate.estimateNumber} · ${estimate.name}`}
      onClose={onClose}
      footer={
        <Button
          title="Mark delivered"
          loading={busy}
          disabled={busy}
          onPress={handleDeliver}
        />
      }
    >
      <View style={{ padding: 20 }}>
        <T variant="body" weight={400} style={{ color: colors.muted, lineHeight: 22 }}>
          Confirming delivery means this material is now at the site and will count in the project's site balance.
        </T>
      </View>
    </Sheet>
  );
}
