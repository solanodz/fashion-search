import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Serves catalog images from data/images in local development. In
 * production NEXT_PUBLIC_IMAGE_BASE_URL points at the R2 bucket instead
 * (ADR 0005), and this route is not used.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/images/[id]">,
) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return new Response("Not found", { status: 404 });

  try {
    const image = await readFile(
      join(process.cwd(), "data", "images", `${id}.jpg`),
    );
    return new Response(image, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
