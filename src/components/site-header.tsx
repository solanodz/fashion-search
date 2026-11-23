import Link from "next/link";

// One line each, with a touch target taller than the text.
const navLink = "link -my-1 py-1 whitespace-nowrap hover:text-ink";

/**
 * Site name and navigation, shared by every page. On a narrow screen the
 * navigation moves below the name instead of squeezing next to it.
 */
export function SiteHeader({ titleAs: Title = "p" }: { titleAs?: "h1" | "p" }) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
      <Title className="font-medium whitespace-nowrap">
        <Link href="/">fashion-search</Link>
      </Title>
      <nav
        aria-label="Site"
        className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted sm:gap-x-5"
      >
        <Link className={navLink} href="/outfit">
          Shop the look
        </Link>
        <Link className={navLink} href="/use-cases">
          Use cases
        </Link>
        <Link className={navLink} href="/how-it-works">
          How it works
        </Link>
        <Link className={navLink} href="/evaluation">
          Evaluation
        </Link>
        <a
          className={navLink}
          href="https://github.com/solanodz/fashion-search"
        >
          Source
        </a>
      </nav>
    </header>
  );
}
