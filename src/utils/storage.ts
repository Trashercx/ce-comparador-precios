// src/utils/storage.ts
import type { KeywordItem, ProductNormalized, ScrapeJob, Site } from "./types";

const KEYS = {
  keywords: "keywords",
  jobs: "jobs",
  results: "results",
} as const;

export type JobsState = Record<string, Partial<Record<Site, ScrapeJob>>>;
export type ResultsState = Record<string, Partial<Record<Site, ProductNormalized[]>>>;

export interface AppState {
  keywords: KeywordItem[];
  jobs: JobsState;
  results: ResultsState;
}

function assertStorage() {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    throw new Error("chrome.storage.local no está disponible en este contexto.");
  }
}

export async function loadAppState(): Promise<AppState> {
  assertStorage();
  const data = await chrome.storage.local.get([KEYS.keywords, KEYS.jobs, KEYS.results]);

  return {
    keywords: (data[KEYS.keywords] as KeywordItem[]) ?? [],
    jobs: (data[KEYS.jobs] as JobsState) ?? {},
    results: (data[KEYS.results] as ResultsState) ?? {},
  };
}

export async function saveKeywords(keywords: KeywordItem[]): Promise<void> {
  assertStorage();
  await chrome.storage.local.set({ [KEYS.keywords]: keywords });
}

export async function upsertJob(keywordId: string, site: Site, job: ScrapeJob): Promise<void> {
  const state = await loadAppState();
  const nextJobs: JobsState = { ...state.jobs };
  nextJobs[keywordId] = { ...(nextJobs[keywordId] ?? {}), [site]: job };
  await chrome.storage.local.set({ [KEYS.jobs]: nextJobs });
}

export async function upsertResults(
  keywordId: string,
  site: Site,
  products: ProductNormalized[],
): Promise<void> {
  const state = await loadAppState();
  const nextResults: ResultsState = { ...state.results };
  nextResults[keywordId] = { ...(nextResults[keywordId] ?? {}), [site]: products };
  await chrome.storage.local.set({ [KEYS.results]: nextResults });
}

export async function deleteKeyword(keywordId: string): Promise<void> {
  const state = await loadAppState();

  const nextKeywords = state.keywords.filter((k) => k.id !== keywordId);

  const nextJobs = { ...state.jobs };
  delete nextJobs[keywordId];

  const nextResults = { ...state.results };
  delete nextResults[keywordId];

  await chrome.storage.local.set({
    [KEYS.keywords]: nextKeywords,
    [KEYS.jobs]: nextJobs,
    [KEYS.results]: nextResults,
  });
}

export function newJob(tabId: number | null, url: string | null): ScrapeJob {
  return {
    state: "RUNNING",
    startedAt: Date.now(),
    endedAt: null,
    count: 0,
    error: null,
    tabId,
    url,
  };
}
