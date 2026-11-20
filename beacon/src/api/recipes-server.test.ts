// @vitest-environment node
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import { zipSync } from 'fflate';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { describe, it, expect } from 'vitest';
const require = createRequire(import.meta.url);
const { parseExport, mergeRecipes, createRecipeHandler } = require('../../recipes.cjs');
const sample = (uid = 'test-1', name = 'Test recipe') => ({ uid, name, ingredients: '1 cup flour\n2 eggs', directions: 'Mix.\nBake.', categories: ['Dinner'], source_url: 'https://example.com/recipe' });
function archive(values: object[]) {
  return Buffer.from(zipSync(Object.fromEntries(values.map((v,i) => [`${i}.paprikarecipe`, gzipSync(JSON.stringify(v))]))));
}
async function request(handler: ReturnType<typeof createRecipeHandler>, url: string, method = 'GET', body?: Buffer) {
  let status = 0; let response = Buffer.alloc(0);
  const req = Object.assign(Readable.from(body ? [body] : []), { url, method });
  await handler(req, { writeHead: (code: number) => { status = code; }, end: (data: string | Buffer) => { response = Buffer.from(data); } });
  return { status, data: JSON.parse(response.toString()) };
}
describe('Paprika export import', () => {
  it('reads gzipped recipes, preserves multiline content and does not fetch external images', () => {
    const [r] = parseExport(archive([{ ...sample(), image_url: 'https://example.com/private.jpg' }]));
    expect(r.ingredients).toBe('1 cup flour\n2 eggs'); expect(r.categories).toEqual(['Dinner']); expect(r.photo_data).toBeUndefined();
  });
  it('matches IDs instead of titles, updates existing and retains missing recipes', () => {
    const old = parseExport(archive([sample('a'),sample('b')]));
    const result = mergeRecipes(old, parseExport(archive([sample('a','Updated'),sample('c')])));
    expect(result.recipes).toHaveLength(3); expect(result.added).toBe(1); expect(result.updated).toBe(1);
    expect(mergeRecipes(result.recipes,parseExport(archive([sample('a','Updated'),sample('c')]))).unchanged).toBe(2);
  });
  it('rejects corrupt archives and duplicate or missing IDs', () => {
    expect(() => parseExport(Buffer.from('not a zip'))).toThrow();
    expect(() => parseExport(archive([sample(),sample()]))).toThrow(/Duplicate/);
    expect(() => parseExport(archive([{ name:'No ID' }]))).toThrow(/missing/);
  });
  it('rejects a decompression bomb before writing any library', () => {
    const bomb = archive([{ ...sample(), notes: 'x'.repeat(9 * 1024 * 1024) }]);
    expect(() => parseExport(bomb)).toThrow(/exceeds/);
  });
  it('ignores script/vector image payloads', () => {
    const [r] = parseExport(archive([{ ...sample(), photo_data: Buffer.from('<svg onload="alert(1)"></svg>').toString('base64') }]));
    expect(r.photo_data).toBeUndefined();
  });
  it('previews without writing, persists across restart, and leaves data intact after failed import', async () => {
    const dir = await mkdtemp(join(tmpdir(),'beacon-recipes-'));
    try {
      const handler = createRecipeHandler(dir), file = archive([sample()]);
      expect((await request(handler,'/recipes/preview','POST',file)).data.added).toBe(1);
      expect((await request(handler,'/recipes')).data).toEqual([]);
      expect((await request(handler,'/recipes/import','POST',file)).data.total).toBe(1);
      const before = await readFile(join(dir,'recipes/library.json'),'utf8');
      expect((await request(handler,'/recipes/import','POST',Buffer.from('broken'))).status).toBe(400);
      expect(await readFile(join(dir,'recipes/library.json'),'utf8')).toBe(before);
      const restarted = createRecipeHandler(dir);
      expect((await request(restarted,'/recipes')).data).toHaveLength(1);
      expect((await request(restarted,'/recipes/test-1')).data.directions).toBe('Mix.\nBake.');
      await request(restarted,'/recipes/test-1','DELETE');
      expect((await request(restarted,'/recipes')).data).toEqual([]);
    } finally { await rm(dir,{ recursive:true,force:true }); }
  });
  it('serializes concurrent imports without losing either recipe', async () => {
    const dir = await mkdtemp(join(tmpdir(),'beacon-recipes-'));
    try {
      const h = createRecipeHandler(dir);
      await Promise.all(['a','b'].map(id => request(h,'/recipes/import','POST',archive([sample(id)]))));
      expect((await request(h,'/recipes')).data).toHaveLength(2);
    } finally { await rm(dir,{ recursive:true,force:true }); }
  });
});
