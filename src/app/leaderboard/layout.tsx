import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Robotics Club KKH rankings by server-validated XP.",
  alternates: { canonical: "/leaderboard" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
