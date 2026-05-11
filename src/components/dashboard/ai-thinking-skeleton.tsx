export function AiThinkingSkeleton() {
  return (
    <div className="flex flex-col gap-y-2" aria-label="Clōd is thinking">
      <div className="h-3 w-[90%] rounded bg-muted/70 motion-safe:animate-pulse" />
      <div className="h-3 w-[80%] rounded bg-muted/70 motion-safe:animate-pulse" />
      <div className="h-3 w-[65%] rounded bg-muted/70 motion-safe:animate-pulse" />
    </div>
  );
}
