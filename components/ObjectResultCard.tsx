export type IndicatorColor = "green" | "yellow" | "orange" | "red";

export type ObjectMarker = {
  x: number;
  y: number;
};

export type EurValueRange = {
  min: number;
  max: number;
};

export type ObjectResult = {
  object_name: string;
  likely_category: string;
  estimated_period: string;
  value_context: string;
  market_interest: "low" | "medium" | "high";
  estimated_value_eur: EurValueRange;
  valuation_basis: "MODEL_ESTIMATE" | "BRAND_ESTIMATE" | "CATEGORY_ESTIMATE";
  candidate_status: "INTERESTING" | "NEEDS_CLOSEUP" | "IGNORE";
  pricing_confidence: "low" | "medium" | "high";
  worth_score: number;
  indicator_color: IndicatorColor;
  identification_confidence: number;
  what_to_photograph_next: string[];
  recommendation: "IGNORE" | "CHECK" | "SAVE" | "EXPERT";
  reasoning_summary: string;
  marker: ObjectMarker | null;
};

const colorClasses: Record<IndicatorColor, string> = {
  green: "bg-emerald-400 text-stone-950 shadow-emerald-400/35",
  yellow: "bg-yellow-300 text-stone-950 shadow-yellow-300/35",
  orange: "bg-orange-400 text-stone-950 shadow-orange-400/35",
  red: "bg-red-500 text-white shadow-red-500/35",
};

const recommendationClasses: Record<ObjectResult["recommendation"], string> = {
  IGNORE: "border-red-400/25 bg-red-500/10 text-red-100",
  CHECK: "border-yellow-300/25 bg-yellow-300/10 text-yellow-100",
  SAVE: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
  EXPERT: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
};

const candidateStatusClasses: Record<ObjectResult["candidate_status"], string> = {
  INTERESTING: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
  NEEDS_CLOSEUP: "border-yellow-300/25 bg-yellow-300/10 text-yellow-100",
  IGNORE: "border-red-400/25 bg-red-500/10 text-red-100",
};

const candidateStatusLabels: Record<ObjectResult["candidate_status"], string> = {
  INTERESTING: "Interesting",
  NEEDS_CLOSEUP: "Needs close-up",
  IGNORE: "Low priority",
};

const valuationBasisLabels: Record<ObjectResult["valuation_basis"], string> = {
  MODEL_ESTIMATE: "Model estimate",
  BRAND_ESTIMATE: "Brand estimate",
  CATEGORY_ESTIMATE: "Category estimate",
};

const eurNumberFormatter = new Intl.NumberFormat("en-IE", {
  maximumFractionDigits: 0,
});

export function formatEurRange(range: EurValueRange): string {
  const min = Math.max(0, Math.round(range.min));
  const max = Math.max(min, Math.round(range.max));

  if (min === max) {
    return `EUR ${eurNumberFormatter.format(min)}`;
  }

  return `EUR ${eurNumberFormatter.format(min)}-${eurNumberFormatter.format(max)}`;
}

type ObjectResultCardProps = {
  result: ObjectResult;
  itemNumber: number;
};

export function ObjectResultCard({ result, itemNumber }: ObjectResultCardProps) {
  return (
    <article
      id={`treasure-result-${itemNumber}`}
      className="scroll-mt-4 rounded-lg border border-stone-700/70 bg-stone-950/68 p-4 shadow-xl shadow-black/20 backdrop-blur"
    >
      <div className="flex items-start gap-3">
        <span
          aria-label={`Item ${itemNumber}, ${result.indicator_color} value indicator`}
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black shadow-[0_0_22px] ${colorClasses[result.indicator_color]}`}
        >
          {itemNumber}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-6 text-stone-50">
            {result.object_name}
          </h2>
          <p className="mt-2 text-2xl font-semibold text-amber-100">
            {formatEurRange(result.estimated_value_eur)}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span
              className={`rounded-md border px-2.5 py-1 text-xs font-bold tracking-[0.14em] ${recommendationClasses[result.recommendation]}`}
            >
              {result.recommendation}
            </span>
            <span className="text-xs text-stone-400">
              Identification {Math.round(result.identification_confidence)}/100
            </span>
            <span className="text-xs text-stone-400">
              Pricing confidence {result.pricing_confidence}
            </span>
          </div>

          <p className="mt-3 text-sm text-stone-400">
            {result.likely_category} / {result.estimated_period || "unknown period"}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-stone-700 bg-stone-900 px-2.5 py-1 text-xs text-stone-300">
              {valuationBasisLabels[result.valuation_basis]}
            </span>
            <span
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${candidateStatusClasses[result.candidate_status]}`}
            >
              {candidateStatusLabels[result.candidate_status]}
            </span>
            <span className="text-xs text-stone-500">
              Radar score {Math.round(result.worth_score)}/100
            </span>
          </div>

          <p className="mt-4 text-sm leading-5 text-stone-300">{result.reasoning_summary}</p>

          {result.what_to_photograph_next.length > 0 ? (
            <div className="mt-4 border-t border-stone-800 pt-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Optional next photo
              </p>
              <p className="mt-2 text-sm leading-5 text-stone-300">
                {result.what_to_photograph_next[0]}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
