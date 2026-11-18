import type { Metadata } from "next";
import { getTemplate } from "@/lib/garage";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const t = getTemplate((await params).id);
  return t ? { title: t.metadata.name, description: t.metadata.description } : { title: "BEAST Project Garage" };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
