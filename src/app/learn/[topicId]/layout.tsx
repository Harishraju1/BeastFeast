import type { Metadata } from "next";
import { getTopic } from "@/lib/learning";

export async function generateMetadata({ params }: { params: Promise<{ topicId: string }> }): Promise<Metadata> {
  const topic = getTopic((await params).topicId);
  return topic ? { title: topic.title, description: topic.summary } : { title: "Beast Topic" };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
