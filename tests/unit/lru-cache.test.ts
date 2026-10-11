import { LruCache } from "../../src/cache";

describe("LruCache", () => {
  /** Creates a cache and sets each key to its index, left to right. */
  const filledCache = (keys: string[], maxSize = 3) => {
    const cache = new LruCache<string, number>(maxSize);
    keys.forEach((key, i) => cache.set(key, i));
    return cache;
  };

  describe("construction", () => {
    it.each([0, -1, -100])("rejects maxSize %p", (maxSize) => {
      expect(() => new LruCache(maxSize)).toThrow(RangeError);
    });

    it.each([1, 10_000])("accepts maxSize %p and starts empty", (maxSize) => {
      const cache = new LruCache(maxSize);

      expect(cache.size).toBe(0);
      expect(cache.keys()).toEqual([]);
    });
  });

  describe("basic operations", () => {
    it("returns undefined for a missing key", () => {
      const cache = filledCache(["a"]);

      expect(cache.get("missing")).toBeUndefined();
      expect(cache.peek("missing")).toBeUndefined();
    });

    it("returns a stored value and tracks size", () => {
      const cache = filledCache(["a", "b"]);

      expect(cache.get("a")).toBe(0);
      expect(cache.peek("b")).toBe(1);
      expect(cache.size).toBe(2);
    });

    it("returns itself from set so calls can be chained", () => {
      const cache = new LruCache<string, number>(3);

      expect(cache.set("a", 1).set("b", 2)).toBe(cache);
      expect(cache.size).toBe(2);
    });

    it.each([
      { label: "0", val: 0 },
      { label: "empty string", val: "" },
      { label: "false", val: false },
      { label: "null", val: null },
    ])("stores the falsy value $label", ({ val }) => {
      const cache = new LruCache<string, unknown>(3);

      cache.set("a", val);

      expect(cache.get("a")).toBe(val);
      expect(cache.peek("a")).toBe(val);
    });

    it("stores objects by reference, so in-place updates are visible", () => {
      const cache = new LruCache<string, { count: number }>(3);
      const state = { count: 0 };
      cache.set("a", state);

      state.count += 1;

      expect(cache.get("a")).toEqual({ count: 1 });
    });

    it("updates the value of an existing key without growing", () => {
      const cache = filledCache(["a", "b"]);

      cache.set("a", 100);

      expect(cache.get("a")).toBe(100);
      expect(cache.size).toBe(2);
    });

    it("deletes an existing key", () => {
      const cache = filledCache(["a", "b"]);

      expect(cache.delete("a")).toBe(true);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.size).toBe(1);
    });

    it("can store a key again after deleting it", () => {
      const cache = filledCache(["a", "b"]);

      cache.delete("a");
      cache.set("a", 5);

      expect(cache.keys()).toEqual(["b", "a"]);
      expect(cache.get("a")).toBe(5);
    });
  });

  describe("deque order (left = least recently used, right = most recently used)", () => {
    it("keeps insertion order", () => {
      expect(filledCache(["a", "b", "c"]).keys()).toEqual(["a", "b", "c"]);
    });

    it.each([
      { position: "leftmost", key: "a", expected: ["b", "c", "a"] },
      { position: "middle", key: "b", expected: ["a", "c", "b"] },
      { position: "rightmost", key: "c", expected: ["a", "b", "c"] },
    ])("moves the $position key to the right on get", ({ key, expected }) => {
      const cache = filledCache(["a", "b", "c"]);

      cache.get(key);

      expect(cache.keys()).toEqual(expected);
    });

    it("does not reorder on a missed get", () => {
      const cache = filledCache(["a", "b", "c"]);

      cache.get("missing");

      expect(cache.keys()).toEqual(["a", "b", "c"]);
    });

    it("does not reorder on peek", () => {
      const cache = filledCache(["a", "b", "c"]);

      cache.peek("a");

      expect(cache.keys()).toEqual(["a", "b", "c"]);
    });

    it.each([
      { position: "leftmost", key: "a", expected: ["b", "c"] },
      { position: "middle", key: "b", expected: ["a", "c"] },
      { position: "rightmost", key: "c", expected: ["a", "b"] },
    ])("keeps the order after deleting the $position key", ({ key, expected }) => {
      const cache = filledCache(["a", "b", "c"]);

      cache.delete(key);

      expect(cache.keys()).toEqual(expected);
    });

    it("keeps the order after deleting the only key", () => {
      const cache = filledCache(["a"]);

      cache.delete("a");

      expect(cache.keys()).toEqual([]);
      expect(cache.size).toBe(0);
    });
  });

  describe("eviction", () => {
    it("evicts the leftmost key when a new key exceeds maxSize", () => {
      const cache = filledCache(["a", "b", "c", "d"]);

      expect(cache.keys()).toEqual(["b", "c", "d"]);
      expect(cache.peek("a")).toBeUndefined();
      expect(cache.size).toBe(3);
    });

    it("keeps a recently read key and evicts the next least recently used", () => {
      const cache = filledCache(["a", "b", "c"]);

      cache.get("a");
      cache.set("d", 3);

      expect(cache.keys()).toEqual(["c", "a", "d"]);
      expect(cache.peek("b")).toBeUndefined();
    });

    it("does not protect a key that was only peeked", () => {
      const cache = filledCache(["a", "b", "c"]);

      cache.peek("a");
      cache.set("d", 3);

      expect(cache.keys()).toEqual(["b", "c", "d"]);
    });

    it("replaces the only entry when maxSize is 1", () => {
      const cache = filledCache(["a", "b"], 1);

      expect(cache.keys()).toEqual(["b"]);
    });

    it("does not evict when updating an existing key in a full cache", () => {
      const cache = filledCache(["a", "b", "c"]);

      cache.set("b", 100);

      expect(cache.size).toBe(3);
      expect(cache.peek("a")).toBe(0);
    });

    it("has room again after a delete", () => {
      const cache = filledCache(["a", "b", "c"]);

      cache.delete("b");
      cache.set("d", 3);

      expect(cache.keys()).toEqual(["a", "c", "d"]);
    });

    it.each([1, 2, 5, 100])(
      "never holds more than maxSize (%i) entries",
      (maxSize) => {
        const keys = Array.from({ length: maxSize + 10 }, (_, i) => `k${i}`);
        const cache = filledCache(keys, maxSize);

        expect(cache.size).toBe(maxSize);
        expect(cache.keys()).toEqual(keys.slice(10));
        keys.slice(0, 10).forEach((key) => expect(cache.peek(key)).toBeUndefined());
      },
    );
  });
});
