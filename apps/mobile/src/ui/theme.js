// ─────────────────────────────────────────────────────────────────────────────
// XMTO design tokens — the single source of truth for how the app looks.
//
// Change a colour, size or font here and every screen follows. Screens never hard-code
// colours or sizes; they use these tokens or the components in src/ui.
//
// Source: "XMTO – MEP Material Take-off" design (Claude Design), design-system board:
// "Linear meets a site notebook" — one hand, gloves and sunlight. Targets ≥ 48px,
// primary buttons 56px, rows ≥ 64px, WCAG AA contrast.
// ─────────────────────────────────────────────────────────────────────────────

// ── Brand ────────────────────────────────────────────────────────────────────
export const brand = {
  name: "XMTO",
  storeName: "XMTO – MEP Material Take-off",
  tagline: "MEP material take-off",
  maker: "XOITT Transformation",
  makerUrl: "https://xoitt.com",
};

// ── Colour ───────────────────────────────────────────────────────────────────
export const palette = {
  navy: "#1F2150", //      headings, hero, splash (XOITT "X")
  blue700: "#2B4A7A", //   primary structure, links
  blue600: "#3A6BA3", //   secondary, stock bars
  blue500: "#4589CC", //   active, highlights, logo "O"
  action: "#2F74BA", //    primary buttons, FAB, focus
  ink: "#151833", //       body copy
  muted: "#4A5270", //     secondary copy (7:1 on canvas)
  faint: "#6B7390", //     placeholders, captions
  chevron: "#8A92AD",
  canvas: "#F2F5FA", //    app background
  surface: "#FFFFFF", //   cards, sheets
  border: "#D5DEEB",
  borderSoft: "#EEF2F7",
  dashed: "#B8C7DC",
  success: "#23845F",
  warning: "#C77A12",
  danger: "#C0392B",
  white: "#FFFFFF",
};

export const colors = {
  ...palette,
  // text
  text: palette.ink,
  heading: palette.navy,
  link: palette.blue700,
  // tints (backgrounds for icon tiles, pills, selected states)
  tintBlue: "#E3EDF8",
  tintBlueSoft: "#EEF4FB",
  specChip: "#EEF2F8",
  skeleton: "#E3E9F2",
  disabledBg: "#C9D3E2",
  // on navy
  onNavy: "#FFFFFF",
  onNavyMuted: "#C9D6EA",
  onNavyFaint: "#B9C7DE",
  onNavyTile: "rgba(255,255,255,0.08)",
  gridMajor: "rgba(120,170,230,0.10)",
  gridMinor: "rgba(120,170,230,0.05)",
  // status text on tints
  successInk: "#17613F",
  successTint: "#DDF1E8",
  warningInk: "#8A4F05",
  warningText: "#9A5B06",
  warningTint: "#FBEFD9",
  warningBorder: "#EBCB94",
  dangerInk: "#A0281D",
  dangerTint: "#F8E1DE",
  dangerBorder: "#E2B3AD",
  backdrop: "rgba(21,24,51,0.55)",
};

// Estimate status → badge colours. Every badge has a dot and a word, never colour alone.
export const statusStyles = {
  Draft: { bg: colors.warningTint, fg: colors.warningInk, dot: palette.warning },
  Ready: { bg: "#E1ECF8", fg: "#1F4E86", dot: palette.action },
  Sent: { bg: "#E4E6F1", fg: palette.navy, dot: palette.navy },
  Approved: { bg: colors.successTint, fg: colors.successInk, dot: palette.success },
  Rejected: { bg: colors.dangerTint, fg: colors.dangerInk, dot: palette.danger },
  Completed: { bg: "#E9ECF2", fg: "#3A4160", dot: palette.faint },
};
export const STATUSES = Object.keys(statusStyles);

// Trade → pill colours + icon.
export const tradeStyles = {
  Plumbing: { bg: "#E3EFFA", fg: "#1F4E86", icon: "droplet" },
  Electrical: { bg: "#ECEEF6", fg: palette.navy, icon: "bolt" },
};

// ── Type ─────────────────────────────────────────────────────────────────────
// Poppins 400/500/600/700. React Native picks a font by family name, not weight, so each
// weight is its own family (loaded in App.js).
export const fonts = {
  400: "Poppins_400Regular",
  500: "Poppins_500Medium",
  600: "Poppins_600SemiBold",
  700: "Poppins_700Bold",
};

// Sentence case everywhere; money and quantities use tabular figures (see <T num>).
export const type = {
  display: { size: 34, line: 42, weight: 600, color: "heading" }, //  ₹3,19,894.00
  title: { size: 26, line: 34, weight: 600, color: "heading" }, //    Estimates
  heading: { size: 20, line: 26, weight: 600, color: "heading" }, //  Add item
  cardTitle: { size: 18, line: 24, weight: 600, color: "heading" }, // Villa 12 — Plumbing
  rowTitle: { size: 16, line: 22, weight: 600, color: "text" }, //    Pipe · PVC
  body: { size: 15, line: 22, weight: 400, color: "text" },
  bodyStrong: { size: 15, line: 22, weight: 600, color: "text" },
  sub: { size: 14, line: 20, weight: 400, color: "muted" }, //        Aegis Builders · Whitefield
  label: { size: 13, line: 18, weight: 500, color: "muted" }, //      Work email
  caption: { size: 12, line: 16, weight: 500, color: "muted" }, //    6 m × ₹65.00 + ₹12.00 labour
  overline: { size: 12, line: 16, weight: 600, color: "muted", letterSpacing: 0.96, upper: true }, // NEEDS ATTENTION
  tag: { size: 10, line: 12, weight: 700, color: "text", letterSpacing: 0.8, upper: true },
};

// ── Layout ───────────────────────────────────────────────────────────────────
export const space = { xxs: 2, xs: 4, s: 6, sm: 8, m: 10, md: 12, l: 16, xl: 20, xxl: 24, xxxl: 32 };

export const radius = { xs: 5, s: 8, m: 12, l: 14, xl: 16, xxl: 20, sheet: 24, pill: 999 };

// Touch floors: standing on site, one hand, gloves on.
export const sizes = {
  button: 56, //   primary / secondary
  input: 56,
  icon: 48, //     icon button, chip height
  fab: 60,
  row: 64, //      list row minimum
  tabBar: 88,
  screenX: 20, //  side padding
};

export const shadow = {
  card: { shadowColor: palette.ink, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 },
  raised: { shadowColor: palette.navy, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 16, elevation: 8 },
  toast: { shadowColor: "#78140A", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.3, shadowRadius: 28, elevation: 10 },
};

export const theme = { brand, palette, colors, statusStyles, tradeStyles, fonts, type, space, radius, sizes, shadow };
export default theme;
