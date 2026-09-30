import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Calculator } from "@/components/calculator";
import "@/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing root");

createRoot(root).render(
  <StrictMode>
    <Calculator />
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
}
