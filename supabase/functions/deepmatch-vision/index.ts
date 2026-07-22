// DeepMatch Vision — reads Superbet screenshots and returns structured team stats.
// Accepts { images: [{ data: base64, mimeType: string }], homeName?, awayName? }.
// Returns { home: ParsedTeamStats, away: ParsedTeamStats, notes: string[] }.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Ești un extractor de statistici Superbet. Primești unul sau mai multe screenshot-uri din secțiunile Superbet ale unui meci (Clasament, Top statistici / General, Atac, Apărare, Acasă, Deplasare, etc.) și returnezi un JSON cu statisticile ambelor echipe.

REGULI STRICTE:
- Detectează singur ce tip de secțiune e fiecare imagine (clasament, top statistici, atac, apărare).
- Din CLASAMENT extrage pentru fiecare echipă: leaguePosition (POZ / Loc), matchesPlayed (M / MJ) și totalTeamsInLeague (numărul total de rânduri / echipe în ligă).
- Din TOP STATISTICI extrage: goalsScored (Goluri/meci), possession (%, valoare 0-100), shots (Total șuturi/meci), shotsOnTarget (Șuturi pe poartă/meci), cornersPerMatch (Cornere/meci), fouls (Faulturi/meci), cardsPerMatch (Cartonașe galbene/meci).
- Din ATAC extrage DOAR "Atacuri periculoase / meci" → dangerousAttacks. Ignoră restul.
- Din APĂRARE extrage DOAR "Intervenții portar / meci" = "Salvări portar/meci" → gkSaves. Ignoră restul.
- Nu inventa valori. Dacă o valoare nu apare în imagini, întoarce null pentru câmpul respectiv.
- În Superbet, prima coloană / prima echipă este cea GAZDĂ, a doua este cea OASPETE. Dacă utilizatorul dă homeName / awayName, folosește-le pentru dezambiguizare.
- Returnează numere ca numere (nu string). Procentele fără semnul %.
- Nu returna comentarii sau text în afara JSON-ului.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    home: { $ref: "#/definitions/team" },
    away: { $ref: "#/definitions/team" },
    notes: { type: "array", items: { type: "string" } },
  },
  required: ["home", "away", "notes"],
  additionalProperties: false,
  definitions: {
    team: {
      type: "object",
      properties: {
        name: { type: ["string", "null"] },
        leaguePosition: { type: ["number", "null"] },
        matchesPlayed: { type: ["number", "null"] },
        totalTeamsInLeague: { type: ["number", "null"] },
        goalsScored: { type: ["number", "null"] },
        possession: { type: ["number", "null"] },
        shots: { type: ["number", "null"] },
        shotsOnTarget: { type: ["number", "null"] },
        cornersPerMatch: { type: ["number", "null"] },
        fouls: { type: ["number", "null"] },
        cardsPerMatch: { type: ["number", "null"] },
        dangerousAttacks: { type: ["number", "null"] },
        gkSaves: { type: ["number", "null"] },
      },
      required: [
        "name", "leaguePosition", "matchesPlayed", "totalTeamsInLeague",
        "goalsScored", "possession", "shots", "shotsOnTarget",
        "cornersPerMatch", "fouls", "cardsPerMatch",
        "dangerousAttacks", "gkSaves",
      ],
      additionalProperties: false,
    },
  },
};

interface ImageIn { data: string; mimeType: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) {
      return new Response(JSON.stringify({ ok: false, error: "LOVABLE_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const images: ImageIn[] = Array.isArray(body.images) ? body.images : [];
    const homeName: string | undefined = body.homeName;
    const awayName: string | undefined = body.awayName;

    if (!images.length) {
      return new Response(JSON.stringify({ ok: false, error: "No images" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userContent: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: `Extrage statisticile din următoarele ${images.length} screenshot(uri) Superbet.${
          homeName || awayName
            ? ` Echipa gazdă = ${homeName ?? "?"}, echipa oaspete = ${awayName ?? "?"}.`
            : ""
        } Returnează JSON conform schemei.`,
      },
      ...images.map((img) => ({
        type: "image_url",
        image_url: { url: `data:${img.mimeType};base64,${img.data}` },
      })),
    ];

    const gatewayRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "deepmatch_extract", strict: true, schema: RESPONSE_SCHEMA },
        },
      }),
    });

    if (!gatewayRes.ok) {
      const text = await gatewayRes.text();
      return new Response(
        JSON.stringify({ ok: false, error: `gateway ${gatewayRes.status}`, detail: text }),
        { status: gatewayRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const json = await gatewayRes.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try { parsed = JSON.parse(content); }
    catch {
      return new Response(JSON.stringify({ ok: false, error: "invalid_json", raw: content }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, result: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});