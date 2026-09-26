import React from "react";
import { View, ScrollView, KeyboardAvoidingView, Platform } from "react-native";

import { Sheet, StepProgress, Button, T } from "../ui";
import { money } from "../features/estimates";
import { useAddItemWizard, STEP_LABELS } from "../features/addItem/useAddItemWizard";
import { ItemStep, TileStep, QtyStep } from "../features/addItem/steps";

// Add item / edit line — a bottom sheet with 4 (sometimes 5) tap-to-advance steps.
// Rules live in features/addItem/useAddItemWizard.js; step views in features/addItem/steps.js.
export default function AddItemScreen({ route, navigation }) {
  const { estimateId, editItemId } = route.params;
  const w = useAddItemWizard({ estimateId, editItemId, onDone: () => navigation.goBack() });
  const labels = w.steps.map((k) => STEP_LABELS[k]);
  const onQty = w.stepKey === "qty";

  const footer = (
    <>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <T variant="label" weight={400} num>
          Line total
          {w.specComplete ? ` · M ${money(Number(w.materialRate) || 0, false)} + L ${money(Number(w.labourRate) || 0, false)}` : ""}
        </T>
        <T size={22} weight={700} color="navy" num>
          {w.specComplete ? money(w.totals.line) : "—"}
        </T>
      </View>
      {onQty ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          {!w.isEditing ? <Button title="Save + add another" tone="secondary" compactText disabled={!w.canTry} onPress={() => w.save(true)} style={{ flex: 1, paddingHorizontal: 10 }} /> : null}
          <Button title={w.errors.stock ? w.stockProblem?.title || "Not in stock" : w.isEditing ? "Save changes" : "Add to estimate"} icon={w.isEditing ? "check" : undefined} tone={w.errors.stock ? "danger" : "primary"} disabled={!w.canTry} onPress={() => w.save(false)} style={{ flex: 1, paddingHorizontal: 10 }} />
        </View>
      ) : (
        <T variant="label" weight={400} center style={{ height: 24, lineHeight: 24 }}>
          Tap to choose — each pick moves you on.
        </T>
      )}
    </>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Sheet
        inline
        full
        title={w.isEditing ? "Edit line" : "Add item"}
        subtitle={`Step ${w.stepIndex + 1} of ${w.steps.length} · ${STEP_LABELS[w.stepKey]}`}
        onClose={() => navigation.goBack()}
        header={<StepProgress steps={labels} current={w.stepIndex} onStep={w.goToIndex} />}
        footer={footer}
      >
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
          {w.stepKey === "item" ? <ItemStep w={w} /> : onQty ? <QtyStep w={w} /> : <TileStep w={w} />}
        </ScrollView>
      </Sheet>
    </KeyboardAvoidingView>
  );
}
