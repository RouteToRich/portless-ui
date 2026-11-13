import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { cn } from "@/lib/utils";

// Product names for HS codes (GET /trade-min/hs-names: the catalogue's name for the
// product line, a curated short name, else the official HS description — every code
// gets one; the full official text is the tooltip). Codes asked for in the same moment
// are sent in ONE request, so a list of 50 deals costs one call.
type HsNames = { names: Record<string, string | null>; descriptions?: Record<string, string | null> };
type HsName = { name: string | null; description: string | null };
let pending: { codes: Set<string>; promise: Promise<HsNames> } | null = null;

function fetchName(code: string): Promise<HsName> {
  if (!pending) {
    const codes = new Set<string>();
    const promise = new Promise<HsNames>((resolve) => {
      setTimeout(async () => {
        pending = null;
        try {
          const { data } = await api.get<HsNames>("/trade-min/hs-names", { params: { codes: [...codes].join(",") } });
          resolve(data ?? { names: {} });
        } catch {
          resolve({ names: {} }); // the code alone is still shown
        }
      }, 20);
    });
    pending = { codes, promise };
  }
  pending.codes.add(code);
  return pending.promise.then((r) => ({ name: r.names?.[code] ?? null, description: r.descriptions?.[code] ?? null }));
}

/** The short name shown beside an HS code and the full official description (tooltip). */
export function useHsName(code: string | null | undefined): HsName {
  const hs = (code ?? "").trim();
  const { data } = useQuery({
    queryKey: ["hs-name", hs],
    queryFn: () => fetchName(hs),
    enabled: hs.length > 0,
    staleTime: 60 * 60 * 1000,
  });
  return data ?? { name: null, description: null };
}

/** "10063020 · basmati rice" — the code in the given style, the product name beside it. */
export function HsCode({
  code,
  className,
  nameClassName,
  prefix,
}: {
  code: string | null | undefined;
  className?: string;
  nameClassName?: string;
  prefix?: string;
}) {
  const { name, description } = useHsName(code);
  if (!code) return null;
  const tip = [`HS ${code}`, description || name].filter(Boolean).join(" — ");
  return (
    <span className="inline-flex items-baseline gap-1 min-w-0" title={tip}>
      <span className={className}>
        {prefix}
        {code}
      </span>
      {name && <span className={cn("font-sans font-normal text-xs text-muted-foreground truncate", nameClassName)}>· {name}</span>}
    </span>
  );
}
