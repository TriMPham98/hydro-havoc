import { BOATS, boatById, statBars, type BoatId } from "../data/boats";
import type { CourseId } from "../data/tracks/catalog";
import type { Boat } from "../sim/Boat";
import { BOOST_CAP, LAP_COUNT, SUPER_DURATION } from "../sim/constants";
import { formatTime, type RaceDirector } from "../sim/RaceDirector";

export type Screen = "title" | "select" | "hud" | "pause" | "results";

/** Whatever can hand the overlay a byte spectrum (the audio engine). */
export interface SpectrumSource {
  spectrum(out: Uint8Array<ArrayBuffer>): boolean;
}

export class Overlay {
  readonly root: HTMLElement;
  private title!: HTMLElement;
  private select!: HTMLElement;
  private hud!: HTMLElement;
  private pause!: HTMLElement;
  private results!: HTMLElement;
  private debug!: HTMLElement;
  private countdown!: HTMLElement;
  private callout!: HTMLElement;
  private pack!: HTMLElement;
  private help!: HTMLElement;
  private gate!: HTMLElement;
  private calloutUntil = 0;
  private pos!: HTMLElement;
  private lap!: HTMLElement;
  private clock!: HTMLElement;
  private speed!: HTMLElement;
  private sector!: HTMLElement;
  private boostFill!: HTMLElement;
  private superFill!: HTMLElement;
  private lastBoost = 0;
  private lastSuper = 0;
  private onStart?: () => void;
  private onSelect?: (id: BoatId) => void;
  private onRace?: () => void;
  private onRetry?: () => void;
  private onMenu?: () => void;
  private onResume?: () => void;
  private onChangeBoat?: () => void;
  private onMute?: () => void;
  private viz!: HTMLCanvasElement;
  private vizCtx: CanvasRenderingContext2D | null = null;
  private bins = new Uint8Array(128);
  private soundBtn!: HTMLButtonElement;
  private screen: Screen = "title";
  selected: BoatId = "skimmer";
  course: CourseId = "riptide";
  showDebug = false;

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `
      <section class="screen title-screen" id="title">
        <h1 class="wordmark"><b data-text="HYDRO">HYDRO</b><span data-text="HAVOC">HAVOC</span></h1>
        <p class="tagline">Riptide Refinery</p>
        <canvas class="viz" id="viz" width="640" height="90" aria-hidden="true"></canvas>
        <div class="btn-row">
          <button class="primary press-start" id="title-start">Press Start</button>
        </div>
        <p class="hint">Enter / Space · Gamepad A</p>
        <p class="sound-gate" id="sound-gate">🔊 Turn your sound up — click or press any key</p>
      </section>
      <button class="sound-toggle" id="sound-toggle" aria-label="Toggle sound" title="Sound (M)"></button>
      <section class="screen select-screen" id="select" hidden>
        <h2 class="wordmark select-title">Choose Hull</h2>
        <aside class="hull-sheet" id="hull-sheet"></aside>
        <div class="select-dock">
          <div class="boat-grid" id="boat-grid"></div>
          <div class="btn-row" style="margin-top:12px">
            <button class="ghost" id="select-back">Back</button>
            <button class="primary" id="select-go">Launch</button>
          </div>
          <p class="hint">← → hull · Enter launch · Esc back</p>
        </div>
      </section>
      <div class="hud" id="hud" hidden>
        <div class="vignette" aria-hidden="true"></div>
        <div class="speed-streaks" aria-hidden="true"></div>
        <div class="hud-top">
          <div class="plate"><div class="label">Place</div><div class="value place-num" id="hud-pos">1</div></div>
          <div class="plate"><div class="label">Lap</div><div class="value" id="hud-lap">1/${LAP_COUNT}</div></div>
          <div class="plate"><div class="label">Time</div><div class="value" id="hud-clock">0:00.00</div></div>
          <div class="plate"><div class="label">Knots</div><div class="value" id="hud-speed">00</div></div>
          <div class="plate"><div class="label">Sector</div><div class="value" id="hud-sector">HARBOR</div></div>
        </div>
        <div class="meters">
          <div class="meter boost"><div class="label">Boost</div><div class="meter-fill"><i id="boost-fill"></i></div></div>
          <div class="meter super"><div class="label">Super</div><div class="meter-fill"><i id="super-fill"></i></div></div>
        </div>
        <div class="help">
          <div><kbd>W</kbd> throttle <kbd>S</kbd> brake <kbd>A D</kbd> steer</div>
          <div><kbd>Shift</kbd> boost · Hydro Jump: brake then boost · <kbd>Esc</kbd> pause</div>
        </div>
        <div class="gate-lights" id="gate-lights" hidden>
          <i></i><i></i><i></i>
        </div>
        <div class="countdown" id="countdown"></div>
        <div class="callout" id="callout"></div>
        <ol class="pack" id="pack"></ol>
      </div>
      <section class="screen scrim" id="pause" hidden>
        <div class="pause-card">
          <h2>Paused</h2>
          <p>Hydro Jump: release throttle, tap brake, then tap boost. Hold brake after the tap to go higher.</p>
          <p>Blue / red icons fill boost. Yellow is Super Boost. Ram a slower boat for +1s boost. Crates drop scrap or mines.</p>
          <p class="pause-keys"><kbd>M</kbd> mute · <kbd>N</kbd> announcer · rev on the grid with <kbd>W</kbd></p>
          <div class="btn-row">
            <button class="primary" id="pause-resume">Resume</button>
            <button class="ghost" id="pause-menu">Title</button>
          </div>
        </div>
      </section>
      <section class="screen scrim" id="results" hidden>
        <div class="results">
          <h2 id="result-head">Finish</h2>
          <p class="result-sub" id="result-sub"></p>
          <ol id="result-list"></ol>
          <div class="btn-row">
            <button class="primary" id="retry">Retry</button>
            <button class="ghost" id="to-select">Change Boat</button>
          </div>
          <p class="hint">Enter retry · Esc title</p>
        </div>
      </section>
      <pre class="debug" id="debug" hidden></pre>
    `;

    this.title = this.el("#title");
    this.select = this.el("#select");
    this.hud = this.el("#hud");
    this.pause = this.el("#pause");
    this.results = this.el("#results");
    this.debug = this.el("#debug");
    this.countdown = this.el("#countdown");
    this.callout = this.el("#callout");
    this.pack = this.el("#pack");
    this.help = this.el(".help");
    this.gate = this.el("#gate-lights");
    this.pos = this.el("#hud-pos");
    this.lap = this.el("#hud-lap");
    this.clock = this.el("#hud-clock");
    this.speed = this.el("#hud-speed");
    this.sector = this.el("#hud-sector");
    this.boostFill = this.el("#boost-fill");
    this.superFill = this.el("#super-fill");

    this.el("#title-start").addEventListener("click", () => this.onStart?.());
    this.title.addEventListener("click", (e) => {
      if (e.target instanceof HTMLElement && e.target.closest("button")) return;
      this.onStart?.();
    });
    this.el("#select-go").addEventListener("click", () => this.onRace?.());
    this.el("#select-back").addEventListener("click", () => this.onMenu?.());
    this.el("#pause-resume").addEventListener("click", () => this.onResume?.());
    this.el("#pause-menu").addEventListener("click", () => this.onMenu?.());
    this.el("#retry").addEventListener("click", () => this.onRetry?.());
    this.el("#to-select").addEventListener("click", () => this.onChangeBoat?.());
    this.viz = this.el("#viz") as HTMLCanvasElement;
    this.vizCtx = this.viz.getContext("2d");
    this.soundBtn = this.el("#sound-toggle") as HTMLButtonElement;
    this.soundBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.onMute?.();
    });
    this.renderBoatCards();
  }

  setMuted(muted: boolean): void {
    this.soundBtn.classList.toggle("off", muted);
    this.soundBtn.innerHTML = muted
      ? `<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6" fill="none"/></svg>`
      : `<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none"/></svg>`;
  }

  setAudioLive(live: boolean): void {
    this.root.classList.toggle("audio-live", live);
  }

  /** Beat pulse drives CSS (--beat) everywhere; the title also draws the spectrum. */
  setBeat(beat: number, source: SpectrumSource): void {
    this.root.style.setProperty("--beat", beat.toFixed(3));
    if (this.screen !== "title" || !this.vizCtx) return;
    const ctx = this.vizCtx;
    const w = this.viz.width;
    const h = this.viz.height;
    ctx.clearRect(0, 0, w, h);
    if (!source.spectrum(this.bins)) return;
    const bars = 48;
    const gap = 3;
    const bw = (w - gap * (bars - 1)) / bars;
    for (let i = 0; i < bars; i++) {
      // Mirror around the centre: lows in the middle, highs at the edges.
      const d = Math.abs(i - (bars - 1) / 2) / ((bars - 1) / 2);
      const bin = Math.floor(2 + Math.pow(d, 1.4) * 70);
      const v = this.bins[bin] / 255;
      const bh = Math.max(2, Math.pow(v, 1.5) * h * 0.95);
      const x = i * (bw + gap);
      const grad = ctx.createLinearGradient(0, h, 0, h - bh);
      grad.addColorStop(0, "rgba(46,230,255,0.15)");
      grad.addColorStop(1, v > 0.7 ? "rgba(255,225,74,0.95)" : "rgba(46,230,255,0.9)");
      ctx.fillStyle = grad;
      ctx.fillRect(x, (h - bh) / 2, bw, bh);
    }
  }

  on(handlers: {
    start?: () => void;
    race?: () => void;
    retry?: () => void;
    menu?: () => void;
    resume?: () => void;
    select?: (id: BoatId) => void;
    changeBoat?: () => void;
    mute?: () => void;
  }): void {
    this.onMute = handlers.mute;
    this.onStart = handlers.start;
    this.onRace = handlers.race;
    this.onRetry = handlers.retry;
    this.onMenu = handlers.menu;
    this.onResume = handlers.resume;
    this.onSelect = handlers.select;
    this.onChangeBoat = handlers.changeBoat;
  }

  show(screen: Screen): void {
    this.screen = screen;
    this.root.dataset.screen = screen;
    this.title.hidden = screen !== "title";
    this.select.hidden = screen !== "select";
    this.hud.hidden = screen !== "hud";
    this.pause.hidden = screen !== "pause";
    this.results.hidden = screen !== "results";
    if (screen === "hud") this.help.classList.remove("faded");
  }

  setSelected(id: BoatId): void {
    this.selected = id;
    this.renderBoatCards();
  }

  cycleHull(dir: number): BoatId {
    const i = BOATS.findIndex((b) => b.id === this.selected);
    const next = BOATS[(i + dir + BOATS.length) % BOATS.length];
    this.setSelected(next.id);
    this.onSelect?.(next.id);
    return next.id;
  }

  updateHud(player: Boat, dir: RaceDirector, label: string | null, field: Boat[] = []): void {
    if (this.pos.textContent !== String(player.place)) restartAnim(this.pos, "sting");
    this.pos.textContent = String(player.place);
    this.lap.textContent = `${Math.min(player.lap + 1, LAP_COUNT)}/${LAP_COUNT}`;
    this.clock.textContent = formatTime(dir.time);
    this.speed.textContent = String(Math.round(player.speed * 2.4)).padStart(2, "0");
    this.sector.textContent = sectorName(player.courseT, this.course);
    const boost = player.boostFuel + player.pendingBoost;
    const sup = player.superBoostRemaining + player.pendingSuper;
    if (boost > this.lastBoost + 0.05) restartAnim(this.boostFill.closest(".meter"), "gain");
    if (sup > this.lastSuper + 0.05) restartAnim(this.superFill.closest(".meter"), "gain");
    this.lastBoost = boost;
    this.lastSuper = sup;
    this.boostFill.style.width = `${(boost / BOOST_CAP) * 100}%`;
    this.superFill.style.width = `${(sup / SUPER_DURATION) * 100}%`;
    this.hud.classList.toggle("dry", player.jetSputter > 0);
    const hot = player.boostHeld && player.jetBay <= 0 && (player.boostFuel > 0 || player.superBoostRemaining > 0);
    this.hud.classList.toggle("boosting", hot);
    this.hud.classList.toggle("bay-lock", player.jetBay > 0);
    this.hud.classList.toggle("super-on", player.superBoostRemaining > 0 && player.boostHeld);
    this.countdown.textContent = label === "GO" ? "GO" : "";
    this.gate.hidden = !label;
    this.hud.dataset.count = label ?? "";
    if (field.length) {
      this.pack.innerHTML = field
        .slice()
        .sort((a, b) => a.place - b.place)
        .map((b) => `<li class="${b.ai ? "" : "you"}">${b.place} ${b.def.name}</li>`)
        .join("");
    }
    if (this.calloutUntil && performance.now() > this.calloutUntil) {
      this.callout.textContent = "";
      this.calloutUntil = 0;
    }
    this.help.classList.toggle("faded", dir.phase === "racing" && dir.time >= 8);
  }

  flashHit(text: string, ms = 900): void {
    if (this.callout.textContent !== text || !this.calloutUntil) restartAnim(this.callout, "pop");
    this.callout.textContent = text;
    this.calloutUntil = performance.now() + ms;
  }

  showResults(boats: Boat[]): void {
    const you = boats.find((b) => !b.ai);
    const place = you?.place ?? 0;
    const ordinal = place === 1 ? "1st" : place === 2 ? "2nd" : place === 3 ? "3rd" : `${place}th`;
    this.el("#result-head").textContent = place === 1 ? "You Win" : "Finish";
    this.el("#result-sub").textContent = you ? `${ordinal} · ${you.def.name} · ${formatTime(you.finishTime)}` : "";
    const list = this.el("#result-list");
    list.innerHTML = boats
      .slice()
      .sort((a, b) => a.place - b.place)
      .map(
        (b) =>
          `<li class="${b.ai ? "" : "player"}"><span>${b.place}. ${b.def.name}${b.ai ? "" : " (you)"}</span><span>${formatTime(b.finishTime)}</span></li>`,
      )
      .join("");
  }

  setDebug(text: string): void {
    this.debug.hidden = !this.showDebug;
    this.debug.textContent = text;
  }

  private renderBoatCards(): void {
    const grid = this.el("#boat-grid");
    grid.innerHTML = "";
    for (const boat of BOATS) {
      const btn = document.createElement("button");
      btn.className = `boat-card${boat.id === this.selected ? " selected" : ""}`;
      btn.innerHTML = `<h3>${boat.name}</h3><span class="role">${boat.role}</span>`;
      btn.addEventListener("click", () => {
        this.selected = boat.id;
        this.onSelect?.(boat.id);
        this.renderBoatCards();
      });
      grid.appendChild(btn);
    }
    const def = BOATS.find((b) => b.id === this.selected) ?? boatById("skimmer");
    this.el("#hull-sheet").innerHTML = `
      <h3>${def.name}</h3>
      <span class="role">${def.role}</span>
      <p>${def.blurb}</p>
      ${statBars(def)
        .map(
          (s) =>
            `<div class="stat"><span>${s.label}</span><div class="bar"><i style="width:${Math.round(s.value * 100)}%"></i></div></div>`,
        )
        .join("")}`;
  }

  private el(sel: string): HTMLElement {
    const node = this.root.querySelector(sel);
    if (!(node instanceof HTMLElement)) throw new Error(sel);
    return node;
  }
}

function restartAnim(el: Element | null, cls: string): void {
  if (!(el instanceof HTMLElement)) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function sectorName(t: number, _course: CourseId): string {
  if (t < 0.22 || t > 0.92) return "HARBOR";
  if (t < 0.42) return "MESA";
  if (t < 0.68) return "NEON";
  return "REEF";
}
