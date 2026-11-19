import { cn } from "@/lib/utils";

// A loading placeholder. It also says so: role="status" + a visually hidden "Loading…", so a
// screen reader announces it and a browser test can tell a loading page from an empty one.
function Skeleton({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "relative animate-pulse rounded-md bg-secondary",
        className
      )}
      {...props}
    >
      {children ?? <span className="sr-only">Loading…</span>}
    </div>
  );
}

export { Skeleton };
