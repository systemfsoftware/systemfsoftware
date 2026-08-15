import slidesMetadata from "../../../build/slides-metadata.cjs";

const { readSlide, readSlides } = slidesMetadata;

const localImage = (image) => {
  const url = new URL(image, "https://ttsc.dev");
  return url.origin === "https://ttsc.dev" ? url.pathname : url.href;
};

export function getSlides() {
  return readSlides().map((slide) => ({
    ...slide,
    imagePath: localImage(slide.image),
  }));
}

export function getSlide(slug) {
  const slide = readSlide(slug);
  return slide ? { ...slide, imagePath: localImage(slide.image) } : null;
}
