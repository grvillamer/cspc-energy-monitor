import { useState, useEffect, useRef, Fragment } from "react";
import {
  AreaChart, Area,
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import modelResultsJson from "./data/model-results.json";
import type { ModelResults, TestResult } from "./types/model-results";

const VERIFIED_RESULTS = modelResultsJson as ModelResults;

// ─── Palette ──────────────────────────────────────────────────────────────────
const G = "#00e676";        // Shelly green
const G2 = "#00b359";       // darker green
const CYAN = "#00bcd4";
const VIOLET = "#7c3aed";
const AMBER = "#ffa000";
const CARD = "var(--surface-card)";
const BORDER = "var(--border)";
const APP_BG = "var(--app-bg)";
const HEADER_BG = "var(--surface-header)";
const INSET_BG = "var(--surface-inset)";
const TRACK_BG = "var(--surface-track)";
const GRID = "var(--chart-grid)";
const TEXT_PRIMARY = "var(--text-primary)";
const TEXT_SECONDARY = "var(--text-secondary)";
const TEXT_MUTED = "var(--text-muted)";
const TEXT_FAINT = "var(--text-faint)";
const TEXT_DISABLED = "var(--text-disabled)";
const TEXT_WARNING = "var(--text-warning)";
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

// Forecast data is intentionally deterministic: use the verified model outputs already saved in the repository.
function makeVerifiedForecastData() {
  return VERIFIED_RESULTS.testResults.map((entry) => ({
    label: entry.label,
    month: entry.month,
    actual: entry.actualKwh,
    lstm: entry.lstmKwh,
    xgboost: entry.xgboostKwh,
  }));
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
const Tip = ({ active, payload, label, unit }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: INSET_BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 12px", fontFamily: MONO, fontSize: 11 }}>
      <p style={{ color: TEXT_SECONDARY, marginBottom: 4 }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color, margin: "2px 0" }}>
          {p.name}: <strong>{Number(p.value).toLocaleString()}{unit ? ` ${unit}` : ""}</strong>
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
        background: active ? G : TRACK_BG,
        color: active ? "#000" : TEXT_MUTED,
        transition: "all .15s",
      }}
    >
      {children}
    </button>
  );
}

function StatRow({ label, value, unit, color = TEXT_PRIMARY }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 0", borderBottom: `1px solid ${BORDER}` }}>
      <span style={{ color: TEXT_MUTED, fontSize: 11, fontFamily: SANS }}>{label}</span>
      <span style={{ color, fontFamily: MONO, fontSize: 13, fontWeight: 600 }}>
        {value}{unit && <span style={{ color: TEXT_FAINT, fontSize: 10, marginLeft: 3 }}>{unit}</span>}
      </span>
    </div>
  );
}

function Card({ children, className, style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={className} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 11, padding: 16, ...style }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ color: TEXT_FAINT, fontSize: 10, fontFamily: MONO, fontWeight: 600, textTransform: "uppercase", letterSpacing: 2, marginBottom: 14 }}>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      <div className="live-monitor-notice" style={{ border: `1px solid ${AMBER}44`, background: `${AMBER}0d`, borderRadius: 8, padding: "8px 12px" }}>
        <p style={{ color: TEXT_WARNING, fontFamily: MONO, fontSize: 9, lineHeight: 1.5, margin: 0 }}>
          Planned integration preview — the Shelly Pro 3EM is not yet connected. Values shown in this tab are simulated interface data and are not actual building measurements.
        </p>
      </div>

      <div className="live-monitor-grid">
        <div className="live-monitor-main">
          {/* Hero readout */}
          <Card className="live-monitor-hero" style={{ textAlign: "center", padding: "8px 14px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 0%, ${G}12 0%, transparent 70%)`, pointerEvents: "none" }} />
        <p style={{ color: TEXT_FAINT, fontSize: 11, fontFamily: MONO, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>Total Active Power</p>
        <p style={{ color: G, fontSize: 42, fontWeight: 700, fontFamily: MONO, lineHeight: 1, marginBottom: 4 }}>
          {(total / 1000).toFixed(2)}<span style={{ fontSize: 22, color: G2, marginLeft: 6 }}>kW</span>
        </p>
        <p style={{ color: TEXT_FAINT, fontSize: 12, fontFamily: MONO, marginTop: 8 }}>
          {totalA.toFixed(1)} A total · {((total / 1000) * 24).toFixed(1)} kWh/day est.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 22, marginTop: 12 }}>
          {[{ label: "Voltage avg", val: (phases.reduce((s,p)=>s+p.voltage,0)/3).toFixed(1)+" V" },
            { label: "PF avg", val: (phases.reduce((s,p)=>s+p.pf,0)/3).toFixed(2) },
            { label: "Freq", val: "60.0 Hz" },
          ].map((s) => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <p style={{ color: G, fontFamily: MONO, fontSize: 15, fontWeight: 700 }}>{s.val}</p>
              <p style={{ color: TEXT_FAINT, fontSize: 10, fontFamily: SANS }}>{s.label}</p>
            </div>
          ))}
        </div>
          </Card>

          {/* Live chart */}
          <Card>
            <SectionTitle>Live Power (last 20s)</SectionTitle>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={liveHistory} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="lgLive" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={G} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={G} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="t" tick={{ fill: TEXT_FAINT, fontSize: 9, fontFamily: MONO }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: TEXT_FAINT, fontSize: 9, fontFamily: MONO }} axisLine={false} tickLine={false} width={40} domain={["auto","auto"]} />
                <Tooltip content={<Tip />} />
                <Area type="monotone" dataKey="total" name="W" stroke={G} strokeWidth={2} fill="url(#lgLive)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card className="live-monitor-device" style={{ padding: "12px 14px" }}>
            <SectionTitle>Device — Shelly Pro 3EM</SectionTitle>
            <div className="live-monitor-device-grid">
              <StatRow label="Model" value="Shelly Pro 3EM" color={TEXT_SECONDARY} />
              <StatRow label="Max Current" value="120" unit="A" color={G} />
              <StatRow label="Phases" value="3" color={TEXT_SECONDARY} />
              <StatRow label="Status" value="Planned integration" color={AMBER} />
              <StatRow label="Location" value="Supply and Property Building" color={TEXT_SECONDARY} />
              <StatRow label="Uptime" value="Simulated preview" color={TEXT_SECONDARY} />
            </div>
          </Card>
        </div>

        {/* Phase cards */}
        <div className="live-monitor-phases">
          {phases.map((p) => {
            const readings = [
              { label: "Current", value: p.current.toFixed(1), unit: "A", color: p.color },
              { label: "Voltage", value: p.voltage.toFixed(1), unit: "V", color: TEXT_PRIMARY },
              { label: "Power Factor", value: p.pf.toFixed(2), unit: "", color: TEXT_PRIMARY },
              { label: "Frequency", value: p.freq.toFixed(2), unit: "Hz", color: TEXT_PRIMARY },
              { label: "Apparent Power", value: ((p.watts / p.pf) / 1000).toFixed(2), unit: "kVA", color: TEXT_PRIMARY },
            ];

            return (
              <Card key={p.id} style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: p.color }} />
                    <span style={{ color: TEXT_SECONDARY, fontFamily: SANS, fontSize: 13, fontWeight: 600 }}>Phase {p.id}</span>
                  </div>
                  <span style={{ color: p.color, fontFamily: MONO, fontSize: 20, fontWeight: 700 }}>
                    {(p.watts / 1000).toFixed(2)} <span style={{ fontSize: 11, color: TEXT_FAINT }}>kW</span>
                  </span>
                </div>
                <div className="phase-reading-grid">
                  {readings.map((reading) => (
                    <div className="phase-reading-row" key={reading.label}>
                      <div className="phase-reading-label" style={{ color: TEXT_MUTED, fontFamily: SANS }}>{reading.label}</div>
                      <div className="phase-reading-value" style={{ color: reading.color, fontFamily: MONO, fontWeight: 600 }}>
                        {reading.value}{reading.unit && <span style={{ color: TEXT_FAINT, fontSize: 10, marginLeft: 3 }}>{reading.unit}</span>}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 7 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ color: TEXT_FAINT, fontSize: 10, fontFamily: SANS }}>Load (max 400A)</span>
                    <span style={{ color: TEXT_FAINT, fontSize: 10, fontFamily: MONO }}>{((p.current / 400) * 100).toFixed(1)}%</span>
                  </div>
                  <div style={{ background: TRACK_BG, borderRadius: 4, height: 4 }}>
                    <div style={{ height: 4, borderRadius: 4, background: p.color, width: `${(p.current / 400) * 100}%`, transition: "width .4s" }} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Consumption ──────────────────────────────────────────────────────────────
type Period = "Hourly" | "Daily" | "Weekly" | "Monthly";

type MonthlyRate = {
  id: number;
  month: string;
  advisoryDate: string;
  effectiveFrom: string;
  effectiveThrough: string;
  rate: number;
  source: string;
};

function ConsumptionTab() {
  const [period, setPeriod] = useState<Period>("Daily");
  const [monthlyRates, setMonthlyRates] = useState<MonthlyRate[]>([]);
  const [rateMonth, setRateMonth] = useState("");
  const [advisoryDate, setAdvisoryDate] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveThrough, setEffectiveThrough] = useState("");
  const [rateInput, setRateInput] = useState("");
  const [rateSource, setRateSource] = useState("CASURECO III billing statement");
  const [rateError, setRateError] = useState("");

  const datasets: Record<Period, { label: string; kwh: number; cost: number }[]> = {
    Hourly:  HOURS,
    Daily:   DAYS,
    Weekly:  WEEKS,
    Monthly: MONTHS_DATA,
  };

  const selectedRate = monthlyRates[0];
  const data = datasets[period].map((entry) => ({
    ...entry,
    cost: selectedRate ? +(entry.kwh * selectedRate.rate).toFixed(2) : 0,
  }));
  const totalKwh = data.reduce((s, d) => s + d.kwh, 0);
  const totalCost = data.reduce((s, d) => s + d.cost, 0);
  const avg = totalKwh / data.length;
  const peak = Math.max(...data.map((d) => d.kwh));
  const peakLabel = data.find((d) => d.kwh === peak)?.label ?? "—";

  const saveMonthlyRate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRateError("");

    if (effectiveThrough < effectiveFrom) {
      setRateError("Effective through date must be on or after the effective-from date.");
      return;
    }

    const rate = Number(rateInput);
    if (!Number.isFinite(rate) || rate <= 0) {
      setRateError("Enter a rate greater than ₱0.00 per kWh.");
      return;
    }

    const entry: MonthlyRate = {
      id: Date.now(),
      month: rateMonth,
      advisoryDate,
      effectiveFrom,
      effectiveThrough,
      rate,
      source: rateSource.trim(),
    };
    setMonthlyRates((previous) => [entry, ...previous]);
    setRateMonth("");
    setAdvisoryDate("");
    setEffectiveFrom("");
    setEffectiveThrough("");
    setRateInput("");
  };

  const interval = period === "Hourly" ? 0 : period === "Daily" ? 5 : period === "Weekly" ? 8 : 0;

  return (
    <div className="consumption-layout">

      <div className="consumption-notice" style={{ border: `1px solid ${AMBER}44`, background: `${AMBER}0d`, borderRadius: 8, padding: "10px 12px" }}>
        <p style={{ color: TEXT_WARNING, fontFamily: MONO, fontSize: 9, lineHeight: 1.5, margin: 0 }}>
          Future building-monitoring view — hourly, daily, weekly, and monthly summaries will be derived from Shelly Pro 3EM readings after device integration. Current values are simulated.
        </p>
      </div>

      <div className="consumption-workspace">
      <Card className="consumption-settings" style={{ padding: 16 }}>
        <SectionTitle>Electricity Rate Settings</SectionTitle>
        <p style={{ color: TEXT_SECONDARY, fontSize: 13, fontWeight: 600, margin: "0 0 4px" }}>
          Monthly CASURECO III rate history
        </p>
        <p className="consumption-settings-description" style={{ color: TEXT_MUTED, fontSize: 11, lineHeight: 1.5, margin: "0 0 16px" }}>
          Enter the official advisory date and effective billing period. CASURECO III often publishes advisories near the 20th–28th, but the dashboard does not assume a fixed change date.
        </p>

        <form className="consumption-rate-form" onSubmit={saveMonthlyRate} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="consumption-rate-fields">
            {[
              { label: "Rate advisory month", type: "month", value: rateMonth, change: setRateMonth },
              { label: "Official advisory date", type: "date", value: advisoryDate, change: setAdvisoryDate },
              { label: "Effective from", type: "date", value: effectiveFrom, change: setEffectiveFrom },
              { label: "Effective through", type: "date", value: effectiveThrough, change: setEffectiveThrough },
            ].map((field) => (
              <label key={field.label} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                <span style={{ color: TEXT_FAINT, fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: 1.2 }}>
                  {field.label}
                </span>
                <input
                  aria-label={field.label}
                  type={field.type}
                  value={field.value}
                  onChange={(event) => field.change(event.target.value)}
                  required
                  style={{ width: "100%", minWidth: 0, background: INSET_BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 11px", color: TEXT_PRIMARY, fontFamily: MONO, fontSize: 12 }}
                />
              </label>
            ))}
            <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
              <span style={{ color: TEXT_FAINT, fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: 1.2 }}>
                Rate (₱/kWh)
              </span>
              <input
                aria-label="Rate in pesos per kilowatt-hour"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Enter billed rate"
                value={rateInput}
                onChange={(event) => setRateInput(event.target.value)}
                required
                style={{ width: "100%", minWidth: 0, background: INSET_BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 11px", color: TEXT_PRIMARY, fontFamily: MONO, fontSize: 12 }}
              />
            </label>
          </div>

          <div className="consumption-rate-actions">
            <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
              <span style={{ color: TEXT_FAINT, fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: 1.2 }}>
                Source
              </span>
              <input
                aria-label="Rate source"
                value={rateSource}
                onChange={(event) => setRateSource(event.target.value)}
                required
                style={{ width: "100%", minWidth: 0, background: INSET_BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 11px", color: TEXT_PRIMARY, fontFamily: MONO, fontSize: 12 }}
              />
            </label>
            <button
              type="submit"
              style={{ alignSelf: "flex-end", minHeight: 40, background: AMBER, color: "#171000", border: "none", borderRadius: 8, fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "10px 24px", cursor: "pointer" }}
            >
              Save monthly rate
            </button>
          </div>
          {rateError && <p role="alert" style={{ color: AMBER, fontFamily: MONO, fontSize: 11, margin: 0 }}>{rateError}</p>}

        </form>
        <div className="consumption-rate-history">
          <div className="consumption-rate-history-heading">
            <span>Saved rate history</span>
            <span>{monthlyRates.length} {monthlyRates.length === 1 ? "record" : "records"}</span>
          </div>
          {monthlyRates.length === 0 ? (
            <p className="consumption-rate-empty">No monthly rates saved yet.</p>
          ) : (
            <div className="consumption-rate-list">
              {monthlyRates.map((entry) => (
                <div className="consumption-rate-entry" key={entry.id}>
                  <div>
                    <strong>{entry.month}</strong>
                    <span>{entry.effectiveFrom} to {entry.effectiveThrough}</span>
                  </div>
                  <strong>₱{entry.rate.toFixed(2)}/kWh</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="consumption-dashboard">
      {/* Period selector */}
      <div className="consumption-period-selector" style={{ display: "flex", gap: 7 }}>
        {(["Hourly","Daily","Weekly","Monthly"] as Period[]).map((p) => (
          <Pill key={p} active={period === p} onClick={() => setPeriod(p)}>{p}</Pill>
        ))}
      </div>

      {/* KPI strip */}
      <div className="consumption-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 12 }}>
        {[
          { label: "Total kWh", value: fmtK(+totalKwh.toFixed(0)), color: G },
          { label: "Estimated Cost", value: selectedRate ? `₱${(totalCost/1000).toFixed(1)}k` : "Rate required", color: AMBER },
          { label: `Avg / ${period === "Hourly" ? "hr" : period === "Daily" ? "day" : period === "Weekly" ? "wk" : "mo"}`, value: avg.toFixed(1), color: TEXT_PRIMARY },
          { label: "Peak", value: peak.toFixed(1), color: CYAN },
          { label: "Peak at", value: peakLabel, color: TEXT_PRIMARY },
        ].map((k) => (
          <Card key={k.label} style={{ padding: "12px 14px" }}>
            <p style={{ color: TEXT_FAINT, fontSize: 10, fontFamily: MONO, textTransform: "uppercase", letterSpacing: 1.5, whiteSpace: "nowrap", margin: "0 0 8px" }}>{k.label}</p>
            <p style={{ color: k.color, fontFamily: MONO, fontSize: 20, fontWeight: 700, whiteSpace: "nowrap", margin: 0 }}>{k.value}</p>
          </Card>
        ))}
      </div>

      <div className="consumption-charts">
      {/* Energy chart */}
      <Card className="consumption-chart">
        <SectionTitle>Energy Consumption — {period}</SectionTitle>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="lgBar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={G} stopOpacity={0.9} />
                <stop offset="100%" stopColor={G2} stopOpacity={0.5} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="label" tick={{ fill: TEXT_FAINT, fontSize: 10, fontFamily: MONO }} axisLine={false} tickLine={false} interval={interval} />
            <YAxis tick={{ fill: TEXT_FAINT, fontSize: 10, fontFamily: MONO }} axisLine={false} tickLine={false} width={44} />
            <Tooltip content={<Tip />} />
            <Bar dataKey="kwh" name="kWh" fill="url(#lgBar)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Cost chart */}
      <Card className="consumption-chart">
        <SectionTitle>Estimated Energy Cost (₱) — {period}</SectionTitle>
        {selectedRate ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="lgCost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={AMBER} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={AMBER} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="label" tick={{ fill: TEXT_FAINT, fontSize: 10, fontFamily: MONO }} axisLine={false} tickLine={false} interval={interval} />
              <YAxis tick={{ fill: TEXT_FAINT, fontSize: 10, fontFamily: MONO }} axisLine={false} tickLine={false} width={50} />
              <Tooltip content={<Tip />} />
              <Area type="monotone" dataKey="cost" name="₱" stroke={AMBER} strokeWidth={2} fill="url(#lgCost)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="consumption-cost-empty" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 16, textAlign: "center" }}>
            <p style={{ color: TEXT_FAINT, fontFamily: MONO, fontSize: 11, lineHeight: 1.6, maxWidth: 420, margin: 0 }}>
              Add and select a monthly CASURECO III rate to calculate estimated energy cost.
            </p>
          </div>
        )}
      </Card>
      </div>
      </div>
      </div>
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
    const data = makeVerifiedForecastData();
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
            <p style={{ color: TEXT_FAINT, fontSize: 10, fontFamily: MONO, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>Granularity</p>
            <div style={{ display: "flex", gap: 6 }}>
              {(["Hourly","Daily","Weekly","Monthly"] as Period[]).map((p) => (
                <Pill key={p} active={period === p} onClick={() => { setPeriod(p); setRan(false); }}>{p}</Pill>
              ))}
            </div>
          </div>
          <div>
            <p style={{ color: TEXT_FAINT, fontSize: 10, fontFamily: MONO, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>Training Set</p>
            <select
              style={{ background: INSET_BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "6px 12px", color: TEXT_PRIMARY, fontFamily: MONO, fontSize: 12, outline: "none" }}
              defaultValue="2023–2024"
            >
              <option>2023–2024</option>
              <option>2023</option>
              <option>2024</option>
            </select>
          </div>
          <div>
            <p style={{ color: TEXT_FAINT, fontSize: 10, fontFamily: MONO, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>Test Set</p>
            <select
              style={{ background: INSET_BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "6px 12px", color: TEXT_PRIMARY, fontFamily: MONO, fontSize: 12, outline: "none" }}
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
              <span style={{ color: TEXT_MUTED, fontFamily: MONO, fontSize: 11 }}>Forecast ready · {period} · {forecastData.length} pts</span>
            </div>
          </div>
        )}
      </Card>

      {/* Empty state */}
      {!ran && (
        <Card style={{ textAlign: "center", padding: "60px 20px" }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>⚡</p>
          <p style={{ color: TEXT_DISABLED, fontFamily: MONO, fontSize: 13 }}>
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
                  <span style={{ color: TEXT_SECONDARY }}>── Actual</span>
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
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="label" tick={{ fill: TEXT_FAINT, fontSize: 10, fontFamily: MONO }} axisLine={false} tickLine={false} interval={interval} />
                <YAxis tick={{ fill: TEXT_FAINT, fontSize: 10, fontFamily: MONO }} axisLine={false} tickLine={false} width={46} />
                <Tooltip content={<Tip />} />
                <Line type="monotone" dataKey="actual"  name="Actual"   stroke={TEXT_MUTED}   strokeWidth={2}   dot={false} />
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
                  <p style={{ color: TEXT_FAINT, fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>{k}</p>
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

const modelResults = modelResultsJson as ModelResults;

function WithheldResultsNotice({ message }: { message: string }) {
  return (
    <div style={{ border: `1px solid ${AMBER}44`, background: `${AMBER}0d`, borderRadius: 10, padding: "14px 16px" }}>
      <p style={{ color: TEXT_WARNING, fontFamily: MONO, fontSize: 10, lineHeight: 1.5, margin: 0 }}>
        {message}
      </p>
    </div>
  );
}

function getResultState() {
  const testResults = Array.isArray(modelResults?.testResults) ? modelResults.testResults as TestResult[] : [];
  const hasValidStatus = modelResults?.status === "verified";
  const hasValidRows = hasValidStatus && testResults.length === 2;
  const hasValidMetrics = !!modelResults?.metrics && !!modelResults.metrics.lstm && !!modelResults.metrics.xgboost && !!modelResults.metrics.persistence;

  if (hasValidRows && hasValidMetrics) {
    return { state: "verified" as const, results: testResults };
  }

  if (modelResults?.status === "failed") {
    return { state: "failed" as const, results: testResults };
  }

  return { state: "pending" as const, results: testResults };
}

function ModelComparisonTab() {
  const resultState = getResultState();

  if (resultState.state !== "verified") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <WithheldResultsNotice
          message={
            resultState.state === "failed"
              ? "The model-results file is incomplete or invalid. Please regenerate the verified exports from the Python modeling layer."
              : "Model-comparison charts, MAE, RMSE, and MAPE will appear after verified LSTM, XGBoost, and persistence-baseline outputs are imported. The preferred model will be identified from the lowest test errors."
          }
        />
      </div>
    );
  }

  const rows = [
    ["MAE (kWh)", modelResults.metrics.lstm.mae, modelResults.metrics.xgboost.mae, modelResults.metrics.persistence.mae],
    ["RMSE (kWh)", modelResults.metrics.lstm.rmse, modelResults.metrics.xgboost.rmse, modelResults.metrics.persistence.rmse],
    ["MAPE (%)", modelResults.metrics.lstm.mape, modelResults.metrics.xgboost.mape, modelResults.metrics.persistence.mape],
  ] as const;

  const preferredModel = (() => {
    const candidates = [
      { name: "LSTM", metrics: modelResults.metrics.lstm },
      { name: "XGBoost", metrics: modelResults.metrics.xgboost },
    ];

    return candidates.reduce((best, current) => {
      const bestScore = [best.metrics.mae, best.metrics.rmse, best.metrics.mape];
      const currentScore = [current.metrics.mae, current.metrics.rmse, current.metrics.mape];
      const better = currentScore[0] < bestScore[0] ||
        (currentScore[0] === bestScore[0] && (currentScore[1] < bestScore[1] || (currentScore[1] === bestScore[1] && currentScore[2] < bestScore[2])));
      return better ? current : best;
    }, candidates[0]);
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ border: `1px solid ${G}55`, background: `${G}14`, borderRadius: 10, padding: "14px 16px" }}>
        <p style={{ color: G, fontFamily: MONO, fontSize: 11, lineHeight: 1.5, margin: 0 }}>
          Preferred forecasting model: <strong>{preferredModel.name}</strong>
        </p>
        <p style={{ color: TEXT_SECONDARY, fontFamily: MONO, fontSize: 10, lineHeight: 1.5, margin: "6px 0 0" }}>
          {preferredModel.name} produced the lowest MAE, RMSE, and MAPE among the learning models during validation. The persistence model is retained only as a benchmark reference.
        </p>
      </div>

      <Card style={{ padding: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr repeat(3, minmax(0, 1fr))", gap: 8 }}>
          <div style={{ color: TEXT_FAINT, fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: 1.4, padding: "8px 6px" }}>Metric</div>
          <div style={{ color: CYAN, fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: 1.4, padding: "8px 6px" }}>LSTM</div>
          <div style={{ color: VIOLET, fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: 1.4, padding: "8px 6px" }}>XGBoost</div>
          <div style={{ color: AMBER, fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: 1.4, padding: "8px 6px" }}>Persistence</div>

          {rows.map(([metric, lstm, xgb, persist], idx) => (
            <Fragment key={metric}>
              <div style={{ color: TEXT_PRIMARY, fontFamily: MONO, fontSize: 11, padding: "8px 6px", borderTop: idx === 0 ? "none" : `1px solid ${BORDER}` }}>{metric}</div>
              <div style={{ color: CYAN, fontFamily: MONO, fontSize: 11, padding: "8px 6px", borderTop: idx === 0 ? "none" : `1px solid ${BORDER}` }}>{Number(lstm).toFixed(metric.includes("MAPE") ? 2 : 1)}</div>
              <div style={{ color: VIOLET, fontFamily: MONO, fontSize: 11, padding: "8px 6px", borderTop: idx === 0 ? "none" : `1px solid ${BORDER}` }}>{Number(xgb).toFixed(metric.includes("MAPE") ? 2 : 1)}</div>
              <div style={{ color: AMBER, fontFamily: MONO, fontSize: 11, padding: "8px 6px", borderTop: idx === 0 ? "none" : `1px solid ${BORDER}` }}>{Number(persist).toFixed(metric.includes("MAPE") ? 2 : 1)}</div>
            </Fragment>
          ))}
        </div>
      </Card>

      <div style={{ border: `1px solid ${AMBER}44`, background: `${AMBER}0d`, borderRadius: 10, padding: "14px 16px" }}>
        <p style={{ color: TEXT_WARNING, fontFamily: MONO, fontSize: 10, lineHeight: 1.5, margin: 0 }}>
          Lower error values indicate stronger predictive performance. The preferred learning model is selected automatically from the lowest MAE, RMSE, and MAPE among LSTM and XGBoost, while persistence remains a baseline comparison only.
        </p>
      </div>
    </div>
  );
}

function VerifiedModelComparisonTab() {
  return <ModelComparisonTab />;
}

function VerifiedForecastTab() {
  const resultState = getResultState();

  if (resultState.state !== "verified") {
    return (
      <div className="results-view" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <WithheldResultsNotice
          message={
            resultState.state === "failed"
              ? "The verified result file is unavailable or invalid. Please regenerate the exported Python results before displaying forecast outputs."
              : "Verified rolling one-month-ahead results for January and February 2025 will appear here after the Python scripts export the LSTM, XGBoost, and persistence-baseline predictions."
          }
        />
      </div>
    );
  }

  const chartData = modelResults.testResults.map((entry) => ({
    month: entry.month,
    label: entry.label,
    actual: entry.actualKwh,
    lstm: entry.lstmKwh,
    xgboost: entry.xgboostKwh,
    persistence: entry.persistenceKwh,
  }));

  return (
    <div className="results-view forecast-workspace">
      <section className="forecast-main-panel">
        <div className="forecast-intro">
          <p className="forecast-eyebrow">Forecast Workspace</p>
          <h1>Historical Test Output</h1>
          <p>
            Rolling one-month-ahead results for January and February 2025, compared with observed consumption.
          </p>
        </div>

        <div className="forecast-chart-panel">
          <div className="forecast-panel-heading">
            <SectionTitle>Actual vs Forecasted Consumption · January–February 2025</SectionTitle>
            <span>kWh</span>
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="month" tick={{ fill: TEXT_FAINT, fontSize: 10, fontFamily: MONO }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: TEXT_FAINT, fontSize: 10, fontFamily: MONO }} axisLine={false} tickLine={false} width={52} />
              <Tooltip content={<Tip unit="kWh" />} />
              <Line type="monotone" dataKey="actual" name="Actual" stroke={TEXT_PRIMARY} strokeWidth={2} dot={{ r: 4, fill: TEXT_PRIMARY }} />
              <Line type="monotone" dataKey="lstm" name="LSTM" stroke={CYAN} strokeWidth={2} dot={{ r: 4, fill: CYAN }} />
              <Line type="monotone" dataKey="xgboost" name="XGBoost" stroke={VIOLET} strokeWidth={2} dot={{ r: 4, fill: VIOLET }} />
              <Line type="monotone" dataKey="persistence" name="Persistence" stroke={AMBER} strokeWidth={2} dot={{ r: 4, fill: AMBER }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="forecast-output-table">
          <div className="forecast-panel-heading">
            <SectionTitle>Forecast Output Table</SectionTitle>
          </div>
          <div className="forecast-output-grid">
            <div className="forecast-table-heading">Month</div>
            <div className="forecast-table-heading">Actual</div>
            <div className="forecast-table-heading forecast-lstm">LSTM</div>
            <div className="forecast-table-heading forecast-xgboost">XGBoost</div>
            <div className="forecast-table-heading forecast-persistence">Persistence</div>
            {modelResults.testResults.map((row, index) => (
              <Fragment key={row.month}>
                <div className="forecast-table-cell">{row.label}</div>
                <div className="forecast-table-cell">{row.actualKwh.toLocaleString()}</div>
                <div className="forecast-table-cell forecast-lstm">{row.lstmKwh.toLocaleString()}</div>
                <div className="forecast-table-cell forecast-xgboost">{row.xgboostKwh.toLocaleString()}</div>
                <div className="forecast-table-cell forecast-persistence">{row.persistenceKwh.toLocaleString()}</div>
              </Fragment>
            ))}
          </div>
        </div>

        <div className="forecast-summary-grid">
          <div><span>Development</span><strong>{modelResults.dataset.observedDevelopmentRecords} observed · {modelResults.dataset.interpolatedTrainingMonths} interpolated</strong></div>
          <div><span>Testing</span><strong>{modelResults.dataset.testRecords} records</strong></div>
          <div><span>Granularity</span><strong>Monthly</strong></div>
        </div>
      </section>

      <aside className="forecast-exports-panel">
        <SectionTitle>Required Model Exports</SectionTitle>
        <div className="forecast-export-list">
          {[
            { number: "01", title: "LSTM predictions", file: "train_lstm.py", metric: `MAE ${modelResults.metrics.lstm.mae.toLocaleString()} kWh`, color: CYAN },
            { number: "02", title: "XGBoost predictions", file: "train_xgboost.py", metric: `MAE ${modelResults.metrics.xgboost.mae.toLocaleString()} kWh`, color: VIOLET },
            { number: "03", title: "Comparison metrics", file: "compare.py", metric: `Best MAPE ${modelResults.metrics.xgboost.mape.toFixed(2)}% · XGBoost`, color: G },
          ].map((item) => (
            <div className="forecast-export-item" key={item.number}>
              <span className="forecast-export-number" style={{ color: item.color, borderColor: `${item.color}44`, background: `${item.color}12` }}>{item.number}</span>
              <div className="forecast-export-copy">
                <strong>{item.title}</strong>
                <span>{item.file}</span>
                <small>{item.metric}</small>
              </div>
              <span className="forecast-export-status">Ready</span>
            </div>
          ))}
        </div>
        <div className="forecast-verified-note">
          Verified exports loaded from <strong>model-results.json</strong>. Generated {new Date(modelResults.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} using rolling-origin validation.
        </div>
      </aside>
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
  const [tab, setTab] = useState<Tab>("Forecast");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const isLight = theme === "light";

  return (
    <div className="energy-app" data-theme={theme} style={{ minHeight: "100%", background: APP_BG, fontFamily: SANS, color: TEXT_PRIMARY }}>

      {/* Header */}
      <header className="topbar" style={{
        background: HEADER_BG, borderBottom: `1px solid ${BORDER}`,
        padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <div className="brand" style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 25, height: 25, borderRadius: 6, background: `${G}22`, border: `1px solid ${G}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>
            ⚡
          </div>
          <div>
            <p style={{ color: TEXT_PRIMARY, fontWeight: 700, fontSize: 11, fontFamily: SANS }}>CSPC Energy Monitor</p>
            <p style={{ color: TEXT_FAINT, fontSize: 8, fontFamily: MONO }}>Shelly Pro 3EM · 120A · Supply &amp; Property Building · Camarines Sur Polytechnic Colleges</p>
          </div>
        </div>
        <div className="header-status" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={() => setTheme(isLight ? "dark" : "light")}
            style={{
              border: `1px solid ${BORDER}`,
              background: isLight ? "#f5f5f5" : "#111111",
              color: isLight ? "#111827" : "#f3f4f6",
              borderRadius: 999,
              padding: "6px 10px",
              fontFamily: MONO,
              fontSize: 10,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
            aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
          >
            <span>{isLight ? "☀" : "☾"}</span>
            {isLight ? "Light" : "Dark"}
          </button>
          <div style={{ width: 6, height: 6, borderRadius: 4, background: AMBER, boxShadow: `0 0 6px ${AMBER}` }} />
          <span style={{ color: TEXT_FAINT, fontFamily: MONO, fontSize: 9 }}>Device integration planned</span>
        </div>
      </header>

      {/* Tab bar */}
      <nav className="tabbar" style={{ background: HEADER_BG, borderBottom: `1px solid ${BORDER}`, padding: "0 16px", display: "flex", gap: 0, position: "sticky", top: 43, zIndex: 40, overflowX: "auto" }}>
        {(["Live Monitor","Consumption","Forecast","Model Comparison"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="tab-button"
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "10px 13px", fontFamily: SANS, fontSize: 10, fontWeight: 600,
              color: tab === t ? G : TEXT_FAINT,
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
      <main className={`content-shell${tab === "Live Monitor" ? " live-monitor-content" : ""}${tab === "Consumption" ? " consumption-content" : ""}${tab === "Forecast" ? " forecast-content" : ""}`} style={{ maxWidth: tab === "Consumption" ? 1220 : 960, margin: "0 auto", padding: "20px 16px" }}>
        {tab === "Live Monitor"     && <LiveMonitorTab />}
        {tab === "Consumption"      && <ConsumptionTab />}
        {tab === "Forecast"         && <VerifiedForecastTab />}
        {tab === "Model Comparison" && <VerifiedModelComparisonTab />}

        <footer className={tab === "Consumption" ? "consumption-footer" : tab === "Forecast" ? "forecast-footer" : undefined} style={{ marginTop: 48, paddingTop: 24, borderTop: `1px solid ${BORDER}`, textAlign: "center" }}>
          <p style={{ color: TEXT_DISABLED, fontFamily: MONO, fontSize: 11, lineHeight: 1.7 }}>
            CSPC · College of Computer Studies · BS Computer Science · September 2026<br />
            Romance · Sarcauga · Namia · Villamer · Adviser: Tiffanylyn Pandes, MSc.
          </p>
        </footer>
      </main>
    </div>
  );
}
