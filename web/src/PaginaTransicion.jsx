import { cloneElement, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

// Duración de la salida: debe coincidir con `.pagina-sale` en motion.css
const MS_SALIDA = 220;

// Transición entre páginas. Al cambiar la ruta mantiene visible la página
// anterior mientras se desvanece (clase .pagina-sale) y después monta la
// nueva, cuyos bloques entran con la animación escalonada de motion.css.
// Cubre cualquier navegación (Link, navigate, <Navigate>) porque solo mira
// la ubicación del router. `children` es el <Routes> a mostrar.
export default function PaginaTransicion({ children }) {
  const location = useLocation();
  const [mostrada, setMostrada] = useState(location);
  const [saliendo, setSaliendo] = useState(false);

  const cambiaRuta = location.pathname !== mostrada.pathname;
  if (cambiaRuta && !saliendo) setSaliendo(true);

  useEffect(() => {
    if (!saliendo) return undefined;
    const t = setTimeout(() => {
      setMostrada(location);
      setSaliendo(false);
      window.scrollTo({ top: 0, behavior: "instant" });
    }, MS_SALIDA);
    return () => clearTimeout(t);
  }, [saliendo, location]);

  // Mientras sale, se sigue renderizando la ruta anterior
  const activa = cambiaRuta ? mostrada : location;

  return (
    <div key={mostrada.pathname} className={saliendo ? "pagina pagina-sale" : "pagina"}>
      {cloneElement(children, { location: activa })}
    </div>
  );
}
