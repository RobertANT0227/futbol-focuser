import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function HowItWorks() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <span>🧠</span> Cum funcționează robotul
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">🧠 Cum funcționează BetAnalyzer AI</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm text-secondary-foreground">
          <section>
            <h3 className="font-semibold text-foreground mb-1">1. Colectarea datelor</h3>
            <p>Robotul primește statisticile echipelor (goluri, xG, șuturi, cornere, posesie, formă, stil de joc) și cotele bookmaker-ului.</p>
          </section>

          <section>
            <h3 className="font-semibold text-foreground mb-1">2. Calculul forței offensive/defensive</h3>
            <p>Se calculează puterea de atac și apărare a fiecărei echipe pe baza golurilor marcate/primite acasă și în deplasare, raportate la media proprie. Se compară atacul gazdei cu apărarea oaspetelui și invers.</p>
          </section>

          <section>
            <h3 className="font-semibold text-foreground mb-1">3. Expected Goals (xG)</h3>
            <p>Golurile așteptate se calculează combinând forța ofensivă a unei echipe cu forța defensivă a adversarului. Se aplică apoi ajustări:</p>
            <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
              <li><strong>Avantaj teren:</strong> +12% xG gazdă, -12% oaspete</li>
              <li><strong>Forma recentă:</strong> ±5% bazat pe ultimele 5 meciuri (W=3, D=1, L=0)</li>
              <li><strong>xG vs goluri reale:</strong> Regresie 70/30 spre medie</li>
              <li><strong>Șuturi pe poartă:</strong> Ajustare ±10% bazat pe media de SoT/meci</li>
              <li><strong>Oboseală:</strong> -8% dacă echipa are program încărcat sau meci european</li>
              <li><strong>Stil de joc:</strong> Pressing +5%, Posesie +2%, Contraatac -2%, Low-block -7%</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-foreground mb-1">4. Distribuția Poisson</h3>
            <p>Se folosește distribuția Poisson pentru a calcula probabilitatea fiecărui scor posibil (0-5 goluri per echipă). Se construiește o matrice 6×6 cu toate combinațiile de scoruri.</p>
            <p className="mt-1 font-mono text-xs bg-secondary p-2 rounded">P(k goluri) = (λ^k × e^(-λ)) / k!</p>
          </section>

          <section>
            <h3 className="font-semibold text-foreground mb-1">5. Simulare Monte Carlo (10.000 iterații)</h3>
            <p>Se rulează 10.000 de simulări independente ale meciului folosind xG-ul calculat. Fiecare simulare generează un scor aleator bazat pe Poisson. Se agregă rezultatele pentru a obține probabilități stabile.</p>
          </section>

          <section>
            <h3 className="font-semibold text-foreground mb-1">6. Blend Poisson + Monte Carlo</h3>
            <p>Probabilitățile finale sunt un amestec: <strong>70% Poisson + 30% Monte Carlo</strong>, pentru precizie maximă.</p>
          </section>

          <section>
            <h3 className="font-semibold text-foreground mb-1">7. Detectarea Value-ului</h3>
            <p>Se compară probabilitatea modelului cu probabilitatea implicită din cotele bookmaker-ului:</p>
            <p className="mt-1 font-mono text-xs bg-secondary p-2 rounded">Value% = ((Prob_model - Prob_bookmaker) / Prob_bookmaker) × 100</p>
            <p className="mt-1">Un value pozitiv înseamnă că modelul consideră evenimentul mai probabil decât bookmaker-ul → pariu profitabil pe termen lung.</p>
          </section>

          <section>
            <h3 className="font-semibold text-foreground mb-1">8. Kelly Criterion (Stake optim)</h3>
            <p>Formula Kelly determină procentul optim din bankroll de pariat:</p>
            <p className="mt-1 font-mono text-xs bg-secondary p-2 rounded">f = (b × p - q) / b, unde b = cotă-1, p = prob model, q = 1-p</p>
          </section>

          <section>
            <h3 className="font-semibold text-foreground mb-1">9. Analiza cornerelor</h3>
            <p>Se folosesc cornerele medii acasă/deplasare ale fiecărei echipe. Se ajustează pentru stilul de joc (pressing/posesie generează mai multe cornere vs apărare joasă) și derby.</p>
          </section>

          <section>
            <h3 className="font-semibold text-foreground mb-1">10. Filtru de risc & Ranking</h3>
            <p>Pariurile sunt clasificate pe nivele de risc (scăzut/mediu/ridicat) bazat pe cotă, stabilitate Monte Carlo și value. Se sortează după <strong>value × stabilitate</strong> pentru a prioritiza pariurile cele mai bune.</p>
          </section>

          <section>
            <h3 className="font-semibold text-foreground mb-1">11. Plan personalizat</h3>
            <p>Dacă activezi planul, robotul filtrează pariurile conform preferințelor tale: risc maxim acceptat, bankroll, prag minim de value și tipuri de pariuri preferate.</p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
