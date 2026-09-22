import { useState, useEffect, useRef } from "react";
import {
  AreaChart, Area,
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

// ─── Palette ──────────────────────────────────────────────────────────────────
const G = "#00e676";        // Shelly green
const G2 = "#00b359";       // darker green
const CYAN = "#00bcd4";
const VIOLET = "#7c3aed";
const AMBER = "#ffa000";
const CARD = "#111111";
const BORDER = "#222222";
const MONO = "'JetBrains Mono', monospace";
const SANS = "'Outfit', sans-serif";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number, d = 0) => n.toFixed(d);
const fmtK = (n: number) => n >= 1000 ? (n / 1000).toFixed(1) + "k" : n.toString();

function rand(base: number, spread: number) {
  return +(base + (Math.random() - 0.5) * spread).toFixed(2);
}

// ─── Data generators ──────────────────────────────────────────────────────────
const HOURS = Array.from({ length: 24 }, (_, h) => {
  const label = `${h + 1}`;
  const base = h >= 7 && h <= 18 ? 14 : 4;
  const kwh = +(base + Math.sin((h / 24) * Math.PI * 2) * 4 + Math.random() * 2).toFixed(2);
  return { label, kwh, cost: +(kwh * 10.5).toFixed(0) };
});

const DAYS = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(2025, 8, i + 1);
  const label = d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
  const kwh = +(isWeekend ? 180 + Math.random() * 40 : 310 + Math.random() * 80).toFixed(1);
  return { label, kwh, cost: +(kwh * 10.5).toFixed(0) };
});

const WEEKS = Array.from({ length: 52 }, (_, i) => ({
  label: `W${i + 1}`,
  kwh: +(1800 + Math.sin(i * 0.3) * 400 + Math.random() * 200).toFixed(0),
  cost: 0,
})).map((w) => ({ ...w, cost: +(+w.kwh * 10.5).toFixed(0) }));

const MONTHS_DATA = [
  "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"
].map((label, i) => {
  const kwh = [3210,3540,4120,4380,4750,4610,4200,4080,3950,4320,4800,5982][i];
  return { label, kwh, cost: +(kwh * 10.5).toFixed(0) };
});

// Forecast generator
function makeForecast(data: { kwh: number; label: string }[]) {
  return data.map((d) => {
    const a = d.kwh;
    const lstmErr  = (Math.sin(Math.random() * 10) * 0.05);
    const xgbErr   = (Math.cos(Math.random() * 8)  * 0.035);
    return {
      label: d.label,
      actual: a,
      lstm:    Math.round(a * (1 + lstmErr)),
      xgboost: Math.round(a * (1 + xgbErr)),
    };
  });
}

function metrics(data: { actual: number; lstm: number; xgboost: number }[]) {
  const calc = (key: "lstm" | "xgboost") => {
    if (!data.length) return { mae: 0, rmse: 0, mape: 0 };
    const mae  = data.reduce((s, d) => s + Math.abs(d.actual - d[key]), 0) / data.length;
    const rmse = Math.sqrt(data.reduce((s, d) => s + (d.actual - d[key]) ** 2, 0) / data.length);
    const mape = data.reduce((s, d) => s + (d.actual ? Math.abs((d.actual - d[key]) / d.actual) * 100 : 0), 0) / data.length;
    return { mae: +mae.toFixed(1), rmse: +rmse.toFixed(1), mape: +mape.toFixed(2) };
  };
  return { lstm: calc("lstm"), xgboost: calc("xgboost") };
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
const Tip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1a1a1a", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 12px", fontFamily: MONO, fontSize: 11 }}>
      <p style={{ color: "#666", marginBottom: 4 }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color, margin: "2px 0" }}>
          {p.name}: <strong>{Number(p.value).toLocaleString()}</strong>
        </p>
      ))}
    </div>
  );
};

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: MONO, fontSize: 11, fontWeight: 600,
        padding: "5px 14px", borderRadius: 20, border: "none", cursor: "pointer",
        background: active ? G : "#1e1e1e",
        color: active ? "#000" : "#555",
        transition: "all .15s",
      }}
    >
      {children}
    </button>
  );
}

function StatRow({ label, value, unit, color = "#aaa" }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 0", borderBottom: `1px solid ${BORDER}` }}>
      <span style={{ color: "#555", fontSize: 11, fontFamily: SANS }}>{label}</span>
      <span style={{ color, fontFamily: MONO, fontSize: 13, fontWeight: 600 }}>
        {value}{unit && <span style={{ color: "#444", fontSize: 10, marginLeft: 3 }}>{unit}</span>}
      </span>
    </div>
  );
}

function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 20, ...style }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ color: "#444", fontSize: 10, fontFamily: MONO, fontWeight: 600, textTransform: "uppercase", letterSpacing: 2, marginBottom: 14 }}>
      {children}
    </p>
  );
}

// ─── Live Monitor ─────────────────────────────────────────────────────────────
function LiveMonitorTab() {
  const [phases, setPhases] = useState([
    { id: "A", color: G,      watts: 4218, current: 18.4, voltage: 229.3, pf: 0.97, freq: 59.98 },
    { id: "B", color: CYAN,   watts: 3891, current: 16.9, voltage: 230.1, pf: 0.96, freq: 59.97 },
    { id: "C", color: VIOLET, watts: 4062, current: 17.6, voltage: 229.8, pf: 0.96, freq: 60.01 },
  ]);

  const [liveHistory, setLiveHistory] = useState<{ t: string; total: number }[]>(() =>
    Array.from({ length: 20 }, (_, i) => ({
      t: `${String(i).padStart(2, "0")}s`,
      total: rand(12000, 800),
    }))
  );

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const now = new Date();
      const t = `${String(now.getSeconds()).padStart(2, "0")}s`;
      setPhases((prev) => prev.map((p) => ({
        ...p,
        watts:   Math.round(p.watts + (Math.random() - 0.5) * 120),
        current: +rand(p.current, 0.4).toFixed(1),
        voltage: +rand(p.voltage, 0.8).toFixed(1),
      })));
      setLiveHistory((prev) => {
        const next = [...prev.slice(-19), { t, total: rand(12000, 900) }];
        return next;
      });
    }, 1500);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const total = phases.reduce((s, p) => s + p.watts, 0);
  const totalA = phases.reduce((s, p) => s + p.current, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Hero readout */}
      <Card style={{ textAlign: "center", padding: "28px 20px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 0%, ${G}12 0%, transparent 70%)`, pointerEvents: "none" }} />
        <p style={{ color: "#444", fontSize: 11, fontFamily: MONO, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>Total Active Power</p>
        <p style={{ color: G, fontSize: 56, fontWeight: 700, fontFamily: MONO, lineHeight: 1, marginBottom: 4 }}>
          {(total / 1000).toFixed(2)}<span style={{ fontSize: 22, color: G2, marginLeft: 6 }}>kW</span>
        </p>
        <p style={{ color: "#444", fontSize: 12, fontFamily: MONO, marginTop: 8 }}>
          {totalA.toFixed(1)} A total · {((total / 1000) * 24).toFixed(1)} kWh/day est.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 24, marginTop: 16 }}>
          {[{ label: "Voltage avg", val: (phases.reduce((s,p)=>s+p.voltage,0)/3).toFixed(1)+" V" },
            { label: "PF avg", val: (phases.reduce((s,p)=>s+p.pf,0)/3).toFixed(2) },
            { label: "Freq", val: "60.0 Hz" },
          ].map((s) => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <p style={{ color: G, fontFamily: MONO, fontSize: 15, fontWeight: 700 }}>{s.val}</p>
              <p style={{ color: "#444", fontSize: 10, fontFamily: SANS }}>{s.label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Live chart */}
      <Card>
        <SectionTitle>Live Power (last 20s)</SectionTitle>
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={liveHistory} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="lgLive" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={G} stopOpacity={0.3} />
                <stop offset="95%" stopColor={G} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="t" tick={{ fill: "#444", fontSize: 9, fontFamily: MONO }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#444", fontSize: 9, fontFamily: MONO }} axisLine={false} tickLine={false} width={40} domain={["auto","auto"]} />
            <Tooltip content={<Tip />} />
            <Area type="monotone" dataKey="total" name="W" stroke={G} strokeWidth={2} fill="url(#lgLive)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* Phase cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        {phases.map((p) => (
          <Card key={p.id}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: p.color }} />
                <span style={{ color: "#888", fontFamily: SANS, fontSize: 13, fontWeight: 600 }}>Phase {p.id}</span>
              </div>
              <span style={{ color: p.color, fontFamily: MONO, fontSize: 20, fontWeight: 700 }}>
                {(p.watts / 1000).toFixed(2)} <span style={{ fontSize: 11, color: "#444" }}>kW</span>
              </span>
            </div>
            <StatRow label="Current" value={p.current.toFixed(1)} unit="A" color={p.color} />
            <StatRow label="Voltage" value={p.voltage.toFixed(1)} unit="V" />
            <StatRow label="Power Factor" value={p.pf.toFixed(2)} />
            <StatRow label="Frequency" value={p.freq.toFixed(2)} unit="Hz" />
            <StatRow label="Apparent Power" value={((p.watts / p.pf) / 1000).toFixed(2)} unit="kVA" />

            {/* Load bar */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ color: "#444", fontSize: 10, fontFamily: SANS }}>Load (max 400A)</span>
                <span style={{ color: "#444", fontSize: 10, fontFamily: MONO }}>{((p.current / 400) * 100).toFixed(1)}%</span>
              </div>
              <div style={{ background: "#1e1e1e", borderRadius: 4, height: 4 }}>
                <div style={{ height: 4, borderRadius: 4, background: p.color, width: `${(p.current / 400) * 100}%`, transition: "width .4s" }} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Device info */}
      <Card>
        <SectionTitle>Device — Shelly Pro 3EM</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
          <StatRow label="Model" value="Shelly Pro 3EM" color="#888" />
          <StatRow label="Max Current" value="400" unit="A" color={G} />
          <StatRow label="Phases" value="3" color="#888" />
          <StatRow label="Status" value="Online" color={G} />
          <StatRow label="Location" value="CSPC Main" color="#888" />
          <StatRow label="Uptime" value="14d 7h 22m" color="#888" />
        </div>
      </Card>
    </div>
  );
}

// ─── Consumption ──────────────────────────────────────────────────────────────
type Period = "Hourly" | "Daily" | "Weekly" | "Monthly";

function ConsumptionTab() {
  const [period, setPeriod] = useState<Period>("Daily");

  const datasets: Record<Period, { label: string; kwh: number; cost: number }[]> = {
    Hourly:  HOURS,
    Daily:   DAYS,
    Weekly:  WEEKS,
    Monthly: MONTHS_DATA,
  };

  const data = datasets[period];
  const totalKwh = data.reduce((s, d) => s + d.kwh, 0);
  const totalCost = data.reduce((s, d) => s + d.cost, 0);
  const avg = totalKwh / data.length;
  const peak = Math.max(...data.map((d) => d.kwh));
  const peakLabel = data.find((d) => d.kwh === peak)?.label ?? "—";

  const interval = period === "Hourly" ? 0 : period === "Daily" ? 5 : period === "Weekly" ? 8 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Period selector */}
      <div style={{ display: "flex", gap: 8 }}>
        {(["Hourly","Daily","Weekly","Monthly"] as Period[]).map((p) => (
          <Pill key={p} active={period === p} onClick={() => setPeriod(p)}>{p}</Pill>
        ))}
      </div>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        {[
          { label: "Total kWh", value: fmtK(+totalKwh.toFixed(0)), color: G },
          { label: "Total Cost", value: `₱${(totalCost/1000).toFixed(1)}k`, color: AMBER },
          { label: `Avg / ${period === "Hourly" ? "hr" : period === "Daily" ? "day" : period === "Weekly" ? "wk" : "mo"}`, value: avg.toFixed(1), color: "#aaa" },
          { label: "Peak", value: peak.toLocaleString(), color: CYAN },
          { label: "Peak at", value: peakLabel, color: "#aaa" },
        ].map((k) => (
          <Card key={k.label} style={{ padding: 16 }}>
            <p style={{ color: "#444", fontSize: 10, fontFamily: MONO, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>{k.label}</p>
            <p style={{ color: k.color, fontFamily: MONO, fontSize: 20, fontWeight: 700 }}>{k.value}</p>
          </Card>
        ))}
      </div>

      {/* Energy chart */}
      <Card>
        <SectionTitle>Energy Consumption — {period}</SectionTitle>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="lgBar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={G} stopOpacity={0.9} />
                <stop offset="100%" stopColor={G2} stopOpacity={0.5} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
            <XAxis dataKey="label" tick={{ fill: "#444", fontSize: 10, fontFamily: MONO }} axisLine={false} tickLine={false} interval={interval} />
            <YAxis tick={{ fill: "#444", fontSize: 10, fontFamily: MONO }} axisLine={false} tickLine={false} width={44} />
            <Tooltip content={<Tip />} />
            <Bar dataKey="kwh" name="kWh" fill="url(#lgBar)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Cost chart */}
      <Card>
        <SectionTitle>Electricity Cost (₱) — {period}</SectionTitle>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="lgCost" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={AMBER} stopOpacity={0.3} />
                <stop offset="95%" stopColor={AMBER} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
            <XAxis dataKey="label" tick={{ fill: "#444", fontSize: 10, fontFamily: MONO }} axisLine={false} tickLine={false} interval={interval} />
            <YAxis tick={{ fill: "#444", fontSize: 10, fontFamily: MONO }} axisLine={false} tickLine={false} width={50} />
            <Tooltip content={<Tip />} />
            <Area type="monotone" dataKey="cost" name="₱" stroke={AMBER} strokeWidth={2} fill="url(#lgCost)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

// ─── Forecast ─────────────────────────────────────────────────────────────────
type ModelFilter = "Both" | "LSTM" | "XGBoost";

function ForecastTab() {
  const [period, setPeriod] = useState<Period>("Monthly");
  const [modelFilter, setModelFilter] = useState<ModelFilter>("Both");
  const [ran, setRan] = useState(false);
  const [forecastData, setForecastData] = useState<any[]>([]);
  const [met, setMet] = useState({ lstm: { mae: 0, rmse: 0, mape: 0 }, xgboost: { mae: 0, rmse: 0, mape: 0 } });

  const datasets: Record<Period, { kwh: number; label: string }[]> = {
    Hourly: HOURS, Daily: DAYS, Weekly: WEEKS, Monthly: MONTHS_DATA,
  };

  function runForecast() {
    const data = makeForecast(datasets[period]);
    setForecastData(data);
    setMet(metrics(data));
    setRan(true);
  }

  const showLSTM = modelFilter === "Both" || modelFilter === "LSTM";
  const showXGB  = modelFilter === "Both" || modelFilter === "XGBoost";
  const interval = period === "Hourly" ? 0 : period === "Daily" ? 5 : period === "Weekly" ? 8 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Controls */}
      <Card>
        <SectionTitle>Forecast Configuration</SectionTitle>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-end" }}>
          <div>
            <p style={{ color: "#444", fontSize: 10, fontFamily: MONO, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>Granularity</p>
            <div style={{ display: "flex", gap: 6 }}>
              {(["Hourly","Daily","Weekly","Monthly"] as Period[]).map((p) => (
                <Pill key={p} active={period === p} onClick={() => { setPeriod(p); setRan(false); }}>{p}</Pill>
              ))}
            </div>
          </div>
          <div>
            <p style={{ color: "#444", fontSize: 10, fontFamily: MONO, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>Training Set</p>
            <select
              style={{ background: "#1a1a1a", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "6px 12px", color: "#aaa", fontFamily: MONO, fontSize: 12, outline: "none" }}
              defaultValue="2023–2024"
            >
              <option>2023–2024</option>
              <option>2023</option>
              <option>2024</option>
            </select>
          </div>
          <div>
            <p style={{ color: "#444", fontSize: 10, fontFamily: MONO, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>Test Set</p>
            <select
              style={{ background: "#1a1a1a", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "6px 12px", color: "#aaa", fontFamily: MONO, fontSize: 12, outline: "none" }}
              defaultValue="2025"
            >
              <option>2025</option>
              <option>2024</option>
            </select>
          </div>
          <button
            onClick={runForecast}
            style={{
              background: G, color: "#000", fontFamily: MONO, fontWeight: 700, fontSize: 13,
              border: "none", borderRadius: 10, padding: "10px 24px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8, transition: "opacity .15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            ▶ Run Forecast
          </button>
        </div>

        {ran && (
          <div style={{ display: "flex", gap: 24, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: G }} />
              <span style={{ color: "#555", fontFamily: MONO, fontSize: 11 }}>Forecast ready · {period} · {forecastData.length} pts</span>
            </div>
          </div>
        )}
      </Card>

      {/* Empty state */}
      {!ran && (
        <Card style={{ textAlign: "center", padding: "60px 20px" }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>⚡</p>
          <p style={{ color: "#333", fontFamily: MONO, fontSize: 13 }}>
            Select granularity and press <span style={{ color: G }}>Run Forecast</span>
          </p>
        </Card>
      )}

      {/* Forecast chart */}
      {ran && (
        <>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
              <div>
                <SectionTitle>Actual vs Forecasted — {period}</SectionTitle>
                <div style={{ display: "flex", gap: 16, fontSize: 11, fontFamily: MONO }}>
                  <span style={{ color: "#666" }}>── Actual</span>
                  {showLSTM && <span style={{ color: CYAN }}>- - LSTM</span>}
                  {showXGB  && <span style={{ color: VIOLET }}>··· XGBoost</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {(["Both","LSTM","XGBoost"] as ModelFilter[]).map((m) => (
                  <Pill key={m} active={modelFilter === m} onClick={() => setModelFilter(m)}>{m}</Pill>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={forecastData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                <XAxis dataKey="label" tick={{ fill: "#444", fontSize: 10, fontFamily: MONO }} axisLine={false} tickLine={false} interval={interval} />
                <YAxis tick={{ fill: "#444", fontSize: 10, fontFamily: MONO }} axisLine={false} tickLine={false} width={46} />
                <Tooltip content={<Tip />} />
                <Line type="monotone" dataKey="actual"  name="Actual"   stroke="#555"   strokeWidth={2}   dot={false} />
                {showLSTM && <Line type="monotone" dataKey="lstm"    name="LSTM"     stroke={CYAN}   strokeWidth={2} strokeDasharray="6 3" dot={false} />}
                {showXGB  && <Line type="monotone" dataKey="xgboost" name="XGBoost"  stroke={VIOLET} strokeWidth={2} strokeDasharray="3 3" dot={false} />}
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Quick metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            {(["MAE","RMSE","MAPE"] as const).map((k) => {
              const lv = met.lstm[k.toLowerCase() as "mae"|"rmse"|"mape"];
              const xv = met.xgboost[k.toLowerCase() as "mae"|"rmse"|"mape"];
              const unit = k === "MAPE" ? "%" : " kWh";
              return (
                <Card key={k} style={{ padding: 16 }}>
                  <p style={{ color: "#444", fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>{k}</p>
                  {showLSTM && <p style={{ color: CYAN,   fontFamily: MONO, fontSize: 16, fontWeight: 700, marginBottom: 4 }}>LSTM: {lv}{unit}</p>}
                  {showXGB  && <p style={{ color: VIOLET, fontFamily: MONO, fontSize: 16, fontWeight: 700 }}>XGB: {xv}{unit}</p>}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Model Comparison ─────────────────────────────────────────────────────────
function ModelComparisonTab() {
  const [period, setPeriod] = useState<Period>("Monthly");
  const [ran, setRan] = useState(false);
  const [met, setMet] = useState({ lstm: { mae: 0, rmse: 0, mape: 0 }, xgboost: { mae: 0, rmse: 0, mape: 0 } });
  const [barData, setBarData] = useState<any[]>([]);

  const datasets: Record<Period, { kwh: number; label: string }[]> = {
    Hourly: HOURS, Daily: DAYS, Weekly: WEEKS, Monthly: MONTHS_DATA,
  };

  function compare() {
    const fd = makeForecast(datasets[period]);
    const m  = metrics(fd);
    setMet(m);
    setBarData([
      { metric: "MAE",  LSTM: m.lstm.mae,  XGBoost: m.xgboost.mae },
      { metric: "RMSE", LSTM: m.lstm.rmse, XGBoost: m.xgboost.rmse },
      { metric: "MAPE", LSTM: m.lstm.mape, XGBoost: m.xgboost.mape },
    ]);
    setRan(true);
  }

  const winner: "lstm" | "xgboost" = ran
    ? (met.xgboost.mae + met.xgboost.rmse + met.xgboost.mape < met.lstm.mae + met.lstm.rmse + met.lstm.mape ? "xgboost" : "lstm")
    : "xgboost";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Controls */}
      <Card>
        <SectionTitle>Comparison Settings</SectionTitle>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
          <div>
            <p style={{ color: "#444", fontSize: 10, fontFamily: MONO, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>Granularity</p>
            <div style={{ display: "flex", gap: 6 }}>
              {(["Hourly","Daily","Weekly","Monthly"] as Period[]).map((p) => (
                <Pill key={p} active={period === p} onClick={() => { setPeriod(p); setRan(false); }}>{p}</Pill>
              ))}
            </div>
          </div>
          <button
            onClick={compare}
            style={{
              background: "#1e1e1e", color: VIOLET, fontFamily: MONO, fontWeight: 700, fontSize: 13,
              border: `1px solid ${VIOLET}44`, borderRadius: 10, padding: "10px 24px", cursor: "pointer",
              transition: "all .15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = `${VIOLET}22`; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#1e1e1e"; }}
          >
            ◈ Compare Models
          </button>
        </div>
      </Card>

      {!ran && (
        <Card style={{ textAlign: "center", padding: "60px 20px" }}>
          <p style={{ color: "#333", fontFamily: MONO, fontSize: 13 }}>
            Select granularity and press <span style={{ color: VIOLET }}>Compare Models</span>
          </p>
        </Card>
      )}

      {ran && (
        <>
          {/* Model cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            {(["lstm","xgboost"] as const).map((m) => {
              const isWinner = winner === m;
              const color = m === "lstm" ? CYAN : VIOLET;
              const mt = met[m];
              return (
                <Card key={m} style={{ border: isWinner ? `1px solid ${G}44` : `1px solid ${BORDER}`, position: "relative", overflow: "hidden" }}>
                  {isWinner && (
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${G}, transparent)` }} />
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ color, fontFamily: MONO, fontSize: 16, fontWeight: 700, textTransform: "uppercase" }}>{m}</span>
                    {isWinner && (
                      <span style={{ background: `${G}22`, color: G, border: `1px solid ${G}44`, borderRadius: 20, fontSize: 10, fontFamily: MONO, fontWeight: 700, padding: "3px 10px" }}>
                        ★ RECOMMENDED
                      </span>
                    )}
                  </div>
                  <p style={{ color: "#444", fontSize: 11, fontFamily: SANS, marginBottom: 16, lineHeight: 1.6 }}>
                    {m === "lstm"
                      ? "Deep learning · Sequential time windows · LSTM recurrent layers · TensorFlow/Keras"
                      : "Gradient boosting · Lag + calendar features · Boosted decision trees · XGBoost library"}
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    {[
                      { k: "MAE",  v: mt.mae,  u: "kWh" },
                      { k: "RMSE", v: mt.rmse, u: "kWh" },
                      { k: "MAPE", v: mt.mape, u: "%" },
                    ].map((metric) => (
                      <div key={metric.k} style={{ background: "#0d0d0d", borderRadius: 10, padding: "12px 8px", textAlign: "center" }}>
                        <p style={{ color: "#444", fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>{metric.k}</p>
                        <p style={{ color: isWinner ? G : "#666", fontFamily: MONO, fontSize: 18, fontWeight: 700, marginBottom: 2 }}>{metric.v}</p>
                        <p style={{ color: "#333", fontSize: 9, fontFamily: MONO }}>{metric.u}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Bar chart */}
          <Card>
            <SectionTitle>Error Metrics — Side by Side</SectionTitle>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                <XAxis dataKey="metric" tick={{ fill: "#555", fontSize: 11, fontFamily: MONO }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#444", fontSize: 10, fontFamily: MONO }} axisLine={false} tickLine={false} width={44} />
                <Tooltip content={<Tip />} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: MONO, color: "#555" }} />
                <Bar dataKey="LSTM"    fill={CYAN}   radius={[4, 4, 0, 0]} />
                <Bar dataKey="XGBoost" fill={VIOLET} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Verdict */}
          <Card style={{ border: `1px solid ${G}33`, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 0% 50%, ${G}08 0%, transparent 60%)`, pointerEvents: "none" }} />
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `${G}22`, border: `1px solid ${G}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 20 }}>
                ★
              </div>
              <div>
                <p style={{ color: G, fontFamily: MONO, fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                  {winner === "xgboost" ? "XGBoost" : "LSTM"} is the Recommended Model
                </p>
                <p style={{ color: "#555", fontFamily: SANS, fontSize: 12, lineHeight: 1.7 }}>
                  Based on {period.toLowerCase()} consumption data, {winner === "xgboost" ? "XGBoost" : "LSTM"} achieves lower MAE, RMSE, and MAPE.
                  It is the more appropriate model for short-term electricity demand forecasting and institutional energy management at CSPC.
                  Training set: Jan 2023 – Dec 2024 · Test set: Jan 2025 – Dec 2025.
                </p>
              </div>
            </div>
          </Card>

          {/* Architecture comparison table */}
          <Card>
            <SectionTitle>Architecture Overview</SectionTitle>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["Parameter","LSTM","XGBoost"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "#444", fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Input type", "Sequential windows", "Feature matrix"],
                  ["Algorithm", "Recurrent neural network", "Gradient boosting trees"],
                  ["Library", "TensorFlow / Keras", "XGBoost + Scikit-learn"],
                  ["Key hyperparams", "Layers, units, epochs", "n_estimators, max_depth, lr"],
                  ["Feature engineering", "Normalization only", "Lags, calendar, rolling avg"],
                  ["Handles seasonality", "Implicitly (sequence)", "Explicitly (features)"],
                  ["Training time", "Slower", "Faster"],
                ].map(([param, lstm, xgb]) => (
                  <tr key={param} style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <td style={{ padding: "10px 12px", color: "#555", fontFamily: SANS }}>{param}</td>
                    <td style={{ padding: "10px 12px", color: CYAN,   fontFamily: MONO, fontSize: 11 }}>{lstm}</td>
                    <td style={{ padding: "10px 12px", color: VIOLET, fontFamily: MONO, fontSize: 11 }}>{xgb}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Root ──────────────────────────────────────────────────────────────────────
type Tab = "Live Monitor" | "Consumption" | "Forecast" | "Model Comparison";

const TAB_ICONS: Record<Tab, string> = {
  "Live Monitor":      "⚡",
  "Consumption":       "📊",
  "Forecast":          "📈",
  "Model Comparison":  "⚖",
};

export default function App() {
  const [tab, setTab] = useState<Tab>("Live Monitor");

  return (
    <div style={{ minHeight: "100%", background: "#0a0a0a", fontFamily: SANS, color: "#ccc" }}>

      {/* Header */}
      <header style={{
        background: "#0d0d0d", borderBottom: `1px solid ${BORDER}`,
        padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: `${G}22`, border: `1px solid ${G}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
            ⚡
          </div>
          <div>
            <p style={{ color: "#fff", fontWeight: 700, fontSize: 14, fontFamily: SANS }}>CSPC Energy Monitor App</p>
            <p style={{ color: "#444", fontSize: 11, fontFamily: MONO }}>Shelly Pro 3EM · 400A · Camarines Sur Polytechnic Colleges</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: 4, background: G, boxShadow: `0 0 6px ${G}` }} />
          <span style={{ color: "#444", fontFamily: MONO, fontSize: 11 }}>Online</span>
        </div>
      </header>

      {/* Tab bar */}
      <nav style={{ background: "#0d0d0d", borderBottom: `1px solid ${BORDER}`, padding: "0 24px", display: "flex", gap: 0, position: "sticky", top: 62, zIndex: 40, overflowX: "auto" }}>
        {(["Live Monitor","Consumption","Forecast","Model Comparison"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "14px 18px", fontFamily: SANS, fontSize: 13, fontWeight: 600,
              color: tab === t ? G : "#444",
              borderBottom: tab === t ? `2px solid ${G}` : "2px solid transparent",
              display: "flex", alignItems: "center", gap: 7,
              transition: "all .15s", whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontSize: 14 }}>{TAB_ICONS[t]}</span>
            {t}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
        {tab === "Live Monitor"     && <LiveMonitorTab />}
        {tab === "Consumption"      && <ConsumptionTab />}
        {tab === "Forecast"         && <ForecastTab />}
        {tab === "Model Comparison" && <ModelComparisonTab />}

        <footer style={{ marginTop: 48, paddingTop: 24, borderTop: `1px solid ${BORDER}`, textAlign: "center" }}>
          <p style={{ color: "#2a2a2a", fontFamily: MONO, fontSize: 11 }}>
            CSPC · College of Computer Studies · BS Computer Science · Jan 2026 · Romance · Namia · Sarcauga · Villamer
          </p>
        </footer>
      </main>
    </div>
  );
}
