import type { EurValueRange, ObjectResult } from "@/components/ObjectResultCard";

type ModelAnalyzeFrameResult = {
  scene_summary: string;
  objects: ObjectResult[];
  warning: string;
};

export type AnalyzeFrameResult = ModelAnalyzeFrameResult & {
  total_estimated_value_eur: EurValueRange;
};

const visionPrompt = `Analyze this camera frame as a discovery scan for objects that may deserve closer inspection in thrift stores, attics, flea markets, church restorations, workshops, and demolition or restoration sites.

Your job is not to prove that an object is valuable. Your job is to identify up to five of the best visible, unique objects and provide a useful provisional resale estimate for each one.

An object may deserve attention because of:
- resale value
- collectible or historical value
- useful parts value
- a visible brand, model, maker mark, signature, or label
- unusual design, craftsmanship, material, or construction

Consider both modern and older objects, including electronics, audio equipment, cameras, tools, watches, jewelry, ceramics, glassware, art, toys, games, musical equipment, branded goods, furniture, books, papers, packaging, religious or church objects, military or historical objects, and architectural salvage.

Do not require an object to be antique, vintage, rare, old, or collectible. Do not force those descriptions when they are not supported by visible evidence.
For wide scenes, select the five strongest candidates rather than trying to identify everything. Return each physical object only once. Treat an obvious matching set as one item when it would normally be sold together.
Never invent a brand, model, age, material, authenticity claim, or price detail that cannot be seen.

Valuation rules:
- Estimate the visible object's likely as-is second-hand resale value in EUR, not its original retail price, replacement cost, or a professional appraisal.
- Every returned object must receive a minimum and maximum EUR estimate.
- A close-up should narrow the estimate, not unlock the estimate.
- Use MODEL_ESTIMATE when an exact or likely model is visible.
- Use BRAND_ESTIMATE when a brand is visible but the model is unclear.
- Use CATEGORY_ESTIMATE when only the category and visible characteristics are known.
- If the category is identifiable, CATEGORY_ESTIMATE is mandatory even when the brand and model are unreadable.
- Use visible category, approximate size, brand, apparent age, condition, materials, distinctive design, and completeness.
- Wider uncertainty must produce a wider range. Low pricing confidence must not remove the estimate or automatically make the recommendation IGNORE.
- Assume used and untested unless visible evidence supports a different condition.
- Use non-negative whole EUR amounts, with min less than or equal to max.
- Only omit an object when even its category cannot be meaningfully identified.

Candidate status rules:
- INTERESTING: visible details give a concrete reason to inspect, research, save, or seek an expert.
- NEEDS_CLOSEUP: a specific additional photo would materially narrow an estimate that is already provided. This is optional guidance, not a reason to withhold a price.
- IGNORE: the object is identifiable and its provisional resale interest is genuinely low. Do not use IGNORE because an object is modern, unidentified by brand, or priced with low confidence.

When details are insufficient, keep the object as a candidate, use a broad CATEGORY_ESTIMATE or BRAND_ESTIMATE, and lower pricing confidence.
Identification confidence describes how certain the object identification is. Pricing confidence separately describes how reliable the range is.
Be cautious with value estimates and do not claim an exact brand, model, or professional appraisal accuracy when details are unreadable.
Return at most one specific next-photo suggestion per object, and only when it would materially improve identification or narrow the estimate. Return an empty list when no additional photo is useful. Do not repeat generic close-up instructions.
Return an empty objects array only when there are genuinely no identifiable objects worth closer inspection. Do not pad the list with ordinary objects.

For every returned object, place one approximate marker at the visual center of that object.
Marker x and y must be percentages from 0 to 100, measured from the image's top-left corner.
Only include objects that can be located clearly enough to place a marker.
Return only valid JSON.`;

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    scene_summary: { type: "string" },
    objects: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          object_name: { type: "string" },
          likely_category: { type: "string" },
          estimated_period: { type: "string" },
          value_context: { type: "string" },
          market_interest: { type: "string", enum: ["low", "medium", "high"] },
          estimated_value_eur: {
            type: "object",
            additionalProperties: false,
            properties: {
              min: { type: "number", minimum: 0 },
              max: { type: "number", minimum: 0 },
            },
            required: ["min", "max"],
          },
          valuation_basis: {
            type: "string",
            enum: ["MODEL_ESTIMATE", "BRAND_ESTIMATE", "CATEGORY_ESTIMATE"],
          },
          candidate_status: {
            type: "string",
            enum: ["INTERESTING", "NEEDS_CLOSEUP", "IGNORE"],
          },
          pricing_confidence: { type: "string", enum: ["low", "medium", "high"] },
          worth_score: { type: "number", minimum: 0, maximum: 100 },
          indicator_color: { type: "string", enum: ["green", "yellow", "orange", "red"] },
          identification_confidence: { type: "number", minimum: 0, maximum: 100 },
          what_to_photograph_next: {
            type: "array",
            maxItems: 1,
            items: { type: "string" },
          },
          recommendation: { type: "string", enum: ["IGNORE", "CHECK", "SAVE", "EXPERT"] },
          reasoning_summary: { type: "string" },
          marker: {
            type: "object",
            additionalProperties: false,
            properties: {
              x: { type: "number", minimum: 0, maximum: 100 },
              y: { type: "number", minimum: 0, maximum: 100 },
            },
            required: ["x", "y"],
          },
        },
        required: [
          "object_name",
          "likely_category",
          "estimated_period",
          "value_context",
          "market_interest",
          "estimated_value_eur",
          "valuation_basis",
          "candidate_status",
          "pricing_confidence",
          "worth_score",
          "indicator_color",
          "identification_confidence",
          "what_to_photograph_next",
          "recommendation",
          "reasoning_summary",
          "marker",
        ],
      },
    },
    warning: { type: "string" },
  },
  required: ["scene_summary", "objects", "warning"],
} as const;

function extractResponseText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";

  const outputText = (payload as { output_text?: unknown }).output_text;
  if (typeof outputText === "string") return outputText;

  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") return text;
    }
  }

  return "";
}

function normalizeEurRange(range: EurValueRange): EurValueRange {
  const min = typeof range?.min === "number" ? range.min : Number.NaN;
  const max = typeof range?.max === "number" ? range.max : Number.NaN;

  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < 0) {
    throw new Error("OpenAI returned an invalid EUR value estimate.");
  }

  return {
    min: Math.round(Math.min(min, max)),
    max: Math.round(Math.max(min, max)),
  };
}

function normalizeByScore(object: ObjectResult): ObjectResult {
  const candidateStatus: ObjectResult["candidate_status"] =
    object.candidate_status === "INTERESTING" ||
    object.candidate_status === "NEEDS_CLOSEUP" ||
    object.candidate_status === "IGNORE"
      ? object.candidate_status
      : "INTERESTING";
  const pricingConfidence: ObjectResult["pricing_confidence"] =
    object.pricing_confidence === "medium" || object.pricing_confidence === "high"
      ? object.pricing_confidence
      : "low";
  const valuationBasis: ObjectResult["valuation_basis"] =
    object.valuation_basis === "MODEL_ESTIMATE" ||
    object.valuation_basis === "BRAND_ESTIMATE"
      ? object.valuation_basis
      : "CATEGORY_ESTIMATE";
  let worthScore = Math.max(0, Math.min(100, Number(object.worth_score) || 0));
  const identificationConfidence = Math.max(
    0,
    Math.min(100, Number(object.identification_confidence) || 0),
  );
  const markerX = Number(object.marker?.x);
  const markerY = Number(object.marker?.y);
  const marker =
    Number.isFinite(markerX) && Number.isFinite(markerY)
      ? {
          x: Math.max(2, Math.min(98, markerX)),
          y: Math.max(2, Math.min(98, markerY)),
        }
      : null;

  let indicator_color: ObjectResult["indicator_color"] = "red";
  let recommendation: ObjectResult["recommendation"] = "IGNORE";

  if (candidateStatus === "IGNORE") {
    worthScore = Math.min(worthScore, 24);
  } else {
    worthScore = Math.max(25, worthScore);
  }

  if (candidateStatus === "IGNORE") {
    indicator_color = "red";
    recommendation = "IGNORE";
  } else if (worthScore >= 80) {
    indicator_color = "green";
    recommendation = object.recommendation === "EXPERT" ? "EXPERT" : "SAVE";
  } else if (worthScore >= 50) {
    indicator_color = "yellow";
    recommendation = "CHECK";
  } else if (worthScore >= 25) {
    indicator_color = "orange";
    recommendation = "CHECK";
  }

  return {
    ...object,
    candidate_status: candidateStatus,
    pricing_confidence: pricingConfidence,
    valuation_basis: valuationBasis,
    estimated_value_eur: normalizeEurRange(object.estimated_value_eur),
    worth_score: worthScore,
    identification_confidence: identificationConfidence,
    indicator_color,
    recommendation,
    marker,
    what_to_photograph_next: Array.isArray(object.what_to_photograph_next)
      ? [...new Set(
          object.what_to_photograph_next
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean),
        )].slice(0, 1)
      : [],
  };
}

function normalizeIdentity(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isLikelyDuplicate(candidate: ObjectResult, existing: ObjectResult): boolean {
  if (!candidate.marker || !existing.marker) return false;

  const sameName = normalizeIdentity(candidate.object_name) === normalizeIdentity(existing.object_name);
  const sameCategory =
    normalizeIdentity(candidate.likely_category) === normalizeIdentity(existing.likely_category);
  const markerDistance = Math.hypot(
    candidate.marker.x - existing.marker.x,
    candidate.marker.y - existing.marker.y,
  );

  return markerDistance <= 7 && (sameName || sameCategory);
}

function deduplicateObjects(objects: ObjectResult[]): ObjectResult[] {
  const uniqueObjects: ObjectResult[] = [];

  for (const object of objects) {
    if (!uniqueObjects.some((existing) => isLikelyDuplicate(object, existing))) {
      uniqueObjects.push(object);
    }
  }

  return uniqueObjects.slice(0, 5);
}

function removeRepeatedPhotoSuggestions(objects: ObjectResult[]): ObjectResult[] {
  const seenSuggestions = new Set<string>();

  return objects.map((object) => {
    const suggestion = object.what_to_photograph_next[0];
    if (!suggestion) return object;

    const normalizedSuggestion = normalizeIdentity(suggestion);
    if (!normalizedSuggestion || seenSuggestions.has(normalizedSuggestion)) {
      return { ...object, what_to_photograph_next: [] };
    }

    seenSuggestions.add(normalizedSuggestion);
    return object;
  });
}

function calculateTotalValue(objects: ObjectResult[]): EurValueRange {
  return objects.reduce(
    (total, object) => ({
      min: total.min + object.estimated_value_eur.min,
      max: total.max + object.estimated_value_eur.max,
    }),
    { min: 0, max: 0 },
  );
}

export async function analyzeFrameWithOpenAI(imageBase64: string): Promise<AnalyzeFrameResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured on the server.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: visionPrompt },
            { type: "input_image", image_url: imageBase64 },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "treasurescan_analysis",
          strict: true,
          schema: responseSchema,
        },
      },
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object"
        ? (payload as { error?: { message?: string } }).error?.message
        : "";
    throw new Error(message || "OpenAI vision analysis failed.");
  }

  const text = extractResponseText(payload);
  if (!text) {
    throw new Error("OpenAI returned an empty analysis.");
  }

  let parsed: ModelAnalyzeFrameResult;
  try {
    parsed = JSON.parse(text) as ModelAnalyzeFrameResult;
  } catch {
    throw new Error("OpenAI returned analysis that was not valid JSON.");
  }

  const normalizedObjects = Array.isArray(parsed.objects)
    ? parsed.objects
        .filter((object): object is ObjectResult => Boolean(object && typeof object === "object"))
        .map(normalizeByScore)
    : [];
  const objects = removeRepeatedPhotoSuggestions(deduplicateObjects(normalizedObjects));

  return {
    scene_summary: parsed.scene_summary || "",
    objects,
    total_estimated_value_eur: calculateTotalValue(objects),
    warning: parsed.warning || "",
  };
}
