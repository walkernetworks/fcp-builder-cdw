import { buildTimelineFromFields, engagementFieldsSchema, timelineSchema, type EngagementFields } from "../shared/fcp";
import { invokeLLM } from "./_core/llm";

const timelineJsonSchema = {
  type: "object",
  properties: {
    timeline: {
      type: "object",
      properties: {
        columns: { type: "array", minItems: 2, maxItems: 12, items: { type: "string" } },
        lanes: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              bars: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    startCol: { type: "integer", minimum: 1 },
                    endCol: { type: "integer", minimum: 2 },
                    color: { type: "string", enum: ["slate", "blue", "teal", "amber", "red", "green", "gate", "deferred"] },
                    label: { type: "string" },
                    milestone: { type: "boolean" },
                    deferred: { type: "boolean" },
                  },
                  required: ["id", "startCol", "endCol", "color", "label", "milestone", "deferred"],
                  additionalProperties: false,
                },
              },
            },
            required: ["id", "name", "bars"],
            additionalProperties: false,
          },
        },
      },
      required: ["columns", "lanes"],
      additionalProperties: false,
    },
    rationale: { type: "string" },
  },
  required: ["timeline", "rationale"],
  additionalProperties: false,
} as const;

const systemPrompt = `You are a CDW VMware Cloud Foundation sequencing specialist. Return only the requested JSON.

Authoritative rules:
1. Treat new hardware procurement as a hard gate for foundation build, but use the lead time for readiness, operations, DR design, security design, and governance.
2. Front-load VCF Operations and VCF Automation. Keep lifecycle management continuous.
3. Organize HCX migrations into 2-5 mobility-group waves. Put the primary data-center flip on a wave boundary.
4. If DR is in scope, design it before migration and deploy/test it alongside foundation and migration.
5. If VDefend is in scope, show active Year-1 red work. Keep ACC deferred unless explicitly procured.
6. Omit Kubernetes and DSM lanes unless their scope flags are true. DSM follows VCF Automation and Supervisor enablement.
7. Same-lane bars must not overlap. Different lanes may run concurrently.
8. startCol is 1-indexed and endCol is exclusive. No endCol may exceed columns.length + 1.
9. Use only colors: slate, blue, teal, amber, red, green, gate, deferred.
10. Never invent commercial values, dates, quantities, vendors, or scope. Use the supplied structured fields and notes.`;

async function callConfiguredEndpoint(fields: EngagementFields) {
  const endpoint = process.env.FCP_LLM_ENDPOINT?.trim();
  const apiKey = process.env.FCP_LLM_API_KEY?.trim();
  const model = process.env.FCP_LLM_MODEL?.trim();
  const payload = {
    model: model || undefined,
    messages: [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: `Create the FCP timeline from this validated intake:\n${JSON.stringify(fields)}` },
    ],
    response_format: {
      type: "json_schema" as const,
      json_schema: { name: "fcp_timeline", strict: true, schema: timelineJsonSchema },
    },
  };

  if (endpoint) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(Number(process.env.FCP_LLM_TIMEOUT_MS || 90000)),
    });
    if (!response.ok) throw new Error(`Approved LLM endpoint returned ${response.status}`);
    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; output?: unknown };
    if (json.output) return json.output;
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("Approved LLM endpoint returned no structured content");
    return JSON.parse(content);
  }

  if (process.env.BUILT_IN_FORGE_API_URL && process.env.BUILT_IN_FORGE_API_KEY) {
    const response = await invokeLLM(payload);
    const content = response.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Configured LLM returned no structured content");
    return JSON.parse(content);
  }

  return buildTimelineFromFields(fields);
}

export async function draftTimelineWithAi(rawFields: EngagementFields) {
  const fields = engagementFieldsSchema.parse(rawFields);
  try {
    const result = (await callConfiguredEndpoint(fields)) as { timeline: unknown; rationale: unknown };
    return {
      timeline: timelineSchema.parse(result.timeline),
      rationale: String(result.rationale || "The timeline follows the configured FCP sequencing controls."),
      source: "configured-llm" as const,
    };
  } catch (error) {
    const deterministic = buildTimelineFromFields(fields);
    return {
      ...deterministic,
      source: "deterministic-fallback" as const,
      warning: error instanceof Error ? error.message : "The configured LLM call failed validation.",
    };
  }
}
