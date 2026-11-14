// Interfața noastră nu stă peste textul paginii: ce margini rezervăm pentru panou, chat și mascotă.

import { describe, expect, test } from "vitest";
import { edgesFor } from "./reserve-space";

const SCREEN = { width: 1600, height: 900 };

describe("marginile rezervate", () => {
  test("panoul ia o coloană în dreapta, chatul deschis una în stânga", () => {
    const panel = { box: { left: 1100, right: 1580, top: 20, bottom: 800 }, side: "right" as const };
    const chat = { box: { left: 20, right: 520, top: 600, bottom: 880 }, side: "left" as const };
    expect(edgesFor([panel, chat], SCREEN, 10)).toEqual({ left: 530, right: 510, bottom: 0 });
  });

  test("butonul chatului și mascota iau doar loc jos, cât cel mai înalt dintre ele", () => {
    const launcher = { box: { left: 20, right: 240, top: 820, bottom: 880 }, side: "bottom" as const };
    const mascot = { box: { left: 1420, right: 1590, top: 740, bottom: 890 }, side: "bottom" as const };
    expect(edgesFor([launcher, mascot], SCREEN, 10)).toEqual({ left: 0, right: 0, bottom: 170 });
  });

  test("ce nu se vede (închis, 0×0) nu rezervă nimic", () => {
    const closed = { box: { left: 0, right: 0, top: 0, bottom: 0 }, side: "left" as const };
    expect(edgesFor([closed], SCREEN)).toEqual({ left: 0, right: 0, bottom: 0 });
  });
});
