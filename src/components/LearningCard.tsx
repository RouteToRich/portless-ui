import { Brain } from "lucide-react";
import { useLearning } from "@/api/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type GateEvidence = {
  recommended_level: string;
  why: string[];
  [k: string]: unknown;
};

const LABEL: Record<string, string> = {
  CONFIRM_MATCH: "Match Confirmation",
  SEND_INDICATIVE_OFFER: "Indicative Offers",
};

function pct(v: unknown) {
  return typeof v === "number" ? `${Math.round(v * 100)}%` : "—";
}

/** What the outcome feedback loop says: is the match board's "chance of closing"
 *  honest yet, and is there enough evidence to loosen a prospect gate? */
export function LearningCard() {
  const { data, isLoading } = useLearning();
  const evidence = (data?.evidence ?? {}) as Record<string, GateEvidence>;
  const match = evidence.CONFIRM_MATCH as (GateEvidence & {
    calibration?: { n_resolved: number; ece: number | null; active: boolean;
                    bins: { low: number; high: number; n: number; mean_predicted: number | null; observed_rate: number | null }[] };
  }) | undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-[#a78bfa]" />
          What the outcomes say
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Every proposed match is followed to signed / failed / completed. These numbers decide when a gate is
          safe to loosen — the recommendation is shown here, never applied by itself.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !data ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(evidence).map(([action, ev]) => (
                <div key={action} className="rounded-lg border border-border bg-secondary/50 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{LABEL[action] ?? action}</p>
                    <Badge variant={ev.recommended_level === "L0" ? "secondary" : "success"} className="text-[10px]">
                      evidence supports {ev.recommended_level}
                    </Badge>
                  </div>
                  {action === "CONFIRM_MATCH" ? (
                    <p className="text-[11px] text-muted-foreground">
                      {String(ev.proposals ?? 0)} proposed · {String(ev.decided ?? 0)} decided · operator agreement{" "}
                      {pct(ev.operator_agreement)} · {String(ev.resolved ?? 0)} resolved · {String(ev.signed ?? 0)} signed ·
                      sign rate above threshold {pct(ev.sign_rate_above_threshold)}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      {String(ev.sent ?? 0)} sent · {String(ev.answered ?? 0)} answered · {String(ev.accepted_or_countered ?? 0)} gave a price
                    </p>
                  )}
                  <ul className="text-[11px] list-disc pl-4">
                    {ev.why.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                </div>
              ))}
            </div>

            {match?.calibration && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                  Calibration — predicted chance vs actually signed
                  {match.calibration.active ? " (active: the board uses the calibrated value)" : ` (activates at ${20} resolved matches)`}
                </p>
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-muted-foreground text-left">
                      <th className="py-1">Band</th><th>Matches</th><th>Predicted</th><th>Signed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {match.calibration.bins.map((b) => (
                      <tr key={b.low} className="border-t border-border">
                        <td className="py-1">{Math.round(b.low * 100)}–{Math.round(b.high * 100)}%</td>
                        <td>{b.n}</td>
                        <td>{pct(b.mean_predicted)}</td>
                        <td>{pct(b.observed_rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {match.calibration.ece != null && (
                  <p className="text-[10px] text-muted-foreground mt-1">Average calibration error {pct(match.calibration.ece)}</p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
