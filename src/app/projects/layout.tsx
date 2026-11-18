import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Projects",
  description: "Start, open and manage your own robot projects.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
