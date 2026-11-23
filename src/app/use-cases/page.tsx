import type { Metadata } from "next";
import Link from "next/link";

import { Figure, ProductPhoto, SearchBar } from "@/components/guide/figures";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Use cases · Fashion Search",
  description:
    "What each part of fashion-search solves for a store, with a link to try it, and where the same engine works outside fashion.",
};

const REPO = "https://github.com/solanodz/fashion-search";

type UseCase = {
  id: string;
  title: string;
  /** What a store or its shoppers struggle with. */
  problem: string;
  /** How this demo answers it. */
  answer: React.ReactNode;
  figure: { caption: string; content: React.ReactNode };
  /** Live searches that show it. */
  links: { label: string; href: string }[];
};

/** A row of catalog photos, as a search would return them. */
function PhotoRow({ ids }: { ids: number[] }) {
  return (
    <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
      {ids.map((id) => (
        <ProductPhoto key={id} id={id} className="aspect-[3/4] w-full" />
      ))}
    </div>
  );
}

type MatchRow = { label: string; ids: number[] };

/** Several searches at once: a label and the first matches of each. */
function MatchRows({ rows }: { rows: MatchRow[] }) {
  return (
    <div className="grid min-w-0 flex-1 gap-2">
      {rows.map(({ label, ids }) => (
        <div key={label} className="flex items-center gap-2">
          <span className="w-[4.5rem] shrink-0 text-xs text-muted sm:w-20 sm:text-sm">
            {label}
          </span>
          {ids.map((id) => (
            <ProductPhoto
              key={id}
              id={id}
              className="aspect-[3/4] w-8 sm:w-11"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** The sample outfit photo and the matches of each garment found in it. */
const LOOK: MatchRow[] = [
  { label: "Sunglasses", ids: [29127, 8703, 50208] },
  { label: "Jacket", ids: [57063, 57066, 57068] },
  { label: "Jeans", ids: [57077, 57209, 54334] },
  { label: "Bag", ids: [53670, 53671, 54394] },
];

function LookFigure() {
  return (
    <div className="flex items-start gap-4 sm:gap-5">
      <ProductPhoto id={57068} className="aspect-[3/4] w-20 shrink-0 sm:w-32" />
      <MatchRows rows={LOOK} />
    </div>
  );
}

/** What the assistant planned and found for the wedding request. */
const WEDDING_REQUEST = "Outfit para una boda de verano, hombre, nada de negro";
const WEDDING: MatchRow[] = [
  { label: "Camisa", ids: [57291, 12267, 37791] },
  { label: "Pantalón", ids: [26135, 40275, 12218] },
  { label: "Zapatos", ids: [10129, 16151, 10153] },
  { label: "Cinturón", ids: [15937, 32616, 19895] },
];

function PlanFigure() {
  return (
    <>
      <div className="flex h-11 items-center gap-1 rounded-md border border-rule bg-paper pr-1">
        <span className="min-w-0 flex-1 truncate px-3">{WEDDING_REQUEST}</span>
        <span className="shrink-0 rounded bg-ink px-3 py-1.5 text-sm text-paper">
          Plan it
        </span>
      </div>
      <div className="mt-5 flex">
        <MatchRows rows={WEDDING} />
      </div>
    </>
  );
}

const FOR_SHOPPERS: UseCase[] = [
  {
    id: "describe",
    title: "Find it by describing it",
    problem:
      "Shoppers type what they have in mind, not the words in your product titles. A keyword search finds nothing for “something comfortable for running” unless a title says exactly that.",
    answer: (
      <>
        Here the query and every product photo are turned into vectors by the
        same model, so a description finds the products that look like it.
        Product names are still matched as keywords and the two lists are
        merged. It reads Spanish too. On 27 test searches, 79% of the top ten
        results match the type, colour and gender asked for (
        <Link className="link" href="/evaluation">
          the measurements
        </Link>
        ).
      </>
    ),
    figure: {
      caption:
        "A search for “white running shoes”. Half of these product names don't mention running; their photos matched.",
      content: (
        <>
          <SearchBar text="white running shoes" />
          <PhotoRow ids={[12954, 4530, 36437, 1923, 13919, 13677]} />
        </>
      ),
    },
    links: [
      { label: "white running shoes", href: "/?q=white+running+shoes" },
      {
        label: "in Spanish: zapatillas blancas para correr",
        href: "/?q=zapatillas+blancas+para+correr",
      },
    ],
  },
  {
    id: "photo",
    title: "Find it with a photo",
    problem:
      "A shopper sees a bag on the street or in a post and wants one like it. There is nothing to type.",
    answer:
      "Any photo works as the query. It is encoded in the visitor's browser and compared with every product photo, so the photo itself is never uploaded: only its vector is sent.",
    figure: {
      caption:
        "A photo of a black leather handbag returns the handbags that look most like it.",
      content: (
        <>
          <SearchBar
            photoId={27745}
            placeholder="Describe a change, e.g. in blue"
            photoButton="Use another photo"
          />
          <PhotoRow ids={[37856, 20450, 57259, 15439, 21951, 44242]} />
        </>
      ),
    },
    links: [
      { label: "search with this handbag's photo", href: "/?like=27745" },
      { label: "or drop your own photo on the search page", href: "/" },
    ],
  },
  {
    id: "refine",
    title: "This one, but different",
    problem:
      "Often a shopper finds something close: the right shape in the wrong colour. Filters can't say “like this one”.",
    answer:
      "A photo and a few words become one query. The words count double, so “in blue” moves the results to blue without losing the shape.",
    figure: {
      caption:
        "The same black handbag plus “in blue”: similar handbags, now blue.",
      content: (
        <>
          <SearchBar
            photoId={27745}
            text="in blue"
            photoButton="Use another photo"
          />
          <PhotoRow ids={[25230, 34555, 25229, 54475, 58179, 25225]} />
        </>
      ),
    },
    links: [
      { label: "the black handbag, in blue", href: "/?like=27745&q=in+blue" },
    ],
  },
  {
    id: "look",
    title: "Shop the look",
    problem:
      "A photo of a whole outfit has several products in it. Lookbooks, posts and customer photos only help a store if each piece in them can be found in the catalog.",
    answer: (
      <>
        A segmentation model finds each garment in the photo, and each one is
        searched in its own part of the catalog: jackets among tops, bags among
        bags. An optional language model describes each piece, which sharpens
        colour and type (
        <a
          className="link"
          href={`${REPO}/blob/main/docs/adr/0013-outfit-search.md`}
        >
          how it was decided
        </a>
        ).
      </>
    ),
    figure: {
      caption:
        "One photo, four searches: the sunglasses, the jacket, the jeans and the bag each get their own matches.",
      content: <LookFigure />,
    },
    links: [{ label: "a sample photo or your own", href: "/outfit" }],
  },
  {
    id: "assistant",
    title: "Shopping in plain language",
    problem:
      "Some needs aren't one product. “Something for a summer wedding, nothing black” is a shirt, trousers, shoes and a belt, plus a rule. A search box takes one query, and it reads “nothing black” as black: typed into the normal search, half of the first results are black.",
    answer: (
      <>
        A small language model reads the request and writes a plan: a few
        searches, each with a catalog type, who it is for and the colours to
        leave out. The page shows the plan and the same engine runs it. The
        model never sees the catalog, so it can&apos;t make up a product (
        <a
          className="link"
          href={`${REPO}/blob/main/docs/adr/0014-shopping-assistant.md`}
        >
          how it was decided
        </a>
        ).
      </>
    ),
    figure: {
      caption:
        "A request in Spanish for a summer wedding outfit with nothing black becomes four searches: shirts, trousers, shoes and belts, none of them black.",
      content: <PlanFigure />,
    },
    links: [
      {
        label: "the summer wedding outfit",
        href: `/assistant?q=${encodeURIComponent(WEDDING_REQUEST)}`,
      },
      {
        label: "a gift for dad",
        href: `/assistant?q=${encodeURIComponent("Un regalo para mi papá, que usa reloj")}`,
      },
    ],
  },
  {
    id: "similar",
    title: "Alternatives and recommendations",
    problem:
      "When a size is sold out or a shopper hesitates, close alternatives keep them browsing. Most recommendation systems need purchase history, which new products and new visitors don't have.",
    answer:
      "Every product's nearest neighbours are one query away, from its photo alone. “More like this” on any result does exactly that, so it works from the first day a product is listed.",
    figure: {
      caption:
        "The products closest to a white running shoe: other trainers of the same shape, in several colours.",
      content: <PhotoRow ids={[4530, 4175, 4146, 4478, 9116, 33837]} />,
    },
    links: [{ label: "more like this running shoe", href: "/?like=4530" }],
  },
];

/** Where the same pipeline would apply. Not built here. */
const BEYOND_FASHION: { domain: string; example: React.ReactNode }[] = [
  {
    domain: "Furniture and decor",
    example:
      "“A sofa like this one, in green”, or a photo of a living room where each piece is matched, as Shop the look does with an outfit.",
  },
  {
    domain: "Real estate",
    example:
      "“Bright kitchen with an island” over listing photos, without anyone tagging rooms by hand.",
  },
  {
    domain: "Spare parts and hardware",
    example:
      "A photo of the broken part instead of a part number nobody remembers.",
  },
  {
    domain: "Marketplaces",
    example: (
      <>
        Spotting the same item listed twice, and suggesting a category when a
        seller uploads a photo. The second is measured on this catalog: the
        products a photo looks like get its type right 87% of the time (
        <a
          className="link"
          href={`${REPO}/blob/main/docs/evaluation.md#auto-tagging-2026-11-23`}
        >
          the numbers
        </a>
        ).
      </>
    ),
  },
  {
    domain: "Art, stock photos and archives",
    example:
      "Finding images by what they show when captions are missing or inconsistent.",
  },
];

const WHAT_IT_TAKES: { need: string; detail: React.ReactNode }[] = [
  {
    need: "A catalog",
    detail:
      "Product photos plus the metadata you already have. Encoding these 42,426 photos takes about nine minutes on a laptop.",
  },
  {
    need: "A model that fits",
    detail:
      "CLIP, the model used here, knows everyday objects well. A specialised catalog may need a model trained for it; the test searches tell you.",
  },
  {
    need: "A way to measure",
    detail: (
      <>
        A set of searches with known answers, run again after every change, so
        each decision is measured instead of guessed. This project&apos;s are on
        the{" "}
        <Link className="link" href="/evaluation">
          evaluation page
        </Link>
        .
      </>
    ),
  },
  {
    need: "Very little infrastructure",
    detail:
      "The model runs in the visitor's browser and, at this size, the vectors fit a free database tier. There is no GPU server to pay for.",
  },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-24">
      <h2 id={id} className="text-xl font-medium tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

function UseCaseArticle({ useCase }: { useCase: UseCase }) {
  const { id, title, problem, answer, figure, links } = useCase;
  return (
    <article aria-labelledby={id} className="mt-16 first:mt-8">
      <h3 id={id} className="text-lg font-medium">
        {title}
      </h3>
      <p className="mt-2 leading-relaxed">{problem}</p>
      <p className="mt-2 leading-relaxed text-muted">{answer}</p>
      <Figure caption={figure.caption}>{figure.content}</Figure>
      <p className="mt-4 text-sm">
        Try it:{" "}
        {links.map((link, index) => (
          <span key={link.href}>
            <Link className="link" href={link.href}>
              {link.label}
            </Link>
            {index < links.length - 1 ? ", " : "."}
          </span>
        ))}
      </p>
    </article>
  );
}

export default function UseCases() {
  return (
    <div className="flex w-full flex-1 flex-col px-5 pt-8 pb-16 sm:px-8 lg:px-10">
      <SiteHeader />
      <main className="mx-auto mt-16 w-full max-w-3xl flex-1">
        <h1 className="text-2xl font-medium tracking-tight">Use cases</h1>
        <p className="mt-3 leading-relaxed text-muted">
          fashion-search is a demo, but each thing it does answers a problem
          that stores have. Here they are, each with a search you can try,
          followed by where the same engine would work outside fashion.
        </p>

        <Section id="shoppers" title="For shoppers">
          {FOR_SHOPPERS.map((useCase) => (
            <UseCaseArticle key={useCase.id} useCase={useCase} />
          ))}
        </Section>

        <Section id="beyond" title="Beyond fashion">
          <p className="mt-3 leading-relaxed text-muted">
            Nothing in the engine knows about clothes. It needs product photos,
            whatever metadata exists and a model that understands the domain.
            None of these is built here; they are where the same pipeline would
            apply.
          </p>
          <dl className="mt-6 space-y-5 leading-relaxed">
            {BEYOND_FASHION.map(({ domain, example }) => (
              <div key={domain}>
                <dt>{domain}</dt>
                <dd className="text-muted">{example}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="adapting" title="What it takes to adapt it">
          <dl className="mt-4 space-y-5 leading-relaxed">
            {WHAT_IT_TAKES.map(({ need, detail }) => (
              <div key={need}>
                <dt>{need}</dt>
                <dd className="text-muted">{detail}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-8 leading-relaxed text-muted">
            The code and the reasoning behind each decision are public:{" "}
            <a className="link" href={REPO}>
              source
            </a>{" "}
            and{" "}
            <a className="link" href={`${REPO}/tree/main/docs/adr`}>
              decision records
            </a>
            . How a search works step by step is in the{" "}
            <Link className="link" href="/how-it-works">
              guide
            </Link>
            .
          </p>
        </Section>
      </main>
    </div>
  );
}
