import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Learning Academy",
  description: "Beast Topics: 84 robotics lessons on line following, robo race and sumo, each with diagrams, worked examples and a mini quiz.",
  alternates: { canonical: "/learn" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
