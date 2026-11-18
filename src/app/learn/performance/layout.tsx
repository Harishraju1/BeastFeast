import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Performance",
  description: "Your quiz accuracy by topic and category, with strongest and weakest areas and recommended lessons.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
