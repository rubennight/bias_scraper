// AuthContext.jsx — sesión de usuario en toda la app.
//
// La sesión vive en una cookie httpOnly (ver api/routes/auth.js) —
// este contexto nunca toca localStorage ni lee el token: solo llama
// a GET /api/auth/me al montar (el navegador manda la cookie solo) y
// guarda el usuario resultante en memoria. Si no hay cookie o no es
// válida, /me responde {usuario: null} sin error — sesión anónima.

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api, { login as apiLogin, logout as apiLogout, getMe } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const cargarSesion = useCallback(() => {
    return getMe()
      .then(r => setUsuario(r.data.usuario))
      .catch(() => setUsuario(null));
  }, []);

  useEffect(() => {
    cargarSesion().finally(() => setLoading(false));
  }, [cargarSesion]);

  // Si cualquier petición responde 401 (sesión expirada o revocada a
  // mitad de uso — el token dura 10h), limpiamos el usuario en memoria
  // y mandamos a /login en vez de dejar que cada página maneje el
  // error por separado.
  useEffect(() => {
    const id = api.interceptors.response.use(
      res => res,
      err => {
        // No redirigir si el 401 viene del propio intento de login —
        // ahí es un error de credenciales normal, lo maneja Login.jsx.
        const esLogin = err.config?.url?.includes("/api/auth/login");
        if (err.response?.status === 401 && !esLogin) {
          setUsuario(null);
          navigate("/login");
        }
        return Promise.reject(err);
      }
    );
    return () => api.interceptors.response.eject(id);
  }, [navigate]);

  const login = async (usuarioNombre, password) => {
    const r = await apiLogin(usuarioNombre, password);
    setUsuario(r.data);
    return r.data;
  };

  const logout = async () => {
    try { await apiLogout(); } catch { /* si falla igual limpiamos localmente */ }
    setUsuario(null);
    navigate("/login");
  };

  return (
    <AuthContext.Provider value={{ usuario, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() debe usarse dentro de <AuthProvider>");
  return ctx;
}
