import { SearchExperience } from "@/components/search/search-experience";
import { SiteHeader } from "@/components/site-header";

export default function Home() {
  return (
    <div className="flex w-full flex-1 flex-col px-5 pt-8 pb-12 sm:px-8 lg:px-10">
      <SiteHeader titleAs="h1" />
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        Search a catalog of fashion products by text, by photo, or both. A CLIP
        model turns your query into a vector in this browser; the server returns
        the products whose image vectors are closest to it.
      </p>
      <main className="mt-8 flex flex-1 flex-col">
        <SearchExperience />
      </main>
      <footer className="mt-20 text-sm text-muted">
        Catalog: Fashion Product Images by Param Aggarwal, 42,426 products, MIT
        license.
      </footer>
    </div>
  );
}
