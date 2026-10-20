import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
// Fonts are self-hosted from the installed packages. No font requests leave the site.
import "@fontsource-variable/inter/index.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
