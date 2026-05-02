import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "KnowMe Agent Workspace",
  description: "Personal-theme agent workspace for planning, skills, sandbox traces, and memory."
};

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{props.children}</body>
    </html>
  );
}

