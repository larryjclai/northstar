import type { InvestmentImportMapping } from "../data/investmentImport";

export interface ImportTemplate {
  id: string;
  name: string;
  mapping: InvestmentImportMapping;
  updatedAt: string;
}

const STORAGE_KEY = "northstar.investmentImportTemplates.v1";

export function loadImportTemplates(): ImportTemplate[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ImportTemplate[]) : [];
  } catch {
    return [];
  }
}

function persist(list: ImportTemplate[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable — keep in-memory only */
  }
}

export function upsertImportTemplate(template: ImportTemplate): ImportTemplate[] {
  const list = loadImportTemplates();
  const next = { ...template, updatedAt: new Date().toISOString() };
  const index = list.findIndex((entry) => entry.id === template.id);
  if (index >= 0) list[index] = next;
  else list.push(next);
  persist(list);
  return list;
}

export function deleteImportTemplate(id: string): ImportTemplate[] {
  const list = loadImportTemplates().filter((entry) => entry.id !== id);
  persist(list);
  return list;
}

export function newTemplateId(): string {
  return `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
