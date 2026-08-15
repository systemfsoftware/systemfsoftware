import { notFound } from "next/navigation";

import { getSlide, getSlides } from "../get-slides";
import SlideFrame from "./SlideFrame";

export function generateStaticParams() {
  return getSlides().map((slide) => ({ slug: slide.slug }));
}

export async function generateMetadata(props) {
  const { slug } = await props.params;
  const slide = getSlide(slug);
  if (!slide) return {};

  return {
    title: slide.title,
    description: slide.description,
    alternates: { canonical: slide.url },
    openGraph: {
      title: slide.title,
      description: slide.description,
      type: "website",
      url: slide.url,
      images: [{ url: slide.image }],
    },
    twitter: {
      card: "summary_large_image",
      title: slide.title,
      description: slide.description,
      images: [slide.image],
    },
  };
}

export default async function SlidePage(props) {
  const { slug } = await props.params;
  const slide = getSlide(slug);
  if (!slide) notFound();

  return (
    <div className="ttsc-slide-viewer">
      <SlideFrame
        src={slide.staticRoute}
        title={`${slide.title} presentation`}
      />
    </div>
  );
}
