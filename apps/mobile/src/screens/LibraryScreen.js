import React, { useState } from "react";
import { View } from "react-native";

import { Screen, Tabs, Notice, SearchField, EmptyState, Chip, ChipRow, colors } from "../ui";
import { StockTab } from "../features/library/StockTab";
import { RatesTab } from "../features/library/RatesTab";
import { ReturnsTab } from "../features/library/ReturnsTab";
import { useCompany } from "../context/CompanyContext";
import { useProjects, useProjectScope } from "../context/ProjectsContext";
import { useRates } from "../pricing/RatesContext";
import { useInventory } from "../inventory/InventoryContext";

const SECTIONS = ["Stock", "Returns", "Budget rates"];

// Library: stock, returns and budget rates — kept per project, so pick which one at the top.
// Each tab is in features/library/.
export default function LibraryScreen() {
  const [section, setSection] = useState("Stock");
  const [query, setQuery] = useState("");
  const { profile, serverMode } = useCompany();
  const { projects, getProject } = useProjects();
  const { projectId, setProjectId } = useProjectScope();
  const project = getProject(projectId);
  const projectScoped = section === "Stock" || section === "Budget rates";
  const needsProject = serverMode && projectScoped && !project;
  const { canEdit: canEditRates, loaded: ratesLoaded } = useRates();
  const { canEdit: canEditStock = true, loaded: stockLoaded } = useInventory();
  const readOnly = !canEditRates && !canEditStock;
  const searchable = section === "Budget rates";

  return (
    <Screen tabBar title="Library" subtitle={serverMode && project ? `Stock and budget rates for ${project.name}` : `Budget rates and stock for ${profile?.name || "your company"}`} loading={!ratesLoaded && !stockLoaded}>
      {readOnly ? (
        <Notice icon="lock" style={{ marginBottom: 12 }}>
          Set by your admin. You can look, not change.
        </Notice>
      ) : null}
      <View style={{ marginHorizontal: -20, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 14 }}>
        <Tabs scroll active={section} onChange={(k) => { setSection(k); setQuery(""); }} tabs={SECTIONS.map((s) => ({ key: s, label: s }))} style={{ paddingHorizontal: 12 }} />
      </View>
      {serverMode && projectScoped && projects.length > 0 ? (
        <ChipRow style={{ marginBottom: 12 }}>
          {projects.map((p) => (
            <Chip key={p.id} label={p.name} active={p.id === projectId} onPress={() => setProjectId(p.id)} />
          ))}
        </ChipRow>
      ) : null}
      {searchable ? <SearchField value={query} onChangeText={setQuery} placeholder={section === "Budget rates" ? "Search budget rates" : `Search ${section.toLowerCase()}`} style={{ marginBottom: 12 }} /> : null}
      {needsProject ? (
        <EmptyState icon="building" title="No project yet" body="Stock and budget rates live inside a project. Create a project first, then set its stock and budget rates here." />
      ) : section === "Returns" ? <ReturnsTab />
      : section === "Stock" ? <StockTab /> : <RatesTab query={query} />}
    </Screen>
  );
}
