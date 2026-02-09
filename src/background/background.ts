import type { Site } from "../utils/types";

// URLs de búsqueda
function buildSearchUrl(site: Site, keyword: string): string {
  const q = encodeURIComponent(keyword.trim());
  if (site === "falabella") {
    return `https://www.falabella.com.pe/falabella-pe/search?Ntt=${q}`;
  }
  // MercadoLibre Perú
  return `https://listado.mercadolibre.com.pe/${q}`;
}

async function openTab(url: string): Promise<number> {
  const tab = await chrome.tabs.create({ url, active: true });
  if (!tab.id) throw new Error("No se pudo obtener tab.id");
  return tab.id;
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
});

// Popup -> Background messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "startScrape") {
    const site = message.site as Site;
    const keyword = String(message.keyword || "").trim();

    (async () => {
      try {
        if (!keyword) throw new Error("Keyword vacía");

        const url = buildSearchUrl(site, keyword);
        const tabId = await openTab(url);

        const port = chrome.tabs.connect(tabId, { name: `scrape:${site}` });

        port.postMessage({
          type: "start",
          site,
          keyword,
          keywordId: `tmp-${Date.now()}`, 
        });

        sendResponse({ ok: true, tabId, url });
      } catch (err: any) {
        console.error("startScrape error:", err);
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();

    return true; // async sendResponse
  }
});
