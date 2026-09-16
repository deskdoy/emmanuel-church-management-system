import { LoadingSkeleton } from "./LoadingSkeleton";

/** Shared fallback for feature modules while their code loads. */
export function ViewLoadingFallback({ label = "Loading view" }: { label?: string }) {
  return <section className="panel" aria-busy="true" aria-label={label}>
    <LoadingSkeleton rows={4} label={label} />
  </section>;
}
