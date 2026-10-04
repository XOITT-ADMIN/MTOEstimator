// Renders every XMTO brand asset from the SVG below.
//   npm i -D playwright-core   (uses any Chromium: set CHROMIUM=path)
//   FONT=/path/Poppins-Bold.ttf FONTSB=/path/Poppins-Medium.ttf node brand/render.mjs
// Then copy icon/adaptive-icon/splash-icon/favicon into apps/mobile/assets and the logos into
// apps/mobile/assets/brand (trim transparent edges).
import { chromium } from "playwright-core";
import fs from "node:fs";
const FONT = process.env.FONT, FONTSB = process.env.FONTSB;
const css = `@font-face{font-family:P;src:url(file://${FONT});font-weight:700}@font-face{font-family:P;src:url(file://${FONTSB});font-weight:500}
html,body{margin:0;background:transparent}`;
// XOIT-style X in a 100x100 box
const X = (band, wedge) => `
  <polygon points="68,4 98,4 34,96 4,96" fill="${band}"/>
  <polygon points="5,4 34,4 41,14 26,33" fill="${wedge}"/>
  <polygon points="95,96 66,96 59,86 74,67" fill="${wedge}"/>`;
const NAVY="#1F2150", B7="#2B4A7A", B6="#3A6BA3", B5="#4589CC";
const jobs = {
  // App icon: navy gradient tile, white X with sky-blue wedges, MTO below
  "icon.png": [1024,1024, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${NAVY}"/><stop offset="1" stop-color="${B7}"/></linearGradient></defs>
    <rect width="1024" height="1024" fill="url(#g)"/>
    <g transform="translate(292,190) scale(4.4)">${X("#FFFFFF", B5)}</g>
    <text x="512" y="830" text-anchor="middle" font-family="P" font-weight="700" font-size="150" letter-spacing="18" fill="#FFFFFF">MTO</text></svg>`],
  // Android adaptive foreground: content inside the central 66% safe zone, transparent bg
  "adaptive-icon.png": [1024,1024, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
    <g transform="translate(357,300) scale(3.1)">${X("#FFFFFF", B5)}</g>
    <text x="512" y="720" text-anchor="middle" font-family="P" font-weight="700" font-size="104" letter-spacing="12" fill="#FFFFFF">MTO</text></svg>`],
  // Splash: white wordmark, transparent (splash backgroundColor = navy)
  "splash-icon.png": [1200,480, logo("#FFFFFF","#FFFFFF","#FFFFFF",B5,"#9EC3E8")],
  "favicon.png": [96,96, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="${NAVY}"/><g transform="translate(18,18) scale(0.64)">${X("#FFFFFF", B5)}</g></svg>`],
  // In-app logos
  "logo-light.png": [1200,480, logo(NAVY,B7,B6,B5,B5)],       // on light backgrounds
  "logo-dark.png": [1200,480, logo("#FFFFFF","#FFFFFF","#DCE8F5",B5,"#9EC3E8")], // on navy
  // Google Play feature graphic (1024×500)
  "feature-graphic.png": [1024,500, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${NAVY}"/><stop offset="1" stop-color="${B7}"/></linearGradient></defs>
    <rect width="1024" height="500" fill="url(#g)"/>
    <g transform="translate(56,70) scale(0.5)">${logo("#FFFFFF","#FFFFFF","#DCE8F5",B5,"#9EC3E8").replace(/^<svg[^>]*>|<\/svg>$/g,"")}</g>
    <text x="88" y="360" font-family="P" font-weight="500" font-size="30" fill="#DCE8F5">Plumbing &amp; electrical take-offs, shared with your team.</text>
    <text x="940" y="470" text-anchor="end" font-family="P" font-weight="500" font-size="20" fill="#9EC3E8">A XOITT Transformation product</text></svg>`],
  "mark.png": [512,512, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${X(NAVY, B5)}</svg>`],
  "mark-white.png": [512,512, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${X("#FFFFFF", B5)}</svg>`],
};
function logo(xc, m, t, o, tag) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 480">
    <g transform="translate(60,70) scale(2.6)">${X(xc, o)}</g>
    <text x="360" y="325" font-family="P" font-weight="700" font-size="300" letter-spacing="-6"><tspan fill="${m}">M</tspan><tspan fill="${t}">T</tspan><tspan fill="${o}">O</tspan></text>
    <text x="64" y="440" font-family="P" font-weight="500" font-size="54" letter-spacing="19" fill="${tag}">MEP MATERIAL TAKE-OFF</text></svg>`;
}
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium" });
for (const [file, [w, h, svg]] of Object.entries(jobs)) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  fs.writeFileSync("/tmp/brand-page.html", `<html><head><style>${css}</style></head><body>${svg.replace("<svg ", `<svg width="${w}" height="${h}" `)}</body></html>`);
  await p.goto("file:///tmp/brand-page.html");
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(150);
  fs.mkdirSync("out", { recursive: true });
  await p.screenshot({ path: "out/" + file, omitBackground: true });
  await p.close();
}
await b.close();
console.log("done");
