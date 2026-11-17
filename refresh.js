// Per-source stale-while-revalidate state. No timers run inside a service worker.
export class RefreshResource {
  constructor({
    key,
    ttl,
    maxAge,
    loader,
    validate = () => true,
    validAt = () => null,
    sourceMaxAge = Infinity,
    onState = () => {},
    storage = null,
    now = () => Date.now(),
    online = () => globalThis.navigator?.onLine !== false,
    visible = () => typeof document === "undefined" || !document.hidden,
    retryBase = 30000,
    respectExpiry = true,
  }) {
    Object.assign(this, {
      key,
      ttl,
      maxAge,
      loader,
      validate,
      validAt,
      sourceMaxAge,
      onState,
      storage,
      now,
      online,
      visible,
      retryBase,
      respectExpiry,
    });
    this.entry = null;
    this.error = null;
    this.failures = 0;
    this.retryAt = 0;
    this.inflight = null;
    this.controller = null;
    this.disposed = false;
    const cached = storage?.get(key, null);
    if (
      cached &&
      Number.isFinite(cached.at) &&
      cached.at <= now() + 60000 &&
      now() - cached.at <= maxAge &&
      validate(cached.body)
    )
      this.entry = cached;
  }
  interval() {
    return typeof this.ttl === "function"
      ? this.ttl(this.entry?.body)
      : this.ttl;
  }
  snapshot() {
    const now = this.now(),
      entry = this.entry,
      usable =
        entry && now - entry.at <= this.maxAge && entry.at <= now + 60000;
    const checkedAt = usable ? entry.at : null,
      validAt = usable ? this.validAt(entry.body) : null;
    const delayed =
      Number.isFinite(validAt) && now - validAt > this.sourceMaxAge;
    const fresh = Boolean(
      usable &&
      !this.error &&
      this.online() &&
      now - entry.at < this.interval() &&
      !delayed,
    );
    return {
      key: this.key,
      data: usable ? entry.body : null,
      checkedAt,
      validAt,
      fresh,
      delayed,
      offline: !this.online(),
      refreshing: Boolean(this.inflight),
      error: this.error,
      retryAt: this.retryAt,
      age: checkedAt == null ? Infinity : Math.max(0, now - checkedAt),
    };
  }
  emit() {
    if (!this.disposed) this.onState(this.snapshot());
  }
  due() {
    return (
      !this.snapshot().data ||
      this.now() >=
        Math.max(
          this.entry.at + this.interval(),
          this.respectExpiry ? this.entry.expiresAt || 0 : 0,
        )
    );
  }
  refresh({ force = false } = {}) {
    if (this.disposed) return Promise.resolve(this.snapshot());
    if (this.inflight) return this.inflight;
    if (!this.online()) {
      this.emit();
      return Promise.resolve(this.snapshot());
    }
    // Manual refresh also honors a server Retry-After / rate-limit cooldown.
    if (this.now() < this.retryAt || (!force && !this.due())) {
      this.emit();
      return Promise.resolve(this.snapshot());
    }
    this.controller = new AbortController();
    const task = async () => {
      try {
        const result = await this.loader({ signal: this.controller.signal });
        if (this.disposed) return this.snapshot();
        const body = result?.body ?? result;
        if (!this.validate(body))
          throw new Error("The source returned incomplete or invalid data");
        this.entry = {
          at: this.now(),
          body,
          expiresAt: Number.isFinite(result?.expiresAt)
            ? result.expiresAt
            : null,
        };
        this.error = null;
        this.failures = 0;
        this.retryAt = 0;
        this.storage?.set(this.key, this.entry);
      } catch (error) {
        if (this.disposed) return this.snapshot();
        this.error = {
          message: error?.message || "Source unavailable",
          status: error?.status || 0,
        };
        this.failures++;
        this.retryAt = Math.max(
          this.now() +
            Math.min(
              900000,
              this.retryBase * 2 ** Math.min(5, this.failures - 1),
            ),
          error?.retryAt || 0,
        );
      } finally {
        if (!this.disposed) {
          this.inflight = null;
          this.controller = null;
          this.emit();
        }
      }
      return this.snapshot();
    };
    // Assign before the first state emission, including synchronously resolved loaders.
    this.inflight = Promise.resolve().then(task);
    this.emit();
    return this.inflight;
  }
  tick() {
    if (this.disposed) return;
    this.emit();
    if (this.visible() && this.online()) return this.refresh();
  }
  dispose() {
    this.disposed = true;
    this.controller?.abort();
    this.inflight = null;
  }
}
export function freshnessText(
  snapshot,
  {
    label = "Source",
    time = (at) =>
      new Date(at).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      }),
  } = {},
) {
  if (snapshot.data?.unsupported)
    return "Not covered · consult your local authority";
  if (!snapshot.data)
    return snapshot.refreshing ? `Updating ${label}…` : `${label} unavailable`;
  const state = snapshot.offline
    ? "Offline · saved"
    : snapshot.error
      ? "Refresh failed · saved"
      : snapshot.delayed
        ? "Source delayed"
        : snapshot.refreshing
          ? "Updating quietly"
          : "Checked";
  return `${state} ${time(snapshot.checkedAt)}${snapshot.validAt ? ` · Valid ${time(snapshot.validAt)}` : ""}`;
}
