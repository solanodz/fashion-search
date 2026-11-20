import Link from "next/link";

/** Site name and navigation, shared by every page. */
export function SiteHeader({ titleAs: Title = "p" }: { titleAs?: "h1" | "p" }) {
  return (
    <header className="flex items-baseline justify-between gap-4">
      <Title className="font-medium">
        <Link href="/">fashion-search</Link>
      </Title>
      <nav aria-label="Site" className="flex gap-5 text-sm text-muted">
        <Link className="link hover:text-ink" href="/how-it-works">
          How it works
        </Link>
        <Link className="link hover:text-ink" href="/evaluation">
          Evaluation
        </Link>
        <a
          className="link hover:text-ink"
          href="https://github.com/solanodz/fashion-search"
        >
          Source
        </a>
      </nav>
    </header>
  );
}
