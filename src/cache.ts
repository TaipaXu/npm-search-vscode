interface CacheEntry<Value> {
    expiresAt: number;
    value: Value;
}

export class TtlLruCache<Key, Value> {
    private readonly entries = new Map<Key, CacheEntry<Value>>();

    public constructor(
        private readonly maxSize: number,
        private readonly ttlMs: number,
        private readonly now: () => number = Date.now,
    ) {
        if (!Number.isInteger(maxSize) || maxSize < 1) {
            throw new RangeError('maxSize must be a positive integer.');
        }

        if (!Number.isFinite(ttlMs) || ttlMs < 1) {
            throw new RangeError('ttlMs must be a positive number.');
        }
    }

    public get size(): number {
        this.deleteExpired();
        return this.entries.size;
    }

    public clear(): void {
        this.entries.clear();
    }

    public get(key: Key): Value | undefined {
        const entry = this.entries.get(key);
        if (entry === undefined) {
            return undefined;
        }

        if (entry.expiresAt <= this.now()) {
            this.entries.delete(key);
            return undefined;
        }

        // Map preserves insertion order. Reinsert on access so the first key is always the LRU.
        this.entries.delete(key);
        this.entries.set(key, entry);
        return entry.value;
    }

    public set(key: Key, value: Value): void {
        this.entries.delete(key);
        this.entries.set(key, {
            expiresAt: this.now() + this.ttlMs,
            value,
        });

        while (this.entries.size > this.maxSize) {
            const leastRecentlyUsed = this.entries.keys().next();
            if (leastRecentlyUsed.done) {
                break;
            }

            this.entries.delete(leastRecentlyUsed.value);
        }
    }

    private deleteExpired(): void {
        const now = this.now();
        for (const [key, entry] of this.entries) {
            if (entry.expiresAt <= now) {
                this.entries.delete(key);
            }
        }
    }
}
