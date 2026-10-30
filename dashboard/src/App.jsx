import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Menu from "./pages/Menu";
import MenuUser from "./pages/MenuUser";
import MenuBook from "./pages/MenuBook";
import MenuRecord from "./pages/MenuRecord";
import MenuFine from "./pages/MenuFine";
import MenuAdmin from "./pages/MenuAdmin";

function ProtectedRoute({ children }) {
  return localStorage.getItem("token") ? children : <Navigate to="/" replace />;
}
function PublicRoute({ children }) {
  return localStorage.getItem("token") ? <Navigate to="/menu" replace /> : children;
}
function App() {
  const [ready, setReady] = useState(false);
  useEffect(() => { localStorage.removeItem("token"); localStorage.removeItem("user"); setReady(true); }, []);
  if (!ready) return null;
  return <BrowserRouter><Routes>
    <Route path="/" element={<PublicRoute><Login /></PublicRoute>} />
    <Route path="/menu" element={<ProtectedRoute><Menu /></ProtectedRoute>} />
    <Route path="/menuuser" element={<ProtectedRoute><MenuUser /></ProtectedRoute>} />
    <Route path="/menubook" element={<ProtectedRoute><MenuBook /></ProtectedRoute>} />
    <Route path="/menurecord" element={<ProtectedRoute><MenuRecord /></ProtectedRoute>} />
    <Route path="/menufine" element={<ProtectedRoute><MenuFine /></ProtectedRoute>} />
    <Route path="/menuadmin" element={<ProtectedRoute><MenuAdmin /></ProtectedRoute>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></BrowserRouter>;
}
export default App;
