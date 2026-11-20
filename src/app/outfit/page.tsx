import type { Metadata } from "next";

import { OutfitExperience } from "@/components/outfit/outfit-experience";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Shop the look · Fashion Search",
  description:
    "Upload a photo of a person: each garment is found, cut out and matched to the catalog, all in your browser.",
};

export default function OutfitPage() {
  return (
    <div className="flex w-full flex-1 flex-col px-5 pt-8 pb-16 sm:px-8 lg:px-10">
      <SiteHeader />
      <main className="mt-12 w-full flex-1">
        <h1 className="text-2xl font-medium tracking-tight">Shop the look</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Upload a photo of a person and find the closest products to each thing
          they wear: the top, the bottom, the shoes, the bag.
        </p>
        <div className="mt-8">
          <OutfitExperience />
        </div>
      </main>
    </div>
  );
}
