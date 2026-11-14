// Mascota (specs/11): un raton care stă în colțul de jos, merge până la un element și îl arată (point_at),
// cu o bulă de mesaj și un contur pulsatoriu desenat în stratul nostru (nu atingem stilul site-ului). La o rulare
// reușită dansează (happy).
// Nu primește click-uri (pointer-events: none), ca să nu acopere niciodată ce vrea omul să apese.

import type { MascotState, ToolData, ToolResult } from "@uishapeshifter/contracts";
import type { OurRoot } from "../extension/shadow-root";
import { DANCE_MS, POSE_ANIMATIONS, type MascotPose } from "./animations";
import {
  bubblePlacement,
  homePosition,
  needsScroll,
  pointPlacement,
  stepToward,
  type Box,
  type Facing,
  type Placement,
  type Point,
  type Size,
} from "./geometry";
import { MASCOT_CSS } from "./mascot-styles";
import { createSpriteRenderer, FRONT_FACING, type CreateRenderer, type MascotRenderer } from "./renderer-sprite";

/** Viteza de mers, în pixeli pe secundă: destul de încet ca ochiul să o urmărească. */
const WALK_SPEED_PX_PER_SECOND = 420;
/** Cât de departe de marginea ecranului și de element stă. */
const EDGE_MARGIN_PX = 8;
const ELEMENT_GAP_PX = 4;
/** Conturul stă puțin în afara elementului, ca marginea lui să nu acopere prima și ultima literă. */
const HIGHLIGHT_PAD_PX = 4;
/** Cât rămâne pe element după point_at, dacă nu vine altă comandă. */
const POINT_HOLD_MS = 20_000;
/** Cât stă bula, implicit, și cât pe cuvânt (ca un mesaj lung să se poată citi). */
const BUBBLE_MIN_MS = 4_000;
const BUBBLE_MS_PER_WORD = 400;
/** Cât așteptăm derularea lină a paginii până la element. */
const SCROLL_SETTLE_MS = 450;
/** Cât stă cel mult un gând fără un altul după el (o rulare are pași mult mai des). */
const THOUGHT_MAX_MS = 60_000;
/** Mărimea de rezervă, când CSS-ul n-a fost încă aplicat (happy-dom, prima randare). */
const FALLBACK_SIZE = { width: 132, height: 112 };

export interface MascotController {
  setState(state: MascotState): void;
  state(): MascotState;
  say(text: string, ms?: number): void;
  /**
   * Ce gândește agentul acum (rândul de activitate din chat), într-o bulă de gând cu „…” care stă cât lucrează;
   * `null` o ascunde. Nu acoperă bula unui point_at.
   */
  think(text: string | null): void;
  /** Merge la element și îl arată; NOT_VISIBLE dacă e ascuns (meniu închis, `display: none`). */
  pointAt(element: Element, message: string): Promise<ToolResult<ToolData["point_at"]>>;
  /** Lasă elementul și se întoarce în colț. */
  release(): void;
  destroy(): void;
}

export interface MascotOptions {
  reducedMotion?: () => boolean;
  /** Testele dau o randare falsă; în extensie sunt cadrele vulpii. */
  createRenderer?: CreateRenderer;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Se vede elementul pe pagină? (nu verificăm suprapunerile, doar că e desenat) */
export function isRendered(element: Element): boolean {
  if (!element.isConnected) return false;
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function boxOf(element: Element): Box {
  const rect = element.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

/** Partea vizibilă a paginii, fără barele de derulare (innerWidth le include, iar mascota ar intra sub ele). */
function viewport() {
  const root = document.documentElement;
  return { width: root.clientWidth || window.innerWidth, height: root.clientHeight || window.innerHeight };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function mountMascot(root: OurRoot, options: MascotOptions = {}): MascotController {
  const reducedMotion = options.reducedMotion ?? prefersReducedMotion;
  root.addStyle(MASCOT_CSS);

  const container = document.createElement("div");
  container.className = "mascot";
  container.id = "mascot"; // AGENT_UI_IDS: auditul nostru o deosebește de site
  container.dataset.agentId = "mascot";
  container.setAttribute("aria-hidden", "true"); // decor; mesajele ei ajung și în chat, unde le citește cititorul de ecran
  container.innerHTML = `
    <p class="mascot-bubble" hidden></p>
    <div class="mascot-stage">
      <span class="mascot-disc"></span>
      <canvas class="mascot-canvas"></canvas>
      <span class="mascot-note" style="--i: 0; --angle: -65deg">♪</span>
      <span class="mascot-note" style="--i: 1; --angle: 22deg">♫</span>
      <span class="mascot-note" style="--i: 2; --angle: -22deg">♪</span>
      <span class="mascot-note" style="--i: 3; --angle: 65deg">♫</span>
    </div>
  `;
  const highlight = document.createElement("div");
  highlight.className = "mascot-highlight";
  highlight.hidden = true;
  root.shadow.append(highlight, container);

  const bubble = container.querySelector<HTMLParagraphElement>(".mascot-bubble")!;
  const canvas = container.querySelector<HTMLCanvasElement>(".mascot-canvas")!;

  let state: MascotState = "idle";
  /** Mersul în curs: unde merge și cum îl anunțăm pe cel care îl așteaptă (true = a ajuns, false = întrerupt). */
  let walk: { target: Point; done: (arrived: boolean) => void } | null = null;
  let renderer: MascotRenderer | null = null;
  let position: Point = { x: 0, y: 0 };
  let walkFrame = 0;
  let trackFrame = 0;
  let bubbleTimer: ReturnType<typeof setTimeout> | undefined;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let pointed: Element | null = null;
  let destroyed = false;
  let danceTimer: ReturnType<typeof setTimeout> | undefined;
  /** Mărimea bulei, măsurată când apare un mesaj (o dată pe mesaj, nu la fiecare pas de mers); null = încă nemăsurată. */
  let bubbleSize: Size | null = null;
  /** Bula arată acum un gând (think), nu un mesaj (say): un gând nou o poate înlocui, unul gol o ascunde. */
  let thinking = false;

  function size() {
    const rect = container.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? { width: rect.width, height: rect.height } : FALLBACK_SIZE;
  }

  /**
   * Ține bula în ecran: lângă marginea de sus (ex. câmpul de căutare al unui site) trece sub mascotă, iar lângă
   * marginea din stânga se întinde spre dreapta. Până apare primul mesaj o socotim cât mascota (câteva rânduri).
   */
  function placeBubble() {
    const mascotSize = size();
    const place = bubblePlacement({ ...position, ...mascotSize }, bubbleSize ?? mascotSize, viewport(), EDGE_MARGIN_PX);
    container.dataset.bubbleBelow = String(place.below);
    container.dataset.bubbleAlign = place.alignLeft ? "left" : "right";
  }

  function moveTo(point: Point) {
    position = point;
    container.style.transform = `translate(${Math.round(point.x)}px, ${Math.round(point.y)}px)`;
    placeBubble();
  }

  /**
   * Întoarce ratonul. Partea spre care privește ajunge și în CSS (data-facing): cadrul oglindit îl mută în cutie, iar
   * dansul se învârte în jurul mijlocului lui, nu al cutiei.
   */
  function face(facing: Facing | "front") {
    const side = facing === "front" ? FRONT_FACING : facing;
    if (container.dataset.facing !== side) container.dataset.facing = side; // chemat la fiecare cadru cât arată un element
    renderer?.face(facing);
  }

  function showPose(pose: MascotPose) {
    container.dataset.state = pose;
    renderer?.play(POSE_ANIMATIONS[pose]);
  }

  function goHomeInstantly() {
    moveTo(homePosition(viewport(), size(), EDGE_MARGIN_PX));
  }

  /**
   * Încheie mersul în curs și îl anunță pe cel care îl așteaptă. Fără asta, un mers întrerupt (alt point_at, tab
   * ascuns) ar lăsa promisiunea nerezolvată, iar point_at n-ar mai răspunde agentului.
   */
  function endWalk(arrived: boolean) {
    if (!walk) return;
    const { target, done } = walk;
    walk = null;
    cancelAnimationFrame(walkFrame);
    if (arrived) moveTo(target);
    showPose(state);
    done(arrived);
  }

  /** Merge până la `target`; promisiunea spune dacă a ajuns (true) sau dacă mersul a fost întrerupt de altul (false). */
  function walkTo(target: Point): Promise<boolean> {
    endWalk(false);
    // Într-un tab ascuns browserul nu dă cadre (requestAnimationFrame stă pe loc): mutăm direct, ca la reducedMotion.
    if (reducedMotion() || document.hidden) {
      moveTo(target);
      showPose(state);
      return Promise.resolve(true);
    }
    showPose("walking");
    face(target.x >= position.x ? "right" : "left");
    return new Promise((resolve) => {
      walk = { target, done: resolve };
      let last = performance.now();
      const step = (now: number) => {
        const seconds = (now - last) / 1000;
        last = now;
        const next = stepToward(position, target, WALK_SPEED_PX_PER_SECOND * seconds);
        moveTo(next.point);
        if (next.arrived) {
          endWalk(true);
          return;
        }
        walkFrame = requestAnimationFrame(step);
      };
      walkFrame = requestAnimationFrame(step);
    });
  }

  function placeHighlight(rect: Box) {
    highlight.style.transform = `translate(${rect.x - HIGHLIGHT_PAD_PX}px, ${rect.y - HIGHLIGHT_PAD_PX}px)`;
    highlight.style.width = `${rect.width + 2 * HIGHLIGHT_PAD_PX}px`;
    highlight.style.height = `${rect.height + 2 * HIGHLIGHT_PAD_PX}px`;
  }

  /** Cât arată un element: urmărește-l la scroll, resize și când pagina își schimbă singură layout-ul. */
  function track(element: Element) {
    cancelAnimationFrame(trackFrame);
    const follow = () => {
      if (pointed !== element) return;
      if (!isRendered(element)) {
        release();
        return;
      }
      const rect = boxOf(element);
      placeHighlight(rect);
      if (!walk) {
        const place = pointPlacement(rect, size(), viewport(), position, EDGE_MARGIN_PX, ELEMENT_GAP_PX);
        if (Math.abs(place.x - position.x) > 1 || Math.abs(place.y - position.y) > 1) moveTo(place);
        face(place.facing);
      }
      trackFrame = requestAnimationFrame(follow);
    };
    trackFrame = requestAnimationFrame(follow);
  }

  function showBubble(text: string, kind: "message" | "thought") {
    clearTimeout(bubbleTimer);
    thinking = kind === "thought";
    bubble.dataset.kind = kind;
    bubble.textContent = text;
    if (thinking) {
      const dots = document.createElement("span");
      dots.className = "mascot-dots";
      dots.innerHTML = `<span class="mascot-dot"></span><span class="mascot-dot"></span><span class="mascot-dot"></span>`;
      bubble.append(dots);
    }
    bubble.hidden = false;
    const rect = bubble.getBoundingClientRect();
    bubbleSize = rect.width > 0 && rect.height > 0 ? { width: rect.width, height: rect.height } : null;
    placeBubble();
  }

  function think(text: string | null) {
    // point_at a pus în bulă unde să apese omul: gândurile de după nu-l acoperă.
    if (pointed && !thinking && !bubble.hidden) return;
    if (!text) {
      if (thinking) {
        clearTimeout(bubbleTimer);
        bubble.hidden = true;
        thinking = false;
      }
      return;
    }
    showBubble(text.replace(/…$/, ""), "thought"); // punctele care pulsează țin locul lui „…”
    // Plasă de siguranță: dacă nu mai vine nimic (legătura s-a rupt), gândul nu rămâne pe ecran la nesfârșit.
    bubbleTimer = setTimeout(() => {
      bubble.hidden = true;
      thinking = false;
    }, THOUGHT_MAX_MS);
  }

  function say(text: string, ms?: number) {
    showBubble(text, "message");
    const words = text.trim().split(/\s+/).length;
    bubbleTimer = setTimeout(() => (bubble.hidden = true), ms ?? Math.max(BUBBLE_MIN_MS, words * BUBBLE_MS_PER_WORD));
  }

  function setState(next: MascotState) {
    clearTimeout(danceTimer);
    state = next;
    if (!walk) showPose(next);
    if (next !== "pointing" && !pointed) face("front");
    if (next === "happy")
      danceTimer = setTimeout(() => state === "happy" && setState(pointed ? "pointing" : "idle"), DANCE_MS);
  }

  function release() {
    clearTimeout(holdTimer);
    cancelAnimationFrame(trackFrame);
    pointed = null;
    highlight.hidden = true;
    if (state === "pointing") state = "idle";
    void walkTo(homePosition(viewport(), size(), EDGE_MARGIN_PX)).then(() => {
      if (!pointed) face("front");
    });
  }

  async function pointAt(element: Element, message: string): Promise<ToolResult<ToolData["point_at"]>> {
    if (!isRendered(element)) {
      return {
        ok: false,
        error: { code: "NOT_VISIBLE", message: "Elementul nu se vede (ascuns sau într-un meniu închis)." },
      };
    }
    clearTimeout(holdTimer);
    cancelAnimationFrame(trackFrame);
    highlight.hidden = true;

    let scrolledIntoView = false;
    if (needsScroll(boxOf(element), viewport())) {
      element.scrollIntoView({ block: "center", inline: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
      scrolledIntoView = true;
      await wait(reducedMotion() ? 0 : SCROLL_SETTLE_MS);
    }

    pointed = element;
    state = "pointing";
    const rect = boxOf(element);
    const place: Placement = pointPlacement(rect, size(), viewport(), position, EDGE_MARGIN_PX, ELEMENT_GAP_PX);
    const arrived = await walkTo(place);
    // a venit între timp alt point_at (sau release): mascota e a lui, noi doar răspundem agentului
    if (!arrived || pointed !== element) return { ok: true, data: { scrolledIntoView, rect } };

    face(place.facing);
    showPose("pointing");
    highlight.hidden = false;
    placeHighlight(boxOf(element));
    say(message);
    track(element);
    holdTimer = setTimeout(release, POINT_HOLD_MS);
    return { ok: true, data: { scrolledIntoView, rect: boxOf(element) } };
  }

  function onResize() {
    if (!pointed && !walk) goHomeInstantly();
  }

  /** Tabul a trecut în fundal în timpul mersului: cadrele s-au oprit, deci ajunge direct la țintă. */
  function onVisibilityChange() {
    if (document.hidden) endWalk(true);
  }

  goHomeInstantly();
  face("front");
  showPose("idle");
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisibilityChange);
  (options.createRenderer ?? createSpriteRenderer)(canvas, { reducedMotion: reducedMotion() })
    .then((created) => {
      if (destroyed) return created.dispose();
      renderer = created;
      face(pointed ? "right" : "front");
      showPose(walk ? "walking" : state);
    })
    .catch(() => {
      // Cadrele n-au putut fi decodate: ratonul lipsește, dar conturul și bula încă arată elementul.
      container.dataset.noModel = "true";
    });

  return {
    setState,
    state: () => state,
    say,
    think,
    pointAt,
    release,
    destroy() {
      destroyed = true;
      clearTimeout(bubbleTimer);
      clearTimeout(holdTimer);
      clearTimeout(danceTimer);
      endWalk(false);
      cancelAnimationFrame(trackFrame);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      renderer?.dispose();
      container.remove();
      highlight.remove();
    },
  };
}
