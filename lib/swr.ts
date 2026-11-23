/**
 * Petit cache mémoire « servir tout de suite, rafraîchir derrière ».
 *
 * - valeur récente (moins de `fresh` ms) : renvoyée sans appel réseau ;
 * - valeur un peu ancienne (moins de `stale` ms) : renvoyée tout de suite, et rechargée en
 *   arrière-plan pour la lecture suivante ;
 * - sinon : on attend le chargement.
 *
 * Les écritures ne passent jamais par ce cache : elles relisent toujours la base.
 */
export interface Cache<T> {
  read(): Promise<T>;
  /** Remplace la valeur (après une écriture réussie). */
  set(value: T): void;
  clear(): void;
}

interface Slot<T> {
  at: number;
  value?: T;
  loading?: Promise<T>;
}

const slots = globalThis as unknown as { __swr?: Map<string, Slot<unknown>> };

export function createCache<T>(name: string, load: () => Promise<T>, fresh: number, stale: number): Cache<T> {
  const map = (slots.__swr ??= new Map());
  const slot = () => {
    let s = map.get(name) as Slot<T> | undefined;
    if (!s) map.set(name, (s = { at: 0 }));
    return s;
  };
  const refresh = () => {
    const s = slot();
    s.loading ??= load()
      .then((value) => {
        s.value = value;
        s.at = Date.now();
        return value;
      })
      .finally(() => {
        s.loading = undefined;
      });
    return s.loading;
  };
  return {
    async read() {
      const s = slot();
      const age = Date.now() - s.at;
      if (s.value !== undefined && age < fresh) return s.value;
      if (s.value !== undefined && age < stale) {
        void refresh().catch(() => undefined);
        return s.value;
      }
      return refresh();
    },
    set(value) {
      const s = slot();
      s.value = value;
      s.at = Date.now();
    },
    clear() {
      map.delete(name);
    },
  };
}
