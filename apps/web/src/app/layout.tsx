import type { ReactNode } from "react";

export const metadata = {
  title: "AssessmentOS",
  description: "Open-source technical assessment platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#f6f8fa",
          color: "#24292f",
        }}
      >
        {children}
      </body>
    </html>
  );
}
