// Keep only nearby decoded frames. Every entry is a real provider image.
export function createImageBuffer({
  limit = 4,
  makeImage = () => new Image(),
  timeoutMs = 25000,
} = {}) {
  const entries = new Map();
  let protectedUrls = new Set(),
    clock = 0;
  function remove(entry) {
    entries.delete(entry.url);
    entry.cancel?.();
    if (!entry.ready) {
      entry.image.onload = null;
      entry.image.onerror = null;
      entry.image.src = "";
    }
  }
  function evict() {
    for (const entry of [...entries.values()].sort((a, b) => a.used - b.used))
      if (entries.size > limit && !protectedUrls.has(entry.url)) remove(entry);
  }
  function load(url) {
    const old = entries.get(url);
    if (old) {
      old.used = ++clock;
      return old.promise;
    }
    const image = makeImage(),
      entry = {
        url,
        image,
        used: ++clock,
        ready: false,
        cancel: null,
        promise: null,
      };
    entries.set(url, entry);
    entry.promise = new Promise((resolve, reject) => {
      let settled = false,
        timer;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        image.onload = null;
        image.onerror = null;
        entry.cancel = null;
        entry.ready = ok;
        if (ok) resolve(image);
        else {
          if (entries.get(url) === entry) entries.delete(url);
          reject(new Error("Weather image unavailable"));
        }
      };
      entry.cancel = () => finish(false);
      image.crossOrigin = "anonymous";
      image.onload = () => finish(image.naturalWidth > 0);
      image.onerror = () => finish(false);
      timer = setTimeout(() => finish(false), timeoutMs);
      image.src = url;
    });
    evict();
    return entry.promise;
  }
  return {
    load,
    protect(urls) {
      protectedUrls = new Set(urls.filter(Boolean));
      evict();
    },
    prefetch(urls) {
      for (const url of urls) if (url) void load(url).catch(() => {});
    },
    clear({ except = [] } = {}) {
      protectedUrls = new Set(except.filter(Boolean));
      for (const entry of [...entries.values()])
        if (!protectedUrls.has(entry.url)) remove(entry);
    },
    get size() {
      return entries.size;
    },
  };
}
