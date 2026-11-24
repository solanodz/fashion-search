import type { Metadata } from "next";
import Link from "next/link";

import {
  DropZone,
  FilterReplica,
  Figure,
  ResultTiles,
  type SampleResult,
  SearchBar,
  UrlBar,
  VectorFigure,
} from "@/components/guide/figures";
import { SearchFlow } from "@/components/guide/search-flow";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "How it works · Fashion Search",
  description:
    "How to search 42,000 fashion products by text or photo, and what happens behind each search: CLIP in the browser, hybrid search in Qdrant.",
};

const REPO = "https://github.com/solanodz/fashion-search";

// Similarities computed with the same model (Node, q8); the browser's
// values differ by a few hundredths.
const RED_DRESSES: SampleResult[] = [
  {
    id: 25908,
    name: "Femella Women Red Dress",
    detail: "Dresses, red",
    score: 0.276,
    keyword: true,
  },
  {
    id: 57057,
    name: "Elle Women Red A-Line Dress",
    detail: "Dresses, red",
    score: 0.271,
    keyword: true,
  },
  {
    id: 37267,
    name: "United Colors of Benetton Girls Red Printed Dress",
    detail: "Dresses, red",
    score: 0.292,
    keyword: true,
  },
  {
    id: 33199,
    name: "Sepia Women Printed Red Dress",
    detail: "Dresses, red",
    score: 0.263,
    keyword: true,
  },
];

const IN_RED: SampleResult[] = [
  {
    id: 20669,
    name: "Classic Polo Men Striped Red Tshirt",
    detail: "Tshirts, red",
    score: 0.562,
    parts: { photo: 0.905, text: 0.214 },
  },
  {
    id: 16403,
    name: "Levis Men Check Red Shirts",
    detail: "Shirts, red",
    score: 0.559,
    parts: { photo: 0.942, text: 0.192 },
  },
  {
    id: 19153,
    name: "United Colors of Benetton Men Red Polo TShirt",
    detail: "Tshirts, red",
    score: 0.554,
    parts: { photo: 0.894, text: 0.211 },
  },
  {
    id: 16408,
    name: "Levis Men Check Red Shirts",
    detail: "Shirts, red",
    score: 0.541,
    parts: { photo: 0.899, text: 0.192 },
  },
];

const NIGHTDRESS: SampleResult[] = [
  {
    id: 52406,
    name: "Red Rose Women Red Nightdress",
    detail: "Nightdress, red",
    score: 0.269,
  },
  {
    id: 33199,
    name: "Sepia Women Printed Red Dress",
    detail: "Dresses, red",
    score: 0.263,
    keyword: true,
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

function Step({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="mt-16 first:mt-8">
      <h3 className="text-lg font-medium">{title}</h3>
      <div className="mt-2 leading-relaxed text-muted">{children}</div>
    </li>
  );
}

export default function HowItWorks() {
  return (
    <div className="flex w-full flex-1 flex-col px-5 pt-8 pb-16 sm:px-8 lg:px-10">
      <SiteHeader />
      <main className="mx-auto mt-16 w-full max-w-3xl flex-1">
        <h1 className="text-2xl font-medium tracking-tight">
          How fashion-search works
        </h1>
        <p className="mt-3 leading-relaxed text-muted">
          fashion-search finds products in a catalog of 42,426 fashion items by
          what they look like. You can describe what you want, show a photo, or
          both. This page follows a search from your browser to the results,
          explains what you see on screen and why it&apos;s built this way, and
          ends with a short guide to every control.
        </p>
        <nav
          aria-label="On this page"
          className="mt-6 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted"
        >
          <a className="link hover:text-ink" href="#behind">
            Behind a search
          </a>
          <a className="link hover:text-ink" href="#reading">
            Reading the screen
          </a>
          <a className="link hover:text-ink" href="#why">
            Why it&apos;s built this way
          </a>
          <a className="link hover:text-ink" href="#using">
            Using it
          </a>
        </nav>

        <Section id="behind" title="Behind a search">
          <p className="mt-3 leading-relaxed text-muted">
            Each search happens in two places. The heavy part, understanding
            your words or photo, runs in your browser. The server only compares
            numbers.
          </p>
          <SearchFlow />

          <ol className="list-none">
            <Step title="Your browser turns the query into 512 numbers">
              <p>
                A model called CLIP was trained on millions of images and their
                descriptions, so it places a photo and a sentence that describe
                the same thing close together. It turns your query into a list
                of 512 numbers, an <span className="text-ink">embedding</span>.
                The model (about 150 MB) downloads once and then runs on your
                device: your text and photos stay private, and the site needs no
                GPU server.
              </p>
              <Figure caption="An embedding drawn as a strip: one column per number, darker for larger values.">
                <VectorFigure />
              </Figure>
            </Step>

            <Step title="Your words also become keywords">
              <p>
                The words of a text search are simplified (&ldquo;dresses&rdquo;
                becomes &ldquo;dress&rdquo;, filler words are dropped) and
                turned into codes in your browser. The server matches those
                codes against product names, the way a classic search engine
                does (BM25), without ever seeing your text.
              </p>
            </Step>

            <Step title="The server finds the closest products">
              <p>
                Every product photo was turned into 512 numbers in advance. A
                vector database, Qdrant, compares your numbers with all 42,426
                of them and returns the most similar. Similarity is measured as{" "}
                <span className="text-ink">cosine similarity</span>: 1 means the
                same, 0 means unrelated. Between words and photos, good matches
                score around 0.3; between two photos, around 0.9.
              </p>
            </Step>

            <Step title="Two lists become one">
              <p>
                For text searches, the image comparison and the keyword match
                each produce a ranked list. They&apos;re merged by rank
                (reciprocal rank fusion): products near the top of both lists
                rise. This matters because CLIP alone judges by looks. For
                &ldquo;a red dress&rdquo; it ranked red nightdresses first; with
                keywords, actual dresses win.
              </p>
              <Figure caption="For “a red dress”, this nightdress looks closer (0.269) than this dress (0.263). Only the dress matches the keyword “dress”, so the merged list puts it first.">
                <ResultTiles results={NIGHTDRESS} />
              </Figure>
            </Step>
          </ol>
        </Section>

        <Section id="reading" title="Reading the screen">
          <dl className="mt-4 space-y-5 leading-relaxed">
            <div>
              <dt>Like and Dislike on a result</dt>
              <dd className="text-muted">
                They refine the search you already made. The query moves towards
                the look of what you liked and away from what you disliked, and
                what your likes share in the catalog (type, colour, who it is
                for) comes first. The bar above the results says what it
                understood, and each mark can be removed.
              </dd>
            </div>
            <div>
              <dt>Shop the look</dt>
              <dd className="text-muted">
                Upload a photo of a person: a segmentation model finds each
                garment in your browser, CLIP encodes its crop, and each one is
                searched in its own part of the catalog. With &ldquo;Describe
                with AI&rdquo; on, a small OpenAI model also names each garment
                (&ldquo;maroon checked long wool coat&rdquo;), which steers
                colour and type.{" "}
                <Link className="link hover:text-ink" href="/outfit">
                  Try it
                </Link>
              </dd>
            </div>
            <div>
              <dt>Shopping assistant</dt>
              <dd className="text-muted">
                Write what you need in your own words (&ldquo;an outfit for a
                summer wedding, nothing black&rdquo;). A small OpenAI model
                turns it into a few searches, each with a text, a catalog type,
                who it is for and the colours to avoid. The page shows that plan
                and runs each search as usual; the model never picks the
                products.{" "}
                <Link className="link hover:text-ink" href="/assistant">
                  Try it
                </Link>
              </dd>
            </div>
          </dl>
        </Section>

        <Section id="why" title="Why it's built this way">
          <ul className="mt-4 space-y-4 leading-relaxed text-muted">
            <li>
              <span className="text-ink">The model runs in your browser.</span>{" "}
              Nothing you type or upload leaves your device, and the site runs
              on free tiers: no GPU server, no paid AI API.
            </li>
            <li>
              <span className="text-ink">
                Looks plus words beat looks alone.
              </span>{" "}
              On 27 test searches, the share of top-10 results with the right
              type, colour and gender went from 59% with images only to 79% with
              keywords added.
            </li>
            <li>
              <span className="text-ink">Spanish works too.</span> The model and
              the product names are in English, so a Spanish search
              (&ldquo;remera blanca para hombre&rdquo;) is first rewritten in
              English with a fashion glossary, in your browser. It scores 78% on
              the same test searches, against 80% in English.
            </li>
            <li>
              <span className="text-ink">Sharper photos, better matches.</span>{" "}
              Moving from 60×80 thumbnails to 384×512 photos made the catalog
              look right and improved every measure a little.
            </li>
            <li>
              <span className="text-ink">Decisions are written down.</span> Each
              choice, with the options considered, is recorded in the{" "}
              <a
                className="link hover:text-ink"
                href={`${REPO}/tree/main/docs/adr`}
              >
                architecture decision records
              </a>
              , and the numbers in the{" "}
              <a
                className="link hover:text-ink"
                href={`${REPO}/blob/main/docs/evaluation.md`}
              >
                evaluation report
              </a>
              .
            </li>
          </ul>
        </Section>

        <Section id="using" title="Using it">
          <ol className="list-none">
            <Step title="1. Describe what you're looking for">
              <p>
                Type a few words, the way you&apos;d describe the item to a
                friend: &ldquo;a red dress&rdquo;, &ldquo;white running
                shoes&rdquo;, &ldquo;gold watch for women&rdquo;. Press Enter or
                Search. The closest products come first, each with a number that
                says how similar it is to your words.
              </p>
              <Figure caption="A text search. Every result shows its rank and similarity; “keyword” means the product's name also contains your words.">
                <SearchBar text="a red dress" />
                <ResultTiles results={RED_DRESSES} />
              </Figure>
            </Step>

            <Step title="2. Or search with a photo">
              <p>
                Use <span className="text-ink">Search with a photo</span>, drop
                an image anywhere on the page, or paste one. The photo appears
                at the start of the search bar; the × removes it. Your photo is
                processed in your browser and never uploaded.
              </p>
              <Figure caption="A photo in the search bar, and the drop zone that appears when you drag an image over the page.">
                <SearchBar
                  photoId={15970}
                  placeholder="Describe a change, e.g. in blue"
                  photoButton="Use another photo"
                />
                <DropZone />
              </Figure>
            </Step>

            <Step title="3. Change the photo with words">
              <p>
                With a photo in the bar, type how the result should differ:
                &ldquo;in red&rdquo;, &ldquo;with long sleeves&rdquo;. Your
                words count twice as much as the photo. Each result shows how
                close it is to the photo and to your words, so you can see why
                it appeared.
              </p>
              <Figure caption="A check shirt plus “in red”: the shape comes from the photo (about 0.9), the colour from the words (about 0.2).">
                <SearchBar
                  photoId={15970}
                  text="in red"
                  photoButton="Use another photo"
                />
                <ResultTiles results={IN_RED} />
              </Figure>
            </Step>

            <Step title="4. Find more like a result">
              <p>
                Hover a product (or tap it on a phone) and choose{" "}
                <span className="text-ink">More like this</span>. Its photo
                becomes the new search, so you can keep exploring from anything
                you find.
              </p>
              <Figure caption="“More like this” on a result starts a new search with that product's photo.">
                <ResultTiles
                  results={RED_DRESSES.slice(0, 4)}
                  moreLikeThis={1}
                />
              </Figure>
            </Step>

            <Step title="5. Narrow it down with filters">
              <p>
                Filters on the left keep only one gender, category, type or
                colour. They apply to whatever you searched, and each option
                shows how many products it has. Colours with no products in your
                selection are dimmed.
              </p>
              <Figure caption="Women and Dresses selected, Red picked from the colour swatches; Gold is dimmed because no dress in this selection is gold.">
                <FilterReplica />
              </Figure>
            </Step>

            <Step title="6. Share a search">
              <p>
                The address bar keeps your words and filters, so you can copy it
                to share or bookmark a search. Back and forward move between
                your searches. &ldquo;More like this&rdquo; is shared by
                product; photos you upload stay on your device.
              </p>
              <Figure caption="The address of a search for red dresses, ready to share.">
                <UrlBar url="fashion-search-mu.vercel.app/?q=a+red+dress&colour=Red" />
              </Figure>
            </Step>
          </ol>
          <p className="mt-10">
            <Link className="link" href="/">
              Try a search
            </Link>
          </p>
        </Section>
      </main>
    </div>
  );
}
