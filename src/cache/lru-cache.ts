interface Node<K, V> {
  key: K;
  val: V;
  prev: Node<K, V> | null;
  next: Node<K, V> | null;
}

/**
 * Least recently used cache with a fixed capacity.
 *
 * Entries live in a deque ordered from least recently used (left) to most
 * recently used (right). New entries are pushed on the right and every `get`
 * moves its entry to the right, so when the cache is full the leftmost entry
 * is evicted.
 *
 * The deque is a doubly linked list between two sentinel nodes, and `cache`
 * maps each key to its node, so `get`, `peek`, `set` and `delete` are O(1).
 */
export class LruCache<K, V> {
  private readonly cache = new Map<K, Node<K, V>>();
  /** Sentinel before the leftmost (least recently used) entry. */
  private readonly head = { prev: null, next: null } as Node<K, V>;
  /** Sentinel after the rightmost (most recently used) entry. */
  private readonly tail = { prev: null, next: null } as Node<K, V>;

  constructor(private readonly maxSize: number) {
    if (maxSize < 1) {
      throw new RangeError(`maxSize must be a positive integer, got ${maxSize}`);
    }
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  get size(): number {
    return this.cache.size;
  }

  /** Returns the value for `key` and marks it as most recently used. */
  get(key: K): V | undefined {
    const node = this.cache.get(key);
    if (!node) return undefined;

    this.unlink(node);
    this.pushRight(node);
    return node.val;
  }

  /** Returns the value for `key` without changing its position. */
  peek(key: K): V | undefined {
    return this.cache.get(key)?.val;
  }

  /** Stores `val` under `key`, evicting the leftmost entry if the cache is full. */
  set(key: K, val: V): this {
    const existing = this.cache.get(key);
    if (existing) {
      existing.val = val;
      return this;
    }

    if (this.cache.size >= this.maxSize) {
      this.delete(this.head.next!.key);
    }

    const node: Node<K, V> = { key, val, prev: null, next: null };
    this.cache.set(key, node);
    this.pushRight(node);
    return this;
  }

  delete(key: K): boolean {
    const node = this.cache.get(key)!;
    this.unlink(node);
    return this.cache.delete(key);
  }

  /** Keys from left (least recently used) to right (most recently used). */
  keys(): K[] {
    const keys: K[] = [];
    for (let node = this.head.next; node !== this.tail; node = node!.next) {
      keys.push(node!.key);
    }
    return keys;
  }

  private pushRight(node: Node<K, V>): void {
    node.prev = this.tail.prev;
    node.next = this.tail;
    this.tail.prev!.next = node;
    this.tail.prev = node;
  }

  private unlink(node: Node<K, V>): void {
    node.prev!.next = node.next;
    node.next!.prev = node.prev;
    node.prev = null;
    node.next = null;
  }
}
