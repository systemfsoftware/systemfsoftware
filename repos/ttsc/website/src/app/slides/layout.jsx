import "./slides.css";

export const metadata = {
  title: "Slides",
  description:
    "Presentations about ttsc compiler tooling, Evidence Graph, and the TypeScript compiler knowledge graph.",
};

export default function SlidesLayout(props) {
  return <div className="ttsc-slides-root">{props.children}</div>;
}
