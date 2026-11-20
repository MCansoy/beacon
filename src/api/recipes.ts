export interface RecipeSummary {
  uid: string; name: string; categories: string[]; has_photo: boolean;
  prep_time: string; cook_time: string; total_time: string;
}
export interface Recipe extends RecipeSummary {
  description: string; ingredients: string; directions: string; notes: string;
  nutritional_info: string; difficulty: string; servings: string; source: string; source_url: string;
}
export interface ImportPreview {
  added: number; updated: number; unchanged: number; imported: number; total: number; photos: number;
}
export function recipeUrl(suffix = '') {
  return `${window.location.pathname.replace(/\/$/, '')}/recipes${suffix}`;
}
export async function recipeRequest<T>(suffix = '', options?: RequestInit): Promise<T> {
  const response = await fetch(recipeUrl(suffix), options);
  let data;
  try { data = await response.json(); }
  catch { throw new Error('Recipes require the updated Beacon add-on server.'); }
  if (!response.ok) throw new Error(data.error || 'Recipe request failed. Please retry.');
  return data as T;
}
