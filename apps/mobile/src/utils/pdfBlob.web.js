// Web: expo-print has no way to produce actual PDF bytes here — window.print() is the only
// thing it can do in a browser (see ExponentPrint.web.js). See pdfBlob.js for the native path,
// where expo-print renders a real file directly.
//
// So on the web we rasterise the same quotation HTML with html2canvas, slice it into A4 pages
// (cutting between table rows, never through a line of text) and wrap each page's JPEG in a PDF
// ourselves. A JPEG is already DCT-encoded, so it can be dropped into a PDF's image stream
// byte-for-byte — no PDF-writing library needed.
import html2canvas from "html2canvas";

import { buildQuotationHtml } from "./quotationHtml";

const PAGE_W = 595; // A4 at 72dpi, points — matches the native PDF's page size (see PdfPreviewScreen)
const PAGE_H = 842;
const MARGIN_X = 40; // matches the @page margin in quotationHtml.js
const MARGIN_Y = 36;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
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

// N pages, one full-bleed JPEG each. images: [{ bytes, w, h }] (w/h are the JPEG's pixel size).
function jpegsToPdfBytes(images, pageW, pageH) {
  const textEncoder = new TextEncoder();
  const chunks = [];
  let cursor = 0;
  const offsets = [];

  function push(part) {
    const bytes = typeof part === "string" ? textEncoder.encode(part) : part;
    chunks.push(bytes);
    cursor += bytes.length;
  }
  function obj(n, body) {
    offsets[n] = cursor;
    push(`${n} 0 obj\n`);
    body();
    push("endobj\n");
  }

  // Object ids: 1 catalog, 2 pages, then per page i: page 3+3i, content 4+3i, image 5+3i.
  push("%PDF-1.4\n");
  obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>\n"));
  obj(2, () => push(`<< /Type /Pages /Kids [${images.map((_, i) => `${3 + 3 * i} 0 R`).join(" ")}] /Count ${images.length} >>\n`));
  const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
  images.forEach((img, i) => {
    obj(3 + 3 * i, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 ${5 + 3 * i} 0 R >> >> /Contents ${4 + 3 * i} 0 R >>\n`));
    obj(4 + 3 * i, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\n`));
    obj(5 + 3 * i, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`);
      push(img.bytes);
      push("\nendstream\n");
    });
  });

  const xrefStart = cursor;
  const objectCount = 3 + 3 * images.length; // objects 0..N, where 0 is the free-list head
  push(`xref\n0 ${objectCount}\n0000000000 65535 f \n`);
  for (let i = 1; i < objectCount; i++) {
    push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return concatBytes(chunks, cursor);
}

// [start, end) rows (CSS px) of the tall capture for each page. A page ends at the lowest block
// bottom that still fits, so rows/boxes are never sliced in half.
function pageSlices(totalH, pageContentH, blockBottoms) {
  const slices = [];
  let start = 0;
  while (totalH - start > pageContentH) {
    const limit = start + pageContentH;
    let cut = limit;
    for (let i = blockBottoms.length - 1; i >= 0; i--) {
      if (blockBottoms[i] <= limit && blockBottoms[i] > start + pageContentH * 0.4) {
        cut = blockBottoms[i];
        break;
      }
    }
    slices.push([start, cut]);
    start = cut;
  }
  slices.push([start, totalH]);
  return slices;
}

export async function estimatePdfBase64(estimate, company) {
  const html = buildQuotationHtml(estimate, company);

  // Render off-screen in a same-origin iframe so html2canvas sees the exact quotation layout.
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

    // Capture just the content box (no screen padding); the margins are re-added per page below.
    const doc = iframe.contentDocument;
    doc.body.style.padding = "0";
    doc.body.style.width = `${CONTENT_W}px`;
    const target = doc.querySelector(".page");
    const totalH = Math.ceil(target.scrollHeight);
    iframe.style.height = `${totalH}px`;
    await new Promise((r) => setTimeout(r, 30));
    const top = target.getBoundingClientRect().top;
    const blockBottoms = Array.from(doc.querySelectorAll("tr, .box, .tl, .terms, .sign, .head, .trade"))
      .map((el) => Math.round(el.getBoundingClientRect().bottom - top))
      .sort((x, y) => x - y);

    const canvas = await html2canvas(target, {
      width: CONTENT_W,
      height: totalH,
      windowWidth: CONTENT_W,
      windowHeight: totalH,
      scale: RENDER_SCALE,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const images = pageSlices(totalH, PAGE_H - MARGIN_Y * 2, blockBottoms).map(([y0, y1]) => {
      const page = document.createElement("canvas");
      page.width = PAGE_W * RENDER_SCALE;
      page.height = PAGE_H * RENDER_SCALE;
      const ctx = page.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, page.width, page.height);
      const sh = Math.min((y1 - y0) * RENDER_SCALE, canvas.height - y0 * RENDER_SCALE);
      ctx.drawImage(canvas, 0, y0 * RENDER_SCALE, canvas.width, sh, MARGIN_X * RENDER_SCALE, MARGIN_Y * RENDER_SCALE, canvas.width, sh);
      return { bytes: dataUrlToBytes(page.toDataURL("image/jpeg", 0.92)), w: page.width, h: page.height };
    });
    return bytesToBase64(jpegsToPdfBytes(images, PAGE_W, PAGE_H));
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
