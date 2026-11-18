import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile",
  description: "Your rank, XP history and achievements.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
