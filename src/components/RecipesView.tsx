import { useEffect, useRef, useState } from 'react';
import { BookOpen, Upload, ArrowLeft, Search } from 'lucide-react';
import { recipeRequest, recipeUrl, type Recipe, type RecipeSummary, type ImportPreview } from '../api/recipes';
import '../styles/recipes.css';

export function RecipesView({ initialRecipeId }: { initialRecipeId?: string | null }) {
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(initialRecipeId || null);
  const [detail, setDetail] = useState<Recipe | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    recipeRequest<RecipeSummary[]>('', { signal: controller.signal }).then(setRecipes)
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    setDetail(null); setConfirmDelete(false);
    if (!selected) return;
    const controller = new AbortController();
    recipeRequest<Recipe>(`/${encodeURIComponent(selected)}`, { signal: controller.signal }).then(setDetail)
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [selected]);

  async function inspect(file: File) {
    setError(''); setNotice(''); setPreview(null); setFile(null);
    if (!file.name.toLowerCase().endsWith('.paprikarecipes') || file.size > 30 * 1024 * 1024) {
      setError('Choose a .paprikarecipes export smaller than 30 MB.'); return;
    }
    setBusy(true);
    try { const result = await recipeRequest<ImportPreview>('/preview', { method: 'POST', body: file }); setPreview(result); setFile(file); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function importRecipes() {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const result = await recipeRequest<ImportPreview>('/import', { method: 'POST', body: file });
      setPreview(null); setFile(null);
      setNotice(`Import complete: ${result.added} added, ${result.updated} updated, ${result.unchanged} unchanged.`);
      setRecipes(await recipeRequest<RecipeSummary[]>());
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function removeRecipe() {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      await recipeRequest(`/${encodeURIComponent(selected)}`, { method: 'DELETE' });
      setRecipes(items => items.filter(r => r.uid !== selected)); setSelected(null); setNotice('Recipe removed from Beacon.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const categories = [...new Set(recipes.flatMap(r => r.categories))].sort((a,b) => a.localeCompare(b));
  const visible = recipes.filter(r => (!category || r.categories.includes(category)) &&
    `${r.name} ${r.categories.join(' ')}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a,b) => a.name.localeCompare(b.name));
  const sourceUrl = detail && /^https?:\/\//i.test(detail.source_url) ? detail.source_url : null;
  return <main className="recipes-view">
    <header className="recipes-header">
      <div><p className="recipes-eyebrow">Your family cookbook</p><h1><BookOpen aria-hidden="true" /> Recipes</h1><p>{recipes.length} recipes · Imported from Paprika</p></div>
      <button className="recipes-primary" disabled={busy || loading} onClick={() => fileInput.current?.click()}><Upload size={18} />{busy ? 'Working…' : 'Import recipes'}</button>
      <input ref={fileInput} hidden type="file" accept=".paprikarecipes" onChange={e => { const f=e.target.files?.[0]; e.target.value=''; if(f) void inspect(f); }} />
    </header>
    {error && <p className="recipes-error" role="alert">{error}</p>}
    {notice && <p className="recipes-notice" role="status">{notice}</p>}
    {preview && <section className="recipes-import" aria-label="Import preview">
      <h2>Ready to import {preview.imported} recipes</h2>
      <p>{preview.added} new · {preview.updated} updates · {preview.unchanged} unchanged · {preview.photos} photos</p>
      <p>Matching Paprika IDs update existing recipes. Recipes absent from this export stay in your library. Paprika itself is never changed.</p>
      <button className="recipes-primary" disabled={busy} onClick={() => void importRecipes()}>Confirm import</button>{' '}
      <button disabled={busy} onClick={() => { setPreview(null); setFile(null); }}>Cancel</button>
    </section>}
    {selected ? <>
      <button className="recipes-back" onClick={() => { setSelected(null); setError(''); }}><ArrowLeft size={18} /> All recipes</button>
      {!detail && !error && <p role="status">Loading recipe…</p>}
      {detail && <article className="recipe-detail" key={detail.uid}>
        <div className="recipe-hero">
          {detail.has_photo && <img src={recipeUrl(`/${encodeURIComponent(detail.uid)}/photo`)} alt={detail.name} />}
          <div><p className="recipes-eyebrow">{detail.categories.join(' · ')}</p><h2>{detail.name}</h2>
            <p className="recipe-text">{detail.description}</p>
            <dl className="recipe-facts">{[['Servings',detail.servings],['Prep',detail.prep_time],['Cook',detail.cook_time],['Total',detail.total_time],['Difficulty',detail.difficulty]].filter(([,v]) => v).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          </div>
        </div>
        <div className="recipe-columns">
          <section><h3>Ingredients</h3><ul className="recipe-ingredients">{detail.ingredients.split('\n').filter(line => line.trim()).map((line,i) => <li key={i}><label><input type="checkbox" /><span>{line}</span></label></li>)}</ul></section>
          <section><h3>Directions</h3><div className="recipe-text">{detail.directions || 'No directions provided.'}</div></section>
        </div>
        {detail.notes && <section><h3>Notes</h3><div className="recipe-text">{detail.notes}</div></section>}
        {detail.nutritional_info && <section><h3>Nutrition</h3><div className="recipe-text">{detail.nutritional_info}</div></section>}
        {(detail.source || sourceUrl) && <p>Source: {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer">{detail.source || 'Original recipe'}</a> : detail.source}</p>}
        <footer className="recipe-footer"><p>To edit, update the recipe in Paprika and import a fresh export.</p>
          {confirmDelete ? <div><p>Remove this recipe from Beacon? It can be restored by importing it again.</p><button disabled={busy} onClick={() => void removeRecipe()}>Remove recipe</button>{' '}<button onClick={() => setConfirmDelete(false)}>Keep recipe</button></div>
            : <button onClick={() => setConfirmDelete(true)}>Remove from Beacon</button>}
        </footer>
      </article>}
    </> : <>
      <div className="recipes-filters"><label><Search size={18} /><input aria-label="Search recipes" placeholder="Search recipes or categories" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <select aria-label="Recipe category" value={category} onChange={e => setCategory(e.target.value)}><option value="">All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select>
      </div>
      {loading ? <p role="status">Loading recipes…</p> : !recipes.length ? <section className="recipes-empty"><BookOpen size={48} /><h2>Your cookbook starts here</h2><p>In Paprika, open Settings → Export and choose Paprika format. Then use Import recipes above.</p></section> : !visible.length ? <p>No recipes match these filters.</p> :
        <div className="recipes-grid">{visible.map(r => <button key={r.uid} className="recipe-card" onClick={() => { setSelected(r.uid); setError(''); }}>
          {r.has_photo ? <img loading="lazy" src={recipeUrl(`/${encodeURIComponent(r.uid)}/photo`)} alt="" /> : <div className="recipe-placeholder"><BookOpen size={40} /></div>}
          <div><span className="recipe-card-category">{r.categories.slice(0,2).join(' · ')}</span><h2>{r.name}</h2><span>{r.total_time || r.cook_time || r.prep_time}</span></div>
        </button>)}</div>}
    </>}
  </main>;
}
