import React, { useState } from "react";
import { View } from "react-native";

import { Screen, Tabs, Notice, SearchField, colors } from "../ui";
import { StockTab } from "../features/library/StockTab";
import { RatesTab } from "../features/library/RatesTab";
import { CatalogTab } from "../features/library/CatalogTab";
import { useCompany } from "../context/CompanyContext";
import { useRates } from "../pricing/RatesContext";
import { useInventory } from "../inventory/InventoryContext";

const SECTIONS = ["Stock", "Plumbing", "Electrical", "Materials", "Sizes", "Rates"];

// Library: the company's shared stock, rates and master catalog. Each tab is in features/library/.
export default function LibraryScreen() {
  const [section, setSection] = useState("Stock");
  const [query, setQuery] = useState("");
  const { profile } = useCompany();
  const { canEdit: canEditRates } = useRates();
  const { canEdit: canEditStock = true } = useInventory();
  const readOnly = !canEditRates && !canEditStock;
  const searchable = section !== "Stock" && section !== "Sizes";

  return (
    <Screen tabBar title="Library" subtitle={`Rates and stock shared across ${profile?.name || "your company"}`}>
      {readOnly ? (
        <Notice icon="lock" style={{ marginBottom: 12 }}>
          Set by your admin. You can look, not change.
        </Notice>
      ) : null}
      <View style={{ marginHorizontal: -20, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 14 }}>
        <Tabs scroll active={section} onChange={(k) => { setSection(k); setQuery(""); }} tabs={SECTIONS.map((s) => ({ key: s, label: s }))} style={{ paddingHorizontal: 12 }} />
      </View>
      {searchable ? <SearchField value={query} onChangeText={setQuery} placeholder={section === "Rates" ? "Search rates" : `Search ${section.toLowerCase()}`} style={{ marginBottom: 12 }} /> : null}
      {section === "Stock" ? <StockTab /> : section === "Rates" ? <RatesTab query={query} /> : <CatalogTab section={section} query={query} />}
    </Screen>
  );
}
