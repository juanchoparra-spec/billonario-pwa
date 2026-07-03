import React, { useState, useMemo, useEffect } from "react";
import { Plus, ArrowDownToLine, ArrowUpFromLine, X, Check, TrendingUp, TrendingDown, Wallet, Pencil, Trash2, Download, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "./supabaseClient";

// ---------- Theme ----------
const THEME = {
  bg: "#D9E6F7",
  panelBg: "#FFFFFF",
  border: "#C2D6EE",
  text: "#000000",
  textMuted: "#3A3F47",
  textFaint: "#6B7280",
  inputBg: "#F0F5FC",
  scanline: "linear-gradient(90deg, transparent, #4C8DFF, transparent)",
  brandMark: "#2E6BD6",
  green: "#1FAE63",
  red: "#E0524D",
  shadow: "rgba(46, 107, 214, 0.15)",
};

// ---------- Helpers ----------
const fmtMoney = (n) =>
  (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtPct = (n) => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";

const todayStr = () => new Date().toISOString().slice(0, 10);

const uid = () => Math.random().toString(36).slice(2, 10);

// ---------- Field configs per asset type ----------
const FIELD_CONFIG = {
  opciones: {
    label: "Opciones",
    accent: "#0FB8A6", // teal
    openFields: [
      { key: "ticker", label: "Ticker", type: "text", placeholder: "AAPL" },
      { key: "tipo", label: "Tipo", type: "select", options: ["Call", "Put"] },
      { key: "strike", label: "Strike", type: "number", placeholder: "0.00" },
      { key: "contratos", label: "Contratos", type: "number", placeholder: "1" },
      { key: "prima", label: "Prima pagada (por contrato)", type: "number", placeholder: "0.00" },
      { key: "vencimiento", label: "Vencimiento", type: "date" },
    ],
    closeFields: [
      { key: "primaCierre", label: "Prima recibida (por contrato)", type: "number", placeholder: "0.00" },
    ],
    computeOpenCost: (r) => Number(r.prima || 0) * Number(r.contratos || 0) * 100,
    computeCloseValue: (r) => Number(r.primaCierre || 0) * Number(r.contratos || 0) * 100,
    summaryLine: (r) => `${r.ticker || "?"} ${r.tipo || ""} ${r.strike || ""} x${r.contratos || 0}`,
  },
  acciones: {
    label: "Acciones",
    accent: "#2E6BD6", // blue
    openFields: [
      { key: "ticker", label: "Ticker", type: "text", placeholder: "TSLA" },
      { key: "cantidad", label: "Cantidad de acciones", type: "number", placeholder: "10" },
      { key: "precioCompra", label: "Precio de compra", type: "number", placeholder: "0.00" },
    ],
    closeFields: [
      { key: "precioVenta", label: "Precio de venta", type: "number", placeholder: "0.00" },
    ],
    computeOpenCost: (r) => Number(r.precioCompra || 0) * Number(r.cantidad || 0),
    computeCloseValue: (r) => Number(r.precioVenta || 0) * Number(r.cantidad || 0),
    summaryLine: (r) => `${r.ticker || "?"} x${r.cantidad || 0} @ ${fmtMoney(Number(r.precioCompra || 0))}`,
  },
  deportes: {
    label: "Deportes",
    accent: "#E08A2E", // orange
    openFields: [
      { key: "evento", label: "Evento / Equipo", type: "text", placeholder: "Yankees vs Red Sox" },
      { key: "monto", label: "Monto apostado", type: "number", placeholder: "0.00" },
    ],
    closeFields: [
      { key: "resultado", label: "Resultado", type: "select", options: ["Ganada", "Perdida", "Push", "Cash out"] },
      { key: "montoRetorno", label: "Monto recibido", type: "number", placeholder: "0.00", showIf: (r) => r.resultado !== "Perdida" },
    ],
    computeOpenCost: (r) => Number(r.monto || 0),
    computeCloseValue: (r) => {
      if (r.resultado === "Perdida") return 0;
      return Number(r.montoRetorno || 0);
    },
    summaryLine: (r) => `${r.evento || "?"}`,
  },
};

const TYPES = ["opciones", "acciones", "deportes"];

// ---------- Main Component ----------
export default function TradeLog() {
  const [activeTab, setActiveTab] = useState("opciones");
  const [trades, setTrades] = useState({ opciones: [], acciones: [], deportes: [] });
  const [movements, setMovements] = useState({ opciones: [], acciones: [], deportes: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // New trade form state
  const [newType, setNewType] = useState("opciones");
  const [form, setForm] = useState({});
  const [editingOpenId, setEditingOpenId] = useState(null);
  const [closingId, setClosingId] = useState(null);
  const [closeForm, setCloseForm] = useState({});
  const [editingClosedId, setEditingClosedId] = useState(null);
  const [movForm, setMovForm] = useState({ tipo: "Abono", monto: "", fecha: todayStr() });
  const [showMov, setShowMov] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // { kind: 'trade'|'mov', type, id }

  // ---------- Initial load from Supabase ----------
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [tradesRes, movsRes] = await Promise.all([
        supabase.from("trades").select("*").order("created_at", { ascending: false }),
        supabase.from("movements").select("*").order("fecha", { ascending: false }),
      ]);

      if (tradesRes.error || movsRes.error) {
        setError((tradesRes.error || movsRes.error).message);
        setLoading(false);
        return;
      }

      const groupedTrades = { opciones: [], acciones: [], deportes: [] };
      for (const row of tradesRes.data) {
        groupedTrades[row.type].push({
          id: row.id,
          status: row.status,
          fechaEntrada: row.fecha_entrada,
          fechaSalida: row.fecha_salida,
          data: row.data,
          cost: row.cost,
          closeValue: row.close_value,
          pnl: row.pnl,
          pct: row.pct,
        });
      }

      const groupedMovs = { opciones: [], acciones: [], deportes: [] };
      for (const row of movsRes.data) {
        groupedMovs[row.type].push({
          id: row.id,
          tipo: row.tipo,
          monto: row.monto,
          fecha: row.fecha,
        });
      }

      setTrades(groupedTrades);
      setMovements(groupedMovs);
      setLoading(false);
    };
    load();
  }, []);

  // ---------- Balance calculation ----------
  const balances = useMemo(() => {
    const result = {};
    for (const t of TYPES) {
      const mov = movements[t].reduce((sum, m) => sum + (m.tipo === "Abono" ? m.monto : -m.monto), 0);
      const closedPnl = trades[t]
        .filter((r) => r.status === "closed")
        .reduce((sum, r) => sum + r.pnl, 0);
      const openCost = trades[t]
        .filter((r) => r.status === "open")
        .reduce((sum, r) => sum + r.cost, 0);
      result[t] = { available: mov + closedPnl - openCost, deposited: mov, closedPnl, openCost };
    }
    return result;
  }, [trades, movements]);

  // ---------- Handlers ----------
  const handleAddTrade = async () => {
    const config = FIELD_CONFIG[newType];
    const cost = config.computeOpenCost(form);
    if (!cost || cost <= 0) return;
    const fechaEntrada = form.fecha || todayStr();
    const dataPayload = { ...form };

    const { data, error: insertError } = await supabase
      .from("trades")
      .insert({
        type: newType,
        status: "open",
        fecha_entrada: fechaEntrada,
        fecha_salida: null,
        data: dataPayload,
        cost,
        close_value: null,
        pnl: null,
        pct: null,
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      return;
    }

    const entry = {
      id: data.id,
      status: "open",
      fechaEntrada: data.fecha_entrada,
      data: data.data,
      cost: data.cost,
    };
    setTrades((prev) => ({ ...prev, [newType]: [entry, ...prev[newType]] }));
    setForm({});
  };

  const openCloseDialog = (id) => {
    setClosingId(id);
    setCloseForm({ fechaSalida: todayStr() });
  };

  const handleConfirmClose = async (type) => {
    const config = FIELD_CONFIG[type];
    const r = trades[type].find((x) => x.id === closingId);
    if (!r) return;
    const mergedData = { ...r.data, ...closeForm };
    const closeValue = config.computeCloseValue(mergedData);
    const pnl = closeValue - r.cost;
    const pct = r.cost > 0 ? (pnl / r.cost) * 100 : 0;
    const fechaSalida = closeForm.fechaSalida || todayStr();

    const { error: updateError } = await supabase
      .from("trades")
      .update({
        status: "closed",
        data: mergedData,
        fecha_salida: fechaSalida,
        close_value: closeValue,
        pnl,
        pct,
      })
      .eq("id", closingId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setTrades((prev) => ({
      ...prev,
      [type]: prev[type].map((x) =>
        x.id !== closingId ? x : { ...x, status: "closed", data: mergedData, fechaSalida, closeValue, pnl, pct }
      ),
    }));
    setClosingId(null);
    setCloseForm({});
  };

  const handleAddMovement = async (type) => {
    const monto = Number(movForm.monto || 0);
    if (!monto || monto <= 0) return;
    const fecha = movForm.fecha || todayStr();

    const { data, error: insertError } = await supabase
      .from("movements")
      .insert({ type, tipo: movForm.tipo, monto, fecha })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setMovements((prev) => ({
      ...prev,
      [type]: [{ id: data.id, tipo: data.tipo, monto: data.monto, fecha: data.fecha }, ...prev[type]],
    }));
    setMovForm({ tipo: "Abono", monto: "", fecha: todayStr() });
    setShowMov(false);
  };

  // ---------- Edit open position ----------
  const startEditOpen = (r) => {
    setEditingOpenId(r.id);
    setForm({ ...r.data, fecha: r.fechaEntrada });
    setNewType(activeTab);
  };

  const handleSaveEditOpen = async () => {
    const config = FIELD_CONFIG[activeTab];
    const cost = config.computeOpenCost(form);
    if (!cost || cost <= 0) return;
    const fechaEntrada = form.fecha || todayStr();

    const { error: updateError } = await supabase
      .from("trades")
      .update({ fecha_entrada: fechaEntrada, data: { ...form }, cost })
      .eq("id", editingOpenId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setTrades((prev) => ({
      ...prev,
      [activeTab]: prev[activeTab].map((r) =>
        r.id === editingOpenId ? { ...r, fechaEntrada, data: { ...form }, cost } : r
      ),
    }));
    setEditingOpenId(null);
    setForm({});
  };

  const cancelEditOpen = () => {
    setEditingOpenId(null);
    setForm({});
  };

  // ---------- Edit closed position ----------
  const startEditClosed = (r) => {
    setEditingClosedId(r.id);
    setCloseForm({ ...r.data, fechaSalida: r.fechaSalida });
  };

  const handleSaveEditClosed = async (type) => {
    const config = FIELD_CONFIG[type];
    const r = trades[type].find((x) => x.id === editingClosedId);
    if (!r) return;
    const mergedData = { ...r.data, ...closeForm };
    const closeValue = config.computeCloseValue(mergedData);
    const pnl = closeValue - r.cost;
    const pct = r.cost > 0 ? (pnl / r.cost) * 100 : 0;
    const fechaSalida = closeForm.fechaSalida || r.fechaSalida;

    const { error: updateError } = await supabase
      .from("trades")
      .update({ data: mergedData, fecha_salida: fechaSalida, close_value: closeValue, pnl, pct })
      .eq("id", editingClosedId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setTrades((prev) => ({
      ...prev,
      [type]: prev[type].map((x) =>
        x.id !== editingClosedId ? x : { ...x, data: mergedData, fechaSalida, closeValue, pnl, pct }
      ),
    }));
    setEditingClosedId(null);
    setCloseForm({});
  };

  const cancelEditClosed = () => {
    setEditingClosedId(null);
    setCloseForm({});
  };

  // ---------- Delete ----------
  const handleDeleteTrade = async (type, id) => {
    const { error: deleteError } = await supabase.from("trades").delete().eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setTrades((prev) => ({ ...prev, [type]: prev[type].filter((r) => r.id !== id) }));
    setConfirmDelete(null);
  };

  const handleDeleteMovement = async (type, id) => {
    const { error: deleteError } = await supabase.from("movements").delete().eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setMovements((prev) => ({ ...prev, [type]: prev[type].filter((m) => m.id !== id) }));
    setConfirmDelete(null);
  };

  // ---------- Excel export ----------
  const [showExportPicker, setShowExportPicker] = useState(false);

  const exportType = (t) => {
    const wb = XLSX.utils.book_new();
    const cfg = FIELD_CONFIG[t];
    const rows = [];

    // Open positions
    trades[t]
      .filter((r) => r.status === "open")
      .forEach((r) => {
        rows.push({
          Estado: "Abierta",
          Resumen: cfg.summaryLine(r.data),
          "Fecha entrada": r.fechaEntrada,
          "Fecha salida": "",
          "Inversión ($)": Number(r.cost.toFixed(2)),
          "Retribución ($)": "",
          "Ganancia ($)": "",
          "Ganancia (%)": "",
        });
      });

    // Closed positions
    trades[t]
      .filter((r) => r.status === "closed")
      .forEach((r) => {
        rows.push({
          Estado: "Cerrada",
          Resumen: cfg.summaryLine(r.data),
          "Fecha entrada": r.fechaEntrada,
          "Fecha salida": r.fechaSalida,
          "Inversión ($)": Number(r.cost.toFixed(2)),
          "Retribución ($)": Number(r.closeValue.toFixed(2)),
          "Ganancia ($)": Number(r.pnl.toFixed(2)),
          "Ganancia (%)": Number(r.pct.toFixed(2)),
        });
      });

    if (rows.length === 0) {
      rows.push({
        Estado: "",
        Resumen: "Sin registros",
        "Fecha entrada": "",
        "Fecha salida": "",
        "Inversión ($)": "",
        "Retribución ($)": "",
        "Ganancia ($)": "",
        "Ganancia (%)": "",
      });
    }

    // Final summary block
    const b = balances[t];
    const closedTrades = trades[t].filter((r) => r.status === "closed");
    const winTrades = closedTrades.filter((r) => r.pnl > 0);
    const lossTrades = closedTrades.filter((r) => r.pnl < 0);
    const gainsTotal = winTrades.reduce((sum, r) => sum + r.pnl, 0);
    const lossesTotal = lossTrades.reduce((sum, r) => sum + r.pnl, 0);
    const pnlPct = b.deposited !== 0 ? (b.closedPnl / b.deposited) * 100 : 0;

    const blankRow = {
      Estado: "",
      Resumen: "",
      "Fecha entrada": "",
      "Fecha salida": "",
      "Inversión ($)": "",
      "Retribución ($)": "",
      "Ganancia ($)": "",
      "Ganancia (%)": "",
    };

    rows.push({ ...blankRow });
    rows.push({
      ...blankRow,
      Resumen: "INVERSIÓN BASE",
      "Ganancia ($)": Number(b.deposited.toFixed(2)),
    });
    rows.push({
      ...blankRow,
      Resumen: "GANANCIA TOTAL",
      "Ganancia ($)": Number(gainsTotal.toFixed(2)),
      "Ganancia (%)": `${winTrades.length} operaciones`,
    });
    rows.push({
      ...blankRow,
      Resumen: "PÉRDIDA TOTAL",
      "Ganancia ($)": Number(lossesTotal.toFixed(2)),
      "Ganancia (%)": `${lossTrades.length} operaciones`,
    });
    rows.push({
      ...blankRow,
      Resumen: "GANANCIA / PÉRDIDA NETA (período)",
      "Ganancia ($)": Number(b.closedPnl.toFixed(2)),
      "Ganancia (%)": fmtPct(pnlPct),
    });
    rows.push({
      ...blankRow,
      Resumen: "SALDO ACTUAL",
      "Ganancia ($)": Number(b.available.toFixed(2)),
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 10 }, { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, cfg.label);

    // Movements sheet (Abonos / Retiros) with Mes and Año breakdown
    const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const movRows = [...movements[t]]
      .sort((a, b2) => new Date(a.fecha) - new Date(b2.fecha))
      .map((m) => {
        const d = new Date(m.fecha + "T00:00:00");
        return {
          Fecha: m.fecha,
          Mes: isNaN(d) ? "" : MESES[d.getMonth()],
          "Año": isNaN(d) ? "" : d.getFullYear(),
          Tipo: m.tipo,
          "Monto ($)": Number(Number(m.monto).toFixed(2)),
        };
      });

    if (movRows.length === 0) {
      movRows.push({ Fecha: "", Mes: "", "Año": "", Tipo: "", "Monto ($)": "Sin movimientos" });
    } else {
      const totalAbonos = movements[t].filter((m) => m.tipo === "Abono").reduce((s, m) => s + Number(m.monto), 0);
      const totalRetiros = movements[t].filter((m) => m.tipo === "Retiro").reduce((s, m) => s + Number(m.monto), 0);
      movRows.push({ Fecha: "", Mes: "", "Año": "", Tipo: "", "Monto ($)": "" });
      movRows.push({ Fecha: "", Mes: "", "Año": "", Tipo: "TOTAL ABONOS", "Monto ($)": Number(totalAbonos.toFixed(2)) });
      movRows.push({ Fecha: "", Mes: "", "Año": "", Tipo: "TOTAL RETIROS", "Monto ($)": Number(totalRetiros.toFixed(2)) });
    }

    const wsMov = XLSX.utils.json_to_sheet(movRows);
    wsMov["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsMov, "Movimientos");

    const stamp = todayStr();
    XLSX.writeFile(wb, `TradeLog_${cfg.label}_${stamp}.xlsx`);
    setShowExportPicker(false);
  };

  const config = FIELD_CONFIG[activeTab];
  const newConfig = FIELD_CONFIG[newType];

  if (loading) {
    return (
      <div style={{ ...styles.app, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, color: THEME.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
          <Loader2 size={28} className="spin" style={{ animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          Cargando TradeLog...
        </div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <div style={styles.scanline} />
      {error && (
        <div style={styles.errorBanner}>
          <span>Error: {error}</span>
          <button style={styles.iconBtnGhost} onClick={() => setError(null)}>
            <X size={14} />
          </button>
        </div>
      )}
      <header style={styles.header}>
        <div>
          <div style={styles.brandRow}>
            <span style={styles.brandMark} role="img" aria-label="olla de monedas de oro">💰</span>
            <h1 style={styles.brand}>Billonario</h1>
          </div>
          <p style={styles.tagline}>Registro de operaciones — opciones · acciones · deportes</p>
        </div>
        <div style={{ position: "relative" }}>
          <button style={styles.exportBtn} onClick={() => setShowExportPicker(!showExportPicker)}>
            <Download size={14} /> Exportar Excel
          </button>
          {showExportPicker && (
            <div style={styles.exportMenu}>
              {TYPES.map((t) => (
                <button
                  key={t}
                  style={{ ...styles.exportMenuItem, color: FIELD_CONFIG[t].accent }}
                  onClick={() => exportType(t)}
                >
                  {FIELD_CONFIG[t].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* ---------- New entry / edit panel ---------- */}
      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <span style={styles.panelLabel}>{editingOpenId ? "EDITAR POSICIÓN" : "NUEVA OPERACIÓN"}</span>
          {!editingOpenId && (
            <div style={styles.typeSwitcher}>
              {TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setNewType(t);
                    setForm({});
                  }}
                  style={{
                    ...styles.typeBtn,
                    ...(newType === t
                      ? { background: FIELD_CONFIG[t].accent, color: "#FFFFFF", borderColor: FIELD_CONFIG[t].accent }
                      : {}),
                  }}
                >
                  {FIELD_CONFIG[t].label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={styles.formGrid}>
          <FieldInput
            field={{ key: "fecha", label: "Fecha de entrada", type: "date" }}
            value={form.fecha || todayStr()}
            onChange={(v) => setForm({ ...form, fecha: v })}
            accent={newConfig.accent}
          />
          {newConfig.openFields.map((f) => (
            <FieldInput
              key={f.key}
              field={f}
              value={form[f.key] || ""}
              onChange={(v) => setForm({ ...form, [f.key]: v })}
              accent={newConfig.accent}
            />
          ))}
        </div>
        {editingOpenId ? (
          <div style={styles.closeActions}>
            <button style={{ ...styles.smallBtn, background: newConfig.accent, flex: 1 }} onClick={handleSaveEditOpen}>
              <Check size={14} /> Guardar cambios
            </button>
            <button style={styles.smallBtnGhost} onClick={cancelEditOpen}>
              Cancelar
            </button>
          </div>
        ) : (
          <button style={{ ...styles.primaryBtn, background: newConfig.accent }} onClick={handleAddTrade}>
            <Plus size={16} strokeWidth={2.5} /> Registrar posición
          </button>
        )}
      </section>

      {/* ---------- Tabs ---------- */}
      <nav style={styles.tabBar}>
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            style={{
              ...styles.tab,
              ...(activeTab === t ? { color: FIELD_CONFIG[t].accent, borderColor: FIELD_CONFIG[t].accent } : {}),
            }}
          >
            {FIELD_CONFIG[t].label}
            <span style={styles.tabCount}>{trades[t].length}</span>
          </button>
        ))}
      </nav>

      {/* ---------- Balance bar ---------- */}
      <section style={{ ...styles.balanceBar, borderColor: config.accent + "40" }}>
        <div style={styles.balanceItem}>
          <Wallet size={14} color={config.accent} />
          <div>
            <div style={styles.balanceLabel}>Saldo disponible</div>
            <div style={{ ...styles.balanceValue, color: config.accent }}>{fmtMoney(balances[activeTab].available)}</div>
          </div>
        </div>
        <div style={styles.balanceItem}>
          <div>
            <div style={styles.balanceLabel}>Capital invertido (abierto)</div>
            <div style={styles.balanceValueSmall}>{fmtMoney(balances[activeTab].openCost)}</div>
          </div>
        </div>
        <div style={styles.balanceItem}>
          <div>
            <div style={styles.balanceLabel}>P&L cerrado acumulado</div>
            <div
              style={{
                ...styles.balanceValueSmall,
                color: balances[activeTab].closedPnl >= 0 ? THEME.green : THEME.red,
              }}
            >
              {fmtMoney(balances[activeTab].closedPnl)}
            </div>
          </div>
        </div>
        <button style={{ ...styles.movBtn, borderColor: config.accent }} onClick={() => setShowMov(!showMov)}>
          {showMov ? <X size={14} /> : <Plus size={14} />} Abono / Retiro
        </button>
      </section>

      {showMov && (
        <section style={styles.movPanel}>
          <select
            style={styles.input}
            value={movForm.tipo}
            onChange={(e) => setMovForm({ ...movForm, tipo: e.target.value })}
          >
            <option>Abono</option>
            <option>Retiro</option>
          </select>
          <input
            style={styles.input}
            type="number"
            placeholder="Monto"
            value={movForm.monto}
            onChange={(e) => setMovForm({ ...movForm, monto: e.target.value })}
          />
          <input
            style={styles.input}
            type="date"
            value={movForm.fecha}
            onChange={(e) => setMovForm({ ...movForm, fecha: e.target.value })}
          />
          <button style={{ ...styles.primaryBtn, background: config.accent, margin: 0 }} onClick={() => handleAddMovement(activeTab)}>
            <Check size={16} /> Confirmar
          </button>
        </section>
      )}

      {/* ---------- Movements history (collapsed list) ---------- */}
      {movements[activeTab].length > 0 && (
        <details style={styles.details}>
          <summary style={styles.summaryToggle}>Historial de abonos / retiros ({movements[activeTab].length})</summary>
          <div style={styles.movList}>
            {movements[activeTab].map((m) => (
              <div key={m.id} style={styles.movRow}>
                <span style={{ color: m.tipo === "Abono" ? THEME.green : THEME.red }}>
                  {m.tipo === "Abono" ? <ArrowDownToLine size={13} /> : <ArrowUpFromLine size={13} />} {m.tipo}
                </span>
                <span style={styles.mono}>{fmtMoney(m.monto)}</span>
                <span style={styles.mono}>{m.fecha}</span>
                {confirmDelete?.kind === "mov" && confirmDelete.id === m.id ? (
                  <span style={styles.confirmRow}>
                    <button style={styles.iconBtnDanger} onClick={() => handleDeleteMovement(activeTab, m.id)}>
                      <Check size={12} />
                    </button>
                    <button style={styles.iconBtnGhost} onClick={() => setConfirmDelete(null)}>
                      <X size={12} />
                    </button>
                  </span>
                ) : (
                  <button style={styles.iconBtnGhost} onClick={() => setConfirmDelete({ kind: "mov", type: activeTab, id: m.id })}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ---------- Open positions ---------- */}
      <section style={styles.section}>
        <h2 style={{ ...styles.sectionTitle, color: config.accent }}>Posiciones abiertas</h2>
        {trades[activeTab].filter((r) => r.status === "open").length === 0 && (
          <p style={styles.empty}>No hay posiciones pendientes. Registra una operación arriba.</p>
        )}
        {trades[activeTab]
          .filter((r) => r.status === "open")
          .map((r) => (
            <div key={r.id} style={styles.card}>
              <div style={styles.cardRow}>
                <div style={styles.cardMain}>
                  <div style={styles.cardTitle}>{config.summaryLine(r.data)}</div>
                  <div style={styles.cardSub}>
                    Entrada: {r.fechaEntrada} · Capital: <span style={styles.mono}>{fmtMoney(r.cost)}</span>
                  </div>
                </div>
                <div style={styles.cardIcons}>
                  <button style={styles.iconBtnGhost} onClick={() => startEditOpen(r)} title="Editar">
                    <Pencil size={14} />
                  </button>
                  {confirmDelete?.kind === "trade" && confirmDelete.id === r.id ? (
                    <span style={styles.confirmRow}>
                      <button style={styles.iconBtnDanger} onClick={() => handleDeleteTrade(activeTab, r.id)}>
                        <Check size={12} />
                      </button>
                      <button style={styles.iconBtnGhost} onClick={() => setConfirmDelete(null)}>
                        <X size={12} />
                      </button>
                    </span>
                  ) : (
                    <button style={styles.iconBtnGhost} onClick={() => setConfirmDelete({ kind: "trade", type: activeTab, id: r.id })} title="Borrar">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
              {closingId === r.id ? (
                <div style={styles.closeForm}>
                  {config.closeFields
                    .filter((f) => !f.showIf || f.showIf(closeForm))
                    .map((f) => (
                    <FieldInput
                      key={f.key}
                      field={f}
                      value={closeForm[f.key] || ""}
                      onChange={(v) => setCloseForm({ ...closeForm, [f.key]: v })}
                      accent={config.accent}
                      compact
                    />
                  ))}
                  <FieldInput
                    field={{ key: "fechaSalida", label: "Fecha de salida", type: "date" }}
                    value={closeForm.fechaSalida || todayStr()}
                    onChange={(v) => setCloseForm({ ...closeForm, fechaSalida: v })}
                    accent={config.accent}
                    compact
                  />
                  <div style={styles.closeActions}>
                    <button style={{ ...styles.smallBtn, background: config.accent }} onClick={() => handleConfirmClose(activeTab)}>
                      <Check size={14} /> Cerrar posición
                    </button>
                    <button style={styles.smallBtnGhost} onClick={() => setClosingId(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button style={{ ...styles.smallBtnGhost, borderColor: config.accent, color: config.accent }} onClick={() => openCloseDialog(r.id)}>
                  Registrar venta / resultado
                </button>
              )}
            </div>
          ))}
      </section>

      {/* ---------- Closed positions ---------- */}
      <section style={styles.section}>
        <h2 style={{ ...styles.sectionTitle, color: config.accent }}>Historial cerrado</h2>
        {trades[activeTab].filter((r) => r.status === "closed").length === 0 && (
          <p style={styles.empty}>Todavía no hay operaciones cerradas.</p>
        )}
        {trades[activeTab]
          .filter((r) => r.status === "closed")
          .map((r) => (
            <div key={r.id} style={{ ...styles.card, ...(editingClosedId !== r.id ? styles.cardClosed : {}) }}>
              <div style={styles.cardRow}>
                <div style={styles.cardMain}>
                  <div style={styles.cardTitle}>{config.summaryLine(r.data)}</div>
                  <div style={styles.cardSub}>
                    {r.fechaEntrada} → {r.fechaSalida} · Capital: <span style={styles.mono}>{fmtMoney(r.cost)}</span>
                  </div>
                </div>
                {editingClosedId !== r.id && (
                  <div style={styles.pnlBlock}>
                    <div style={{ ...styles.pnlValue, color: r.pnl >= 0 ? THEME.green : THEME.red }}>
                      {r.pnl >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                      {fmtMoney(r.pnl)}
                    </div>
                    <div style={{ ...styles.pnlPct, color: r.pnl >= 0 ? THEME.green : THEME.red }}>{fmtPct(r.pct)}</div>
                  </div>
                )}
                <div style={styles.cardIcons}>
                  <button style={styles.iconBtnGhost} onClick={() => (editingClosedId === r.id ? cancelEditClosed() : startEditClosed(r))} title="Editar">
                    {editingClosedId === r.id ? <X size={14} /> : <Pencil size={14} />}
                  </button>
                  {confirmDelete?.kind === "trade" && confirmDelete.id === r.id ? (
                    <span style={styles.confirmRow}>
                      <button style={styles.iconBtnDanger} onClick={() => handleDeleteTrade(activeTab, r.id)}>
                        <Check size={12} />
                      </button>
                      <button style={styles.iconBtnGhost} onClick={() => setConfirmDelete(null)}>
                        <X size={12} />
                      </button>
                    </span>
                  ) : (
                    <button style={styles.iconBtnGhost} onClick={() => setConfirmDelete({ kind: "trade", type: activeTab, id: r.id })} title="Borrar">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
              {editingClosedId === r.id && (
                <div style={styles.closeForm}>
                  {config.closeFields
                    .filter((f) => !f.showIf || f.showIf(closeForm))
                    .map((f) => (
                      <FieldInput
                        key={f.key}
                        field={f}
                        value={closeForm[f.key] ?? ""}
                        onChange={(v) => setCloseForm({ ...closeForm, [f.key]: v })}
                        accent={config.accent}
                        compact
                      />
                    ))}
                  <FieldInput
                    field={{ key: "fechaSalida", label: "Fecha de salida", type: "date" }}
                    value={closeForm.fechaSalida || r.fechaSalida}
                    onChange={(v) => setCloseForm({ ...closeForm, fechaSalida: v })}
                    accent={config.accent}
                    compact
                  />
                  <div style={styles.closeActions}>
                    <button style={{ ...styles.smallBtn, background: config.accent }} onClick={() => handleSaveEditClosed(activeTab)}>
                      <Check size={14} /> Guardar cambios
                    </button>
                    <button style={styles.smallBtnGhost} onClick={cancelEditClosed}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
      </section>
    </div>
  );
}

// ---------- Field Input Component ----------
function FieldInput({ field, value, onChange, accent, compact }) {
  return (
    <label style={compact ? styles.fieldLabelCompact : styles.fieldLabel}>
      <span style={styles.fieldLabelText}>{field.label}</span>
      {field.type === "select" ? (
        <select style={styles.input} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          style={{ ...styles.input, ...(value ? { borderColor: accent + "60" } : {}) }}
          type={field.type}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          step={field.type === "number" ? "any" : undefined}
        />
      )}
    </label>
  );
}

// ---------- Styles ----------
const styles = {
  app: {
    fontFamily: "'Inter', -apple-system, sans-serif",
    background: THEME.bg,
    color: THEME.text,
    minHeight: "100vh",
    padding: "20px 16px 60px",
    maxWidth: 720,
    margin: "0 auto",
    position: "relative",
  },
  scanline: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    background: THEME.scanline,
    opacity: 0.6,
  },
  header: {
    marginBottom: 20,
    paddingTop: 8,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 10,
  },
  brandRow: { display: "flex", alignItems: "center", gap: 8 },
  brandMark: { fontSize: 26, lineHeight: 1 },
  brand: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 24,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    margin: 0,
    color: THEME.text,
  },
  tagline: { color: THEME.textMuted, fontSize: 13, margin: "4px 0 0", fontFamily: "'JetBrains Mono', monospace" },
  exportBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: THEME.panelBg,
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    padding: "8px 12px",
    color: THEME.textMuted,
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  exportMenu: {
    position: "absolute",
    top: "calc(100% + 6px)",
    right: 0,
    background: THEME.panelBg,
    border: `1px solid ${THEME.border}`,
    borderRadius: 8,
    padding: 6,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    zIndex: 10,
    minWidth: 140,
    boxShadow: `0 8px 24px ${THEME.shadow}`,
  },
  exportMenuItem: {
    background: "transparent",
    border: "none",
    borderRadius: 6,
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace",
    cursor: "pointer",
    textAlign: "left",
  },

  panel: {
    background: THEME.panelBg,
    border: `1px solid ${THEME.border}`,
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
    boxShadow: `0 2px 12px ${THEME.shadow}`,
  },
  panelHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 },
  panelLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.15em",
    color: THEME.textFaint,
  },
  typeSwitcher: { display: "flex", gap: 6, flexWrap: "wrap" },
  typeBtn: {
    background: "transparent",
    border: `1px solid ${THEME.border}`,
    color: THEME.textMuted,
    borderRadius: 6,
    padding: "5px 12px",
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: 10,
    marginBottom: 14,
  },
  fieldLabel: { display: "flex", flexDirection: "column", gap: 5 },
  fieldLabelCompact: { display: "flex", flexDirection: "column", gap: 5, minWidth: 140 },
  fieldLabelText: {
    fontSize: 11,
    color: THEME.textMuted,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: "0.03em",
  },
  input: {
    background: THEME.inputBg,
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    padding: "9px 10px",
    color: THEME.text,
    fontSize: 14,
    fontFamily: "'JetBrains Mono', monospace",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
  primaryBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    width: "100%",
    border: "none",
    borderRadius: 6,
    padding: "11px 0",
    color: "#FFFFFF",
    fontWeight: 700,
    fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace",
    cursor: "pointer",
    letterSpacing: "0.02em",
  },

  tabBar: { display: "flex", gap: 4, marginBottom: 14, borderBottom: `1px solid ${THEME.border}` },
  tab: {
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    color: THEME.textFaint,
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  tabCount: {
    background: THEME.inputBg,
    borderRadius: 10,
    fontSize: 10,
    padding: "1px 6px",
    color: THEME.textMuted,
  },

  balanceBar: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
    alignItems: "center",
    background: THEME.panelBg,
    border: `1px solid ${THEME.border}`,
    borderRadius: 10,
    padding: "14px 16px",
    marginBottom: 12,
    boxShadow: `0 2px 12px ${THEME.shadow}`,
  },
  balanceItem: { display: "flex", alignItems: "center", gap: 8 },
  balanceLabel: {
    fontSize: 10,
    color: THEME.textFaint,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },
  balanceValue: {
    fontSize: 20,
    fontWeight: 800,
    fontFamily: "'JetBrains Mono', monospace",
  },
  balanceValueSmall: {
    fontSize: 15,
    fontWeight: 800,
    fontFamily: "'JetBrains Mono', monospace",
    color: THEME.text,
  },
  movBtn: {
    marginLeft: "auto",
    background: "transparent",
    border: "1px solid",
    borderRadius: 6,
    padding: "8px 12px",
    color: THEME.text,
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },

  movPanel: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    background: THEME.panelBg,
    border: `1px solid ${THEME.border}`,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    boxShadow: `0 2px 12px ${THEME.shadow}`,
  },

  details: { marginBottom: 16, fontFamily: "'JetBrains Mono', monospace" },
  summaryToggle: { fontSize: 12, color: THEME.textFaint, cursor: "pointer", padding: "4px 0" },
  movList: { display: "flex", flexDirection: "column", gap: 6, marginTop: 8 },
  movRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    background: THEME.panelBg,
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    padding: "6px 10px",
    color: THEME.textMuted,
    fontWeight: 700,
  },

  section: { marginBottom: 22 },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    marginBottom: 10,
  },
  empty: { color: THEME.textFaint, fontSize: 13, fontFamily: "'JetBrains Mono', monospace" },

  card: {
    background: THEME.panelBg,
    border: `1px solid ${THEME.border}`,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    boxShadow: `0 2px 12px ${THEME.shadow}`,
  },
  cardClosed: {},
  errorBanner: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "#FDECEC",
    border: `1px solid ${THEME.red}`,
    borderRadius: 8,
    padding: "10px 14px",
    marginBottom: 14,
    color: THEME.red,
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 700,
  },
  cardRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 },
  cardMain: { display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 },
  cardIcons: { display: "flex", gap: 4, alignItems: "center", flexShrink: 0 },
  iconBtnGhost: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    padding: 6,
    color: THEME.textMuted,
    cursor: "pointer",
  },
  iconBtnDanger: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: THEME.red,
    border: "none",
    borderRadius: 6,
    padding: 6,
    color: "#FFFFFF",
    cursor: "pointer",
  },
  confirmRow: { display: "flex", gap: 4 },
  cardTitle: { fontSize: 14, fontWeight: 800, color: THEME.text },
  cardSub: { fontSize: 12, color: THEME.textMuted, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 },
  mono: { fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: THEME.text },

  closeForm: { display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" },
  closeActions: { display: "flex", gap: 8 },
  smallBtn: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    border: "none",
    borderRadius: 6,
    padding: "9px 14px",
    color: "#FFFFFF",
    fontWeight: 700,
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    cursor: "pointer",
  },
  smallBtnGhost: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    background: "transparent",
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    padding: "9px 14px",
    color: THEME.textMuted,
    fontWeight: 600,
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    cursor: "pointer",
  },

  pnlBlock: { textAlign: "right" },
  pnlValue: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    justifyContent: "flex-end",
    fontSize: 15,
    fontWeight: 800,
    fontFamily: "'JetBrains Mono', monospace",
  },
  pnlPct: { fontSize: 12, fontFamily: "'JetBrains Mono', monospace", marginTop: 2, fontWeight: 800 },
};
