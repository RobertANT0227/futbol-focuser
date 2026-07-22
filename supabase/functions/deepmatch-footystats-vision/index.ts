// DeepMatch FootyStats Vision — strict reader for FootyStats screenshots / HTML dumps.
// Input:  { images: [{ data: base64, mimeType }], mode: 'general' | 'home' | 'away' }
// Output: { ok, result: { form: ('W'|'D'|'L')[]|null, goalsScored: number|null, goalsConceded: number|null, shotsOnTarget: number|null } }
//
// REGULA DE AUR: nu se estimează. Dacă valoarea nu apare în screenshot → null.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Ești un extractor STRICT de statistici FootyStats. Primești screenshoturi (sau HTML) de pe pagina unei echipe FootyStats și un MODE care spune ce tab e activ: "general" (Overall / General / Meciuri și Rezultate Meci), "home" (Acasă / Home) sau "away" (Deplasare / Away).

REGULI ABSOLUTE:
- NU inventa, NU estima, NU calcula medii. Copiezi STRICT valorile care apar în imagini.
- Dacă o valoare nu apare în imaginile date → returnează null pentru câmpul respectiv.
- NU muta date între secțiuni: dacă mode="home" nu completa nimic din date "Away/Deplasare" și invers. Dacă mode="general" NU completa GM/GP/SOT (acelea sunt doar home/away).
- Detectează automat dacă imaginea aparține modului dat: caută cuvintele "Overall/General", "Home/Acasă", "Away/Deplasare". Dacă imaginea NU corespunde modului cerut, IGNOR-O.

CE EXTRAGI, PE MODE:

mode = "general":
  - form: forma ultimelor 5 meciuri (general / overall). Citește din secțiunea "Meciuri și Rezultate Meci" / "Recent Matches" / "Form". Pentru fiecare din ULTIMELE 5 meciuri: W dacă echipa a câștigat, D dacă egal, L dacă a pierdut. Ordine cronologică crescătoare (cel mai vechi din cele 5 primul). Dacă găsești doar scorurile (ex "3-1", "2-0", "1-1"), trebuie să ști care echipă e cea analizată (de obicei prima menționată în tabelul de meciuri sau evidențiată). Dacă nu poți determina cu certitudine W/D/L → null pentru tot form.
  - goalsScored, goalsConceded, shotsOnTarget: NULL (nu se completează în mode general).

mode = "home":
  - form: forma din ultimele 5 meciuri de ACASĂ (W/D/L, ordine cronologică crescătoare).
  - goalsScored: MEDIA "Goluri marcate acasă" (goals scored per home match). Dacă apar doar scoruri individuale (3-1, 2-0, 1-1, 4-0, 2-1) → poți calcula media dacă și numai dacă TOATE cele 5 scoruri sunt vizibile complet — altfel null.
  - goalsConceded: MEDIA "Goluri primite acasă" (goals conceded per home match), aceeași regulă.
  - shotsOnTarget: valoarea afișată explicit "Șuturi pe poartă / meci" (Shots on Target per match) din tab-ul Acasă. NU calcula, doar copie.

mode = "away":
  - form: forma din ultimele 5 meciuri în DEPLASARE.
  - goalsScored: "Goluri marcate deplasare" (per meci).
  - goalsConceded: "Goluri primite deplasare" (per meci).
  - shotsOnTarget: "Șuturi pe poartă / meci" din tab-ul Deplasare.

ATENȚIE:
- Dacă imaginea NU e relevantă pentru mode-ul cerut → toate câmpurile null.
- Rotunjire: dacă rezultă medie din scoruri, rotunjește la 2 zecimale.
- Nu returna text în afara JSON-ului.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    form: {
      type: ["array", "null"],
      items: { type: "string", enum: ["W", "D", "L"] },
      minItems: 5,
      maxItems: 5,
    },
    goalsScored: { type: ["number", "null"] },
    goalsConceded: { type: ["number", "null"] },
    shotsOnTarget: { type: ["number", "null"] },
    notes: { type: "array", items: { type: "string" } },
  },
  required: ["form", "goalsScored", "goalsConceded", "shotsOnTarget", "notes"],
  additionalProperties: false,
};

interface ImageIn { data: string; mimeType: string }
type Mode = "general" | "home" | "away";

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
    const mode: Mode = (["general", "home", "away"].includes(body.mode) ? body.mode : "general") as Mode;
    const teamName: string | undefined = body.teamName;

    if (!images.length) {
      return new Response(JSON.stringify({ ok: false, error: "No images" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const label = mode === "general" ? "GENERAL (Overall)" : mode === "home" ? "ACASĂ (Home)" : "DEPLASARE (Away)";

    const userContent: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: `MODE = "${mode}" (${label}).${teamName ? ` Echipa analizată: ${teamName}.` : ""}\n` +
              `Extrage STRICT după reguli. Dacă imaginile nu conțin datele pentru acest mode → toate câmpurile null.`,
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
        model: "google/gemini-3.6-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "footystats_extract", strict: true, schema: RESPONSE_SCHEMA },
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

    return new Response(JSON.stringify({ ok: true, mode, result: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});