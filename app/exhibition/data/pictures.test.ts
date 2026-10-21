import { describe, expect, it } from "vitest";
import { galleryPictures, pictureSrc } from "./pictures";

const SOURCE = "https://res.cloudinary.com/demo/image/upload/q_auto/f_auto/v1/piece.jpg";

describe("pictureSrc", () => {
  it("serves the scene, grid and focus sizes from the same source", () => {
    expect(pictureSrc(SOURCE, "scene")).toBe("https://res.cloudinary.com/demo/image/upload/w_640,c_limit/q_auto/f_auto/v1/piece.jpg");
    expect(pictureSrc(SOURCE, "grid")).toBe("https://res.cloudinary.com/demo/image/upload/w_800,c_limit/q_auto/f_auto/v1/piece.jpg");
    expect(pictureSrc(SOURCE, "focus")).toBe("https://res.cloudinary.com/demo/image/upload/w_2400,c_limit/q_auto/f_auto/v1/piece.jpg");
  });

  it("leaves a URL without an upload path unchanged", () => {
    expect(pictureSrc("https://example.com/piece.jpg", "focus")).toBe("https://example.com/piece.jpg");
  });
});

describe("galleryPictures", () => {
  it("has eight pieces with distinct titles", () => {
    expect(galleryPictures).toHaveLength(8);
    expect(new Set(galleryPictures.map((piece) => piece.title)).size).toBe(8);
  });

  it("points every piece at a Cloudinary upload, so the size transforms apply", () => {
    for (const piece of galleryPictures) {
      expect(piece.url).toContain("/upload/");
    }
  });
});
