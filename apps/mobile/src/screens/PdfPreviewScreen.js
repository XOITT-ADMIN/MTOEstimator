import React, { useMemo, useState } from "react";
import { View, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Print from "expo-print";

import { IconButton, Button, T, Icon, EmptyState, colors, radius } from "../ui";
import { useEstimates } from "../context/EstimatesContext";
import { useCompany } from "../context/CompanyContext";
import { buildQuotationHtml } from "../utils/quotationHtml";
import { shareEstimateByEmail, shareEstimateByWhatsApp } from "../utils/exportEstimate";
import { notify } from "../utils/confirm";

// WebView is native-only; on web the page renders in an <iframe>.
const WebView = Platform.OS === "web" ? null : require("react-native-webview").WebView;
const PAGE_W = 595;
const PAGE_H = 842;
const STAGE_BG = "#262949";

// "Quotation preview": exactly the A4 page the client receives, with Download and Share.
export default function PdfPreviewScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { getEstimate } = useEstimates();
  const { profile } = useCompany();
  const estimate = getEstimate(route.params?.estimateId);
  const [width, setWidth] = useState(0);
  const [busy, setBusy] = useState(null);
  const html = useMemo(() => (estimate ? buildQuotationHtml(estimate, profile) : ""), [estimate, profile]);

  if (!estimate) {
    return (
      <View style={{ flex: 1, backgroundColor: STAGE_BG, justifyContent: "center" }}>
        <EmptyState icon="fileText" title="Estimate not found" action="Close" onAction={() => navigation.goBack()} />
      </View>
    );
  }

  const scale = width ? width / PAGE_W : 0.6;
  const tax = estimate.tax?.percent || 0;

  async function run(kind) {
    if (busy) return;
    setBusy(kind);
    try {
      if (kind === "email") await shareEstimateByEmail(estimate, profile);
      else if (kind === "whatsapp") await shareEstimateByWhatsApp(estimate, profile);
      else await Print.printAsync({ html }); // system sheet → "Save as PDF" / print
    } catch (e) {
      notify(kind === "download" ? "Download failed" : "Share failed", e?.message || "Could not make the PDF.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: STAGE_BG }}>
      <View style={{ paddingTop: Math.max(insets.top, 12) + 4, paddingHorizontal: 8, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 4 }}>
        <IconButton icon="close" label="Close preview" color="white" onPress={() => navigation.goBack()} />
        <View style={{ flex: 1 }}>
          <T variant="rowTitle" size={17} color="white">
            {route.params?.justReady ? "Ready — send it over" : "Quotation preview"}
          </T>
          <T variant="label" weight={400} color="onNavyMuted" num>
            {estimate.estimateNumber} · A4
          </T>
        </View>
        {tax ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.12)", marginRight: 8 }}>
            <Icon name="tag" size={14} color="#DDE6F3" />
            <T variant="caption" weight={400} color="#DDE6F3">
              GST {tax}%
            </T>
          </View>
        ) : null}
      </View>

      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, alignItems: "center", gap: 12 }}>
        <View
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          style={{ alignSelf: "stretch", flex: 1, maxHeight: width ? PAGE_H * scale : undefined, borderRadius: 4, overflow: "hidden", backgroundColor: colors.white, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 30, shadowOffset: { width: 0, height: 12 }, elevation: 12 }}
        >
          {Platform.OS === "web" ? (
            <View style={{ width: PAGE_W, height: PAGE_H, transform: [{ scale }], transformOrigin: "top left" }}>
              {React.createElement("iframe", { title: "Quotation", srcDoc: html, style: { width: PAGE_W, height: PAGE_H, border: 0, background: "#fff" } })}
            </View>
          ) : (
            <WebView originWhitelist={["*"]} source={{ html: html.replace("width=device-width, initial-scale=1", `width=${PAGE_W}`) }} scalesPageToFit style={{ flex: 1, backgroundColor: colors.white }} />
          )}
        </View>
        <T variant="caption" weight={400} color="onNavyFaint">
          Pinch to zoom · this is exactly what your client receives
        </T>
      </View>

      <View style={{ backgroundColor: colors.white, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, paddingHorizontal: 16, paddingTop: 14, paddingBottom: Math.max(insets.bottom, 12) + 10, gap: 10 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button title="Email" icon="mail" tone="secondary" onPress={() => run("email")} loading={busy === "email"} style={{ flex: 1 }} />
          <Button title="WhatsApp" icon="chat" tone="secondary" onPress={() => run("whatsapp")} loading={busy === "whatsapp"} style={{ flex: 1 }} />
        </View>
        <Button title="Download PDF" icon="download" onPress={() => run("download")} loading={busy === "download"} />
      </View>
    </View>
  );
}
