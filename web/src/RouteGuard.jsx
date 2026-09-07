// RouteGuard.jsx — protege una ruta según sesión/rol.
//
// - Sin sesión: redirige a /login (recordando a dónde quería ir).
// - Con sesión pero rol no permitido: NO redirige a /login otra vez
//   (ya está autenticado, sería confuso) — muestra un mensaje de
//   acceso restringido en el lugar.

import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function RouteGuard({ roles, children }) {
  const { usuario, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="loading"><div className="spinner" />Verificando sesión</div>;
  }

  if (!usuario) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles && !roles.includes(usuario.rol)) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🔒</div>
        <div className="empty-state-text">
          Tu cuenta ({usuario.usuario}, rol {usuario.rol}) no tiene acceso a esta sección.
        </div>
      </div>
    );
  }

  return children;
}
