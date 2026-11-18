import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to BEAST FEAST or create your student account.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
