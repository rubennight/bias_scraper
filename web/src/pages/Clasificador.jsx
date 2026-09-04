import { useState, useEffect, useRef } from "react";
import api from "../api";

const CAT_COLOR = { A: "#2e7d32", B: "#c07800", C: "#C0392B" };
const CAT_BG    = { A: "#eef5ec", B: "#fef9ec", C: "#fdf0ea" };
const MIN       = 300;
const MIN_SUBTIPO = 30;  // mínimo de elementos por subtipo para features completas

function pct(v, max) { return Math.min(100, Math.round((v / max) * 100)); }

function Barra({ valor, max, color }) {
  const p = pct(valor, max);
  return (
    <div style={{ background: "#e8e4dc", borderRadius: 8, height: 8, overflow: "hidden" }}>
      <div style={{
        height: "100%", borderRadius: 8,
        background: p >= 100 ? "#2e7d32" : p >= 60 ? color : "#C0392B",
        width: `${p}%`, transition: "width .5s",
      }} />
    </div>
  );
}

function MatrizConfusion({ data }) {
  if (!data?.matrix) return null;
  const { labels, matrix } = data;
  const max = Math.max(...matrix.flat());
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ padding: "6px 10px", color: "#888", fontSize: 11 }}>Real ↓ / Pred →</th>
            {labels.map(l => (
              <th key={l} style={{ padding: "6px 14px", color: CAT_COLOR[l], fontWeight: 700 }}>{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((fila, i) => (
            <tr key={i}>
              <td style={{ padding: "6px 10px", fontWeight: 700, color: CAT_COLOR[labels[i]] }}>{labels[i]}</td>
              {fila.map((v, j) => (
                <td key={j} style={{
                  padding: "8px 14px", textAlign: "center",
                  background: i === j
                    ? `rgba(46,125,50,${v / max * 0.6 + 0.1})`
                    : v > 0 ? `rgba(192,57,43,${v / max * 0.5 + 0.05})` : "#f9f7f3",
                  fontWeight: i === j ? 700 : 400,
                  color: i === j ? "#2e7d32" : v > 0 ? "#C0392B" : "#aaa",
                  borderRadius: 8,
                }}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 11, color: "#aaa", marginTop: 6 }}>
        Diagonal verde = predicciones correctas · Rojo = errores
      </p>
    </div>
  );
}

function ShapChart({ data }) {
  if (!data) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
      {["A", "B", "C"].map(cat => (
        <div key={cat} style={{
          background: CAT_BG[cat], border: `1px solid ${CAT_COLOR[cat]}40`,
          borderRadius: 12, padding: "12px 14px",
        }}>
          <div style={{ fontWeight: 700, color: CAT_COLOR[cat], fontSize: 13, marginBottom: 10 }}>
            Categoría {cat}
          </div>
          {(data[cat] || []).slice(0, 8).map((f, i) => {
            const max = data[cat][0]?.importancia || 1;
            const w   = Math.round((f.importancia / max) * 100);
            return (
              <div key={i} style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                  <span style={{ color: "#555", fontFamily: "monospace" }}>{f.feature}</span>
                  <span style={{ color: CAT_COLOR[cat], fontWeight: 600 }}>{f.importancia.toFixed(3)}</span>
                </div>
                <div style={{ background: "#e8e4dc", borderRadius: 8, height: 5 }}>
                  <div style={{ height: "100%", borderRadius: 8, background: CAT_COLOR[cat], width: `${w}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function Clasificador() {
  const [dataset,   setDataset]   = useState(null);
  const [lista,     setLista]     = useState([]);
  const [activo,    setActivo]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [iniciando, setIniciando] = useState(false);
  const [error,     setError]     = useState("");
  const pollingRef = useRef(null);

  const cargar = async () => {
    try {
      const [ds, ls] = await Promise.all([
        api.get("/api/entrenamiento/dataset"),
        api.get("/api/entrenamiento/lista"),
      ]);
      setDataset(ds.data);
      setLista(ls.data);

      // Si hay uno corriendo, activar polling
      const corriendo = ls.data.find(e => ["pendiente", "corriendo"].includes(e.estado));
      if (corriendo) iniciarPolling(corriendo.id);

    } catch (e) {
      setError("Error conectando al backend");
    } finally {
      setLoading(false);
    }
  };

  const iniciarPolling = (job_id) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const r = await api.get(`/api/entrenamiento/estado/${job_id}`);
        setActivo(r.data);
        if (!["pendiente", "corriendo"].includes(r.data.estado)) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          cargar(); // recargar lista completa
        }
      } catch {}
    }, 3000);
  };

  useEffect(() => {
    cargar();
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  const handleEntrenar = async () => {
    setIniciando(true);
    setError("");
    try {
      const r = await api.post("/api/entrenamiento/iniciar");
      iniciarPolling(r.data.job_id);
      cargar();
    } catch (e) {
      setError(e.response?.data?.error || "Error al iniciar entrenamiento");
    } finally {
      setIniciando(false);
    }
  };

  if (loading) return <div className="loading"><div className="spinner" />Cargando...</div>;

  const enCurso = activo && ["pendiente", "corriendo"].includes(activo.estado);
  const ultimo  = lista.find(e => e.estado === "completado");

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Clasificador A/B/C</div>
        <div className="page-sub">Fase 5 del pipeline KDD · XGBoost + SHAP</div>
      </div>

      {/* ── DATASET STATUS ── */}
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <div className="card-header">Estado del dataset de entrenamiento</div>
        <div className="card-body">

          {/* Métrica 1 — oraciones por categoría dominante */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>
            Oraciones por categoría dominante — umbral para entrenar
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 20 }}>
            {["A", "B", "C"].map(cat => {
              const v = dataset?.por_categoria?.[cat] || 0;
              const ok = v >= MIN;
              return (
                <div key={cat} style={{ background: ok ? "#eef5ec" : "#fdf0ea", borderRadius: 12, padding: "12px 14px", border: `1px solid ${ok ? "#a0d8a0" : "#f5bbb0"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, color: CAT_COLOR[cat], fontSize: 15 }}>Cat. {cat}</span>
                    <span style={{ fontSize: 12, color: ok ? "#2e7d32" : "#C0392B", fontWeight: 600 }}>
                      {ok ? "✓ Suficiente" : `Faltan ${MIN - v}`}
                    </span>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: CAT_COLOR[cat], fontFamily: "monospace", marginBottom: 6 }}>
                    {v}
                  </div>
                  <Barra valor={v} max={MIN} color={CAT_COLOR[cat]} />
                  <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>mínimo: {MIN} oraciones</div>
                </div>
              );
            })}
          </div>

          {/* Métrica 2 — elementos por tipo y subtipo */}
          {dataset?.elementos_por_tipo && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>
                Elementos identificados — riqueza del lexicón y features
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                {["A", "B", "C"].map(cat => {
                  const total       = dataset.elementos_por_tipo?.[cat] || 0;
                  const detalle     = dataset.subtipos_detalle?.[cat] || {};
                  const sinSubtipo  = dataset.elementos_por_subtipo?.[cat]?.sin_subtipo || 0;
                  return (
                    <div key={cat} style={{ background: "#f9f7f3", borderRadius: 8, padding: "10px 14px", border: "1px solid #e8e4dc" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ fontWeight: 700, color: CAT_COLOR[cat], fontSize: 13 }}>Elementos {cat}</span>
                        <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 16, color: CAT_COLOR[cat] }}>{total}</span>
                      </div>
                      {Object.entries(detalle).map(([sub, info]) => {
                        const color = info.suficiente ? "#2e7d32" : info.total > 0 ? "#c07800" : "#bbb";
                        return (
                          <div key={sub} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#666", marginBottom: 3 }}>
                            <span style={{ fontFamily: "monospace" }}>{sub}</span>
                            <span style={{ fontWeight: 700, color }}>
                              {info.total}
                              {info.suficiente ? " ✓" : info.total > 0 ? ` · faltan ${MIN_SUBTIPO - info.total}` : ""}
                            </span>
                          </div>
                        );
                      })}
                      {Object.keys(detalle).length === 0 && total === 0 && (
                        <div style={{ fontSize: 11, color: "#bbb" }}>sin elementos aún</div>
                      )}
                      {sinSubtipo > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#aaa", marginTop: 4, paddingTop: 4, borderTop: "1px dashed #e8e4dc" }}>
                          <span style={{ fontFamily: "monospace" }}>sin_subtipo</span>
                          <span>{sinSubtipo}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Estado del entrenamiento — tres niveles según categorías + subtipos */}
          {dataset?.estado_entrenamiento && (() => {
            const estado = dataset.estado_entrenamiento;
            const cfg = {
              anotando: {
                bg: "#f4efe5", border: "#d8d1bf", icono: "",
                texto: `Anotación en progreso — se necesitan al menos ${MIN} oraciones por categoría dominante para el primer entrenamiento`,
                sub: null,
              },
              base: {
                bg: "#fef9ec", border: "#f0c870", icono: "⚠",
                texto: "Listo para entrenamiento base · 26 features lingüísticas",
                sub: (() => {
                  const faltantes = [];
                  for (const cat of ["A", "B", "C"]) {
                    const det = dataset.subtipos_detalle?.[cat] || {};
                    for (const [sub, info] of Object.entries(det)) {
                      if (!info.suficiente) faltantes.push(sub);
                    }
                  }
                  return `Para activar las 15 features de subtipos se necesitan al menos ${MIN_SUBTIPO} elementos por subtipo. Faltantes: ${faltantes.join(", ")}`;
                })(),
              },
              completo: {
                bg: "#eef5ec", border: "#a0d8a0", icono: "✓",
                texto: "Listo para entrenamiento completo · 41 features",
                sub: "Todas las features de subtipos tienen datos suficientes",
              },
            }[estado];

            return (
              <div style={{
                background: cfg.bg, border: `1px solid ${cfg.border}`,
                borderRadius: 12, padding: "10px 14px", marginBottom: 16, fontSize: 13,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {cfg.icono && <span>{cfg.icono}</span>}
                  <span style={{ fontWeight: 700, color: "#3a362f" }}>{cfg.texto}</span>
                </div>
                {cfg.sub && (
                  <div style={{ fontSize: 11.5, color: "#888", marginTop: 4 }}>{cfg.sub}</div>
                )}
              </div>
            );
          })()}

          {/* Kappa */}
          {dataset?.ultimo_kappa && (
            <div style={{
              background: dataset.ultimo_kappa.valido ? "#eef5ec" : "#fef9ec",
              border: `1px solid ${dataset.ultimo_kappa.valido ? "#a0d8a0" : "#f0c870"}`,
              borderRadius: 12, padding: "8px 12px", marginBottom: 16,
              display: "flex", alignItems: "center", gap: 10, fontSize: 13,
            }}>
              <span style={{ fontWeight: 700 }}>Último Kappa:</span>
              <span style={{ fontFamily: "monospace", fontWeight: 700, color: dataset.ultimo_kappa.valido ? "#2e7d32" : "#c07800" }}>
                κ = {dataset.ultimo_kappa.kappa_global}
              </span>
              <span style={{ color: "#888" }}>·</span>
              <span style={{ color: dataset.ultimo_kappa.valido ? "#2e7d32" : "#c07800" }}>
                {dataset.ultimo_kappa.valido ? "✓ Dataset válido para entrenar" : "⚠ Kappa bajo umbral (< 0.6)"}
              </span>
            </div>
          )}

          {/* Tabla de subtipos insuficientes — solo en estado "base" */}
          {dataset?.estado_entrenamiento === "base" && (() => {
            const filas = [];
            for (const cat of ["A", "B", "C"]) {
              const det = dataset.subtipos_detalle?.[cat] || {};
              for (const [sub, info] of Object.entries(det)) {
                if (!info.suficiente) {
                  filas.push({ sub, cat, total: info.total, faltan: MIN_SUBTIPO - info.total });
                }
              }
            }
            filas.sort((a, b) => a.total - b.total);
            if (!filas.length) return null;
            return (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>
                  Subtipos insuficientes — más urgentes primero
                </div>
                <table style={{ fontSize: 12.5, borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr>
                      {["Subtipo", "Tipo", "Total", "Faltan"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "4px 12px", color: "#888", fontWeight: 600, fontSize: 11, borderBottom: "1px solid #e8e4dc" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f, i) => (
                      <tr key={`${f.cat}-${f.sub}`} style={{ background: i % 2 === 0 ? "#fff" : "#fafaf8" }}>
                        <td style={{ padding: "6px 12px", fontFamily: "monospace" }}>{f.sub}</td>
                        <td style={{ padding: "6px 12px", fontWeight: 700, color: CAT_COLOR[f.cat] }}>{f.cat}</td>
                        <td style={{ padding: "6px 12px", fontFamily: "monospace" }}>{f.total}</td>
                        <td style={{ padding: "6px 12px", fontFamily: "monospace", fontWeight: 700, color: "#c07800" }}>{f.faltan}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {error && <div style={{ color: "#C0392B", fontSize: 13, marginBottom: 10 }}>{error}</div>}

          {/* Botón entrenar — tres variantes según estado_entrenamiento */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {(() => {
              const estado = dataset?.estado_entrenamiento || "anotando";
              const puedeEntrenar = estado !== "anotando";
              const variante = {
                anotando: { color: "#ccc", texto: "Entrenar modelo" },
                base:     { color: "#c07800", texto: "Entrenar (26 features) →" },
                completo: { color: "#C0392B", texto: "Entrenar modelo completo →" },
              }[estado];

              return (
                <button
                  onClick={handleEntrenar}
                  disabled={iniciando || enCurso || !puedeEntrenar}
                  title={estado === "base" ? "Entrenamiento base — sin features de subtipos" : undefined}
                  style={{
                    background: puedeEntrenar && !enCurso ? variante.color : "#ccc",
                    color: "#fff", border: "none", borderRadius: 8,
                    padding: "10px 28px", fontSize: 14, fontWeight: 700,
                    cursor: puedeEntrenar && !enCurso ? "pointer" : "default",
                    fontFamily: "inherit",
                  }}
                >
                  {iniciando ? "Iniciando..." : enCurso ? "Entrenando..." : variante.texto}
                </button>
              );
            })()}
            {dataset?.estado_entrenamiento === "anotando" && (
              <span style={{ fontSize: 12, color: "#888" }}>
                Necesitas al menos {MIN} oraciones por categoría para entrenar.
              </span>
            )}
            {dataset?.estado_entrenamiento === "base" && (
              <span style={{ fontSize: 12, color: "#888" }}>
                Entrenamiento base — sin features de subtipos.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── PROGRESO EN TIEMPO REAL ── */}
      {enCurso && activo && (
        <div className="card" style={{ marginBottom: "1.25rem", border: "1.5px solid #C0392B" }}>
          <div className="card-header" style={{ color: "#C0392B" }}>Entrenamiento en curso — Job #{activo.id}</div>
          <div className="card-body">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: "#555" }}>{activo.mensaje}</span>
              <span style={{ fontWeight: 700, color: "#C0392B", fontFamily: "monospace" }}>{activo.progreso}%</span>
            </div>
            <div style={{ background: "#e8e4dc", borderRadius: 8, height: 10, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 8,
                background: "linear-gradient(90deg, #C0392B, #e05050)",
                width: `${activo.progreso}%`,
                transition: "width .8s",
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s infinite",
              }} />
            </div>
            <p style={{ fontSize: 11, color: "#aaa", marginTop: 6 }}>
              Actualizando cada 3 segundos...
            </p>
          </div>
        </div>
      )}

      {/* ── RESULTADOS DEL ÚLTIMO ENTRENAMIENTO ── */}
      {ultimo && (
        <div className="card" style={{ marginBottom: "1.25rem" }}>
          <div className="card-header">Resultados — Modelo #{ultimo.id}</div>
          <div className="card-body">

            {/* F1 global + CV */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
              {[
                { label: "F1 Global", value: ultimo.f1_global, color: "#1a1a1a" },
                { label: "F1 categoría A", value: ultimo.f1_a, color: CAT_COLOR.A },
                { label: "F1 categoría B", value: ultimo.f1_b, color: CAT_COLOR.B },
                { label: "F1 categoría C", value: ultimo.f1_c, color: CAT_COLOR.C },
              ].map(m => (
                <div key={m.label} style={{
                  background: "#fff", border: "1px solid #e8e4dc",
                  borderRadius: 8, padding: "12px 18px", textAlign: "center", minWidth: 110,
                }}>
                  <div style={{ fontSize: 26, fontWeight: 700, color: m.color, fontFamily: "monospace" }}>
                    {m.value != null ? parseFloat(m.value).toFixed(2) : "—"}
                  </div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{m.label}</div>
                </div>
              ))}
            </div>

            {/* Precisión y Recall por categoría */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>Precisión / Recall por categoría</div>
              <table style={{ fontSize: 13, borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    {["Cat.", "Precisión", "Recall", "F1"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "4px 12px", color: "#888", fontWeight: 600, fontSize: 11, borderBottom: "1px solid #e8e4dc" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {["A", "B", "C"].map(cat => (
                    <tr key={cat}>
                      <td style={{ padding: "8px 12px", fontWeight: 700, color: CAT_COLOR[cat] }}>{cat}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{parseFloat(ultimo[`precision_${cat.toLowerCase()}`] || 0).toFixed(3)}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{parseFloat(ultimo[`recall_${cat.toLowerCase()}`] || 0).toFixed(3)}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", fontWeight: 600 }}>{parseFloat(ultimo[`f1_${cat.toLowerCase()}`] || 0).toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Matriz de confusión */}
            {ultimo.confusion_matrix && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>Matriz de confusión</div>
                <MatrizConfusion data={typeof ultimo.confusion_matrix === "string" ? JSON.parse(ultimo.confusion_matrix) : ultimo.confusion_matrix} />
              </div>
            )}

            {/* SHAP */}
            {ultimo.shap_features && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>Features más importantes (SHAP)</div>
                <ShapChart data={typeof ultimo.shap_features === "string" ? JSON.parse(ultimo.shap_features) : ultimo.shap_features} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── HISTORIAL ── */}
      {lista.length > 0 && (
        <div className="card">
          <div className="card-header">Historial de entrenamientos</div>
          <div className="card-body" style={{ padding: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f4efe5" }}>
                  {["#", "Estado", "F1 Global", "F1 A", "F1 B", "F1 C", "Oraciones", "Fecha"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, color: "#888", fontWeight: 600, letterSpacing: ".03em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map((e, i) => (
                  <tr key={e.id} style={{ borderTop: "1px solid #e8e4dc", background: i % 2 === 0 ? "#fff" : "#fafaf8" }}>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#888" }}>#{e.id}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 8,
                        background: e.estado === "completado" ? "#dff0df" : e.estado === "error" ? "#fdf0ea" : "#fef0cc",
                        color: e.estado === "completado" ? "#2e7d32" : e.estado === "error" ? "#C0392B" : "#c07800",
                      }}>
                        {e.estado}
                      </span>
                    </td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", fontWeight: 600 }}>{e.f1_global ?? "—"}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", color: CAT_COLOR.A }}>{e.f1_a ?? "—"}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", color: CAT_COLOR.B }}>{e.f1_b ?? "—"}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", color: CAT_COLOR.C }}>{e.f1_c ?? "—"}</td>
                    <td style={{ padding: "8px 12px", color: "#888" }}>{e.total_oraciones ?? "—"}</td>
                    <td style={{ padding: "8px 12px", fontSize: 11, color: "#aaa", fontFamily: "monospace" }}>
                      {e.iniciado_en ? new Date(e.iniciado_en).toLocaleString("es-MX") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
