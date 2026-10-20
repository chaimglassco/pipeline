import { get, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseSharedLibraryState, type SharedLibraryState } from "../state/shared-library-state";

const BLOB_PATH = "glassco/library-state-v1.json";
const localDirectory = path.join(process.cwd(), ".data");
const localPath = path.join(localDirectory, "library-state-v1.json");
const localImageDirectory = path.join(localDirectory, "library-images");

function hasBlobStore() {
  return process.env.VERCEL === "1" && Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

export async function readSharedLibraryStore(): Promise<SharedLibraryState | null> {
  try {
    if (hasBlobStore()) {
      const result = await get(BLOB_PATH, { access: "private", useCache: false });
      if (!result || result.statusCode !== 200) return null;
      return parseSharedLibraryState(await new Response(result.stream).json());
    }
    return parseSharedLibraryState(JSON.parse(await readFile(localPath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeSharedLibraryStore(state: SharedLibraryState) {
  const body = JSON.stringify(state);
  if (hasBlobStore()) {
    await put(BLOB_PATH, body, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 60 });
    return;
  }
  await mkdir(localDirectory, { recursive: true });
  const temporaryPath = `${localPath}.tmp`;
  await writeFile(temporaryPath, body, "utf8");
  await rename(temporaryPath, localPath);
}

const imageExtensions: Record<string, string> = { "image/gif": "gif", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function writeSharedLibraryImage(file: File) {
  const extension = imageExtensions[file.type];
  if (!extension) throw new Error("UNSUPPORTED_IMAGE");
  const pathname = `glassco/library-images/${randomUUID()}.${extension}`;
  if (hasBlobStore()) {
    await put(pathname, file, { access: "private", addRandomSuffix: false, contentType: file.type, cacheControlMaxAge: 31536000 });
    return pathname;
  }
  await mkdir(localImageDirectory, { recursive: true });
  await writeFile(path.join(localImageDirectory, path.basename(pathname)), Buffer.from(await file.arrayBuffer()));
  return pathname;
}

export async function readSharedLibraryImage(pathname: string) {
  if (!/^glassco\/library-images\/[a-f0-9-]+\.(gif|jpg|png|webp)$/.test(pathname)) return null;
  if (hasBlobStore()) {
    const result = await get(pathname, { access: "private", useCache: true });
    if (!result || result.statusCode !== 200) return null;
    return { body: result.stream, contentType: result.blob.contentType };
  }
  try {
    const extension = path.extname(pathname).slice(1);
    const contentTypes: Record<string, string> = { gif: "image/gif", jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
    return { body: await readFile(path.join(localImageDirectory, path.basename(pathname))), contentType: contentTypes[extension] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
