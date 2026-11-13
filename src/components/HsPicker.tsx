import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { OpportunitiesApi } from "@/api/endpoints";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type HsChoice = { code: string; name: string | null; description: string | null };

/**
 * Pick an HS code by typing a product ("basmati", "chilli powder") or a code prefix
 * ("1006"); every match shows its product name and the official HS description.
 */
export function HsPicker({
  value,
  onChange,
  className,
}: {
  value: HsChoice | null;
  onChange: (choice: HsChoice | null) => void;
  className?: string;
}) {
  const [text, setText] = useState(value ? `${value.code} · ${value.name ?? ""}` : "");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(text.includes(" · ") ? "" : text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["hs-search", query],
    queryFn: () => OpportunitiesApi.hsSearch(query),
    enabled: query.length >= 2,
    staleTime: 10 * 60 * 1000,
  });

  return (
    <div ref={box} className={cn("relative", className)}>
      <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-muted-foreground" />
      <Input
        value={text}
        placeholder="Product or HS code — e.g. basmati, chilli powder, 1006"
        className="h-8 pl-7 text-xs"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          if (value) onChange(null);
        }}
        aria-label="HS code"
      />
      {open && query.length >= 2 && (
        <div className="absolute z-30 mt-1 w-full max-h-72 overflow-auto rounded-md border border-border bg-popover shadow-lg">
          {isFetching && results.length === 0 && <p className="px-3 py-2 text-[11px] text-muted-foreground">Searching…</p>}
          {!isFetching && results.length === 0 && (
            <p className="px-3 py-2 text-[11px] text-muted-foreground">No HS code matches "{query}".</p>
          )}
          {results.map((r) => (
            <button
              key={r.code}
              type="button"
              className="block w-full text-left px-3 py-1.5 hover:bg-muted"
              onClick={() => {
                onChange(r);
                setText(`${r.code} · ${r.name ?? ""}`);
                setOpen(false);
              }}
            >
              <span className="font-mono text-xs font-semibold">{r.code}</span>
              <span className="ml-2 text-xs">{r.name}</span>
              {r.description && r.description !== r.name && (
                <span className="block text-[10px] text-muted-foreground truncate">{r.description}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
