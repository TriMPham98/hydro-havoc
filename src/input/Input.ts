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

  constructor() {
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (e.code === "Escape") this.pausePressed = true;
      if (e.code === "Enter" || e.code === "Space") this.confirmPressed = true;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Escape"].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
  }

  consumePause(): boolean {
    const v = this.pausePressed;
    this.pausePressed = false;
    const pads = navigator.getGamepads?.() ?? [];
    for (const pad of pads) {
      if (pad?.buttons[9]?.pressed) return true;
    }
    return v;
  }

  consumeConfirm(): boolean {
    const v = this.confirmPressed;
    this.confirmPressed = false;
    return v;
  }

  read(): InputState {
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

  private held(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }
}
