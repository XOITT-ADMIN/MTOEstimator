import React, { useMemo, useState } from "react";
import { View } from "react-native";

import { BottomBar, Button, IconButton, T, EmptyState, colors } from "../ui";
import { EstimateHeader } from "../features/estimate/EstimateHeader";
import { ItemsTab } from "../features/estimate/ItemsTab";
import { DetailsTab } from "../features/estimate/DetailsTab";
import { SummaryTab } from "../features/estimate/SummaryTab";
import { HistoryTab } from "../features/estimate/HistoryTab";
import { ActionBar } from "../features/estimate/ActionBar";
import { ProcurementTab } from "../features/estimate/ProcurementTab";
import { money, plural } from "../features/estimates";
import { useEstimates } from "../context/EstimatesContext";
import { useCompany } from "../context/CompanyContext";
import { useAuth } from "../context/AuthContext";
import { useInventory } from "../inventory/InventoryContext";
import { shareEstimateByEmail, shareEstimateByWhatsApp } from "../utils/exportEstimate";
import { calculateEstimateBreakdown } from "../pricing/calculations";
import { confirmAction, notify } from "../utils/confirm";

// One MTO: header + Details / Items / Summary / History, and the Action Bar for whatever move
// (Submit, Approve, Reject, …) the signed-in person can make right now.
export default function EstimateDetailScreen({ route, navigation }) {
  const { estimateId } = route.params;
  const { getEstimate, updateEstimate, removeItem, duplicateItem, transitionMto, fetchHistory } = useEstimates();
  const { user } = useAuth();
  const { profile: companyProfile, roles, canEditEstimates = true } = useCompany();
  const { getAvailability } = useInventory();

  function duplicateLine(it) {
    duplicateItem(estimate.id, it.id);
  }
  const estimate = getEstimate(estimateId);
  const isOwnMto = !estimate?.createdBy || estimate.createdBy.id === user?.uid;
  const [tab, setTab] = useState("items");
  const [sharing, setSharing] = useState(null);
  const breakdown = useMemo(() => (estimate ? calculateEstimateBreakdown(estimate) : null), [estimate]);

  async function transition(to, comment) {
    await transitionMto(estimate.id, to, comment);
  }

  if (!estimate) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, justifyContent: "center" }}>
        <EmptyState icon="fileText" title="Estimate not found" body="It may have been deleted on another device." action="Back to estimates" onAction={() => navigation.goBack()} />
      </View>
    );
  }

  const update = (patch) => updateEstimate(estimate.id, patch);
  const openPdf = () => navigation.navigate("PdfPreview", { estimateId: estimate.id });
  const addItem = () => navigation.navigate("AddItem", { estimateId: estimate.id });
  const trades = Array.from(new Set(estimate.items.map((i) => i.trade)));
  // Once an MTO has moved past Draft/Rejected the only way to change it is the Action Bar —
  // editing its fields is refused server-side (see EDITABLE_STATUSES in apps/api).
  const canEdit = canEditEstimates && (estimate.status === "DRAFT" || estimate.status === "REJECTED");

  async function removeLine(item) {
    if (await confirmAction({ title: "Remove this line?", message: `${item.item} · ${item.material}`, confirmText: "Remove", destructive: true })) removeItem(estimate.id, item.id);
  }

  async function share(kind) {
    if (sharing) return;
    setSharing(kind);
    try {
      if (kind === "email") await shareEstimateByEmail(estimate, companyProfile);
      else await shareEstimateByWhatsApp(estimate, companyProfile);
    } catch (err) {
      notify("Share failed", err?.message || "Could not make a PDF for this estimate.");
    } finally {
      setSharing(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <EstimateHeader estimate={estimate} tab={tab} onTab={setTab} onBack={() => navigation.goBack()} onPdf={openPdf} />

      <View style={{ flex: 1 }}>
        {tab === "items" ? (
          <ItemsTab
            estimate={estimate}
            breakdown={breakdown}
            getAvailability={getAvailability}
            canEdit={canEdit}
            onAdd={addItem}
            onEdit={(it) => navigation.navigate("AddItem", { estimateId: estimate.id, editItemId: it.id })}
            onDuplicate={duplicateLine}
            onRemove={removeLine}
          />
        ) : tab === "details" ? (
          <DetailsTab estimate={estimate} update={update} canEdit={canEdit} />
        ) : tab === "procurement" ? (
          <ProcurementTab estimate={estimate} roles={roles} onProcured={() => {}} />
        ) : tab === "history" ? (
          <HistoryTab estimateId={estimate.id} fetchHistory={fetchHistory} />
        ) : (
          <SummaryTab estimate={estimate} breakdown={breakdown} update={update} canEdit={canEdit} />
        )}
      </View>

      <BottomBar style={{ gap: 10, paddingHorizontal: 16 }}>
        <ActionBar estimate={estimate} roles={roles} isOwnMto={isOwnMto} onTransition={transition} />
        {tab === "history" ? null : tab === "summary" ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Button title="Export PDF" icon="fileDown" onPress={openPdf} style={{ flex: 1 }} />
            <IconButton icon="mail" label="Share by email" variant="outlined" color="blue700" size={56} onPress={() => share("email")} disabled={!!sharing} />
            <IconButton icon="chat" label="Share on WhatsApp" variant="outlined" color="blue700" size={56} onPress={() => share("whatsapp")} disabled={!!sharing} />
          </View>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <T variant="label" weight={400} num>
                {plural(estimate.items.length, "item")} · {plural(trades.length, "trade")}
              </T>
              <T variant="cardTitle" color="text" num>
                {money(breakdown.grandTotal)}
              </T>
            </View>
            {canEdit ? <Button title="Add item" icon="plus" onPress={addItem} style={{ paddingHorizontal: 22 }} /> : null}
          </View>
        )}
      </BottomBar>
    </View>
  );
}
