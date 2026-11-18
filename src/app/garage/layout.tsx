import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "BEAST Project Garage | BEAST FEAST", template: "%s | BEAST FEAST" },
  description: "Nine ready-to-simulate reference robots for line following, robo race and sumo, with full circuits and firmware.",
  alternates: { canonical: "/garage" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
