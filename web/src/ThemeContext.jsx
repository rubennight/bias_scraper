// ThemeContext.jsx — modo claro/oscuro con persistencia.
//
// Tres estados posibles en localStorage: "light", "dark", o ausente
// (el usuario nunca tocó el switch → seguimos la preferencia del
// sistema operativo, vía prefers-color-scheme en index.css). Solo
// escribimos el atributo data-theme en <html> cuando hay una
// elección EXPLÍCITA — así, si el usuario nunca la toca, cambiar el
// tema del SO sigue afectando la página en vivo (la media query en
// CSS sigue mandando).

import { createContext, useContext, useEffect, useState, useCallback } from "react";

const ThemeContext = createContext(null);
const STORAGE_KEY = "bias-scraper-theme";

function sistemaPrefiereOscuro() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function ThemeProvider({ children }) {
  const [explicito, setExplicito] = useState(() => {
    try {
      const guardado = localStorage.getItem(STORAGE_KEY);
      return guardado === "light" || guardado === "dark" ? guardado : null;
    } catch {
      return null; // localStorage puede fallar en modo privado — degradamos a "sin preferencia"
    }
  });
  const [sistemaOscuro, setSistemaOscuro] = useState(sistemaPrefiereOscuro);

  // Si el usuario nunca eligió, seguir el tema del SO en vivo.
  useEffect(() => {
    const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mql) return;
    const handler = (e) => setSistemaOscuro(e.matches);
    mql.addEventListener?.("change", handler);
    return () => mql.removeEventListener?.("change", handler);
  }, []);

  const oscuro = explicito ? explicito === "dark" : sistemaOscuro;

  useEffect(() => {
    // Sin elección explícita: no tocar el atributo, que la media
    // query de index.css decida sola.
    if (explicito) {
      document.documentElement.setAttribute("data-theme", explicito);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }, [explicito]);

  const toggleTheme = useCallback(() => {
    const nuevo = oscuro ? "light" : "dark";
    setExplicito(nuevo);
    try { localStorage.setItem(STORAGE_KEY, nuevo); } catch { /* modo privado, no persiste — no rompe nada */ }
  }, [oscuro]);

  return (
    <ThemeContext.Provider value={{ oscuro, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme() debe usarse dentro de <ThemeProvider>");
  return ctx;
}
