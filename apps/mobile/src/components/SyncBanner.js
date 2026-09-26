import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorToast, OfflineBanner } from "../ui";
import { useCompany } from "../context/CompanyContext";
import { useEstimates } from "../context/EstimatesContext";
import { useRates } from "../pricing/RatesContext";
import { useInventory } from "../inventory/InventoryContext";

// Shared-workspace status, shown over every screen:
//   · red "NOT SAVED" toast when the server refused a change (e.g. "Only 4 m left of PVC 40 mm")
//   · amber banner while offline with changes waiting to be sent
export default function SyncBanner() {
  const insets = useSafeAreaInsets();
  const { serverMode, status } = useCompany();
  const est = useEstimates();
  const rates = useRates();
  const inv = useInventory();
  if (!serverMode || status !== "member") return null;

  const error = est.syncError || inv.syncError || rates.syncError;
  const dismiss = () => {
    est.clearSyncError?.();
    inv.clearSyncError?.();
    rates.clearSyncError?.();
  };
  const waiting = est.pending || 0;
  const offline = est.online === false;
  if (!error && !(offline && waiting)) return null;

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + 8, left: 16, right: 16, alignItems: "center", zIndex: 1000 }}>
      <View style={{ width: "100%", maxWidth: 520 }}>{error ? <ErrorToast message={error} onDismiss={dismiss} /> : <OfflineBanner pending={waiting} />}</View>
    </View>
  );
}
