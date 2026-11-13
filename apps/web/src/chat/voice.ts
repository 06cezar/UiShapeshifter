// Cererea vorbită (D10, specs/11): recunoașterea vorbirii din browser (Web Speech), în română. Textul intermediar apare
// în câmpul chatului cât vorbește omul; la final se trimite singur, ca un mesaj scris. Fără API (alt browser decât
// Chrome), chatul nu arată butonul de microfon. Sunetul nu ajunge la serverul nostru: îl transcrie browserul.

export const VOICE_LANG = "ro-RO";

/** Ce folosim din `SpeechRecognition`; tipurile DOM nu-l au încă, iar în teste îl înlocuim cu unul fals. */
export interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

export interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

export type RecognitionConstructor = new () => RecognitionLike;

/** Constructorul din browser (Chrome îl are cu prefixul `webkit`), sau `undefined` dacă nu există. */
export function browserRecognition(win: Window = window): RecognitionConstructor | undefined {
  const candidates = win as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return candidates.SpeechRecognition ?? candidates.webkitSpeechRecognition;
}

export interface VoiceCallbacks {
  /** Ce s-a înțeles până acum (se schimbă cât vorbește omul). */
  interim(text: string): void;
  /** Fraza terminată: se trimite ca cerere. */
  final(text: string): void;
  /** Un mesaj scurt, în română, pentru om. */
  error(message: string): void;
  /** Ascultarea s-a oprit (singură sau la cerere). */
  end(): void;
}

export interface VoiceInput {
  start(): void;
  stop(): void;
  listening(): boolean;
}

/** Mesajele pentru erorile recunoașterii; restul primesc mesajul general. */
const ERROR_TEXT: Record<string, string> = {
  "not-allowed": "Nu am voie la microfon. Permite-l din bara browserului, apoi încearcă din nou.",
  "service-not-allowed": "Nu am voie la microfon. Permite-l din bara browserului, apoi încearcă din nou.",
  "no-speech": "Nu te-am auzit. Apasă din nou pe microfon și vorbește.",
  "audio-capture": "Nu găsesc niciun microfon.",
  network: "Recunoașterea vorbirii are nevoie de internet.",
};
const GENERAL_ERROR = "Nu am putut asculta. Încearcă din nou sau scrie.";

export function createVoiceInput(Recognition: RecognitionConstructor, callbacks: VoiceCallbacks): VoiceInput {
  let active: RecognitionLike | null = null;

  return {
    start() {
      if (active) return;
      const recognition = new Recognition();
      recognition.lang = VOICE_LANG;
      recognition.interimResults = true;
      recognition.continuous = false; // o cerere, apoi se oprește singur
      recognition.onresult = (event) => {
        let interim = "";
        let finished = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i]!;
          if (result.isFinal) finished += result[0].transcript;
          else interim += result[0].transcript;
        }
        if (finished.trim()) callbacks.final(finished.trim());
        else if (interim.trim()) callbacks.interim(interim.trim());
      };
      recognition.onerror = (event) => {
        // „aborted” vine când omul oprește singur: nu e o eroare de spus.
        if (event.error !== "aborted") callbacks.error(ERROR_TEXT[event.error] ?? GENERAL_ERROR);
      };
      recognition.onend = () => {
        active = null;
        callbacks.end();
      };
      active = recognition;
      try {
        recognition.start();
      } catch {
        active = null;
        callbacks.error(GENERAL_ERROR);
        callbacks.end();
      }
    },
    stop() {
      active?.stop();
    },
    listening: () => active !== null,
  };
}
