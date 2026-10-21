export interface GalleryPicture {
  title: string;
  /** The published source image on Cloudinary, without size transforms. */
  url: string;
}

/** The exhibition's pieces, in the order they sit on the galaxy's arms. */
export const galleryPictures: GalleryPicture[] = [
  { title: "Synapses", url: "https://res.cloudinary.com/doayhlzmx/image/upload/q_auto/f_auto/v1775520750/Synapses_2k_jpg_zwfdso.jpg" },
  { title: "New beginnings", url: "https://res.cloudinary.com/doayhlzmx/image/upload/q_auto/f_auto/v1775520749/New_beginnings_2k_jpg_si1uje.jpg" },
  { title: "11.7", url: "https://res.cloudinary.com/doayhlzmx/image/upload/q_auto/f_auto/v1775520749/11.7_dhzshk.jpg" },
  { title: "The rising", url: "https://res.cloudinary.com/doayhlzmx/image/upload/q_auto/f_auto/v1775520749/the_rising_2k_jpg_ozbdmt.jpg" },
  { title: "A leap of faith", url: "https://res.cloudinary.com/doayhlzmx/image/upload/q_auto/f_auto/v1775520749/a_leap_of_faith_2k_jpg_ny8nqg.jpg" },
  { title: "Finally at peace", url: "https://res.cloudinary.com/doayhlzmx/image/upload/q_auto/f_auto/v1775520732/Budha_2k_jpg_z3xdyz.jpg" },
  { title: "Reaching for you", url: "https://res.cloudinary.com/doayhlzmx/image/upload/q_auto/f_auto/v1775520743/reaching_m2ysyd.jpg" },
  { title: "Lust", url: "https://res.cloudinary.com/doayhlzmx/image/upload/q_auto/f_auto/v1775603942/lust_2k_jpg_wbhou2.jpg" },
];

export type PictureSize = "scene" | "grid" | "focus";

const WIDTHS: Record<PictureSize, number> = { scene: 640, grid: 800, focus: 2400 };

/**
 * The same source served at the width a surface needs. Cloudinary makes each size on request,
 * so no extra files are stored.
 */
export function pictureSrc(url: string, size: PictureSize): string {
  return url.replace("/upload/", `/upload/w_${WIDTHS[size]},c_limit/`);
}
