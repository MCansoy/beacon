// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, it, expect, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createMediaSourceHandler } = require('../../media-source.cjs');

async function request(command: ReturnType<typeof vi.fn>, operation: string, id?: string, method = 'GET') {
  let status = 0, headers: Record<string, string> = {}, body = '';
  const res = {
    writeHead: (s: number, h: Record<string, string>) => { status = s; headers = h; },
    end: (text: string) => { body = text; },
  };
  await createMediaSourceHandler(command)({ method, url: `/api/media_source/${operation}${id === undefined ? '' : '/' + encodeURIComponent(id)}` }, res);
  return { status, headers, body: JSON.parse(body) };
}

describe('add-on media WebSocket bridge', () => {
  it('browses a configured folder through the actual HA WebSocket command', async () => {
    const result = { children: [{ title: 'A photo', media_content_type: 'image/jpeg' }] };
    const command = vi.fn().mockResolvedValue(result);
    const id = 'media-source://media_source/local/beacon/photos';
    const response = await request(command, 'browse_media', id);
    expect(command).toHaveBeenCalledWith({ type: 'media_source/browse_media', media_content_id: id });
    expect(response.status).toBe(200);
    expect(response.body).toEqual(result);
    expect(response.headers['Cache-Control']).toBe('no-store');
  });

  it('omits media_content_id when browsing the root', async () => {
    const command = vi.fn().mockResolvedValue({ children: [] });
    await request(command, 'browse_media');
    expect(command).toHaveBeenCalledWith({ type: 'media_source/browse_media' });
  });

  it('signs the resolved local image path for the browser rather than exposing a token', async () => {
    const command = vi.fn()
      .mockResolvedValueOnce({ url: '/media/local/beacon/photos/a%20b.jpg', mime_type: 'image/jpeg' })
      .mockResolvedValueOnce({ path: '/media/local/beacon/photos/a%20b.jpg?authSig=test' });
    const id = 'media-source://media_source/local/beacon/photos/a b.jpg';
    const response = await request(command, 'resolve_media', id);
    expect(command.mock.calls).toEqual([
      [{ type: 'media_source/resolve_media', media_content_id: id }],
      [{ type: 'auth/sign_path', path: '/media/local/beacon/photos/a%20b.jpg', expires: 3600 }],
    ]);
    expect(response.body.url).toBe('/media/local/beacon/photos/a%20b.jpg?authSig=test');
  });

  it('preserves already-public HTTPS URLs without signing them', async () => {
    const command = vi.fn().mockResolvedValue({ url: 'https://example.com/photo.jpg' });
    const response = await request(command, 'resolve_media', 'media-source://provider/photo');
    expect(response.status).toBe(200);
    expect(command).toHaveBeenCalledTimes(1);
  });

  it('does not accept arbitrary signing paths or write operations', async () => {
    const command = vi.fn();
    expect((await request(command, 'resolve_media', '/api/config')).status).toBe(400);
    expect((await request(command, 'resolve_media')).status).toBe(400);
    expect((await request(command, 'browse_media', undefined, 'POST')).status).toBe(405);
    expect((await request(command, 'remove_media')).status).toBe(404);
    expect(command).not.toHaveBeenCalled();
  });

  it('rejects unsafe resolved URL schemes', async () => {
    const command = vi.fn().mockResolvedValue({ url: 'javascript:alert(1)' });
    expect((await request(command, 'resolve_media', 'media-source://provider/photo')).status).toBe(502);
    expect(command).toHaveBeenCalledTimes(1);
  });

  it('returns upstream failure without leaking error details or credentials', async () => {
    const command = vi.fn().mockRejectedValue(new Error('private server details'));
    const response = await request(command, 'browse_media');
    expect(response.status).toBe(502);
    expect(JSON.stringify(response.body)).not.toContain('private');
  });
});
