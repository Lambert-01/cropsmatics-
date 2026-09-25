/** Shared Recharts styling so every chart reads the same way. */
export const CHART = {
  primary: "#087F5B",
  forest: "#073D2D",
  blue: "#2563EB",
  amber: "#D97706",
  red: "#DC2626",
  green: "#16A34A",
  grid: "#e6eeea",
  axis: "#64748b",
};

export const AXIS_PROPS = {
  stroke: CHART.axis,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

export const TOOLTIP_STYLE = {
  contentStyle: {
    borderRadius: 10,
    border: "1px solid rgba(7,61,45,0.12)",
    fontSize: 12,
    boxShadow: "0 10px 30px rgba(3,45,35,0.12)",
  },
  labelStyle: { color: CHART.forest, fontWeight: 600 },
} as const;
