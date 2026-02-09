import { loadAppState, saveKeywords, deleteKeyword } from "../utils/storage";
import type { KeywordItem, Site } from "../utils/types";

const keywordInput = document.getElementById("keywordInput") as HTMLInputElement | null;
const addKeywordBtn = document.getElementById("addKeywordBtn") as HTMLButtonElement | null;
const refreshBtn = document.getElementById("refreshBtn") as HTMLButtonElement | null;
const clearViewBtn = document.getElementById("clearViewBtn") as HTMLButtonElement | null;

const keywordsList = document.getElementById("keywordsList") as HTMLDivElement | null;
const keywordsCount = document.getElementById("keywordsCount") as HTMLSpanElement | null;
const resultEl = document.getElementById("result") as HTMLDivElement | null;

function escapeHtml(str?: string) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function jobBadge(state?: string) {
  const s = state || "IDLE";
  const base = "text-[10px] px-2 py-0.5 rounded-full border";
  if (s === "RUNNING") return `<span class="${base} border-blue-200 bg-blue-50 text-blue-700">RUNNING</span>`;
  if (s === "DONE") return `<span class="${base} border-green-200 bg-green-50 text-green-700">DONE</span>`;
  if (s === "ERROR") return `<span class="${base} border-red-200 bg-red-50 text-red-700">ERROR</span>`;
  if (s === "CANCELLED") return `<span class="${base} border-yellow-200 bg-yellow-50 text-yellow-800">CANCELLED</span>`;
  return `<span class="${base} border-gray-200 bg-gray-50 text-gray-600">IDLE</span>`;
}

async function startScrape(site: Site, keyword: string) {
  chrome.runtime.sendMessage({ type: "startScrape", site, keyword }, (resp) => {
    if (chrome.runtime.lastError) {
      resultEl && (resultEl.innerHTML = `<div class="text-red-600">${escapeHtml(chrome.runtime.lastError.message)}</div>`);
      return;
    }
    if (!resp?.ok) {
      resultEl && (resultEl.innerHTML = `<div class="text-red-600">No se pudo iniciar: ${escapeHtml(resp?.error || "desconocido")}</div>`);
      return;
    }
    resultEl && (resultEl.innerHTML = `<div>Job iniciado ✓ (tab ${resp.tabId})</div>`);
  });
}

async function cancelScrape(keywordId: string, site: Site) {
  chrome.runtime.sendMessage({ type: "cancelScrape", keywordId, site }, (resp) => {
    if (chrome.runtime.lastError) {
      resultEl && (resultEl.innerHTML = `<div class="text-red-600">${escapeHtml(chrome.runtime.lastError.message)}</div>`);
      return;
    }
    if (!resp?.ok) {
      resultEl && (resultEl.innerHTML = `<div class="text-red-600">No se pudo cancelar: ${escapeHtml(resp?.error || "desconocido")}</div>`);
      return;
    }
    resultEl && (resultEl.innerHTML = `<div>Cancelación enviada ✓</div>`);
  });
}

async function addKeyword() {
  const kw = (keywordInput?.value || "").trim();
  if (!kw) return;

  const state = await loadAppState();
  const norm = kw.toLowerCase();

  if (state.keywords.some((k) => k.keyword.trim().toLowerCase() === norm)) {
    resultEl && (resultEl.innerHTML = `<div class="text-yellow-700">Esa keyword ya existe.</div>`);
    return;
  }

  const id = (globalThis.crypto?.randomUUID?.() ?? `kw-${Date.now()}`) as string;
  const item: KeywordItem = { id, keyword: kw, createdAt: Date.now() };

  await saveKeywords([...state.keywords, item]);
  if (keywordInput) keywordInput.value = "";
  await render();
}

async function render() {
  const state = await loadAppState();

  if (keywordsCount) keywordsCount.textContent = `${state.keywords.length} total`;

  if (!keywordsList) return;

  if (state.keywords.length === 0) {
    keywordsList.innerHTML = `<div class="text-xs text-gray-500">Aún no hay keywords. Agrega una arriba.</div>`;
    return;
  }

  // Ordena por más recientes
  const sorted = [...state.keywords].sort((a, b) => b.createdAt - a.createdAt);

  keywordsList.innerHTML = sorted
    .map((k) => {
      const jobF = state.jobs?.[k.id]?.falabella;
      const jobM = state.jobs?.[k.id]?.mercadolibre;

      const countF = state.results?.[k.id]?.falabella?.length ?? 0;
      const countM = state.results?.[k.id]?.mercadolibre?.length ?? 0;

      const canCancelF = jobF?.state === "RUNNING";
      const canCancelM = jobM?.state === "RUNNING";

      return `
        <div class="border rounded-lg p-3 space-y-2">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="text-sm font-semibold text-gray-800">${escapeHtml(k.keyword)}</div>
              <div class="text-[11px] text-gray-500">ID: ${escapeHtml(k.id.slice(0, 8))} • ${new Date(k.createdAt).toLocaleString()}</div>
            </div>
            <button data-del="${escapeHtml(k.id)}" class="text-xs text-red-600 hover:underline">Eliminar</button>
          </div>

          <div class="grid grid-cols-2 gap-2 text-xs">
            <div class="rounded border p-2">
              <div class="flex items-center justify-between">
                <div class="font-medium">Falabella</div>
                ${jobBadge(jobF?.state)}
              </div>
              <div class="mt-1 text-gray-600">Productos: <b>${countF}</b></div>
              <div class="mt-2 flex gap-2">
                <button data-start="${escapeHtml(k.keyword)}" data-site="falabella" class="flex-1 px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700">Buscar</button>
                <button data-cancel="${escapeHtml(k.id)}" data-site="falabella" class="px-2 py-1 ${canCancelF ? "bg-yellow-500 hover:bg-yellow-600 text-white" : "bg-gray-100 text-gray-400 cursor-not-allowed"} rounded" ${canCancelF ? "" : "disabled"}>Cancelar</button>
              </div>
            </div>

            <div class="rounded border p-2">
              <div class="flex items-center justify-between">
                <div class="font-medium">MercadoLibre</div>
                ${jobBadge(jobM?.state)}
              </div>
              <div class="mt-1 text-gray-600">Productos: <b>${countM}</b></div>
              <div class="mt-2 flex gap-2">
                <button data-start="${escapeHtml(k.keyword)}" data-site="mercadolibre" class="flex-1 px-2 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600">Buscar</button>
                <button data-cancel="${escapeHtml(k.id)}" data-site="mercadolibre" class="px-2 py-1 ${canCancelM ? "bg-yellow-500 hover:bg-yellow-600 text-white" : "bg-gray-100 text-gray-400 cursor-not-allowed"} rounded" ${canCancelM ? "" : "disabled"}>Cancelar</button>
              </div>
            </div>
          </div>

          <div class="flex gap-2">
            <button data-preview="${escapeHtml(k.id)}" class="flex-1 px-2 py-1 bg-gray-50 text-gray-700 rounded hover:bg-gray-100 text-xs">Ver JSON</button>
            <button data-stats="${escapeHtml(k.id)}" class="flex-1 px-2 py-1 bg-gray-50 text-gray-700 rounded hover:bg-gray-100 text-xs">Ver estadísticas</button>
          </div>
        </div>
      `;
    })
    .join("");

  // Wire events (delegación)
  keywordsList.querySelectorAll("[data-start]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const el = btn as HTMLButtonElement;
      const site = el.getAttribute("data-site") as Site;
      const keyword = String(el.getAttribute("data-start") || "");
      await startScrape(site, keyword);
      // re-render para reflejar RUNNING cuando llegue jobUpdate
    });
  });

  keywordsList.querySelectorAll("[data-cancel]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const el = btn as HTMLButtonElement;
      const site = el.getAttribute("data-site") as Site;
      const keywordId = String(el.getAttribute("data-cancel") || "");
      await cancelScrape(keywordId, site);
    });
  });

  keywordsList.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = String((btn as HTMLButtonElement).getAttribute("data-del") || "");
      await deleteKeyword(id);
      await render();
      resultEl && (resultEl.innerHTML = `<div>Keyword eliminada ✓</div>`);
    });
  });

  keywordsList.querySelectorAll("[data-preview]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = String((btn as HTMLButtonElement).getAttribute("data-preview") || "");
      const st = await loadAppState();
      const data = st.results?.[id] ?? {};
      resultEl &&
        (resultEl.innerHTML =
          `<div class="mb-2 text-[11px] text-gray-500">Preview (máx 10 por sitio)</div>` +
          `<pre class="p-2 bg-gray-50 rounded overflow-auto max-h-64">${escapeHtml(
            JSON.stringify(
              {
                falabella: (data as any).falabella?.slice?.(0, 10) ?? [],
                mercadolibre: (data as any).mercadolibre?.slice?.(0, 10) ?? [],
              },
              null,
              2
            )
          )}</pre>`);
    });
  });

  keywordsList.querySelectorAll("[data-stats]").forEach((btn) => {
    btn.addEventListener("click", () => {
      resultEl && (resultEl.innerHTML = `<div class="text-gray-600">Stats viene en el PASO 8 🙂</div>`);
    });
  });
}

function init() {
  addKeywordBtn?.addEventListener("click", addKeyword);
  keywordInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addKeyword();
  });

  refreshBtn?.addEventListener("click", render);

  clearViewBtn?.addEventListener("click", () => {
    if (resultEl) resultEl.innerHTML = "";
  });

  // Actualizaciones en vivo 
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "jobUpdate" || msg?.type === "jobResult") {
      render();
    }
  });

  render();
}

init();
