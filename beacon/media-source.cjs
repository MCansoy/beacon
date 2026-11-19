/** Read-only media bridge. HA exposes browse/resolve over WebSocket, not REST. */
function createMediaSourceHandler(command) {
  return async function handleMediaSource(req, res) {
    const reply = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(value));
    };
    if (req.method !== 'GET') return reply(405, { error: 'Method not allowed' });
    const match = req.url.split('?')[0].match(/^\/api\/media_source\/(browse_media|resolve_media)(?:\/(.*))?$/);
    if (!match) return reply(404, { error: 'Unknown media operation' });
    let id;
    try { id = match[2] ? decodeURIComponent(match[2]) : undefined; }
    catch { return reply(400, { error: 'Invalid media ID encoding' }); }
    if ((id && !id.startsWith('media-source://')) || (match[1] === 'resolve_media' && !id)) {
      return reply(400, { error: 'Expected a media-source:// ID' });
    }
    try {
      const result = await command({ type: `media_source/${match[1]}`, ...(id ? { media_content_id: id } : {}) });
      if (match[1] === 'resolve_media') {
        if (!result || typeof result.url !== 'string') throw new Error('No media URL returned');
        // <img> cannot attach an Authorization header. Sign only a path returned
        // by HA, never a caller-supplied path. Keep the URL relative to HA's
        // origin so it also works through ingress and remote HA access.
        if (result.url.startsWith('/') && !result.url.startsWith('//')) {
          const signed = await command({ type: 'auth/sign_path', path: result.url, expires: 3600 });
          return reply(200, { ...result, url: signed.path });
        }
        if (!/^https?:\/\//i.test(result.url)) throw new Error('Unsupported media URL');
      }
      return reply(200, result);
    } catch (err) {
      reply(502, { error: 'Could not load Home Assistant media', code: err.code || null });
    }
  };
}

module.exports = { createMediaSourceHandler };
