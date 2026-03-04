import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

const search = new URLSearchParams(window.location.search);
const useShell = search.get("shell") === "1";

if (!useShell) {
  window.location.replace("/prototype/index.html");
} else {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
