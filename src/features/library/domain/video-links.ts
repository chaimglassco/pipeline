export type VideoPresentation =
  | { kind: "youtube" | "google-drive"; url: string; embedUrl: string; thumbnailUrl: string }
  | { kind: "direct"; url: string; embedUrl: ""; thumbnailUrl: "" }
  | { kind: "link"; url: string; embedUrl: ""; thumbnailUrl: string };

export function normalizeVideoUrl(value: string) {
  try {
    const parsed = new URL(value.trim());
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

export function getVideoPresentation(value: string): VideoPresentation | null {
  const url = normalizeVideoUrl(value);
  if (!url) return null;

  const parsed = new URL(url);
  const youtubeId = getYouTubeVideoId(parsed);
  if (youtubeId) {
    return {
      kind: "youtube",
      url,
      embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
    };
  }

  const driveId = getGoogleDriveFileId(parsed);
  if (driveId) {
    return {
      kind: "google-drive",
      url,
      embedUrl: `https://drive.google.com/file/d/${driveId}/preview`,
      thumbnailUrl: `https://drive.google.com/thumbnail?id=${driveId}&sz=w1600`,
    };
  }

  if (/\.(?:mp4|webm|ogg)(?:$|[?#])/i.test(url)) {
    return { kind: "direct", url, embedUrl: "", thumbnailUrl: "" };
  }

  return { kind: "link", url, embedUrl: "", thumbnailUrl: "" };
}

function getYouTubeVideoId(url: URL) {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let videoId = "";
  if (host === "youtu.be") videoId = url.pathname.split("/").filter(Boolean)[0] ?? "";
  if (host === "youtube.com" || host === "m.youtube.com") {
    videoId = url.searchParams.get("v") ?? "";
    if (!videoId) {
      const parts = url.pathname.split("/").filter(Boolean);
      if (["embed", "shorts", "live"].includes(parts[0])) videoId = parts[1] ?? "";
    }
  }
  return /^[a-zA-Z0-9_-]{6,}$/.test(videoId) ? videoId : "";
}

function getGoogleDriveFileId(url: URL) {
  const host = url.hostname.toLowerCase();
  if (host !== "drive.google.com" && host !== "drive.usercontent.google.com") return "";

  const pathMatch = url.pathname.match(/\/file\/d\/([^/]+)/i);
  const fileId = pathMatch?.[1] ?? url.searchParams.get("id") ?? "";
  return /^[a-zA-Z0-9_-]{10,}$/.test(fileId) ? fileId : "";
}
