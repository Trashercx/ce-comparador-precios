// Content script: Falabella (MV3) - incremental scrape with cancel + progress
export {};

console.log("Falabella content script injected");

type PortMsg =
  | { type: "start"; site: "falabella"; keywordId: string; keyword: string }
  | { type: "cancel" };

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function scrapeFalabellaOnce() {
  const nodeList = document.querySelectorAll('[data-testid="ssr-pod"]');
  const datos = Array.from(nodeList);

  const productos = datos.map((producto: Element, idx) => {
    const text = (producto as HTMLElement).innerText || "";
    const [marca, nombreArticulo, quienComercializa, precioArticulo, descuento] = text.split("\n");

    return {
      marca: marca ?? null,
      nombreArticulo: nombreArticulo ?? null,
      quienComercializa: quienComercializa ?? null,
      precioArticulo: precioArticulo ?? null,
      descuento: descuento ?? null,
      position: idx + 1,
      
      url: null,
    };
  });

  return productos;
}

async function scrollStep() {
 
  window.scrollBy(0, Math.floor(window.innerHeight * 0.85));
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
        const TARGET = 60;            // Falabella requiere 60 si existen
        const MAX_ITER = 30;          // límite de seguridad
        const STALL_LIMIT = 6;        
        const TICK_MS = 250;          // cancelación rápida

        let lastCount = 0;
        let stall = 0;

        for (let iter = 0; iter < MAX_ITER; iter++) {
          if (cancelled) {
            port.postMessage({ type: "cancelled" });
            return;
          }

          const productos = scrapeFalabellaOnce();

          // progress cuando crece
          if (productos.length > lastCount) {
            lastCount = productos.length;
            port.postMessage({ type: "progress", count: lastCount });
            stall = 0;
          } else {
            stall++;
          }

          // condiciones de salida
          if (lastCount >= TARGET) break;
          if (stall >= STALL_LIMIT) break;

          // scroll para intentar cargar más
          await scrollStep();

          await sleep(TICK_MS);
        }

        if (cancelled) {
          port.postMessage({ type: "cancelled" });
          return;
        }

        // resultado final
        const finalProducts = scrapeFalabellaOnce();
        port.postMessage({ type: "result", products: finalProducts });
      } catch (err: any) {
        port.postMessage({ type: "error", message: String(err?.message || err) });
      }
    }
  });
});
