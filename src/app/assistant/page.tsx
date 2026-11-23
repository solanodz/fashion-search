import type { Metadata } from "next";

import { AssistantExperience } from "@/components/assistant/assistant-experience";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Shopping assistant · Fashion Search",
  description:
    "Say what you need in your own words: a small language model plans a few catalog searches and shows the plan it made.",
};

export default function AssistantPage() {
  return (
    <div className="flex w-full flex-1 flex-col px-5 pt-8 pb-16 sm:px-8 lg:px-10">
      <SiteHeader />
      <main className="mx-auto mt-12 w-full max-w-4xl flex-1">
        <h1 className="text-2xl font-medium tracking-tight">
          Shopping assistant
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Say what you need in your own words, in English or Spanish. A small
          language model turns it into a few searches in the catalog and shows
          you the plan it made.
        </p>
        <div className="mt-8">
          <AssistantExperience />
        </div>
      </main>
    </div>
  );
}
