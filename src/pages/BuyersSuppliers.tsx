import { useState } from "react";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Factory, Globe, Mail, Phone, RefreshCw, Search, Users, Zap } from "lucide-react";
import { cn, fmtDateTime, fmtUSD, timeAgo } from "@/lib/utils";
import {
  getWorldwideSearch,
  setWorldwideSearch,
  useCounterparties,
  useScanOpportunities,
  useTradeSources,
} from "@/api/hooks";
import type { Counterparty } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HsCode } from "@/components/HsCode";
import { HsPicker, type HsChoice } from "@/components/HsPicker";

type Role = "buyer" | "supplier";

const SOURCE_LABEL: Record<string, string> = {
  apify_company_search: "Web search",
  apify_us_importers: "US customs",
  apify_alibaba_rfq: "Alibaba RFQ",
  apify_india_suppliers: "Supplier actor",
  alibaba_rfq: "Alibaba API",
  eu_ted: "EU tender",
  indiamart: "IndiaMART",
  tradeindia: "TradeIndia",
};

function hostOf(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function FitBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-muted-foreground">—</span>;
  const variant = score >= 80 ? "success" : score >= 50 ? "info" : "secondary";
  return <Badge variant={variant}>{score}</Badge>;
}

function OutcomeBadge({ c }: { c: Counterparty }) {
  const hasOpp = c.opportunity_ids.length > 0;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Badge variant={hasOpp ? "teal" : "outline"} className="whitespace-nowrap">
            {hasOpp ? `${c.opportunity_ids.length} opportunit${c.opportunity_ids.length === 1 ? "y" : "ies"}` : "No opportunity"}
          </Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{c.last_outcome || "No scan outcome recorded"}</TooltipContent>
    </Tooltip>
  );
}

function Contact({ c }: { c: Counterparty }) {
  if (!c.email && !c.phone) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="space-y-0.5 min-w-0">
      {c.email && (
        <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-primary hover:underline truncate">
          <Mail className="w-3 h-3 shrink-0" />
          <span className="truncate">{c.email}</span>
        </a>
      )}
      {c.phone && (
        <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
          <Phone className="w-3 h-3 shrink-0" />
          {c.phone}
        </a>
      )}
    </div>
  );
}

function CounterpartyTable({ role, rows }: { role: Role; rows: Counterparty[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-3 font-semibold">Company</th>
            <th className="py-2 pr-3 font-semibold">Country</th>
            <th className="py-2 pr-3 font-semibold">Contact</th>
            <th className="py-2 pr-3 font-semibold">HS codes</th>
            {role === "supplier" && <th className="py-2 pr-3 font-semibold">FOB / MT</th>}
            <th className="py-2 pr-3 font-semibold">Source</th>
            <th className="py-2 pr-3 font-semibold">Fit</th>
            <th className="py-2 pr-3 font-semibold">Outcome</th>
            <th className="py-2 font-semibold">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-b border-border/60 align-top hover:bg-secondary/40">
              <td className="py-2.5 pr-3 max-w-[240px]">
                <p className="font-medium truncate" title={c.name}>{c.name}</p>
                {c.website && (
                  <a
                    href={c.website}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-muted-foreground hover:text-primary truncate"
                  >
                    <Globe className="w-3 h-3 shrink-0" />
                    <span className="truncate">{hostOf(c.website)}</span>
                  </a>
                )}
                {(c.gstin || c.iec) && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {c.gstin && `GSTIN ${c.gstin}`} {c.iec && `IEC ${c.iec}`}
                  </p>
                )}
              </td>
              <td className="py-2.5 pr-3 whitespace-nowrap">
                <p>{c.country ?? "—"}</p>
                <p className="text-[10px] text-muted-foreground" title="Markets this company was found for">
                  {c.markets.length ? `for ${c.markets.join(", ")}` : "worldwide search"}
                </p>
              </td>
              <td className="py-2.5 pr-3 max-w-[230px]">
                <Contact c={c} />
              </td>
              <td className="py-2.5 pr-3">
                <span className="flex flex-col gap-0.5">
                  {c.hs_codes.map((hs) => <HsCode key={hs} code={hs} className="font-mono whitespace-nowrap" />)}
                </span>
              </td>
              {role === "supplier" && (
                <td className="py-2.5 pr-3 whitespace-nowrap">
                  {c.estimated_fob_price_usd != null ? fmtUSD(c.estimated_fob_price_usd) : "—"}
                </td>
              )}
              <td className="py-2.5 pr-3">
                <Badge variant="secondary" className="whitespace-nowrap">
                  {SOURCE_LABEL[c.source] ?? c.source}
                </Badge>
              </td>
              <td className="py-2.5 pr-3">
                <FitBadge score={c.fit_score} />
              </td>
              <td className="py-2.5 pr-3">
                <OutcomeBadge c={c} />
              </td>
              <td className="py-2.5 whitespace-nowrap text-muted-foreground" title={fmtDateTime(c.last_seen_at)}>
                {timeAgo(c.last_seen_at)}
                {c.times_seen > 1 && <span className="block text-[10px]">seen {c.times_seen}×</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RolePanel({
  role,
  q,
  market,
  hs,
  country,
  live,
}: {
  role: Role;
  q: string;
  market: string;
  hs: string;
  country: string;
  live: boolean;
}) {
  const { data, isLoading, isError, refetch } = useCounterparties(
    role,
    {
      q: q.trim() || undefined,
      market: market.trim().toUpperCase() || undefined,
      country: country.trim().toUpperCase() || undefined,
      hs_code: hs.trim() || undefined,
    },
    { live }
  );
  const rows = data ?? [];
  const withEmail = rows.filter((r) => r.email).length;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        Could not load {role === "buyer" ? "buyers" : "suppliers"}.{" "}
        <button className="text-primary hover:underline" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="py-12 text-center space-y-1">
        <p className="text-sm font-medium">No {role === "buyer" ? "buyers" : "suppliers"} yet</p>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          {q || market || hs || country
            ? "Nothing matches these filters."
            : live
            ? "Scan in progress — companies appear here as they are found (refreshing every 10 s)."
            : "Run a scan: every company it finds is listed here, even when the scan creates no opportunity or deal. Add your products on the Catalogue page so the search uses product names."}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        {rows.length} {role === "buyer" ? "buyers" : "suppliers"} · {withEmail} with an e-mail
      </p>
      <CounterpartyTable role={role} rows={rows} />
    </div>
  );
}

export function BuyersSuppliers() {
  const [tab, setTab] = useState<Role>("buyer");
  const [q, setQ] = useState("");
  const [market, setMarket] = useState("");
  const [hs, setHs] = useState("");
  const [country, setCountry] = useState("");
  const [worldwide, setWorldwide] = useState(getWorldwideSearch);
  const indiaOnly = country.trim().toUpperCase() === "IN";
  const scan = useScanOpportunities();
  const qc = useQueryClient();
  // true while a scan runs — started here or on the Opportunity Radar
  const scanning = useIsMutating({ mutationKey: ["scan"] }) > 0;
  const { data: sourcesInfo } = useTradeSources();
  const { data: buyers } = useCounterparties("buyer", {}, { live: scanning });
  const { data: suppliers } = useCounterparties("supplier", {}, { live: scanning });

  // "Find buyers & suppliers for a product": an HS code picked by product name, the name the
  // Apify search uses (editable), and the markets — one scan for just that product.
  const [pick, setPick] = useState<HsChoice | null>(null);
  const [productName, setProductName] = useState("");
  const [pickMarkets, setPickMarkets] = useState("");

  async function handleProductScan() {
    if (!pick) return;
    const name = productName.trim() || pick.name || "";
    if (!name || /^\d+$/.test(name)) {
      toast.error("Give the product a name to search for (a bare HS number finds no companies).");
      return;
    }
    const markets = pickMarkets.split(/[\s,]+/).map((m) => m.trim().toUpperCase()).filter((m) => /^[A-Z]{2}$/.test(m));
    setHs(pick.code);
    try {
      const opps = await scan.mutateAsync({
        worldwide,
        hs_codes: [pick.code],
        target_markets: markets,
        product_names: { [pick.code]: name },
      });
      toast.success(`Search for ${name} complete`, {
        description: `${opps.length} opportunit${opps.length === 1 ? "y" : "ies"} · the buyers and suppliers found are listed below`,
      });
    } catch {
      toast.warning("The search is still running on the server", {
        description: "Companies found so far are listed; use Refresh to load more.",
      });
    }
  }

  async function handleScan() {
    try {
      const opps = await scan.mutateAsync({ worldwide });
      toast.success("Scan complete", {
        description: `${opps.length} opportunit${opps.length === 1 ? "y" : "ies"} · buyer and supplier lists updated`,
      });
    } catch {
      // The server keeps scanning and recording after the browser stops waiting.
      toast.warning("Scan is still running on the server", {
        description: "Companies found so far are listed; use Refresh to load more.",
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold">Buyers &amp; Suppliers</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Every company the scanner found, in any country, with or without an opportunity or deal
            {sourcesInfo && !sourcesInfo.apify.token_present && " · APIFY_TOKEN not set, so no new companies are found"}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => qc.invalidateQueries({ queryKey: ["counterparties"] })}
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
        <Button
          variant={worldwide ? "default" : "outline"}
          size="sm"
          className="h-8 gap-1.5 text-xs"
          aria-pressed={worldwide}
          disabled={scanning}
          title={
            worldwide
              ? "On: scans also search importers and suppliers in every country (2 Apify runs per product). Click to scan only the chosen markets and India."
              : "Off: scans search only the chosen markets' buyers and India's suppliers. Click to also search every country."
          }
          onClick={() => {
            setWorldwide(!worldwide);
            setWorldwideSearch(!worldwide);
          }}
        >
          <Globe className="w-3.5 h-3.5" /> Worldwide {worldwide ? "on" : "off"}
        </Button>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleScan} disabled={scanning}>
          {scanning ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Scanning…
            </>
          ) : (
            <>
              <Zap className="w-3.5 h-3.5" /> Scan now
            </>
          )}
        </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div>
            <p className="text-sm font-semibold">Find buyers &amp; suppliers for a product</p>
            <p className="text-[11px] text-muted-foreground">
              Pick the HS code by product name; the Apify search looks for importers in the markets you list (or your catalogue's
              markets) and for suppliers in India{worldwide ? ", plus every country while Worldwide is on" : ""}. Each search costs paid Apify runs.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1.5fr_1fr_auto] gap-2 items-start">
            <HsPicker
              value={pick}
              onChange={(c) => {
                setPick(c);
                setProductName(c?.name ?? "");
              }}
            />
            <Input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Name to search for, e.g. basmati rice"
              className="h-8 text-xs"
              aria-label="Product name to search for"
              disabled={!pick}
            />
            <Input
              value={pickMarkets}
              onChange={(e) => setPickMarkets(e.target.value)}
              placeholder="Markets: AE, DE, US"
              className="h-8 text-xs"
              aria-label="Markets to search (country codes)"
              disabled={!pick}
            />
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleProductScan} disabled={!pick || scanning}>
              {scanning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              {scanning ? "Searching…" : "Find buyers & suppliers"}
            </Button>
          </div>
          {pick?.description && <p className="text-[10px] text-muted-foreground">HS {pick.code}: {pick.description}</p>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { label: "Buyers found", value: buyers?.length ?? 0, icon: Users, color: "#4f8cff" },
          { label: "Suppliers found", value: suppliers?.length ?? 0, icon: Factory, color: "#28c2a0" },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardContent className="flex items-center gap-3 pt-4">
                <div
                  className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
                  style={{ background: `${s.color}1a` }}
                >
                  <Icon className="w-5 h-5" style={{ color: s.color }} />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold" style={{ color: s.color }}>
                    {s.value}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Role)}>
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              <TabsList>
                <TabsTrigger value="buyer" className="gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Buyers
                </TabsTrigger>
                <TabsTrigger value="supplier" className="gap-1.5">
                  <Factory className="w-3.5 h-3.5" /> Suppliers
                </TabsTrigger>
              </TabsList>
              <div className="flex flex-1 flex-wrap gap-2 lg:justify-end">
                <div className="relative w-full sm:w-56">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Name, e-mail, website…"
                    className="pl-8 h-8 text-xs"
                  />
                </div>
                {tab === "supplier" && (
                  <Button
                    variant={indiaOnly ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-xs"
                    aria-pressed={indiaOnly}
                    title="Show only suppliers based in India"
                    onClick={() => setCountry(indiaOnly ? "" : "IN")}
                  >
                    India only
                  </Button>
                )}
                <Input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Country (DE)"
                  maxLength={2}
                  title="The company's own country (ISO-2)"
                  className="h-8 text-xs w-[110px] uppercase"
                />
                <Input
                  value={market}
                  onChange={(e) => setMarket(e.target.value)}
                  placeholder="Market (AE)"
                  maxLength={2}
                  title="The market the company was found for"
                  className={cn("h-8 text-xs w-[110px] uppercase")}
                />
                <Input
                  value={hs}
                  onChange={(e) => setHs(e.target.value)}
                  placeholder="HS code"
                  className="h-8 text-xs w-[110px] font-mono"
                />
              </div>
            </div>
            <TabsContent value="buyer" className="mt-3">
              <RolePanel role="buyer" q={q} market={market} hs={hs} country={country} live={scanning} />
            </TabsContent>
            <TabsContent value="supplier" className="mt-3">
              <RolePanel role="supplier" q={q} market={market} hs={hs} country={country} live={scanning} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
