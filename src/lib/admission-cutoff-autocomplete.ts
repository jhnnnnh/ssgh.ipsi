import { createClient } from "@/lib/supabase/client";
import type { AutocompleteOption } from "@/components/ui/AutocompleteInput";

/**
 * "입결 조회" 탭 전용 자동완성 — admission_cutoffs(대학어디가) 원본을 그대로 찾는다.
 * 카드 입력칸의 자동완성(admission-offering-autocomplete.ts)과는 데이터 소스가 다르다.
 * 매 글자마다 서버에 묻지 않고, 대학 목록은 탭이 열릴 때 한 번 통째로 캐시해 둔다.
 */

let universityCache: string[] | null = null;
let universityPromise: Promise<string[]> | null = null;

function loadUniversities(): Promise<string[]> {
  if (universityCache) return Promise.resolve(universityCache);
  if (!universityPromise) {
    universityPromise = (async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc("autocomplete_cutoff_universities", { p_query: "", p_limit: 2000 });
      const list = (data ?? []).map((r) => r.university);
      universityCache = list;
      return list;
    })();
  }
  return universityPromise;
}

export function prefetchCutoffUniversities() {
  void loadUniversities();
}

export async function searchCutoffUniversities(query: string): Promise<AutocompleteOption[]> {
  const q = query.trim();
  if (!q) return [];
  const all = await loadUniversities();
  return all.filter((u) => u.includes(q)).map((u) => ({ value: u, label: u }));
}

/** 대학·학과·전형 선택 팝업처럼 자동완성이 아니라 전체 목록이 필요한 곳에서 쓴다. */
export async function listCutoffUniversities(): Promise<string[]> {
  return loadUniversities();
}

type DeptRow = { university: string; department: string };
const departmentCache = new Map<string, DeptRow[]>();
const departmentPromises = new Map<string, Promise<DeptRow[]>>();

function loadDepartments(university: string): Promise<DeptRow[]> {
  const cached = departmentCache.get(university);
  if (cached) return Promise.resolve(cached);
  let promise = departmentPromises.get(university);
  if (!promise) {
    promise = (async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc("autocomplete_cutoff_departments", {
        p_query: "",
        p_university: university || null,
        p_limit: university ? 500 : 3000,
      });
      const list = data ?? [];
      departmentCache.set(university, list);
      return list;
    })();
    departmentPromises.set(university, promise);
  }
  return promise;
}

export async function searchCutoffDepartments(query: string, university: string): Promise<AutocompleteOption[]> {
  const q = query.trim();
  if (!q) return [];
  const trimmed = university.trim();
  const all = await loadDepartments(trimmed);
  return all
    .filter((r) => r.department.includes(q))
    .map((r) => ({ value: r.department, label: r.department, hint: trimmed ? undefined : r.university }));
}

export async function listCutoffDepartments(university: string): Promise<string[]> {
  const all = await loadDepartments(university.trim());
  return all.map((r) => r.department);
}

type TypeRow = { admission_type: string; department: string; track: string | null };
const typeCache = new Map<string, TypeRow[]>();
const typePromises = new Map<string, Promise<TypeRow[]>>();

function loadAdmissionTypes(university: string, department: string): Promise<TypeRow[]> {
  const key = `${university}::${department}`;
  const cached = typeCache.get(key);
  if (cached) return Promise.resolve(cached);
  let promise = typePromises.get(key);
  if (!promise) {
    promise = (async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc("autocomplete_cutoff_admission_types", {
        p_query: "",
        p_university: university || null,
        p_department: department || null,
        p_limit: 500,
      });
      const list = data ?? [];
      typeCache.set(key, list);
      return list;
    })();
    typePromises.set(key, promise);
  }
  return promise;
}

export async function searchCutoffAdmissionTypes(
  query: string,
  university: string,
  department: string,
): Promise<AutocompleteOption[]> {
  const trimmedUni = university.trim();
  const trimmedDept = department.trim();
  const q = query.trim();
  const all = await loadAdmissionTypes(trimmedUni, trimmedDept);
  return all
    .filter((r) => !q || r.admission_type.includes(q))
    .map((r) => ({ value: r.admission_type, label: r.admission_type, hint: trimmedDept ? undefined : r.department }));
}

export async function listCutoffAdmissionTypes(university: string, department: string): Promise<string[]> {
  const all = await loadAdmissionTypes(university.trim(), department.trim());
  return all.map((r) => r.admission_type);
}
