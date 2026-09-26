// Web: expo-print has no way to produce actual PDF bytes here — window.print() is the only
// thing it can do in a browser (see ExponentPrint.web.js). See pdfBlob.js for the native path,
// where expo-print renders a real file directly.
//
// So on the web we rasterise the same quotation HTML with html2canvas, then wrap that single
// image in a one-page PDF ourselves. A JPEG is already DCT-encoded, so it can be dropped into a
// PDF's image stream byte-for-byte — no PDF-writing library needed for a single full-page image.
import html2canvas from "html2canvas";

import { buildQuotationHtml } from "./quotationHtml";

const PAGE_W = 595; // A4 at 72dpi, points — matches the native PDF's page size (see PdfPreviewScreen)
const PAGE_H = 842;
const RENDER_SCALE = 2; // sharper text since this ends up as a raster image, not vector text

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function concatBytes(chunks, totalLength) {
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

// One page, one full-bleed JPEG. imgW/imgH are the JPEG's own pixel dimensions (for the image
// object); pageW/pageH (in points) size the page and how large the image is drawn on it.
function jpegToOnePagePdfBytes(jpegBytes, imgW, imgH, pageW, pageH) {
  const textEncoder = new TextEncoder();
  const chunks = [];
  let cursor = 0;
  const offsets = [];

  function push(part) {
    const bytes = typeof part === "string" ? textEncoder.encode(part) : part;
    chunks.push(bytes);
    cursor += bytes.length;
  }
  function beginObj(n) {
    offsets[n] = cursor;
    push(`${n} 0 obj\n`);
  }
  const endObj = () => push("endobj\n");

  push("%PDF-1.4\n");

  beginObj(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\n");
  endObj();

  beginObj(2);
  push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n");
  endObj();

  beginObj(3);
  push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\n`);
  endObj();

  const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
  beginObj(4);
  push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\n`);
  endObj();

  beginObj(5);
  push(`<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
  push(jpegBytes);
  push("\nendstream\nendobj\n");

  const xrefStart = cursor;
  const objectCount = 6; // objects 0..5, where 0 is the free-list head
  push(`xref\n0 ${objectCount}\n0000000000 65535 f \n`);
  for (let i = 1; i < objectCount; i++) {
    push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return concatBytes(chunks, cursor);
}

export async function estimatePdfBase64(estimate, company) {
  const html = buildQuotationHtml(estimate, company);

  // Render off-screen in a same-origin iframe so html2canvas sees the exact quotation layout
  // (fonts, CSS, page size) the same way the in-app preview and the native PDF do.
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = `${PAGE_W}px`;
  iframe.style.height = `${PAGE_H}px`;
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  try {
    await new Promise((resolve) => {
      iframe.onload = resolve;
      iframe.srcdoc = html;
    });
    await new Promise((r) => setTimeout(r, 60)); // let web fonts / layout settle

    const canvas = await html2canvas(iframe.contentDocument.body, {
      width: PAGE_W,
      height: PAGE_H,
      windowWidth: PAGE_W,
      windowHeight: PAGE_H,
      scale: RENDER_SCALE,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const jpegBytes = dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.92));
    const pdfBytes = jpegToOnePagePdfBytes(jpegBytes, canvas.width, canvas.height, PAGE_W, PAGE_H);
    return bytesToBase64(pdfBytes);
  } finally {
    document.body.removeChild(iframe);
  }
}

// Triggers a real file download of the quotation PDF in the browser (no print dialog).
export async function downloadEstimatePdf(estimate, company) {
  const base64 = await estimatePdfBase64(estimate, company);
  const bytes = dataUrlToBytes(`data:application/pdf;base64,${base64}`);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(estimate.estimateNumber || estimate.name || "quotation").replace(/[^a-z0-9-_]+/gi, "_")}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return a.download;
}
