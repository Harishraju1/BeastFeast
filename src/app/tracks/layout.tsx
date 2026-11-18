import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Track Designer",
  description: "Design race, line-following and sumo tracks for the simulation arena.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
