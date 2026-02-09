// Content script: MercadoLibre (MV3) - incremental scrape with cancel + progress
export {};

console.log("MercadoLibre content script injected");

type PortMsg =
  | { type: "start"; site: "mercadolibre"; keywordId: string; keyword: string }
  | { type: "cancel" };

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function scrapeMLOnce() {
  const nodeList = document.querySelectorAll("li.ui-search-layout__item");
  const datos = Array.from(nodeList);

  const productos = datos.map((item: Element, idx) => {
    const text = (item as HTMLElement).innerText || "";
    const parts = text.split("\n");

    
    const a = item.querySelector("a") as HTMLAnchorElement | null;
    const url = a?.href ?? null;

    return {
      raw: parts,
      position: idx + 1,
      url,
    };
  });

  return productos;
}


async function scrollStep() {
  window.scrollBy(0, Math.floor(window.innerHeight * 0.9));
  await sleep(250);
}

chrome.runtime.onConnect.addListener((port) => {
  if (!port.name.startsWith("scrape:")) return;

  let cancelled = false;

  port.postMessage({ type: "ready" });

  port.onMessage.addListener(async (msg: PortMsg) => {
    if (msg?.type === "cancel") {
      cancelled = true;
      return;
    }

    if (msg?.type === "start") {
      cancelled = false;

      try {
        const TARGET = 100;
        const MAX_ITER = 40;
        const STALL_LIMIT = 8;
        const TICK_MS = 250;

        let lastCount = 0;
        let stall = 0;

        for (let iter = 0; iter < MAX_ITER; iter++) {
          if (cancelled) {
            port.postMessage({ type: "cancelled" });
            return;
          }

          const productos = scrapeMLOnce();

          if (productos.length > lastCount) {
            lastCount = productos.length;
            port.postMessage({ type: "progress", count: lastCount });
            stall = 0;
          } else {
            stall++;
          }

          if (lastCount >= TARGET) break;
          if (stall >= STALL_LIMIT) break;

          await scrollStep();
          await sleep(TICK_MS);
        }

        if (cancelled) {
          port.postMessage({ type: "cancelled" });
          return;
        }

        const finalProducts = scrapeMLOnce();
        port.postMessage({ type: "result", products: finalProducts });
      } catch (err: any) {
        port.postMessage({ type: "error", message: String(err?.message || err) });
      }
    }
  });
});
