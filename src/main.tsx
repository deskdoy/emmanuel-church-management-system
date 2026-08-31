import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../app/page";
import "../app/globals.css";
import "./styles/tokens.css";
import "./styles/primitives.css";
import "./styles/motion.css";
import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { ActiveChurchProvider } from "./tenancy/ActiveChurchContext";
import { WorkspaceGate } from "./auth/WorkspaceGate";

createRoot(document.getElementById("root")!).render(
  <StrictMode><AuthProvider><ProtectedRoute><ActiveChurchProvider><WorkspaceGate><App /></WorkspaceGate></ActiveChurchProvider></ProtectedRoute></AuthProvider></StrictMode>,
);
