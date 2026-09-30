import { toMathML } from "@/lib/calc/mathml";

export function MathView({ source }: { source: string }) {
  const html = toMathML(source);
  if (!html) return <span className="whitespace-pre-wrap">{source}</span>;
  return <span className="math-host" dangerouslySetInnerHTML={{ __html: html }} />;
}
