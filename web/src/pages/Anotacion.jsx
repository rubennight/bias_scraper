import { useState, useEffect, useCallback, useRef } from "react";
import {
  getAnotadores, crearAnotador,
  getOracionesPendientes, guardarAnotacion,
  getStatsAnotador, marcarCompleja, marcarDescartada,
  getBancoAnotaciones, eliminarAnotacion,
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

// Subtipos por categoría
const SUBTIPOS_A = [
  { value: "accion",      label: "Acción",      desc: "Acción física concreta y datable (firmó, llegó, declaró)" },
  { value: "declaracion", label: "Declaración", desc: "Afirmación atribuida a ente verificable (el DOJ acusó, la Secretaría informó)" },
  { value: "cifra",       label: "Cifra",       desc: "Dato numérico con fuente identificable (240 mdp, 3.2% del PIB)" },
  { value: "historico",   label: "Histórico",   desc: "Hecho pasado verificable usado como contexto" },
  { value: "legal",       label: "Legal",       desc: "Estatus jurídico formal (fue acusado, dictó auto de formal prisión)" },
];

const SUBTIPOS_BC = [
  { value: "lexical",    label: "Léxico",      desc: "Palabra con carga ideológica (vándalos, trumpista)" },
  { value: "metafora",   label: "Metáfora",    desc: "Imagen figurada valorativa (estrangular, capitular)" },
  { value: "epistemico", label: "Epistémico",  desc: "Intención presentada como hecho verificable" },
  { value: "omision",    label: "Omisión",     desc: "Dato relevante ausente que cambia el sentido" },
  { value: "encuadre",   label: "Encuadre",    desc: "Estructura narrativa que implica causalidad" },
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
                fontSize: 15, width: 28, height: 28, borderRadius: 8,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>{inst.cat}</span>
              <strong style={{ fontSize: 15, color: inst.color }}>{inst.titulo}</strong>
            </div>
            <p style={{ fontSize: 13, color: "#444", marginBottom: 8, lineHeight: 1.55 }}>{inst.desc}</p>
            <div style={{ background: "rgba(0,0,0,.06)", borderRadius: 8, padding: "6px 10px", fontSize: 12, marginBottom: 8 }}>
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
          borderRadius: 10, padding: "12px 36px", fontSize: 15,
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
              style={{ width: "100%", padding: "8px 12px", border: "1px solid #d8d1bf", borderRadius: 10, fontFamily: "inherit", fontSize: 13 }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>Descripción (opcional)</label>
            <input
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Ej: Segundo revisor, estudiante de ISW..."
              style={{ width: "100%", padding: "8px 12px", border: "1px solid #d8d1bf", borderRadius: 10, fontFamily: "inherit", fontSize: 13 }}
            />
          </div>
          {error && <div style={{ color: "#C0392B", fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleCrear} disabled={loading} style={{
              background: "#C0392B", color: "#fff", border: "none", borderRadius: 10,
              padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>
              {loading ? "..." : "Registrar y comenzar"}
            </button>
            <button onClick={() => { setNuevo(false); setError(""); }} style={{
              background: "transparent", border: "1px solid #ccc", borderRadius: 10,
              padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
            }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Componente reutilizable: botones A/B/C con tooltip ─────────
// Usado por InterfazAnotacion (flujo de anotación) y por el editor
// del Banco de Anotaciones — misma UI, sin duplicarla.
function SelectorCategoria({ categoria, onChange }) {
  const [hoveredCat, setHoveredCat] = useState(null);

  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
      {["A", "B", "C"].map(cat => {
        const inst = INSTRUCCIONES.find(i => i.cat === cat);
        return (
          <div key={cat} style={{ flex: 1, position: "relative" }}
            onMouseEnter={() => setHoveredCat(cat)}
            onMouseLeave={() => setHoveredCat(null)}
          >
            <button onClick={() => onChange(cat)} style={{
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
                <div style={{ background: "rgba(0,0,0,.06)", borderRadius: 8, padding: "5px 8px", fontSize: 11, marginBottom: 8 }}>
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
  );
}

// ── Componente reutilizable: editor de elementos + notas ───────
// Usado por InterfazAnotacion y por el editor del Banco de Anotaciones.
function ElementosEditor({ categoria, elementos, setElementos, notas, setNotas }) {
  if (!categoria) return null;

  return (
    <div style={{ background: CAT_BG[categoria], border: `1px solid ${CAT_COLOR[categoria]}40`, borderRadius: 8, padding: "12px 16px", marginBottom: 16 }}>

      <div style={{ fontSize: 11, fontWeight: 700, color: CAT_COLOR[categoria], textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>
        {categoria === "A" ? "Elementos factuales identificados" : "Elementos de sesgo detectados"}
      </div>

      {/* Cabecera de columnas */}
      {elementos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: categoria === "A" ? "2fr 130px 28px" : "1fr 1fr 110px 130px 28px", gap: 6, marginBottom: 4 }}>
          {(categoria === "A"
            ? ["Elemento factual", "Subtipo", ""]
            : ["Elemento con sesgo", "Alternativa neutral", "Tipo", "Mecanismo", ""]
          ).map((h, i) => (
            <div key={i} style={{ fontSize: 10, color: "#999", textTransform: "uppercase", letterSpacing: ".04em" }}>{h}</div>
          ))}
        </div>
      )}

      {/* Filas de elementos */}
      {elementos.map((el, i) => (
        <div key={i} style={{
          display: "grid",
          gridTemplateColumns: categoria === "A" ? "2fr 130px 28px" : "1fr 1fr 110px 130px 28px",
          gap: 6, marginBottom: 7, alignItems: "center",
        }}>
          {/* Elemento — igual para A, B, C */}
          <input
            value={el.elemento}
            onChange={e => {
              const copia = [...elementos];
              copia[i].elemento = e.target.value;
              setElementos(copia);
            }}
            placeholder={el.tipo === "A"
              ? "ej: firmó el decreto, el DOJ acusó..."
              : "ej: estrangular, vándalos, régimen..."}
            style={{ padding: "6px 8px", border: "1px solid #ddd", borderRadius: 10, fontFamily: "inherit", fontSize: 12 }}
          />

          {/* Alternativa + Tipo — solo B y C */}
          {categoria !== "A" && (
            <>
              <textarea
                value={el.alternativa}
                onChange={e => {
                  const copia = [...elementos];
                  copia[i].alternativa = e.target.value;
                  setElementos(copia);
                }}
                placeholder="ej: manifestantes, activistas, ciudadanos (separar con coma)"
                rows={2}
                style={{ padding: "6px 8px", border: "1px solid #ddd", borderRadius: 10, fontFamily: "inherit", fontSize: 12, resize: "vertical", width: "100%" }}
              />
              <select
                value={el.tipo}
                onChange={e => {
                  const copia = [...elementos];
                  copia[i].tipo = e.target.value;
                  setElementos(copia);
                }}
                style={{ padding: "6px 6px", border: "1px solid #ddd", borderRadius: 10, fontFamily: "inherit", fontSize: 12 }}
              >
                <option value="A">A — Hecho</option>
                <option value="B">B — Eval.</option>
                <option value="C">C — Marco</option>
              </select>
            </>
          )}

          {/* Subtipo — opciones según el tipo del elemento individual */}
          <select
            value={el.subtipo || ""}
            onChange={e => {
              const copia = [...elementos];
              copia[i].subtipo = e.target.value;
              setElementos(copia);
            }}
            style={{ padding: "6px 6px", border: "1px solid #ddd", borderRadius: 10, fontFamily: "inherit", fontSize: 12 }}
          >
            <option value="">— subtipo</option>
            {(el.tipo === "A" ? SUBTIPOS_A : SUBTIPOS_BC).map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <button
            onClick={() => setElementos(elementos.filter((_, j) => j !== i))}
            style={{ background: "transparent", border: "1px solid #ddd", borderRadius: 10, padding: "4px 6px", cursor: "pointer", color: "#bbb", fontSize: 13 }}
          >✕</button>
        </div>
      ))}

      {/* Tooltip de subtipos */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8, marginTop: 2 }}>
        {(categoria === "A" ? SUBTIPOS_A : SUBTIPOS_BC).map(s => (
          <span key={s.value} style={{ fontSize: 10, color: "#999", background: "#f0ede8", borderRadius: 8, padding: "1px 6px" }}
            title={s.desc}>
            {s.label}: {s.desc}
          </span>
        ))}
      </div>

      {/* Botón agregar elemento */}
      <button
        onClick={() => setElementos([...elementos, { elemento: "", alternativa: "", tipo: categoria, subtipo: "" }])}
        style={{ background: "transparent", border: `1px dashed ${CAT_COLOR[categoria]}`, borderRadius: 10, padding: "5px 14px", cursor: "pointer", fontSize: 12, color: CAT_COLOR[categoria], fontFamily: "inherit" }}
      >
        {categoria === "A" ? "+ Agregar elemento factual" : "+ Agregar elemento de sesgo"}
      </button>

      {/* Notas */}
      <div style={{ marginTop: 10 }}>
        <input
          value={notas}
          onChange={e => setNotas(e.target.value)}
          placeholder="Notas o justificación (opcional)"
          style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 10, fontFamily: "inherit", fontSize: 12 }}
        />
      </div>
    </div>
  );
}

// ── Componente reutilizable: pills de confianza con tooltip ────
function SelectorConfianza({ confianza, setConfianza }) {
  const [hoveredConf, setHoveredConf] = useState(null);

  return (
    <div style={{ display: "flex", gap: 6, flex: 1, alignItems: "center" }}>
      {["alta", "media", "baja"].map(c => {
        const info = CONFIANZA_INFO[c];
        return (
          <div key={c} style={{ position: "relative" }}
            onMouseEnter={() => setHoveredConf(c)}
            onMouseLeave={() => setHoveredConf(null)}
          >
            <button onClick={() => setConfianza(c)} style={{
              padding: "6px 14px", borderRadius: 10, fontSize: 12,
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
  );
}

// ── Componente: interfaz de anotación ─────────────────────────
function InterfazAnotacion({ anotador }) {
  const [oraciones, setOraciones]     = useState([]);
  const [idx, setIdx]                 = useState(0);
  const [categoria, setCategoria]     = useState(null);
  const [elementos, setElementos]     = useState([]); // [{elemento, alternativa, tipo}]
  const [confianza, setConfianza]     = useState("alta");
  const [notas, setNotas]             = useState("");
  const [guardando, setGuardando]     = useState(false);
  const [guardadas, setGuardadas]     = useState(0);
  const [stats, setStats]             = useState(null);
  const [cargando, setCargando]       = useState(true);
  const [pilotoCompletado, setPilotoCompletado] = useState(false);
  const [hoveredBtn, setHoveredBtn]   = useState(null);

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
    setElementos([]);
    setConfianza("alta");
    setNotas("");
  };

  const handleGuardar = useCallback(async () => {
    if (!categoria) return;
    const oracion = oraciones[idx];
    setGuardando(true);
    try {
      await guardarAnotacion({
        oracion_id:  oracion.id,
        anotador_id: anotador.id,
        categoria,
        elementos:   elementos.filter(e => e.elemento.trim()),
        confianza,
        notas: notas || null,
      });
      setGuardadas(g => g + 1);
      if (guardadas + 1 >= 50) setPilotoCompletado(true);
      if (idx + 1 < oraciones.length) {
        setIdx(i => i + 1);
        resetForm();
      } else {
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
  }, [categoria, oraciones, idx, anotador.id, elementos, confianza, notas, guardadas]);

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
            <span style={{ marginLeft: 8, background: "#fef0cc", color: "#c07800", border: "1px solid #f0c870", borderRadius: 8, fontSize: 10, padding: "2px 6px", fontWeight: 700 }}>
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
      <div style={{ background: "#e8e4dc", borderRadius: 8, height: 4, marginBottom: 20 }}>
        <div style={{ background: "#C0392B", height: "100%", borderRadius: 8, width: `${progreso}%`, transition: "width .3s" }} />
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
      <SelectorCategoria categoria={categoria} onChange={setCategoria} />

      {/* Elementos — A, B y C */}
      <ElementosEditor
        categoria={categoria}
        elementos={elementos}
        setElementos={setElementos}
        notas={notas}
        setNotas={setNotas}
      />

      {/* Confianza + Guardar + Compleja */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <SelectorConfianza confianza={confianza} setConfianza={setConfianza} />

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

        {/* Botón oración compleja */}
        {(() => {
          const skipToNext = async () => {
            if (idx + 1 < oraciones.length) {
              setIdx(i => i + 1);
              resetForm();
            } else {
              const r = await getOracionesPendientes({ anotador_id: anotador.id, limite: 100 });
              setOraciones(r.data);
              setIdx(0);
              resetForm();
            }
          };
          return (
            <>
              <div style={{ position: "relative" }}
                onMouseEnter={() => setHoveredBtn("compleja")}
                onMouseLeave={() => setHoveredBtn(null)}
              >
                <button
                  onClick={async () => {
                    try { await marcarCompleja(oraciones[idx].id); await skipToNext(); }
                    catch (e) { console.error(e); }
                  }}
                  style={{
                    background: "transparent", border: "1px solid #ddd",
                    borderRadius: 8, padding: "10px 14px", fontSize: 12,
                    color: "#999", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  ⚑ Compleja
                </button>
                {hoveredBtn === "compleja" && (
                  <div style={{
                    position: "absolute", bottom: "calc(100% + 10px)", left: "50%",
                    transform: "translateX(-50%)", width: 250,
                    background: "#fef9ec", border: "1.5px solid #c89a2e",
                    borderRadius: 8, padding: "10px 12px", zIndex: 100,
                    boxShadow: "0 4px 18px rgba(0,0,0,.13)", pointerEvents: "none",
                    textAlign: "left",
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: "#c07800", marginBottom: 4 }}>Oración compleja</div>
                    <p style={{ fontSize: 11.5, color: "#555", lineHeight: 1.5, margin: 0 }}>
                      La oración es contenido real del artículo pero es demasiado ambigua para clasificar limpiamente como A, B o C. Se excluye del entrenamiento.
                    </p>
                    <div style={{
                      position: "absolute", bottom: -7, left: "50%", marginLeft: -6,
                      width: 12, height: 12, background: "#fef9ec",
                      borderRight: "1.5px solid #c89a2e", borderBottom: "1.5px solid #c89a2e",
                      transform: "rotate(45deg)",
                    }} />
                  </div>
                )}
              </div>

              <div style={{ position: "relative" }}
                onMouseEnter={() => setHoveredBtn("ruido")}
                onMouseLeave={() => setHoveredBtn(null)}
              >
                <button
                  onClick={async () => {
                    try { await marcarDescartada(oraciones[idx].id); await skipToNext(); }
                    catch (e) { console.error(e); }
                  }}
                  style={{
                    background: "transparent", border: "1px solid #ddd",
                    borderRadius: 8, padding: "10px 14px", fontSize: 12,
                    color: "#999", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  ✕ Ruido
                </button>
                {hoveredBtn === "ruido" && (
                  <div style={{
                    position: "absolute", bottom: "calc(100% + 10px)", left: "50%",
                    transform: "translateX(-50%)", width: 250,
                    background: "#f5f0f0", border: "1.5px solid #999",
                    borderRadius: 8, padding: "10px 12px", zIndex: 100,
                    boxShadow: "0 4px 18px rgba(0,0,0,.13)", pointerEvents: "none",
                    textAlign: "left",
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: "#555", marginBottom: 4 }}>Oración descartada (ruido)</div>
                    <p style={{ fontSize: 11.5, color: "#555", lineHeight: 1.5, margin: 0 }}>
                      No es contenido analizable: encabezados, pies de foto, navegación ("Te puede interesar"), frases genéricas sin relación al evento. Se excluye permanentemente del corpus.
                    </p>
                    <div style={{
                      position: "absolute", bottom: -7, left: "50%", marginLeft: -6,
                      width: 12, height: 12, background: "#f5f0f0",
                      borderRight: "1.5px solid #999", borderBottom: "1.5px solid #999",
                      transform: "rotate(45deg)",
                    }} />
                  </div>
                )}
              </div>
            </>
          );
        })()}
      </div>

      {/* Atajos */}
      <div style={{ marginTop: 12, fontSize: 11, color: "#bbb", textAlign: "center" }}>
        Atajos: <kbd style={{ background: "#f0ede8", padding: "1px 5px", borderRadius: 8 }}>A</kbd>
        {" "}<kbd style={{ background: "#f0ede8", padding: "1px 5px", borderRadius: 8 }}>B</kbd>
        {" "}<kbd style={{ background: "#f0ede8", padding: "1px 5px", borderRadius: 8 }}>C</kbd>
        {" "}para categoría · <kbd style={{ background: "#f0ede8", padding: "1px 5px", borderRadius: 8 }}>Enter</kbd> para guardar
      </div>

      {/* Stats por categoría */}
      {stats?.porCategoria && Object.keys(stats.porCategoria).length > 0 && (
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center" }}>
          {["A", "B", "C"].map(cat => (
            <div key={cat} style={{
              background: CAT_BG[cat], border: `1px solid ${CAT_COLOR[cat]}60`,
              borderRadius: 10, padding: "6px 14px", textAlign: "center",
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

// ── Componente: fila del Banco, con edición inline ─────────────
function FilaAnotacion({ row, anotador, onGuardado, onEliminado }) {
  const [editando, setEditando]       = useState(false);
  const [categoria, setCategoria]     = useState(row.categoria);
  const [elementos, setElementos]     = useState(
    row.elementos.map(el => ({
      elemento: el.elemento, alternativa: el.alternativa || "",
      tipo: el.tipo, subtipo: el.subtipo || "",
    }))
  );
  const [confianza, setConfianza]     = useState(row.confianza);
  const [notas, setNotas]             = useState(row.notas || "");
  const [guardando, setGuardando]     = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [eliminando, setEliminando]   = useState(false);
  const [error, setError]             = useState("");

  const esPropia = row.anotador_id === anotador.id;

  const cancelar = () => {
    setCategoria(row.categoria);
    setElementos(row.elementos.map(el => ({
      elemento: el.elemento, alternativa: el.alternativa || "",
      tipo: el.tipo, subtipo: el.subtipo || "",
    })));
    setConfianza(row.confianza);
    setNotas(row.notas || "");
    setError("");
    setEditando(false);
  };

  const guardar = async () => {
    if (!categoria) return;
    setGuardando(true);
    setError("");
    try {
      await guardarAnotacion({
        oracion_id:  row.oracion_id,
        anotador_id: anotador.id,
        categoria,
        elementos:   elementos.filter(e => e.elemento.trim()),
        confianza,
        notas: notas || null,
      });
      setEditando(false);
      onGuardado();
    } catch (e) {
      setError(e.response?.data?.error || "Error al guardar los cambios");
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    setEliminando(true);
    setError("");
    try {
      await eliminarAnotacion(row.id, anotador.id);
      onEliminado();
    } catch (e) {
      setError(e.response?.data?.error || "Error al eliminar");
      setEliminando(false);
      setConfirmando(false);
    }
  };

  return (
    <div style={{ background: "#fff", border: "1px solid #e8e4dc", borderRadius: 8, padding: "14px 16px", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", color: "#aaa" }}>
          {row.fuente} · {row.titular_evento?.slice(0, 60)}
        </div>
        <span style={{ background: CAT_COLOR[row.categoria], color: "#fff", fontWeight: 700, fontSize: 11, padding: "2px 8px", borderRadius: 6, flexShrink: 0 }}>
          {row.categoria}
        </span>
      </div>

      <div style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 10, color: "#1a1a1a" }}>{row.texto}</div>

      {!editando ? (
        <>
          {row.elementos.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {row.elementos.map(el => (
                <span key={el.id} style={{
                  fontSize: 11, background: CAT_BG[el.tipo], color: CAT_COLOR[el.tipo],
                  border: `1px solid ${CAT_COLOR[el.tipo]}40`, borderRadius: 6, padding: "2px 7px",
                }}>
                  {el.tipo}{el.subtipo ? ` · ${el.subtipo}` : ""}: {el.elemento}
                </span>
              ))}
            </div>
          )}

          {row.notas && (
            <div style={{ fontSize: 11.5, color: "#888", fontStyle: "italic", marginBottom: 10 }}>"{row.notas}"</div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 11, color: "#999" }}>
              {row.anotador_nombre} · confianza {row.confianza} · {new Date(row.creado_en).toLocaleString("es-MX")}
            </div>
            {esPropia && !confirmando && (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setEditando(true)} style={{
                  background: "transparent", border: "1px solid #ddd", borderRadius: 8,
                  padding: "4px 12px", fontSize: 11.5, color: "#555", cursor: "pointer", fontFamily: "inherit",
                }}>Editar</button>
                <button onClick={() => setConfirmando(true)} style={{
                  background: "transparent", border: "1px solid #f5bbb0", borderRadius: 8,
                  padding: "4px 12px", fontSize: 11.5, color: "#C0392B", cursor: "pointer", fontFamily: "inherit",
                }}>Eliminar</button>
              </div>
            )}
            {esPropia && confirmando && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11.5, color: "#C0392B" }}>¿Eliminar esta anotación y sus elementos?</span>
                <button onClick={eliminar} disabled={eliminando} style={{
                  background: "#C0392B", color: "#fff", border: "none", borderRadius: 8,
                  padding: "4px 12px", fontSize: 11.5, cursor: "pointer", fontFamily: "inherit", fontWeight: 700,
                }}>{eliminando ? "..." : "Sí, eliminar"}</button>
                <button onClick={() => setConfirmando(false)} style={{
                  background: "transparent", border: "1px solid #ddd", borderRadius: 8,
                  padding: "4px 12px", fontSize: 11.5, color: "#888", cursor: "pointer", fontFamily: "inherit",
                }}>Cancelar</button>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <SelectorCategoria categoria={categoria} onChange={setCategoria} />
          <ElementosEditor
            categoria={categoria}
            elementos={elementos}
            setElementos={setElementos}
            notas={notas}
            setNotas={setNotas}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <SelectorConfianza confianza={confianza} setConfianza={setConfianza} />
            <button onClick={guardar} disabled={!categoria || guardando} style={{
              background: categoria ? "#C0392B" : "#ccc", color: "#fff", border: "none",
              borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 700,
              cursor: categoria ? "pointer" : "default", fontFamily: "inherit",
            }}>{guardando ? "..." : "Guardar cambios"}</button>
            <button onClick={cancelar} style={{
              background: "transparent", border: "1px solid #ddd", borderRadius: 8,
              padding: "8px 16px", fontSize: 13, color: "#888", cursor: "pointer", fontFamily: "inherit",
            }}>Cancelar</button>
          </div>
        </>
      )}

      {error && <div style={{ color: "#C0392B", fontSize: 12, marginTop: 8 }}>{error}</div>}
    </div>
  );
}

// ── Componente: Banco de Anotaciones — lista, filtros, CRUD ────
const LIMITE_BANCO = 20;

function BancoAnotaciones({ anotador }) {
  const [anotadores, setAnotadores] = useState([]);
  const [qInput, setQInput]         = useState("");
  const [filtros, setFiltros]       = useState({ anotador_id: "", categoria: "", confianza: "", q: "" });
  const [pagina, setPagina]         = useState(1);
  const [data, setData]             = useState({ anotaciones: [], total: 0, total_paginas: 1 });
  const [cargando, setCargando]     = useState(true);
  const [error, setError]           = useState("");
  const debounceRef = useRef(null);

  useEffect(() => {
    getAnotadores().then(r => setAnotadores(r.data)).catch(() => {});
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const params = { pagina, limite: LIMITE_BANCO };
      if (filtros.anotador_id) params.anotador_id = filtros.anotador_id;
      if (filtros.categoria)   params.categoria   = filtros.categoria;
      if (filtros.confianza)   params.confianza   = filtros.confianza;
      if (filtros.q)           params.q           = filtros.q;
      const r = await getBancoAnotaciones(params);
      setData(r.data);
    } catch (e) {
      setError("Error al cargar el banco de anotaciones");
    } finally {
      setCargando(false);
    }
  }, [filtros, pagina]);

  useEffect(() => { cargar(); }, [cargar]);

  // Búsqueda de texto con debounce — resetea a página 1 en cada cambio de filtro
  const handleQChange = (valor) => {
    setQInput(valor);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPagina(1);
      setFiltros(f => ({ ...f, q: valor }));
    }, 400);
  };

  const handleFiltro = (campo, valor) => {
    setPagina(1);
    setFiltros(f => ({ ...f, [campo]: valor }));
  };

  return (
    <div style={{ maxWidth: 780, margin: "0 auto" }}>
      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <select value={filtros.anotador_id} onChange={e => handleFiltro("anotador_id", e.target.value)}
          style={{ padding: "7px 10px", border: "1px solid #ddd", borderRadius: 10, fontFamily: "inherit", fontSize: 12.5 }}>
          <option value="">Todos los anotadores</option>
          {anotadores.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <select value={filtros.categoria} onChange={e => handleFiltro("categoria", e.target.value)}
          style={{ padding: "7px 10px", border: "1px solid #ddd", borderRadius: 10, fontFamily: "inherit", fontSize: 12.5 }}>
          <option value="">Todas las categorías</option>
          <option value="A">A — Hecho</option>
          <option value="B">B — Evaluación</option>
          <option value="C">C — Marco</option>
        </select>
        <select value={filtros.confianza} onChange={e => handleFiltro("confianza", e.target.value)}
          style={{ padding: "7px 10px", border: "1px solid #ddd", borderRadius: 10, fontFamily: "inherit", fontSize: 12.5 }}>
          <option value="">Toda confianza</option>
          <option value="alta">Alta</option>
          <option value="media">Media</option>
          <option value="baja">Baja</option>
        </select>
        <input
          value={qInput}
          onChange={e => handleQChange(e.target.value)}
          placeholder="Buscar en el texto de la oración..."
          style={{ flex: 1, minWidth: 200, padding: "7px 10px", border: "1px solid #ddd", borderRadius: 10, fontFamily: "inherit", fontSize: 12.5 }}
        />
      </div>

      <div style={{ fontSize: 12, color: "#999", marginBottom: 10 }}>
        {data.total} anotaci{data.total === 1 ? "ón" : "ones"} encontrada{data.total === 1 ? "" : "s"}
      </div>

      {error && <div style={{ color: "#C0392B", fontSize: 13, marginBottom: 10 }}>{error}</div>}

      {cargando ? (
        <div className="loading"><div className="spinner" />Cargando...</div>
      ) : data.anotaciones.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">·</div>
          <div className="empty-state-text">Sin anotaciones que coincidan con los filtros.</div>
        </div>
      ) : (
        <>
          {data.anotaciones.map(row => (
            <FilaAnotacion
              key={row.id}
              row={row}
              anotador={anotador}
              onGuardado={cargar}
              onEliminado={cargar}
            />
          ))}

          {/* Paginación */}
          {data.total_paginas > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14, marginTop: 16 }}>
              <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina <= 1} style={{
                background: "transparent", border: "1px solid #ddd", borderRadius: 8,
                padding: "6px 14px", fontSize: 12.5, cursor: pagina <= 1 ? "default" : "pointer",
                color: pagina <= 1 ? "#ccc" : "#555", fontFamily: "inherit",
              }}>‹ Anterior</button>
              <span style={{ fontSize: 12.5, color: "#888" }}>Página {data.pagina} de {data.total_paginas}</span>
              <button onClick={() => setPagina(p => Math.min(data.total_paginas, p + 1))} disabled={pagina >= data.total_paginas} style={{
                background: "transparent", border: "1px solid #ddd", borderRadius: 8,
                padding: "6px 14px", fontSize: 12.5, cursor: pagina >= data.total_paginas ? "default" : "pointer",
                color: pagina >= data.total_paginas ? "#ccc" : "#555", fontFamily: "inherit",
              }}>Siguiente ›</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────
export default function Anotacion() {
  const [paso, setPaso]           = useState("instrucciones"); // instrucciones → anotador → anotar
  const [anotador, setAnotador]   = useState(null);
  const [vista, setVista]         = useState("anotar"); // anotar → banco

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
        <>
          {/* Pestaña interna: Anotar / Banco de Anotaciones */}
          <div style={{ display: "flex", gap: 8, marginBottom: "1.5rem", justifyContent: "center" }}>
            {[
              { id: "anotar", label: "Anotar" },
              { id: "banco",  label: "Banco de Anotaciones" },
            ].map(v => (
              <button key={v.id} onClick={() => setVista(v.id)} style={{
                background: vista === v.id ? "#C0392B" : "transparent",
                color: vista === v.id ? "#fff" : "#888",
                border: `1.5px solid ${vista === v.id ? "#C0392B" : "#ddd"}`,
                borderRadius: 10, padding: "7px 18px", fontSize: 13,
                fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}>
                {v.label}
              </button>
            ))}
          </div>

          {vista === "anotar"
            ? <InterfazAnotacion anotador={anotador} />
            : <BancoAnotaciones anotador={anotador} />}
        </>
      )}
    </div>
  );
}
