import { beforeEach, describe, expect, test } from "vitest";
import type { PageInfo } from "@uishapeshifter/contracts";
import { HOST_ID, mountOurRoot } from "../extension/shadow-root";
import type { OutgoingClientMessage } from "../extension/messages";
import { mountChat } from "./chat-panel";
import { CHAT_TEXT } from "./chat-state";
import { VOICE_LANG, type RecognitionLike, type RecognitionResultEvent } from "./voice";

const PAGE: PageInfo = { url: "https://example.com/a", host: "example.com", title: "Exemplu" };

/** Recunoașterea falsă: testul spune ce „aude” și când se termină. */
class FakeRecognition implements RecognitionLike {
  static last: FakeRecognition | null = null;
  lang = "";
  interimResults = false;
  continuous = true;
  started = false;
  onresult: ((event: RecognitionResultEvent) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.onend?.();
  }
  hear(text: string, isFinal: boolean) {
    this.onresult?.({ resultIndex: 0, results: [{ isFinal, 0: { transcript: text } }] });
  }
}

function setup(recognition: typeof FakeRecognition | null = FakeRecognition) {
  document.getElementById(HOST_ID)?.remove();
  const sent: OutgoingClientMessage[] = [];
  mountChat(mountOurRoot(document), { send: (message) => sent.push(message), page: () => PAGE, recognition });
  const shadow = document.getElementById(HOST_ID)!.shadowRoot!;
  const q = <T extends Element>(selector: string) => shadow.querySelector<T>(selector)!;
  q<HTMLButtonElement>(".chat-launcher").click();
  return { sent, q };
}

beforeEach(() => {
  document.body.innerHTML = "";
  FakeRecognition.last = null;
});

describe("vocea (D10)", () => {
  test("fără recunoaștere în browser, butonul de microfon nu apare", () => {
    const { q } = setup(null);
    expect(q<HTMLButtonElement>(".chat-voice").hidden).toBe(true);
  });

  test("microfonul ascultă în română, arată textul pe parcurs și trimite fraza ca cerere vorbită", () => {
    const { q, sent } = setup();
    const mic = q<HTMLButtonElement>(".chat-voice");
    expect(mic.hidden).toBe(false);
    expect(mic.getAttribute("aria-label")).toBe(CHAT_TEXT.voiceStart);

    mic.click();
    const recognition = FakeRecognition.last!;
    expect(recognition).toMatchObject({ started: true, lang: VOICE_LANG, interimResults: true, continuous: false });
    expect(mic.getAttribute("aria-pressed")).toBe("true");
    expect(q<HTMLElement>(".chat-hint").textContent).toBe(CHAT_TEXT.voiceListening);

    recognition.hear("ascunde", false);
    expect(q<HTMLInputElement>(".chat-input").value).toBe("ascunde");
    recognition.hear("ascunde reclamele", true);
    expect(sent).toEqual([{ type: "user_message", text: "ascunde reclamele", source: "voice", page: PAGE }]);
    expect(q<HTMLInputElement>(".chat-input").value).toBe("");

    recognition.onend?.();
    expect(mic.getAttribute("aria-pressed")).toBe("false");
    expect(q<HTMLElement>(".chat-hint").textContent).toBe("");
  });

  test("a doua apăsare oprește ascultarea", () => {
    const { q } = setup();
    const mic = q<HTMLButtonElement>(".chat-voice");
    mic.click();
    mic.click();
    expect(mic.getAttribute("aria-pressed")).toBe("false");
  });

  test("fără voie la microfon: un mesaj pe înțeles, în română", () => {
    const { q } = setup();
    q<HTMLButtonElement>(".chat-voice").click();
    FakeRecognition.last!.onerror?.({ error: "not-allowed" });
    FakeRecognition.last!.onend?.();
    expect(q<HTMLElement>(".chat-hint").textContent).toContain("Nu am voie la microfon");
  });
});
