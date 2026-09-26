import { useCompany } from "../context/CompanyContext";
import { useEstimates } from "../context/EstimatesContext";

// Sync state for <SyncChip>: "local" (no server) · "offline" · "saving" · "saved".
export function useSyncState() {
  const { serverMode, status } = useCompany();
  const { pending = 0, online } = useEstimates();
  if (!serverMode || status !== "member") return { state: "local", pending: 0 };
  if (online === false) return { state: "offline", pending };
  if (pending) return { state: "saving", pending };
  return { state: "saved", pending: 0 };
}
