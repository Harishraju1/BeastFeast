import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Quiz History",
  description: "Every quiz and challenge you have taken, with your answers and the explanations.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
