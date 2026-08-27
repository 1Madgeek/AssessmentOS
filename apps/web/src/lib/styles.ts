import type { CSSProperties } from "react";

export const pageStyle: CSSProperties = {
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  maxWidth: 960,
  margin: "0 auto",
  padding: 24,
  color: "#24292f",
};

export const cardStyle: CSSProperties = {
  border: "1px solid #d0d7de",
  borderRadius: 8,
  padding: 16,
  background: "#fff",
};

export const btnPrimary: CSSProperties = {
  background: "#0969da",
  color: "#fff",
  border: "none",
  padding: "8px 14px",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
};

export const btnSecondary: CSSProperties = {
  background: "#f6f8fa",
  color: "#24292f",
  border: "1px solid #d0d7de",
  padding: "8px 14px",
  borderRadius: 6,
  cursor: "pointer",
};

export const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid #d0d7de",
  boxSizing: "border-box",
};
