import type { Metadata } from "next";

const TITLES: Record<string, string> = { design: "Robot Designer", circuit: "Circuit Designer", code: "Code Studio", arena: "Simulation Arena" };

export async function generateMetadata({ params }: { params: Promise<{ tab: string }> }): Promise<Metadata> {
  return { title: TITLES[(await params).tab] ?? "Workspace", robots: { index: false } };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
