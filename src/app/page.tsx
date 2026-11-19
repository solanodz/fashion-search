import { SearchExperience } from "@/components/search/search-experience";

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pt-6 pb-16 sm:px-8">
      <header className="flex items-baseline justify-between text-sm text-graphite">
        <h1 className="font-semibold text-ink">fashion-search</h1>
        <a
          className="underline-offset-4 hover:underline"
          href="https://github.com/solanodz/fashion-search"
        >
          Source on GitHub
        </a>
      </header>
      <main className="mt-14 flex flex-1 flex-col sm:mt-20">
        <SearchExperience />
      </main>
      <footer className="mt-20 max-w-xl text-sm leading-relaxed text-graphite">
        Searches are encoded by CLIP in this browser; only the resulting vector
        reaches the server. Catalog: Fashion Product Images (Small), 44,072
        products, MIT license.
      </footer>
    </div>
  );
}
