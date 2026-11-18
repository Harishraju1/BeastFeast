import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Component Library",
  description: "Explore robotics components, microcontrollers, sensors, motors, motor drivers, and electronic modules.",
  alternates: { canonical: "/library" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
