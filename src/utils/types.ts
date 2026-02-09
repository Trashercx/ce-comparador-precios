// src/utils/types.ts
export type Site = "falabella" | "mercadolibre";

export type JobState = "IDLE" | "RUNNING" | "DONE" | "ERROR" | "CANCELLED";

export interface KeywordItem {
  id: string;        // e.g. crypto.randomUUID() o String(Date.now())
  keyword: string;
  createdAt: number; // Date.now()
}

export interface ProductNormalized {
  site: Site;
  keyword: string;
  timestamp: number;  // Date.now()
  position: number;   // 1..N

  title: string | null;

  priceText: string | null;
  priceNumber: number | null;

  url: string | null;

  brand?: string | null;
  seller?: string | null;
}

export interface ScrapeJob {
  state: JobState;
  startedAt: number | null;
  endedAt: number | null;
  count: number;
  error: string | null;

  tabId: number | null;
  url: string | null; // URL que abrimos (búsqueda)
}
