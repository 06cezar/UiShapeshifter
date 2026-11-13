// Mascota (specs/11): o vulpe pixel art care stă în colțul de jos, merge până la un element și îl arată (point_at),
// cu o bulă de mesaj și un contur pulsatoriu desenat în stratul nostru (nu atingem stilul site-ului).
// Nu primește click-uri (pointer-events: none), ca să nu acopere niciodată ce vrea omul să apese.

import type { MascotState, ToolData, ToolResult } from "@uishapeshifter/contracts";
import type { OurRoot } from "../extension/shadow-root";
import { POSE_ANIMATIONS, type MascotPose } from "./animations";
import {
  homePosition,
  needsScroll,
  pointPlacement,
  stepToward,
  type Box,
  type Placement,
  type Point,
} from "./geometry";
import { MASCOT_CSS } from "./mascot-styles";
import { createSpriteRenderer, type CreateRenderer, type MascotRenderer } from "./renderer-sprite";

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
/** Mărimea de rezervă, când CSS-ul n-a fost încă aplicat (happy-dom, prima randare). */
const FALLBACK_SIZE = { width: 99, height: 99 };

export interface MascotController {
  setState(state: MascotState): void;
  state(): MascotState;
  say(text: string, ms?: number): void;
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
    <canvas class="mascot-canvas"></canvas>
  `;
  const highlight = document.createElement("div");
  highlight.className = "mascot-highlight";
  highlight.hidden = true;
  root.shadow.append(highlight, container);

  const bubble = container.querySelector<HTMLParagraphElement>(".mascot-bubble")!;
  const canvas = container.querySelector<HTMLCanvasElement>(".mascot-canvas")!;

  let state: MascotState = "idle";
  let walking = false;
  let renderer: MascotRenderer | null = null;
  let position: Point = { x: 0, y: 0 };
  let walkFrame = 0;
  let trackFrame = 0;
  let bubbleTimer: ReturnType<typeof setTimeout> | undefined;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let pointed: Element | null = null;
  let destroyed = false;

  function size() {
    const rect = container.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? { width: rect.width, height: rect.height } : FALLBACK_SIZE;
  }

  function moveTo(point: Point) {
    position = point;
    container.style.transform = `translate(${Math.round(point.x)}px, ${Math.round(point.y)}px)`;
    // Lângă marginea de sus (ex. câmpul de căutare al unui site), bula de deasupra ar ieși din ecran: o punem dedesubt.
    // Bula are câteva rânduri, deci încape în înălțimea mascotei.
    container.dataset.bubbleBelow = String(point.y < size().height);
  }

  function showPose(pose: MascotPose) {
    container.dataset.state = pose;
    renderer?.play(POSE_ANIMATIONS[pose]);
  }

  function goHomeInstantly() {
    moveTo(homePosition(viewport(), size(), EDGE_MARGIN_PX));
  }

  /** Merge până la `target`; promisiunea se rezolvă la sosire (sau imediat, cu reducedMotion). */
  function walkTo(target: Point): Promise<void> {
    cancelAnimationFrame(walkFrame);
    if (reducedMotion()) {
      moveTo(target);
      return Promise.resolve();
    }
    walking = true;
    showPose("walking");
    renderer?.face(target.x >= position.x ? "right" : "left");
    return new Promise((resolve) => {
      let last = performance.now();
      const step = (now: number) => {
        const seconds = (now - last) / 1000;
        last = now;
        const next = stepToward(position, target, WALK_SPEED_PX_PER_SECOND * seconds);
        moveTo(next.point);
        if (next.arrived || destroyed) {
          walking = false;
          showPose(state);
          resolve();
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
      if (!walking) {
        const place = pointPlacement(rect, size(), viewport(), position, EDGE_MARGIN_PX, ELEMENT_GAP_PX);
        if (Math.abs(place.x - position.x) > 1 || Math.abs(place.y - position.y) > 1) moveTo(place);
        renderer?.face(place.facing);
      }
      trackFrame = requestAnimationFrame(follow);
    };
    trackFrame = requestAnimationFrame(follow);
  }

  function say(text: string, ms?: number) {
    clearTimeout(bubbleTimer);
    bubble.textContent = text;
    bubble.hidden = false;
    const words = text.trim().split(/\s+/).length;
    bubbleTimer = setTimeout(() => (bubble.hidden = true), ms ?? Math.max(BUBBLE_MIN_MS, words * BUBBLE_MS_PER_WORD));
  }

  function setState(next: MascotState) {
    state = next;
    if (!walking) showPose(next);
    if (next !== "pointing" && !pointed) renderer?.face("front");
  }

  function release() {
    clearTimeout(holdTimer);
    cancelAnimationFrame(trackFrame);
    pointed = null;
    highlight.hidden = true;
    if (state === "pointing") state = "idle";
    void walkTo(homePosition(viewport(), size(), EDGE_MARGIN_PX)).then(() => {
      if (!pointed) renderer?.face("front");
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
    await walkTo(place);
    if (pointed !== element) return { ok: true, data: { scrolledIntoView, rect } }; // a venit între timp alt point_at

    renderer?.face(place.facing);
    showPose("pointing");
    highlight.hidden = false;
    placeHighlight(boxOf(element));
    say(message);
    track(element);
    holdTimer = setTimeout(release, POINT_HOLD_MS);
    return { ok: true, data: { scrolledIntoView, rect: boxOf(element) } };
  }

  function onResize() {
    if (!pointed && !walking) goHomeInstantly();
  }

  goHomeInstantly();
  showPose("idle");
  window.addEventListener("resize", onResize);
  (options.createRenderer ?? createSpriteRenderer)(canvas, { reducedMotion: reducedMotion() })
    .then((created) => {
      if (destroyed) return created.dispose();
      renderer = created;
      renderer.face(pointed ? "right" : "front");
      showPose(walking ? "walking" : state);
    })
    .catch(() => {
      // Cadrele n-au putut fi decodate: vulpea lipsește, dar conturul și bula încă arată elementul.
      container.dataset.noModel = "true";
    });

  return {
    setState,
    state: () => state,
    say,
    pointAt,
    release,
    destroy() {
      destroyed = true;
      clearTimeout(bubbleTimer);
      clearTimeout(holdTimer);
      cancelAnimationFrame(walkFrame);
      cancelAnimationFrame(trackFrame);
      window.removeEventListener("resize", onResize);
      renderer?.dispose();
      container.remove();
      highlight.remove();
    },
  };
}
