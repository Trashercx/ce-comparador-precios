import { loadAppState, saveKeywords, upsertJob, upsertResults, newJob } from "../utils/storage";
import type { KeywordItem, ProductNormalized, Site, ScrapeJob } from "../utils/types";

type ActiveKey = `${string}:${Site}`; // keywordId:site
const activePorts = new Map<ActiveKey, chrome.runtime.Port>();

function keyOf(keywordId: string, site: Site): ActiveKey {
  return `${keywordId}:${site}`;
}

function buildSearchUrl(site: Site, keyword: string): string {
  const q = encodeURIComponent(keyword.trim());
  if (site === "falabella") return `https://www.falabella.com.pe/falabella-pe/search?Ntt=${q}`;
  return `https://listado.mercadolibre.com.pe/${q}`;
}

function waitTabComplete(tabId: number, timeoutMs = 20000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Timeout esperando que el tab cargue"));
    }, timeoutMs);

    const listener = (updatedTabId: number, info: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

function parsePriceNumber(input: unknown): number | null {
  if (typeof input !== "string") return null;

  const cleaned = input
    .replace(/[^\d.,]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "") // miles con punto
    .replace(/,(?=\d{3}(\D|$))/g, ""); // miles con coma

  const normalized = cleaned.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function toNormalizedProducts(site: Site, keyword: string, items: any[]): ProductNormalized[] {
  const ts = Date.now();

  if (site === "falabella") {
    return items.map((p, idx) => ({
      site,
      keyword,
      timestamp: ts,
      position: Number(p.position ?? idx + 1),
      title: p.nombreArticulo ?? null,
      priceText: p.precioArticulo ?? null,
      priceNumber: parsePriceNumber(p.precioArticulo),
      url: p.url ?? null,
      brand: p.marca ?? null,
      seller: p.quienComercializa ?? null,
    }));
  }

  return items.map((p, idx) => {
    const parts: string[] = Array.isArray(p.raw) ? p.raw : [];
    const title = parts[0] ?? null;
    const priceText = parts.find((x) => /S\/|\$/.test(x)) ?? null;

    return {
      site,
      keyword,
      timestamp: ts,
      position: Number(p.position ?? idx + 1),
      title,
      priceText,
      priceNumber: parsePriceNumber(priceText),
      url: p.url ?? null,
      brand: null,
      seller: null,
    };
  });
}

async function getOrCreateKeywordId(keyword: string): Promise<{ keywordId: string; item: KeywordItem }> {
  const state = await loadAppState();
  const normalized = keyword.trim().toLowerCase();

  const existing = state.keywords.find((k) => k.keyword.trim().toLowerCase() === normalized);
  if (existing) return { keywordId: existing.id, item: existing };

  const id = (globalThis.crypto?.randomUUID?.() ?? `kw-${Date.now()}`) as string;
  const item: KeywordItem = { id, keyword: keyword.trim(), createdAt: Date.now() };

  await saveKeywords([...state.keywords, item]);
  return { keywordId: id, item };
}

function notifyPopup(msg: any) {
  try {
    chrome.runtime.sendMessage(msg);
  } catch {
    // ignore
  }
}

function cleanup(activeKey: ActiveKey, port?: chrome.runtime.Port) {
  const current = activePorts.get(activeKey);
  if (port && current === port) {
    activePorts.delete(activeKey);
  }
}

chrome.runtime.onInstalled.addListener(() => console.log("Extension installed"));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "startScrape") {
    const site = message.site as Site;
    const keyword = String(message.keyword || "").trim();

    (async () => {
      try {
        if (!keyword) throw new Error("Keyword vacía");

        const { keywordId } = await getOrCreateKeywordId(keyword);
        const url = buildSearchUrl(site, keyword);

        // 1) Abrir tab
        const tab = await chrome.tabs.create({ url, active: true });
        if (!tab.id) throw new Error("No se pudo obtener tab.id");
        const tabId = tab.id;

        // 2) Esperar a que cargue (clave para que el content script esté listo)
        await waitTabComplete(tabId);

        // 3) Guardar job RUNNING
        const job: ScrapeJob = newJob(tabId, url);
        await upsertJob(keywordId, site, job);
        notifyPopup({ type: "jobUpdate", keywordId, site, job });

        // 4) Conectar por puerto persistente (requisito)
        const port = chrome.tabs.connect(tabId, { name: `scrape:${site}` });
        const activeKey = keyOf(keywordId, site);

        // Cerrar port anterior si existía
        const old = activePorts.get(activeKey);
        if (old) {
          try { old.disconnect(); } catch {}
          activePorts.delete(activeKey);
        }

        activePorts.set(activeKey, port);

        port.onDisconnect.addListener(() => {
          cleanup(activeKey, port);
        });

        port.onMessage.addListener(async (msg) => {
        
          // console.log("BG port msg:", msg);

          if (msg?.type === "ready") {
            // handshake opcional (content dice "estoy listo")
            return;
          }

          if (msg?.type === "progress") {
            const count = Number(msg.count || 0);
            const nextJob: ScrapeJob = { ...job, count };
            await upsertJob(keywordId, site, nextJob);
            notifyPopup({ type: "jobUpdate", keywordId, site, job: nextJob });
            return;
          }

          if (msg?.type === "result") {
            const rawProducts = Array.isArray(msg.products) ? msg.products : [];
            const normalizedProducts = toNormalizedProducts(site, keyword, rawProducts);

            const doneJob: ScrapeJob = {
              ...job,
              state: "DONE",
              endedAt: Date.now(),
              count: normalizedProducts.length,
              error: null,
            };

            await upsertResults(keywordId, site, normalizedProducts);
            await upsertJob(keywordId, site, doneJob);

            notifyPopup({ type: "jobUpdate", keywordId, site, job: doneJob });
            notifyPopup({ type: "jobResult", keywordId, site, products: normalizedProducts });

            try { port.disconnect(); } catch {}
            cleanup(activeKey, port);
            return;
          }

          if (msg?.type === "error") {
            const errMsg = String(msg.message || "Error desconocido");
            const errorJob: ScrapeJob = {
              ...job,
              state: "ERROR",
              endedAt: Date.now(),
              error: errMsg,
            };

            await upsertJob(keywordId, site, errorJob);
            notifyPopup({ type: "jobUpdate", keywordId, site, job: errorJob });

            try { port.disconnect(); } catch {}
            cleanup(activeKey, port);
            return;
          }

          if (msg?.type === "cancelled") {
            const cancelledJob: ScrapeJob = {
              ...job,
              state: "CANCELLED",
              endedAt: Date.now(),
              error: null,
            };

            await upsertJob(keywordId, site, cancelledJob);
            notifyPopup({ type: "jobUpdate", keywordId, site, job: cancelledJob });

            try { port.disconnect(); } catch {}
            cleanup(activeKey, port);
            return;
          }
        });

        // 5) Iniciar scraping en content
        port.postMessage({ type: "start", site, keywordId, keyword });

        sendResponse({ ok: true, keywordId, tabId, url });
      } catch (err: any) {
        console.error("startScrape error:", err);
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();

    return true;
  }

  if (message?.type === "cancelScrape") {
    const keywordId = String(message.keywordId || "");
    const site = message.site as Site;

    (async () => {
      const activeKey = keyOf(keywordId, site);
      const port = activePorts.get(activeKey);

      if (!port) {
        sendResponse({ ok: false, error: "No hay job activo para cancelar." });
        return;
      }

      // Cancelación rápida (<1s)
      port.postMessage({ type: "cancel" });
      sendResponse({ ok: true });
    })();

    return true;
  }
});
