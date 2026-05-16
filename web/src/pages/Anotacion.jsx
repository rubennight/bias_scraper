import { useState, useEffect, useCallback } from "react";
import {
  getAnotadores, crearAnotador,
  getOracionesPendientes, guardarAnotacion,
  getStatsAnotador, calcularKappa,
} from "../api";

// ── Instrucciones de la taxonomía ────────────────────────────
const INSTRUCCIONES = [
  {
    cat: "A",
    color: "#2e7d32",
    bg: "#eef5ec",
    titulo: "A — Hecho Verificable",
    desc: "Información que puede comprobarse con fuentes primarias: documentos oficiales, cifras, nombres, fechas, acciones concretas.",
    criterio: "¿Puede verificarse con un documento, cifra o registro físico?",
    si: "Sí → categoría A",
    ejemplos: [
      '"Rocha Moya firmó el decreto el martes 29 de abril."',
      '"La Secretaría reportó un déficit de 3.2% del PIB."',
    ],
  },
  {
    cat: "B",
    color: "#c07800",
    bg: "#fef9ec",
    titulo: "B — Evaluación",
    desc: "Palabras o frases que agregan juicio de valor u opinión sin añadir información factual nueva. Si las quitas, el hecho sigue siendo el mismo.",
    criterio: "¿Puedo eliminar esta palabra sin perder ningún dato verificable?",
    si: "Sí → categoría B",
    ejemplos: [
      '"Firmó el polémico decreto en un oscuro acto." → polémico, oscuro = B',
      '"Lamentablemente, la situación empeoró." → lamentablemente = B',
    ],
  },
  {
    cat: "C",
    color: "#C0392B",
    bg: "#fdf0ea",
    titulo: "C — Marco Ideológico",
    desc: "Elección de palabras con carga política donde existe un sinónimo más neutral. El hecho es el mismo pero la palabra revela la posición del medio.",
    criterio: "¿Existe un sinónimo más neutral que un medio de orientación distinta usaría?",
    si: "Sí → categoría C",
    ejemplos: [
      '"Los vándalos tomaron la plaza." → neutro: manifestantes',
      '"El régimen de Sheinbaum responde." → neutro: el gobierno',
    ],
  },
];

// ── Colores por categoría ─────────────────────────────────────
const CAT_COLOR = { A: "#2e7d32", B: "#c07800", C: "#C0392B" };
const CAT_BG    = { A: "#eef5ec", B: "#fef9ec", C: "#fdf0ea" };

// ── Descripciones de confianza ────────────────────────────────
const CONFIANZA_INFO = {
  alta:  { label: "Alta", desc: "Estás muy seguro de tu clasificación. La categoría es clara y no hay ambigüedad en la oración.", icono: "●●●" },
  media: { label: "Media", desc: "Tienes alguna duda. La oración podría interpretarse de otra forma, pero crees que esta es la categoría más apropiada.", icono: "●●○" },
  baja:  { label: "Baja", desc: "Estás bastante inseguro. La taxonomía es ambigua para este caso o no tienes suficiente contexto para decidir.", icono: "●○○" },
};

// ── Componente: pantalla de instrucciones ─────────────────────
function Instrucciones({ onContinuar }) {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <div style={{ fontSize: 13, color: "var(--text-muted)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 6 }}>
          bias_scraper · Fase 4
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Guía de Anotación A/B/C</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.6 }}>
          Tu tarea es clasificar cada oración en una de tres categorías. Lee con cuidado antes de comenzar.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
        {INSTRUCCIONES.map(inst => (
          <div key={inst.cat} style={{
            background: inst.bg, border: `1.5px solid ${inst.color}`,
            borderRadius: 8, padding: "1rem 1.25rem",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{
                background: inst.color, color: "#fff", fontWeight: 700,
                fontSize: 15, width: 28, height: 28, borderRadius: 4,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>{inst.cat}</span>
              <strong style={{ fontSize: 15, color: inst.color }}>{inst.titulo}</strong>
            </div>
            <p style={{ fontSize: 13, color: "#444", marginBottom: 8, lineHeight: 1.55 }}>{inst.desc}</p>
            <div style={{ background: "rgba(0,0,0,.06)", borderRadius: 4, padding: "6px 10px", fontSize: 12, marginBottom: 8 }}>
              <strong>Criterio:</strong> {inst.criterio} → <em>{inst.si}</em>
            </div>
            <div style={{ fontSize: 12, color: "#555" }}>
              <strong>Ejemplos:</strong>
              {inst.ejemplos.map((e, i) => (
                <div key={i} style={{ fontFamily: "monospace", marginTop: 4, paddingLeft: 8 }}>· {e}</div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        background: "#f4efe5", border: "1px solid #d8d1bf",
        borderRadius: 8, padding: "1rem 1.25rem", marginBottom: 24,
      }}>
        <strong style={{ fontSize: 13 }}>💡 Consejos prácticos</strong>
        <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 13, color: "#555", lineHeight: 1.7 }}>
          <li>Lee el contexto previo y siguiente antes de clasificar.</li>
          <li>Si una oración mezcla A y B, clasifícala por el elemento dominante.</li>
          <li>Si dudas entre B y C, pregúntate: ¿existe un sinónimo más neutral? Si sí → C.</li>
          <li>Cuando marques B o C, indica qué palabra tiene el sesgo y cuál sería la alternativa neutral.</li>
          <li>Puedes bajar la confianza a "media" o "baja" si no estás seguro.</li>
        </ul>
      </div>

      <div style={{ textAlign: "center" }}>
        <button onClick={onContinuar} style={{
          background: "#C0392B", color: "#fff", border: "none",
          borderRadius: 6, padding: "12px 36px", fontSize: 15,
          fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
        }}>
          Entendido, comenzar →
        </button>
      </div>
    </div>
  );
}

// ── Componente: selección de anotador ─────────────────────────
function SeleccionAnotador({ onSeleccionar }) {
  const [anotadores, setAnotadores] = useState([]);
  const [nuevo, setNuevo]           = useState(false);
  const [nombre, setNombre]         = useState("");
  const [desc, setDesc]             = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");

  useEffect(() => {
    getAnotadores().then(r => setAnotadores(r.data)).catch(() => {});
  }, []);

  const handleCrear = async () => {
    if (!nombre.trim()) { setError("El nombre es obligatorio"); return; }
    setLoading(true);
    try {
      const r = await crearAnotador({ nombre: nombre.trim(), descripcion: desc.trim() });
      onSeleccionar(r.data);
    } catch (e) {
      setError(e.response?.data?.error || "Error al crear anotador");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 6 }}>bias_scraper · Fase 4</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>¿Quién anota?</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Selecciona tu perfil o regístrate si es tu primera vez.</p>
      </div>

      {anotadores.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: ".05em", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>Anotadores registrados</div>
          {anotadores.map(a => (
            <button key={a.id} onClick={() => onSeleccionar(a)} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              width: "100%", background: "#fff", border: "1.5px solid #e8e4dc",
              borderRadius: 8, padding: "12px 16px", marginBottom: 8,
              cursor: "pointer", fontFamily: "inherit", transition: "border-color .15s",
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "#C0392B"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "#e8e4dc"}
            >
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{a.nombre}</div>
                {a.descripcion && <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{a.descripcion}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, color: "#C0392B", fontWeight: 600 }}>{a.total_anotaciones} anotadas</div>
                <div style={{ fontSize: 11, color: "#aaa" }}>→ continuar</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {!nuevo ? (
        <button onClick={() => setNuevo(true)} style={{
          width: "100%", background: "transparent", border: "1.5px dashed #ccc",
          borderRadius: 8, padding: "12px 16px", cursor: "pointer",
          fontFamily: "inherit", fontSize: 13, color: "#888",
        }}>
          + Registrar nuevo anotador
        </button>
      ) : (
        <div style={{ background: "#f4efe5", border: "1px solid #d8d1bf", borderRadius: 8, padding: "1rem 1.25rem" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Nuevo anotador</div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>Nombre *</label>
            <input
              value={nombre}
              onChange={e => { setNombre(e.target.value); setError(""); }}
              placeholder="Tu nombre completo"
              style={{ width: "100%", padding: "8px 12px", border: "1px solid #d8d1bf", borderRadius: 6, fontFamily: "inherit", fontSize: 13 }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>Descripción (opcional)</label>
            <input
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Ej: Segundo revisor, estudiante de ISW..."
              style={{ width: "100%", padding: "8px 12px", border: "1px solid #d8d1bf", borderRadius: 6, fontFamily: "inherit", fontSize: 13 }}
            />
          </div>
          {error && <div style={{ color: "#C0392B", fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleCrear} disabled={loading} style={{
              background: "#C0392B", color: "#fff", border: "none", borderRadius: 6,
              padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>
              {loading ? "..." : "Registrar y comenzar"}
            </button>
            <button onClick={() => { setNuevo(false); setError(""); }} style={{
              background: "transparent", border: "1px solid #ccc", borderRadius: 6,
              padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
            }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Componente: interfaz de anotación ─────────────────────────
function InterfazAnotacion({ anotador }) {
  const [oraciones, setOraciones]     = useState([]);
  const [idx, setIdx]                 = useState(0);
  const [categoria, setCategoria]     = useState(null);
  const [elemento, setElemento]       = useState("");
  const [alternativa, setAlternativa] = useState("");
  const [confianza, setConfianza]     = useState("alta");
  const [notas, setNotas]             = useState("");
  const [guardando, setGuardando]     = useState(false);
  const [guardadas, setGuardadas]     = useState(0);
  const [stats, setStats]             = useState(null);
  const [cargando, setCargando]       = useState(true);
  const [pilotoCompletado, setPilotoCompletado] = useState(false);
  const [hoveredCat, setHoveredCat]   = useState(null);
  const [hoveredConf, setHoveredConf] = useState(null);

  const esPiloto = guardadas < 50;

  useEffect(() => {
    setCargando(true);
    getOracionesPendientes({ anotador_id: anotador.id, limite: 50, piloto: true })
      .then(r => { setOraciones(r.data); setCargando(false); })
      .catch(() => setCargando(false));
    getStatsAnotador(anotador.id).then(r => setStats(r.data)).catch(() => {});
  }, [anotador.id]);

  const resetForm = () => {
    setCategoria(null);
    setElemento("");
    setAlternativa("");
    setConfianza("alta");
    setNotas("");
  };

  const handleGuardar = useCallback(async () => {
    if (!categoria) return;
    const oracion = oraciones[idx];
    setGuardando(true);
    try {
      await guardarAnotacion({
        oracion_id:    oracion.id,
        anotador_id:   anotador.id,
        categoria,
        elemento_sesgo: elemento || null,
        alternativa:   alternativa || null,
        confianza,
        notas:         notas || null,
      });
      setGuardadas(g => g + 1);
      // Verificar si completó piloto
      if (guardadas + 1 >= 50) setPilotoCompletado(true);
      // Siguiente oración
      if (idx + 1 < oraciones.length) {
        setIdx(i => i + 1);
        resetForm();
      } else {
        // Cargar más oraciones
        const r = await getOracionesPendientes({ anotador_id: anotador.id, limite: 100 });
        setOraciones(r.data);
        setIdx(0);
        resetForm();
      }
      getStatsAnotador(anotador.id).then(r => setStats(r.data)).catch(() => {});
    } catch (e) {
      console.error(e);
    } finally {
      setGuardando(false);
    }
  }, [categoria, oraciones, idx, anotador.id, elemento, alternativa, confianza, notas, guardadas]);

  // Atajo de teclado: A, B, C para categoría — Enter para guardar
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "a" || e.key === "A") setCategoria("A");
      if (e.key === "b" || e.key === "B") setCategoria("B");
      if (e.key === "c" || e.key === "C") setCategoria("C");
      if (e.key === "Enter" && categoria) handleGuardar();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [categoria, handleGuardar]);

  if (cargando) return <div className="loading"><div className="spinner" />Cargando oraciones...</div>;

  if (!oraciones.length) return (
    <div className="empty-state">
      <div className="empty-state-icon">✓</div>
      <div className="empty-state-text">¡Todas las oraciones están anotadas!</div>
    </div>
  );

  const oracion  = oraciones[idx];
  const progreso = stats ? Math.round((stats.anotadas / stats.total) * 100) : 0;

  return (
    <div style={{ maxWidth: 780, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>
            {anotador.nombre}
          </span>
          {esPiloto && (
            <span style={{ marginLeft: 8, background: "#fef0cc", color: "#c07800", border: "1px solid #f0c870", borderRadius: 3, fontSize: 10, padding: "2px 6px", fontWeight: 700 }}>
              PRUEBA PILOTO
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {stats?.anotadas || 0} / {stats?.total || "?"} oraciones
          {stats && <span style={{ marginLeft: 6, color: "#C0392B", fontWeight: 600 }}>{progreso}%</span>}
        </div>
      </div>

      {/* Barra de progreso */}
      <div style={{ background: "#e8e4dc", borderRadius: 3, height: 4, marginBottom: 20 }}>
        <div style={{ background: "#C0392B", height: "100%", borderRadius: 3, width: `${progreso}%`, transition: "width .3s" }} />
      </div>

      {/* Aviso piloto completado */}
      {pilotoCompletado && (
        <div style={{ background: "#dff0df", border: "1px solid #a0d8a0", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#2e7d32" }}>
          ✓ <strong>Prueba piloto completada</strong> — Ya puedes calcular el Kappa con el segundo anotador desde el Dashboard.
          Puedes seguir anotando para enriquecer el corpus.
        </div>
      )}

      {/* Contexto previo */}
      {oracion.contexto_prev && (
        <div style={{ background: "#f0ede8", borderRadius: "8px 8px 0 0", padding: "10px 14px", fontSize: 12.5, color: "#888", fontStyle: "italic", lineHeight: 1.55 }}>
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 3, color: "#bbb" }}>Contexto anterior</span>
          {oracion.contexto_prev}
        </div>
      )}

      {/* Oración principal */}
      <div style={{
        background: "#fff",
        border: categoria ? `2px solid ${CAT_COLOR[categoria]}` : "2px solid #e8e4dc",
        borderRadius: oracion.contexto_prev ? "0" : "8px 8px 0 0",
        padding: "18px 20px",
        fontSize: 16,
        lineHeight: 1.7,
        fontWeight: 500,
        color: "#1a1a1a",
        transition: "border-color .15s",
      }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", color: "#aaa", marginBottom: 6 }}>
          {oracion.fuente} · {oracion.titular_evento?.slice(0, 50)}
        </div>
        {oracion.texto}
      </div>

      {/* Contexto siguiente */}
      {oracion.contexto_sig && (
        <div style={{ background: "#f0ede8", borderRadius: "0 0 8px 8px", padding: "10px 14px", fontSize: 12.5, color: "#888", fontStyle: "italic", lineHeight: 1.55, marginBottom: 16 }}>
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 3, color: "#bbb" }}>Contexto siguiente</span>
          {oracion.contexto_sig}
        </div>
      )}
      {!oracion.contexto_sig && <div style={{ marginBottom: 16 }} />}

      {/* Botones A / B / C */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        {["A", "B", "C"].map(cat => {
          const inst = INSTRUCCIONES.find(i => i.cat === cat);
          return (
            <div key={cat} style={{ flex: 1, position: "relative" }}
              onMouseEnter={() => setHoveredCat(cat)}
              onMouseLeave={() => setHoveredCat(null)}
            >
              <button onClick={() => setCategoria(cat)} style={{
                width: "100%", padding: "14px 0",
                background: categoria === cat ? CAT_COLOR[cat] : "#fff",
                color: categoria === cat ? "#fff" : CAT_COLOR[cat],
                border: `2px solid ${CAT_COLOR[cat]}`,
                borderRadius: 8, fontSize: 16, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
                transition: "all .15s",
              }}>
                {cat}
                <div style={{ fontSize: 10, fontWeight: 400, marginTop: 3, opacity: .85 }}>
                  {cat === "A" ? "Hecho" : cat === "B" ? "Evaluación" : "Marco ideol."}
                </div>
              </button>

              {hoveredCat === cat && (
                <div style={{
                  position: "absolute",
                  bottom: "calc(100% + 10px)",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 290,
                  background: inst.bg,
                  border: `1.5px solid ${inst.color}`,
                  borderRadius: 8,
                  padding: "12px 14px",
                  zIndex: 100,
                  boxShadow: "0 4px 18px rgba(0,0,0,.13)",
                  pointerEvents: "none",
                  textAlign: "left",
                }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: inst.color, marginBottom: 6 }}>
                    {inst.titulo}
                  </div>
                  <p style={{ fontSize: 12, color: "#444", marginBottom: 8, lineHeight: 1.5, margin: "0 0 8px 0" }}>
                    {inst.desc}
                  </p>
                  <div style={{ background: "rgba(0,0,0,.06)", borderRadius: 4, padding: "5px 8px", fontSize: 11, marginBottom: 8 }}>
                    <strong>Criterio:</strong> {inst.criterio}
                    <br /><em>{inst.si}</em>
                  </div>
                  <div style={{ fontSize: 11, color: "#555" }}>
                    <strong>Ejemplos:</strong>
                    {inst.ejemplos.map((e, i) => (
                      <div key={i} style={{ fontFamily: "monospace", marginTop: 3, paddingLeft: 6 }}>· {e}</div>
                    ))}
                  </div>
                  {/* Flecha apuntando hacia abajo */}
                  <div style={{
                    position: "absolute",
                    bottom: -7,
                    left: "50%",
                    marginLeft: -6,
                    width: 12,
                    height: 12,
                    background: inst.bg,
                    borderRight: `1.5px solid ${inst.color}`,
                    borderBottom: `1.5px solid ${inst.color}`,
                    transform: "rotate(45deg)",
                  }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Campos adicionales para B y C */}
      {(categoria === "B" || categoria === "C") && (
        <div style={{ background: CAT_BG[categoria], border: `1px solid ${CAT_COLOR[categoria]}40`, borderRadius: 8, padding: "12px 16px", marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 4 }}>
                {categoria === "B" ? "Palabra/frase evaluativa *" : "Palabra con sesgo *"}
              </label>
              <input
                value={elemento}
                onChange={e => setElemento(e.target.value)}
                placeholder={categoria === "B" ? "ej: polémico, oscuro" : "ej: vándalos, régimen"}
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 5, fontFamily: "inherit", fontSize: 13 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 4 }}>Alternativa neutral *</label>
              <input
                value={alternativa}
                onChange={e => setAlternativa(e.target.value)}
                placeholder={categoria === "B" ? "ej: (quitar)" : "ej: manifestantes, gobierno"}
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 5, fontFamily: "inherit", fontSize: 13 }}
              />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 4 }}>Notas (opcional)</label>
            <input
              value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="Justificación o duda..."
              style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 5, fontFamily: "inherit", fontSize: 13 }}
            />
          </div>
        </div>
      )}

      {/* Confianza + Guardar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", gap: 6, flex: 1, alignItems: "center" }}>
          {["alta", "media", "baja"].map(c => {
            const info = CONFIANZA_INFO[c];
            return (
              <div key={c} style={{ position: "relative" }}
                onMouseEnter={() => setHoveredConf(c)}
                onMouseLeave={() => setHoveredConf(null)}
              >
                <button onClick={() => setConfianza(c)} style={{
                  padding: "6px 14px", borderRadius: 5, fontSize: 12,
                  background: confianza === c ? "#1a1a1a" : "transparent",
                  color: confianza === c ? "#fff" : "#888",
                  border: "1px solid #ddd", cursor: "pointer", fontFamily: "inherit",
                }}>
                  {c}
                </button>

                {hoveredConf === c && (
                  <div style={{
                    position: "absolute",
                    bottom: "calc(100% + 10px)",
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 230,
                    background: "#fafafa",
                    border: "1.5px solid #555",
                    borderRadius: 8,
                    padding: "10px 12px",
                    zIndex: 100,
                    boxShadow: "0 4px 18px rgba(0,0,0,.13)",
                    pointerEvents: "none",
                    textAlign: "left",
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: "#1a1a1a", marginBottom: 5, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>Confianza {info.label}</span>
                      <span style={{ letterSpacing: 2, fontSize: 11, color: "#555" }}>{info.icono}</span>
                    </div>
                    <p style={{ fontSize: 12, color: "#555", lineHeight: 1.5, margin: 0 }}>
                      {info.desc}
                    </p>
                    <div style={{
                      position: "absolute",
                      bottom: -7,
                      left: "50%",
                      marginLeft: -6,
                      width: 12,
                      height: 12,
                      background: "#fafafa",
                      borderRight: "1.5px solid #555",
                      borderBottom: "1.5px solid #555",
                      transform: "rotate(45deg)",
                    }} />
                  </div>
                )}
              </div>
            );
          })}
          <span style={{ fontSize: 11, color: "#aaa", marginLeft: 4 }}>confianza</span>
        </div>

        <button
          onClick={handleGuardar}
          disabled={!categoria || guardando}
          style={{
            background: categoria ? "#C0392B" : "#ccc",
            color: "#fff", border: "none", borderRadius: 8,
            padding: "10px 28px", fontSize: 14, fontWeight: 700,
            cursor: categoria ? "pointer" : "default", fontFamily: "inherit",
          }}
        >
          {guardando ? "..." : "Guardar →"}
        </button>
      </div>

      {/* Atajos */}
      <div style={{ marginTop: 12, fontSize: 11, color: "#bbb", textAlign: "center" }}>
        Atajos: <kbd style={{ background: "#f0ede8", padding: "1px 5px", borderRadius: 3 }}>A</kbd>
        {" "}<kbd style={{ background: "#f0ede8", padding: "1px 5px", borderRadius: 3 }}>B</kbd>
        {" "}<kbd style={{ background: "#f0ede8", padding: "1px 5px", borderRadius: 3 }}>C</kbd>
        {" "}para categoría · <kbd style={{ background: "#f0ede8", padding: "1px 5px", borderRadius: 3 }}>Enter</kbd> para guardar
      </div>

      {/* Stats por categoría */}
      {stats?.porCategoria && Object.keys(stats.porCategoria).length > 0 && (
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center" }}>
          {["A", "B", "C"].map(cat => (
            <div key={cat} style={{
              background: CAT_BG[cat], border: `1px solid ${CAT_COLOR[cat]}60`,
              borderRadius: 6, padding: "6px 14px", textAlign: "center",
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: CAT_COLOR[cat] }}>
                {stats.porCategoria[cat] || 0}
              </div>
              <div style={{ fontSize: 10, color: "#888" }}>{cat}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────
export default function Anotacion() {
  const [paso, setPaso]           = useState("instrucciones"); // instrucciones → anotador → anotar
  const [anotador, setAnotador]   = useState(null);

  const handleAnotador = (a) => {
    setAnotador(a);
    setPaso("anotar");
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Anotación A/B/C</div>
        <div className="page-sub">Fase 4 del pipeline KDD · Prueba piloto: 50 oraciones</div>
      </div>

      {/* Steps indicator */}
      <div style={{ display: "flex", gap: 0, marginBottom: "2rem", maxWidth: 500 }}>
        {[
          { id: "instrucciones", label: "1. Instrucciones" },
          { id: "anotador",      label: "2. Identificación" },
          { id: "anotar",        label: "3. Anotar" },
        ].map((s, i) => {
          const active  = paso === s.id;
          const done    = (i === 0 && paso !== "instrucciones") ||
                          (i === 1 && paso === "anotar");
          return (
            <div key={s.id} style={{ display: "flex", alignItems: "center", flex: 1 }}>
              <div style={{
                flex: 1, padding: "8px 12px", fontSize: 12, fontWeight: active ? 700 : 400,
                color: active ? "#C0392B" : done ? "#2e7d32" : "#aaa",
                borderBottom: `2px solid ${active ? "#C0392B" : done ? "#2e7d32" : "#e8e4dc"}`,
                textAlign: "center",
              }}>
                {done ? "✓ " : ""}{s.label}
              </div>
            </div>
          );
        })}
      </div>

      {paso === "instrucciones" && (
        <Instrucciones onContinuar={() => setPaso("anotador")} />
      )}
      {paso === "anotador" && (
        <SeleccionAnotador onSeleccionar={handleAnotador} />
      )}
      {paso === "anotar" && anotador && (
        <InterfazAnotacion anotador={anotador} />
      )}
    </div>
  );
}
