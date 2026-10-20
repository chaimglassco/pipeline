import { readSharedLibraryImage, writeSharedLibraryImage } from "@/features/library/data/shared-library-store";
import { withPpcBasePath } from "@/lib/glassco-apps";
import { verifyPipelineRequest } from "@/lib/pipeline-auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const verified = await verifyPipelineRequest(request, true);
  if (verified instanceof Response) return verified;
  try {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) return Response.json({ error: "Choose an image file." }, { status: 400 });
    if (file.size > 2 * 1024 * 1024) return Response.json({ error: "Image must be 2 MB or smaller." }, { status: 413 });
    const pathname = await writeSharedLibraryImage(file);
    return Response.json({ url: withPpcBasePath(`/api/library/images?pathname=${encodeURIComponent(pathname)}`) });
  } catch (error) {
    if (error instanceof Error && error.message === "UNSUPPORTED_IMAGE") return Response.json({ error: "Use a PNG, JPEG, GIF, or WebP image." }, { status: 415 });
    return Response.json({ error: "The image could not be uploaded to shared storage." }, { status: 503 });
  }
}

export async function GET(request: Request) {
  const verified = await verifyPipelineRequest(request);
  if (verified instanceof Response) return verified;
  try {
    const pathname = new URL(request.url).searchParams.get("pathname") ?? "";
    const image = await readSharedLibraryImage(pathname);
    if (!image) return new Response("Image not found.", { status: 404 });
    return new Response(image.body, { headers: { "Content-Type": image.contentType, "Cache-Control": "private, max-age=3600" } });
  } catch {
    return new Response("Image unavailable.", { status: 503 });
  }
}
