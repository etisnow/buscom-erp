import { formatRub } from "@buscom/domain/money";

export function Price({ kopecks, from, className }: { kopecks: number; from?: boolean; className?: string }) {
  if (kopecks <= 0) return <span className={className}>Цена по запросу</span>;
  return (
    <span className={className}>
      {from ? "от " : ""}
      {formatRub(kopecks)}
    </span>
  );
}
