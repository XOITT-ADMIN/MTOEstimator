import React, { useMemo, useState } from "react";
import { View } from "react-native";

import { BottomBar, Button, IconButton, T, EmptyState, colors } from "../ui";
import { EstimateHeader } from "../features/estimate/EstimateHeader";
import { ItemsTab } from "../features/estimate/ItemsTab";
import { DetailsTab } from "../features/estimate/DetailsTab";
import { SummaryTab } from "../features/estimate/SummaryTab";
import { money, plural } from "../features/estimates";
import { useEstimates } from "../context/EstimatesContext";
import { useCompany } from "../context/CompanyContext";
import { useInventory } from "../inventory/InventoryContext";
import { notifyEstimateReady, shareEstimateByEmail, shareEstimateByWhatsApp } from "../utils/exportEstimate";
import { calculateEstimateBreakdown } from "../pricing/calculations";
import { confirmAction, notify } from "../utils/confirm";

// One estimate: header + Details / Items / Summary. The tabs live in features/estimate/.
export default function EstimateDetailScreen({ route, navigation }) {
  const { estimateId } = route.params;
  const { getEstimate, updateEstimate, removeItem, duplicateItem } = useEstimates();
  const { profile: companyProfile, serverMode, status: companyStatus, canManageTeam, canEditEstimates = true } = useCompany();
  const { getAvailability, checkNewLines, stockPolicy } = useInventory();

  // Duplicating a line takes the same stock again, so it gets the same check as Add item.
  function duplicateLine(it) {
    const problems = checkNewLines([it]);
    if (problems.length && stockPolicy === "block") {
      notify("Can't duplicate — not in stock", problems.join("\n"));
      return;
    }
    duplicateItem(estimate.id, it.id);
    if (problems.length) notify("Duplicated — stock is short", problems.join("\n"));
  }
  // In a shared workspace only owners/admins approve, reject or complete (the server enforces it too).
  const canApprove = !(serverMode && companyStatus === "member") || canManageTeam;
  const estimate = getEstimate(estimateId);
  const [tab, setTab] = useState("items");
  const [sharing, setSharing] = useState(null);
  const breakdown = useMemo(() => (estimate ? calculateEstimateBreakdown(estimate) : null), [estimate]);

  if (!estimate) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, justifyContent: "center" }}>
        <EmptyState icon="fileText" title="Estimate not found" body="It may have been deleted on another device." action="Back to estimates" onAction={() => navigation.goBack()} />
      </View>
    );
  }

  const update = (patch) => updateEstimate(estimate.id, patch);
  // Field engineer just marked it Ready: take them straight to Email / WhatsApp, and
  // best-effort email the admin notification address a copy of the PDF (Settings › Notifications).
  const updateDetails = (patch) => {
    update(patch);
    if (patch.status === "Ready" && estimate.status !== "Ready") {
      navigation.navigate("PdfPreview", { estimateId: estimate.id, justReady: true });
      notifyEstimateReady(estimate, companyProfile);
    }
  };
  const openPdf = () => navigation.navigate("PdfPreview", { estimateId: estimate.id });
  const addItem = () => navigation.navigate("AddItem", { estimateId: estimate.id });
  const trades = Array.from(new Set(estimate.items.map((i) => i.trade)));

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
            canEdit={canEditEstimates}
            onAdd={addItem}
            onEdit={(it) => navigation.navigate("AddItem", { estimateId: estimate.id, editItemId: it.id })}
            onDuplicate={duplicateLine}
            onRemove={removeLine}
          />
        ) : tab === "details" ? (
          <DetailsTab estimate={estimate} update={updateDetails} canApprove={canApprove} canEdit={canEditEstimates} />
        ) : (
          <SummaryTab estimate={estimate} breakdown={breakdown} update={update} canEdit={canEditEstimates} />
        )}
      </View>

      {tab === "summary" ? (
        <BottomBar style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16 }}>
          <Button title="Export PDF" icon="fileDown" onPress={openPdf} style={{ flex: 1 }} />
          <IconButton icon="mail" label="Share by email" variant="outlined" color="blue700" size={56} onPress={() => share("email")} disabled={!!sharing} />
          <IconButton icon="chat" label="Share on WhatsApp" variant="outlined" color="blue700" size={56} onPress={() => share("whatsapp")} disabled={!!sharing} />
        </BottomBar>
      ) : (
        <BottomBar style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16 }}>
          <View style={{ flex: 1 }}>
            <T variant="label" weight={400} num>
              {plural(estimate.items.length, "item")} · {plural(trades.length, "trade")}
            </T>
            <T variant="cardTitle" color="text" num>
              {money(breakdown.grandTotal)}
            </T>
          </View>
          {canEditEstimates ? <Button title="Add item" icon="plus" onPress={addItem} style={{ paddingHorizontal: 22 }} /> : null}
        </BottomBar>
      )}
    </View>
  );
}
