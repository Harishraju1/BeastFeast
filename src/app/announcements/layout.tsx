import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Announcements",
  description: "Robotics Club KKH news, competition updates and new learning videos.",
  alternates: { canonical: "/announcements" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
