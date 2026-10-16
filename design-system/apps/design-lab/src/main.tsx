import React from "react";
import ReactDOM from "react-dom/client";
import "@opc-team/theme/default.css";
import "@opc-team/ui/styles.css";
import "@opc-team/ui/mobile.css";
import { App } from "./App";
import { I18nProvider } from "./i18n";
import "./font-profiles/ibm-plex-mono.css";
import "./styles.css";
import "./design-layout.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Design Lab root element was not found.");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);
