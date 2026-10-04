// Native (iOS/Android): expo-print renders the quotation straight to a real PDF file and can
// hand back its bytes as base64 in the same call. See pdfBlob.web.js for the web equivalent —
// expo-print has no such capability there (window.print() is all it can do on the web).
import * as Print from "expo-print";

import { buildQuotationHtml } from "./quotationHtml";

export async function estimatePdfBase64(estimate, company) {
  const html = buildQuotationHtml(estimate, company);
  const { base64 } = await Print.printToFileAsync({ html, base64: true, width: 595, height: 842 });
  return base64;
}
