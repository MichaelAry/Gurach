interface Pending<T> { controller: AbortController; promise: Promise<T>; waiters: number }

export class LookupCache<T> {
  private readonly cache = new Map<string, { expires: number; value: T }>();
  private readonly pending = new Map<string, Pending<T>>();

  constructor(private readonly ttl: (value: T) => number, private readonly limit = 500) {}

  async get(key: string, signal: AbortSignal, load: (signal: AbortSignal) => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;
    if (cached) this.cache.delete(key);
    let job = this.pending.get(key);
    if (!job) {
      const controller = new AbortController();
      const promise = Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return load(controller.signal);
      }).then((value) => {
        if (!controller.signal.aborted && this.ttl(value) > 0) {
          this.cache.set(key, { value, expires: Date.now() + this.ttl(value) });
          if (this.cache.size > this.limit) this.cache.delete(this.cache.keys().next().value!);
        }
        return value;
      }).finally(() => {
        if (this.pending.get(key)?.controller === controller) this.pending.delete(key);
      });
      job = { controller, promise, waiters: 0 };
      this.pending.set(key, job);
    }
    const pending = job;
    pending.waiters++;
    return new Promise<T>((resolve, reject) => {
      const leave = () => {
        signal.removeEventListener('abort', abort);
        pending.waiters--;
      };
      const abort = () => {
        leave();
        if (!pending.waiters) {
          this.pending.delete(key);
          pending.controller.abort();
        }
        reject(signal.reason);
      };
      signal.addEventListener('abort', abort, { once: true });
      pending.promise.then((value) => {
        if (!signal.aborted) { leave(); resolve(value); }
      }, (error) => {
        if (!signal.aborted) { leave(); reject(error); }
      });
    });
  }
}
