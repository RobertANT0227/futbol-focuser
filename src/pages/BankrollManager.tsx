import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
  ResponsiveContainer,
} from 'recharts';
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Info,
  Plus,
  BarChart3,
  Wallet,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  type BankrollState,
  type ConfidenceLevel,
  CONFIDENCE_LABEL,
  CONFIDENCE_STAKE_PCT,
  getDefaultBankrollState,
  loadBankrollState,
  saveBankrollState,
  addBet,
  getStats,
  getCashOutStatus,
  getBankrollChartData,
  getMonthlyProfitData,
  calculateConfidenceStake,
  loadSyncedTopBets,
  clearSyncedTopBets,
  type SyncedTopBet,
} from '@/lib/bankroll';
import { BetCard } from '@/components/BetCard';
import type { BetRecommendation } from '@/lib/types';

const BankrollManager = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<BankrollState>(() => {
    return loadBankrollState() || getDefaultBankrollState(1000);
  });
  const [initialInput, setInitialInput] = useState('');
  const [showSetup, setShowSetup] = useState(!loadBankrollState());

  // Bet form
  const [matchName, setMatchName] = useState('');
  const [odds, setOdds] = useState('');
  const [result, setResult] = useState<'WIN' | 'LOSS'>('WIN');
  const [risk, setRisk] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [winRate, setWinRate] = useState('80');

  const stats = getStats(state);
  const cashOut = getCashOutStatus(state);
  const chartData = getBankrollChartData(state);
  const monthlyData = getMonthlyProfitData(state);

  const handleSetup = () => {
    const val = parseFloat(initialInput);
    if (val > 0) {
      const s = getDefaultBankrollState(val);
      saveBankrollState(s);
      setState(s);
      setShowSetup(false);
    }
  };

  const handleAddBet = () => {
    if (!matchName || !odds || !winRate) return;
    const o = parseFloat(odds);
    const wr = parseFloat(winRate);
    if (o <= 1 || wr <= 0 || wr > 100) return;
    const newState = addBet(state, matchName, o, result, risk, wr);
    setState(newState);
    setMatchName('');
    setOdds('');
    setWinRate('80');
  };

  const handleReset = () => {
    localStorage.removeItem('bankroll_state');
    setState(getDefaultBankrollState(1000));
    setShowSetup(true);
  };

  const kellyPreview = odds && winRate
    ? calculateKelly(parseFloat(winRate) || 0, parseFloat(odds) || 0)
    : 0;
  const stakePreview = odds && winRate
    ? calculateStake(state.currentBankroll, parseFloat(winRate) || 0, parseFloat(odds) || 0, risk, state.stakeModifier)
    : 0;

  if (showSetup) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Wallet className="h-5 w-5 text-primary" />
              Configurare Bankroll
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Bancă inițială (unități)</label>
              <Input
                type="number"
                value={initialInput}
                onChange={e => setInitialInput(e.target.value)}
                placeholder="1000"
                className="bg-secondary border-border"
              />
            </div>
            <Button onClick={handleSetup} className="w-full">Începe tracking</Button>
            <Button variant="ghost" onClick={() => navigate('/')} className="w-full text-muted-foreground">
              <ArrowLeft className="h-4 w-4 mr-2" /> Înapoi la analiză
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Bankroll Manager
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon">
                <Info className="h-5 w-5 text-muted-foreground" />
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">Terminologie</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p><strong className="text-foreground">Winrate</strong> — % pariuri câștigate</p>
                <p><strong className="text-foreground">ROI</strong> — profit / total mizat × 100</p>
                <p><strong className="text-foreground">Yield</strong> — profit / stake total × 100</p>
                <p><strong className="text-foreground">Kelly</strong> — (b×p - q) / b — miză optimă</p>
                <p><strong className="text-foreground">Edge</strong> — avantaj matematic față de bookmaker</p>
                <p><strong className="text-foreground">Stake Modifier</strong> — ajustare automată: -25% după 3L, -50% după 5L, +10% după 5W</p>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="destructive" size="sm" onClick={handleReset}>Reset</Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Header Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Wallet className="h-3.5 w-3.5" /> Bancă actuală
              </div>
              <p className="text-2xl font-bold font-mono text-foreground">
                {state.currentBankroll.toFixed(2)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                {stats.totalProfit >= 0 ? <TrendingUp className="h-3.5 w-3.5 text-primary" /> : <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
                Profit total
              </div>
              <p className={`text-2xl font-bold font-mono ${stats.totalProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                {stats.totalProfit >= 0 ? '+' : ''}{stats.totalProfit.toFixed(2)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Target className="h-3.5 w-3.5" /> ROI
              </div>
              <p className={`text-2xl font-bold font-mono ${stats.roi >= 0 ? 'text-primary' : 'text-destructive'}`}>
                {stats.roi.toFixed(1)}%
              </p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <DollarSign className="h-3.5 w-3.5" /> Winrate
              </div>
              <p className="text-2xl font-bold font-mono text-foreground">
                {stats.winrate.toFixed(1)}%
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Cash-out indicator */}
        <Card className={`border-2 ${cashOut.canCashOut ? 'border-primary bg-primary/5' : 'border-destructive/30 bg-destructive/5'}`}>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {cashOut.canCashOut
                ? <CheckCircle2 className="h-6 w-6 text-primary" />
                : <AlertTriangle className="h-6 w-6 text-destructive" />
              }
              <div>
                <p className={`font-semibold ${cashOut.canCashOut ? 'text-primary' : 'text-destructive'}`}>
                  {cashOut.canCashOut ? '🟢 CASH-OUT RECOMANDAT' : '🔴 NU RETRAGE'}
                </p>
                <p className="text-sm text-muted-foreground">{cashOut.reason}</p>
              </div>
            </div>
            {cashOut.canCashOut && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Retragere sugerată</p>
                <p className="text-lg font-bold font-mono text-primary">{cashOut.suggestedWithdrawal.toFixed(2)}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stake modifier warning */}
        {state.stakeModifier !== 1.0 && (
          <Card className="border-border bg-accent/10">
            <CardContent className="p-3 flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-accent" />
              <span className="text-accent-foreground">
                Stake modifier activ: <strong>{(state.stakeModifier * 100).toFixed(0)}%</strong>
                {state.stakeModifier < 1 ? ` (${state.consecutiveLosses} pierderi consecutive)` : ` (${state.consecutiveWins} câștiguri consecutive)`}
              </span>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Add bet */}
          <Card className="border-border lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2 text-base">
                <Plus className="h-4 w-4 text-primary" /> Adaugă pariu
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Meci</label>
                <Input
                  value={matchName}
                  onChange={e => setMatchName(e.target.value)}
                  placeholder="ex: Arsenal vs Chelsea"
                  className="bg-secondary border-border"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Cotă</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={odds}
                    onChange={e => setOdds(e.target.value)}
                    placeholder="1.85"
                    className="bg-secondary border-border"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">WR estimat (%)</label>
                  <Input
                    type="number"
                    value={winRate}
                    onChange={e => setWinRate(e.target.value)}
                    placeholder="80"
                    className="bg-secondary border-border"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Rezultat</label>
                  <Select value={result} onValueChange={v => setResult(v as 'WIN' | 'LOSS')}>
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WIN">✅ WIN</SelectItem>
                      <SelectItem value="LOSS">❌ LOSS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Risc</label>
                  <Select value={risk} onValueChange={v => setRisk(v as 'LOW' | 'MEDIUM' | 'HIGH')}>
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">🟢 Low</SelectItem>
                      <SelectItem value="MEDIUM">🟡 Medium</SelectItem>
                      <SelectItem value="HIGH">🔴 High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Kelly preview */}
              {odds && winRate && parseFloat(odds) > 1 && (
                <div className="bg-muted rounded-lg p-3 space-y-1 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Kelly %:</span>
                    <span className="text-foreground">{(kellyPreview * 100).toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Stake sugerat:</span>
                    <span className="text-primary font-semibold">{stakePreview.toFixed(2)}</span>
                  </div>
                </div>
              )}

              <Button onClick={handleAddBet} className="w-full" disabled={!matchName || !odds}>
                Adaugă pariu
              </Button>
            </CardContent>
          </Card>

          {/* Right: Charts */}
          <div className="lg:col-span-2 space-y-4">
            {/* Bankroll evolution */}
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" /> Evoluție bancă
                </CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.length > 1 ? (
                  <ChartContainer config={{ bankroll: { label: 'Bancă', color: 'hsl(var(--primary))' } }} className="h-[200px] w-full">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line
                        type="monotone"
                        dataKey="bankroll"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ fill: 'hsl(var(--primary))', r: 3 }}
                      />
                    </LineChart>
                  </ChartContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Adaugă pariuri pentru a vedea graficul</p>
                )}
              </CardContent>
            </Card>

            {/* Monthly profit */}
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-foreground flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-accent" /> Profit lunar
                </CardTitle>
              </CardHeader>
              <CardContent>
                {monthlyData.length > 0 ? (
                  <ChartContainer config={{ profit: { label: 'Profit', color: 'hsl(var(--primary))' } }} className="h-[180px] w-full">
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="profit" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Nicio dată disponibilă</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Dashboard stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Total pariuri', value: stats.total },
            { label: 'Câștigate', value: stats.wins, color: 'text-primary' },
            { label: 'Pierdute', value: stats.losses, color: 'text-destructive' },
            { label: 'Winrate', value: `${stats.winrate}%` },
            { label: 'Cotă medie', value: stats.avgOdds },
            { label: 'ROI', value: `${stats.roi}%`, color: stats.roi >= 0 ? 'text-primary' : 'text-destructive' },
            { label: 'Yield', value: `${stats.yieldPct}%`, color: stats.yieldPct >= 0 ? 'text-primary' : 'text-destructive' },
          ].map(s => (
            <Card key={s.label} className="border-border">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={`text-lg font-bold font-mono ${s.color || 'text-foreground'}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Bet history */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-foreground text-base">Istoric pariuri</CardTitle>
          </CardHeader>
          <CardContent>
            {state.bets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Niciun pariu înregistrat</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-xs">
                      <th className="text-left py-2 px-2">#</th>
                      <th className="text-left py-2 px-2">Meci</th>
                      <th className="text-right py-2 px-2">Cotă</th>
                      <th className="text-right py-2 px-2">Stake</th>
                      <th className="text-center py-2 px-2">Rezultat</th>
                      <th className="text-right py-2 px-2">Profit</th>
                      <th className="text-right py-2 px-2">Bancă</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...state.bets].reverse().map((bet, i) => (
                      <tr key={bet.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2 px-2 text-muted-foreground font-mono text-xs">{state.bets.length - i}</td>
                        <td className="py-2 px-2 text-foreground">{bet.match}</td>
                        <td className="py-2 px-2 text-right font-mono">{bet.odds.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right font-mono">{bet.stake.toFixed(2)}</td>
                        <td className="py-2 px-2 text-center">
                          {bet.result === 'WIN'
                            ? <span className="text-primary font-semibold">✅ W</span>
                            : <span className="text-destructive font-semibold">❌ L</span>
                          }
                        </td>
                        <td className={`py-2 px-2 text-right font-mono font-semibold ${bet.profit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                          {bet.profit >= 0 ? '+' : ''}{bet.profit.toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">{bet.bankrollAfter.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BankrollManager;
