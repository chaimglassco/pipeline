import { describe, expect, it } from "vitest";
import { getVideoPresentation, normalizeVideoUrl } from "./video-links";

describe("video links", () => {
  it("builds an embeddable Google Drive preview from a shared file link", () => {
    expect(getVideoPresentation("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing")).toMatchObject({
      kind: "google-drive",
      embedUrl: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/preview",
      thumbnailUrl: "https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOp&sz=w1600",
    });
  });

  it("supports Google Drive links that use an id query parameter", () => {
    expect(getVideoPresentation("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp")?.embedUrl)
      .toBe("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/preview");
  });

  it("builds a privacy-enhanced YouTube player", () => {
    expect(getVideoPresentation("https://youtu.be/dQw4w9WgXcQ")?.embedUrl)
      .toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("recognizes direct video files and rejects unsafe protocols", () => {
    expect(getVideoPresentation("https://example.com/training.mp4")?.kind).toBe("direct");
    expect(normalizeVideoUrl("javascript:alert(1)")).toBe("");
    expect(getVideoPresentation("not a url")).toBeNull();
  });
});
