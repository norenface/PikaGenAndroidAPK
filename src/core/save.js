// セーブデータ（localStorage）。WebView でも端末内に保持される。
const KEY = 'pikagen-save-v1';

const fresh = () => ({
  friendship: 10,
  items: {},
  flags: {},
  garden: { plots: [null, null, null, null], wateredDay: null },
  fishing: { best: {} },
  muted: false,
});

export class Save {
  constructor() {
    this.data = fresh();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = { ...fresh(), ...JSON.parse(raw) };
    } catch {
      // ストレージが使えない環境ではセーブなしで遊ぶ
    }
  }
  write() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* noop */
    }
  }
  reset() {
    this.data = fresh();
    this.write();
  }
  flag(name) {
    return !!this.data.flags[name];
  }
  setFlag(name, v = true) {
    this.data.flags[name] = v;
    this.write();
  }
  addItem(id, n = 1) {
    this.data.items[id] = (this.data.items[id] ?? 0) + n;
    this.write();
  }
  addFriendship(n) {
    this.data.friendship = Math.max(0, Math.min(100, this.data.friendship + n));
    this.write();
  }
  get friendship() {
    return this.data.friendship;
  }
}
