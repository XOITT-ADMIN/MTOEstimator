import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import * as MailComposer from "expo-mail-composer";

import {
  calculateItemMaterialTotal,
  calculateItemLabourTotal,
  calculateItemTotal,
  calculateEstimateBreakdown,
} from "../pricing/calculations";
import { formatINR } from "../utils/currency";
import { api } from "../api/client";
import { buildQuotationHtml } from "./quotationHtml";
// pdfBlob.js (native) vs pdfBlob.web.js (web) — Metro picks the right one for the platform.
// Both export estimatePdfBase64(estimate, company); only the web build also exports
// downloadEstimatePdf, since only there does "download" need to be a separate step.
import { estimatePdfBase64 } from "./pdfBlob";

function csvEscape(value) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function sanitizeFileName(name) {
  return (name || "estimate").trim().replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60) || "estimate";
}

export function buildEstimateCsv(estimate) {
  const header = [
    "#",
    "Trade",
    "Family",
    "Item",
    "Material",
    "Size",
    "Secondary size",
    "Core",
    "Qty",
    "Unit",
    "Material rate",
    "Material amount",
    "Labour rate",
    "Labour amount",
    "Line total",
    "Remarks",
  ];
  const rows = estimate.items.map((it, i) => [
    i + 1,
    it.trade,
    it.family,
    it.item,
    it.material,
    it.size || "",
    it.secondarySize || "",
    it.core || "",
    it.qty,
    it.unit,
    it.materialRate ?? 0,
    calculateItemMaterialTotal(it),
    it.labourRate ?? 0,
    calculateItemLabourTotal(it),
    calculateItemTotal(it),
    it.remarks || "",
  ]);
  const breakdown = calculateEstimateBreakdown(estimate);
  const summaryRows = [
    [],
    ["", "", "", "", "", "", "", "", "", "", "", "", "", "Subtotal", breakdown.subtotal],
    ["", "", "", "", "", "", "", "", "", "", "", "", "", "Discount", -breakdown.discountAmount],
    ["", "", "", "", "", "", "", "", "", "", "", "", "", `Tax (${estimate.tax?.percent || 0}%)`, breakdown.taxAmount],
    ["", "", "", "", "", "", "", "", "", "", "", "", "", "Grand total", breakdown.grandTotal],
  ];
  return [header, ...rows, ...summaryRows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

// The quotation layout lives in ./quotationHtml.js (shared by the PDF and the in-app preview).
export { buildQuotationHtml as buildEstimateHtml } from "./quotationHtml";

export async function exportEstimateCsv(estimate) {
  const csv = buildEstimateCsv(estimate);
  const filename = `${sanitizeFileName(estimate.name)}.csv`;

  if (Platform.OS === "web") {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(csv);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: "text/csv",
      dialogTitle: `Share ${estimate.name}`,
      UTI: "public.comma-separated-values-text",
    });
  }
}

export async function shareEstimatePdf(estimate, company) {
  const html = buildQuotationHtml(estimate, company);

  if (Platform.OS === "web") {
    await Print.printAsync({ html });
    return;
  }

  const { uri } = await Print.printToFileAsync({ html });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: `Share ${estimate.name}`,
      UTI: "com.adobe.pdf",
    });
  }
}

// "Ready to send" quotation, straight into an email draft with the PDF attached.
// (mailto: links can never carry an attachment — no website can hand a browser's mail
// compose window a file, by design, regardless of how the PDF was made. So on the web this
// downloads the real PDF and opens a compose window with the recipient's next step spelled
// out; on a phone it's one step: the device's own Mail app, PDF already attached.)
export async function shareEstimateByEmail(estimate, company) {
  const subject = `Quotation ${estimate.estimateNumber || ""} — ${estimate.name}`.trim();

  if (Platform.OS === "web") {
    const { downloadEstimatePdf } = await import("./pdfBlob");
    const filename = await downloadEstimatePdf(estimate, company);
    const body =
      `Hi,\n\nPlease find the quotation for ${estimate.name} attached — ` +
      `it just downloaded as "${filename}"; attach it here before sending.\n\n— ${company?.name || "XMTO"}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return;
  }

  const body = `Hi,\n\nPlease find attached the quotation for ${estimate.name}.\n\n— ${company?.name || "XMTO"}`;
  if (!(await MailComposer.isAvailableAsync())) {
    return shareEstimatePdf(estimate, company);
  }
  const html = buildQuotationHtml(estimate, company);
  const { uri } = await Print.printToFileAsync({ html });
  await MailComposer.composeAsync({ subject, body, attachments: [uri] });
}

// On a phone: the general share sheet with the real PDF file, WhatsApp one tap away (there's
// no attachment-carrying deep link straight into WhatsApp itself — that needs a native module
// and a custom build, not plain Expo). On the web there's no share sheet and no wa.me parameter
// that can carry a file either, so this downloads the real PDF and opens WhatsApp Web with the
// next step spelled out: attach the file that just downloaded.
export async function shareEstimateByWhatsApp(estimate, company) {
  if (Platform.OS === "web") {
    const { downloadEstimatePdf } = await import("./pdfBlob");
    const filename = await downloadEstimatePdf(estimate, company);
    const b = calculateEstimateBreakdown(estimate);
    const amount = formatINR(b.grandTotal);
    const text =
      `Quotation ${estimate.estimateNumber || ""} — ${estimate.name}\n` +
      `Amount: ${amount}\n` +
      `— ${company?.name || "XMTO"}\n\n` +
      `(The PDF just downloaded as "${filename}" — attach it here before sending.)`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    return;
  }
  return shareEstimatePdf(estimate, company);
}

// Uploads the estimate's PDF and asks the server to email it to the company's notification
// address (Settings › Notifications), if one is configured. Best-effort and silent: a field
// engineer marking an estimate Ready shouldn't see an error over a "nice to have" admin copy.
export async function notifyEstimateReady(estimate, company) {
  try {
    const pdfBase64 = await estimatePdfBase64(estimate, company);
    const res = await api("POST", `/estimates/${estimate.id}/notify-ready`, { pdfBase64 });
    if (!res?.sent) console.warn("[notifyEstimateReady] server did not send — check Settings > Notifications has an address, and that SMTP is configured on the server.");
  } catch (e) {
    // offline, no server configured, or the request failed — quietly skip, but leave a trace for debugging
    console.warn("[notifyEstimateReady] failed:", e?.message || e);
  }
}