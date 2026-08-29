export interface InputState {
  throttle: number;
  steer: number;
  brake: number;
  boost: boolean;
  pause: boolean;
  confirm: boolean;
}

export class Input {
  private keys = new Set<string>();
  pausePressed = false;
  confirmPressed = false;
  private leftPressed = false;
  private rightPressed = false;
  private padA = false;
  private padB = false;
  private padLeft = false;
  private padRight = false;
  private padStart = false;

  constructor() {
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (e.code === "Escape") this.pausePressed = true;
      if (e.code === "Enter" || e.code === "Space") this.confirmPressed = true;
      if (e.code === "ArrowLeft" || e.code === "KeyA") this.leftPressed = true;
      if (e.code === "ArrowRight" || e.code === "KeyD") this.rightPressed = true;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Escape"].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
  }

  consumePause(): boolean {
    this.syncPad();
    const v = this.pausePressed;
    this.pausePressed = false;
    return v;
  }

  consumeConfirm(): boolean {
    this.syncPad();
    const v = this.confirmPressed;
    this.confirmPressed = false;
    return v;
  }

  consumeMenuLeft(): boolean {
    this.syncPad();
    const v = this.leftPressed;
    this.leftPressed = false;
    return v;
  }

  consumeMenuRight(): boolean {
    this.syncPad();
    const v = this.rightPressed;
    this.rightPressed = false;
    return v;
  }

  read(): InputState {
    this.syncPad();
    let throttle = this.held("KeyW", "ArrowUp") ? 1 : 0;
    let brake = this.held("KeyS", "ArrowDown", "ControlLeft", "ControlRight") ? 1 : 0;
    let steer = 0;
    if (this.held("KeyA", "ArrowLeft")) steer += 1;
    if (this.held("KeyD", "ArrowRight")) steer -= 1;
    let boost = this.held("ShiftLeft", "ShiftRight", "Space");

    const pads = navigator.getGamepads?.() ?? [];
    for (const pad of pads) {
      if (!pad) continue;
      const rt = pad.buttons[7]?.value ?? 0;
      const lt = pad.buttons[6]?.value ?? 0;
      throttle = Math.max(throttle, rt);
      brake = Math.max(brake, lt);
      const axis = pad.axes[0] ?? 0;
      if (Math.abs(axis) > 0.12) steer = -axis;
      const south = pad.buttons[0]?.pressed;
      const rb = pad.buttons[5]?.pressed;
      boost = boost || !!south || !!rb;
    }

    return { throttle, steer, brake, boost, pause: false, confirm: false };
  }

  private syncPad(): void {
    const pads = navigator.getGamepads?.() ?? [];
    let a = false;
    let b = false;
    let left = false;
    let right = false;
    let start = false;
    for (const pad of pads) {
      if (!pad) continue;
      a = a || !!pad.buttons[0]?.pressed;
      b = b || !!pad.buttons[1]?.pressed;
      start = start || !!pad.buttons[9]?.pressed;
      left = left || !!pad.buttons[14]?.pressed || (pad.axes[0] ?? 0) < -0.55;
      right = right || !!pad.buttons[15]?.pressed || (pad.axes[0] ?? 0) > 0.55;
    }
    if (a && !this.padA) this.confirmPressed = true;
    if ((b && !this.padB) || (start && !this.padStart)) this.pausePressed = true;
    if (left && !this.padLeft) this.leftPressed = true;
    if (right && !this.padRight) this.rightPressed = true;
    this.padA = a;
    this.padB = b;
    this.padLeft = left;
    this.padRight = right;
    this.padStart = start;
  }

  private held(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }
}
