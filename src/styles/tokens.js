// src/styles/tokens.js

export const T = {
  // Brand
  brand:      "#E8500A",
  brandDark:  "#C04008",
  brandLight: "#FFF0EB",

  // Backgrounds
  bg:       "#F7F6F3",
  surface:  "#FFFFFF",
  surface2: "#F2F0EC",
  surface3: "#E8E5DF",

  // Text
  text:  "#131211",
  muted: "#6B6460",
  hint:  "#A09890",

  // Borders
  border:    "rgba(0,0,0,0.09)",
  borderMed: "rgba(0,0,0,0.16)",

  // Semantic
  green:   "#1A7F4B",
  greenBg: "#EDFAF3",
  amber:   "#92530A",
  amberBg: "#FEF3CD",
  red:     "#A32D2D",
  redBg:   "#FEECEC",
  blue:    "#1D4ED8",
  blueBg:  "#EFF6FF",

  // Typography
  fontSizes: {
    xs:  11,
    sm:  13,
    md:  15,
    lg:  17,
    xl:  20,
    xxl: 26,
  },

  // Spacing (multiples of 4)
  space: {
    xs:  4,
    sm:  8,
    md:  12,
    lg:  16,
    xl:  20,
    xxl: 28,
  },

  // Radii
  r: {
    sm:   6,
    md:   10,
    lg:   14,
    xl:   20,
    full: 999,
  },

  // Avatar palette
  avatarColors: [
    "#E8500A","#1A7F4B","#7C3AED",
    "#0369A1","#B45309","#BE185D",
    "#0F766E","#C2410C",
  ],
};

// Shared StyleSheet snippets (used across screens)
export const SS = {
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.09)",
    padding: 16,
    marginBottom: 12,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.16)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: "#131211",
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B6460",
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#131211",
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  spaceBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
};

export const initials = (name = "?") =>
  (name || "?").split(" ").filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2);

export const fmt = (n) =>
  `${Number(n || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export const fmtDate = (d) => {
  try {
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return d || "—"; }
};

export const today = () => new Date().toISOString().slice(0, 10);
