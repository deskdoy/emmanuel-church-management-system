import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../app/page";
import "../app/globals.css";
import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";

createRoot(document.getElementById("root")!).render(
  <StrictMode><AuthProvider><ProtectedRoute><App /></ProtectedRoute></AuthProvider></StrictMode>,
);
