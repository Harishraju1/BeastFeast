import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Challenges",
  description: "Test your robotics knowledge through technical quizzes, challenges, and interactive learning activities.",
  alternates: { canonical: "/challenges" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
