import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./styles.css";

const reportRendererError = (message: string, details: string): void => {
  if (!window.rndDesktop) {
    console.error(message, details);
    return;
  }

  window.rndDesktop.log.error(message, details);
};

window.addEventListener("error", (event) => {
  const stack = event.error instanceof Error ? event.error.stack ?? "" : "";
  reportRendererError(
    event.message || "Unhandled renderer error",
    `${event.filename}:${event.lineno}:${event.colno}\n${stack}`.trim()
  );
});

window.addEventListener("unhandledrejection", (event) => {
  const reason =
    event.reason instanceof Error
      ? `${event.reason.message}\n${event.reason.stack ?? ""}`.trim()
      : String(event.reason);
  reportRendererError("Unhandled renderer promise rejection", reason);
});

if (typeof window !== "undefined" && !window.rndDesktop) {
  registerSW({ immediate: true });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
