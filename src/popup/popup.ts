import { showResults } from "../utils/index";
import type { Site } from "../utils/types";

const clearButtonElement = document.getElementById("clearButton") as HTMLButtonElement | null;
const keywordInput = document.getElementById("keywordInput") as HTMLInputElement | null;
const btnFalabella = document.getElementById("btnFalabella") as HTMLButtonElement | null;
const btnML = document.getElementById("btnML") as HTMLButtonElement | null;

function getKeyword(): string {
  const kw = (keywordInput?.value || "").trim();
  return kw;
}

async function start(site: Site) {
  const keyword = getKeyword();
  if (!keyword) {
    alert("Ingresa una keyword primero.");
    return;
  }

  const resultEl = document.getElementById("result");
  if (resultEl) resultEl.innerHTML = `<div class="p-3 text-sm text-gray-600">Iniciando scraping en ${site}…</div>`;

  // Popup -> Background (runtime message)
  chrome.runtime.sendMessage(
    { type: "startScrape", site, keyword },
    (resp) => {
      if (chrome.runtime.lastError) {
        console.error("Runtime message error:", chrome.runtime.lastError);
        if (resultEl) resultEl.innerHTML = `<div class="p-3 text-sm text-red-600">Error: ${chrome.runtime.lastError.message}</div>`;
        return;
      }

    
      if (!resp?.ok) {
        if (resultEl) resultEl.innerHTML = `<div class="p-3 text-sm text-red-600">No se pudo iniciar.</div>`;
        return;
      }

      if (resultEl) resultEl.innerHTML = `<div class="p-3 text-sm text-gray-600">Job iniciado. Tab: ${resp.tabId}</div>`;
    }
  );

 
}

function init() {
  btnFalabella?.addEventListener("click", () => start("falabella"));
  btnML?.addEventListener("click", () => start("mercadolibre"));

  clearButtonElement?.addEventListener("click", () => {
    const resultEl = document.getElementById("result");
    if (resultEl) resultEl.innerHTML = "";
    if (keywordInput) keywordInput.value = "";
  });
}

init();

chrome.runtime.onMessage.addListener((msg) => {
  const resultEl = document.getElementById("result");
  if (!resultEl) return;

  if (msg?.type === "jobUpdate") {
    resultEl.innerHTML = `<div class="p-3 text-sm text-gray-700">
      Estado: <b>${msg.job?.state}</b><br/>
      Conteo: ${msg.job?.count ?? 0}<br/>
      ${msg.job?.error ? `<span class="text-red-600">${msg.job.error}</span>` : ""}
    </div>`;
  }

  if (msg?.type === "jobResult") {
    // de momento es un json feo, luego lo mejoro :D
    resultEl.innerHTML =
      `<div class="p-3 text-sm text-gray-700">DONE ✓ (${msg.products?.length ?? 0} productos)</div>` +
      `<pre class="p-3 text-xs bg-gray-50 overflow-auto max-h-64">${JSON.stringify(msg.products, null, 2)}</pre>`;
  }
});
