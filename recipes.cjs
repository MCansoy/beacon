// Paprika exports are ZIPs of gzipped JSON. Never extract archive paths to disk.
const { unzipSync } = require('fflate');
const { gunzipSync } = require('node:zlib');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const MAX_UPLOAD = 30 * 1024 * 1024;
const MAX_RECIPE = 8 * 1024 * 1024;
const MAX_TOTAL = 100 * 1024 * 1024;

function parseExport(buffer) {
  if (!buffer.length || buffer.length > MAX_UPLOAD) throw new Error('Choose a Paprika export smaller than 30 MB.');
  let total = 0, count = 0;
  let files;
  try {
    files = unzipSync(buffer, { filter: (entry) => {
      if (entry.name.endsWith('/') || entry.name.startsWith('__MACOSX/')) return false;
      if (!entry.name.toLowerCase().endsWith('.paprikarecipe')) throw new Error('Unexpected file in export.');
      total += entry.originalSize;
      if (++count > 2000 || entry.originalSize > MAX_RECIPE || total > MAX_TOTAL) throw new Error('Export exceeds import limits.');
      return true;
    } });
  } catch { throw new Error('Invalid or oversized Paprika archive. Export using Paprika format.'); }
  total = 0;
  const recipes = new Map();
  for (const bytes of Object.values(files)) {
    let value;
    try {
      const raw = bytes[0] === 31 && bytes[1] === 139
        ? gunzipSync(bytes, { maxOutputLength: MAX_RECIPE }) : Buffer.from(bytes);
      total += raw.length;
      if (total > MAX_TOTAL) throw new Error('Too large');
      value = JSON.parse(raw.toString('utf8'));
    } catch { throw new Error('A recipe is damaged or exceeds import limits. Nothing was imported.'); }
    if (!value || typeof value.uid !== 'string' || !value.uid.trim() || value.uid.length > 200 || typeof value.name !== 'string' || !value.name.trim()) {
      throw new Error('A recipe is missing its Paprika ID or name. Nothing was imported.');
    }
    if (recipes.has(value.uid)) throw new Error('Duplicate Paprika IDs in export. Nothing was imported.');
    const recipe = { uid: value.uid, categories: [] };
    for (const key of ['name', 'description', 'ingredients', 'directions', 'notes', 'nutritional_info', 'prep_time', 'cook_time', 'total_time', 'difficulty', 'servings', 'source', 'source_url']) {
      recipe[key] = typeof value[key] === 'string' ? value[key] : '';
    }
    recipe.categories = Array.isArray(value.categories) ? [...new Set(value.categories.filter(x => typeof x === 'string' && x.trim()))] : [];
    // Embedded raster images only. Never fetch a recipe's external image URL.
    if (typeof value.photo_data === 'string' && value.photo_data) {
      const image = Buffer.from(value.photo_data, 'base64');
      const type = image.subarray(0, 3).equals(Buffer.from([255,216,255])) ? 'image/jpeg'
        : image.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
        : image.subarray(0,4).toString() === 'RIFF' && image.subarray(8,12).toString() === 'WEBP' ? 'image/webp' : null;
      if (type) { recipe.photo_data = image.toString('base64'); recipe.photo_type = type; }
    }
    recipes.set(recipe.uid, recipe);
  }
  if (!recipes.size) throw new Error('No recipes found in this export.');
  return [...recipes.values()];
}

function mergeRecipes(existing, incoming) {
  const map = new Map(existing.map(r => [r.uid, r]));
  let added = 0, updated = 0, unchanged = 0;
  for (const r of incoming) {
    if (!map.has(r.uid)) added++;
    else if (JSON.stringify(map.get(r.uid)) === JSON.stringify(r)) unchanged++;
    else updated++;
    map.set(r.uid, r);
  }
  return { recipes: [...map.values()], added, updated, unchanged };
}

function createRecipeHandler(dataDir) {
  const dir = path.join(dataDir, 'recipes');
  const file = path.join(dir, 'library.json');
  let queue = Promise.resolve();
  let cached;
  let loading;
  async function read() {
    // A photo grid must not read and parse the entire cookbook per thumbnail.
    if (cached) return cached;
    if (!loading) loading = fs.readFile(file, 'utf8').then(JSON.parse)
      .catch(e => { if (e.code === 'ENOENT') return []; throw e; })
      .then(data => { cached = data; return data; })
      .finally(() => { loading = undefined; });
    return loading;
  }
  async function write(recipes) {
    await fs.mkdir(dir, { recursive: true });
    const temp = path.join(dir, randomUUID() + '.tmp');
    try { await fs.writeFile(temp, JSON.stringify(recipes), { mode: 0o600 }); await fs.rename(temp, file); cached = recipes; }
    finally { await fs.rm(temp, { force: true }); }
  }
  function serialize(fn) {
    const task = queue.then(fn); queue = task.catch(() => {}); return task;
  }
  return async function handle(req, res) {
    const send = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    try {
      const parts = new URL(req.url, 'http://beacon').pathname.split('/').filter(Boolean);
      const op = parts[1];
      if (req.method === 'POST' && ['preview', 'import'].includes(op) && parts.length === 2) {
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX_UPLOAD) { send(413, { error: 'Export exceeds 30 MB.' }); return; }
          chunks.push(chunk);
        }
        let incoming;
        try { incoming = parseExport(Buffer.concat(chunks)); }
        catch (e) { send(400, { error: e.message }); return; }
        const result = await serialize(async () => {
          const merged = mergeRecipes(await read(), incoming);
          if (op === 'import') await write(merged.recipes);
          return { added: merged.added, updated: merged.updated, unchanged: merged.unchanged,
            imported: incoming.length, total: merged.recipes.length, photos: incoming.filter(r => r.photo_data).length };
        });
        send(200, result); return;
      }
      if (req.method === 'GET' && parts.length === 1) {
        send(200, (await read()).map(({ uid, name, categories, prep_time, cook_time, total_time, photo_data }) => ({ uid, name, categories, prep_time, cook_time, total_time, has_photo: !!photo_data }))); return;
      }
      if (op && parts.length <= 3 && ['GET','DELETE'].includes(req.method)) {
        const uid = decodeURIComponent(op);
        if (req.method === 'DELETE' && parts.length === 2) {
          await serialize(async () => { await write((await read()).filter(r => r.uid !== uid)); });
          send(200, { ok: true }); return;
        }
        if (req.method !== 'GET') { send(405, { error: 'Method not allowed' }); return; }
        const recipe = (await read()).find(r => r.uid === uid);
        if (!recipe) { send(404, { error: 'Recipe not found. Import it or choose another recipe.' }); return; }
        if (parts[2] === 'photo' && recipe.photo_data) {
          res.writeHead(200, { 'Content-Type': recipe.photo_type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
          res.end(Buffer.from(recipe.photo_data, 'base64')); return;
        }
        if (parts.length === 2) {
          const { photo_data, ...detail } = recipe;
          send(200, { ...detail, has_photo: !!photo_data }); return;
        }
      }
      send(404, { error: 'Recipe endpoint not found.' });
    } catch { send(500, { error: 'Recipe storage is unavailable. Please retry; your existing library has been retained.' }); }
  };
}
module.exports = { parseExport, mergeRecipes, createRecipeHandler };
