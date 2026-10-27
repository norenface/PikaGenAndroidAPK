// タッチ（仮想スティック + タップ）とキーボード入力
export class Input {
  constructor(canvas, joyEl) {
    this.move = { x: 0, z: 0 };
    this.keys = new Set();
    this.onTap = null;
    this.onAction = null;
    this.joy = null;
    this.joyEl = joyEl;
    this.knob = joyEl.querySelector('.knob');
    this.pointers = new Map();

    canvas.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.moveP(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) this.onAction?.();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
  }

  down(e) {
    const p = { x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: 0 };
    this.pointers.set(e.pointerId, p);
    if (!this.joy && e.clientX < window.innerWidth * 0.45) {
      this.joy = { id: e.pointerId, cx: e.clientX, cy: e.clientY };
      this.joyEl.style.left = e.clientX + 'px';
      this.joyEl.style.top = e.clientY + 'px';
      this.joyEl.classList.add('on');
    }
  }
  moveP(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    p.moved = Math.max(p.moved, Math.hypot(e.clientX - p.x0, e.clientY - p.y0));
    if (this.joy?.id === e.pointerId) {
      let dx = e.clientX - this.joy.cx;
      let dy = e.clientY - this.joy.cy;
      const len = Math.hypot(dx, dy);
      const max = 55;
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const dead = len < 8 ? 0 : 1;
      this.move.x = (dx / max) * dead;
      this.move.z = (dy / max) * dead;
    }
  }
  up(e) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.joy?.id === e.pointerId) {
      this.joy = null;
      this.move.x = this.move.z = 0;
      this.knob.style.transform = '';
      this.joyEl.classList.remove('on');
    }
    if (p && p.moved < 10 && performance.now() - p.t0 < 300 && e.target.tagName === 'CANVAS') {
      this.onTap?.(e.clientX, e.clientY);
    }
  }

  // 正規化した移動ベクトル（x: 右+, z: 手前+）
  axis() {
    let x = this.move.x;
    let z = this.move.z;
    const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) z -= 1;
    if (k.has('s') || k.has('arrowdown')) z += 1;
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    return { x, z };
  }
}
