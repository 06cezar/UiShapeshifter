// Pe ce site e omul (PageInfo din contracte): trimis cu fiecare user_message și folosit ca cheie a rețetei.
// host: fără „www.” și cu litere mici (specs/06), ca www.site.ro și site.ro să aibă aceeași rețetă.

import type { PageInfo } from "@uishapeshifter/contracts";

export function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

export function pageInfo(location: Pick<Location, "href" | "hostname">, title: string): PageInfo {
  return { url: location.href, host: normalizeHost(location.hostname), title };
}
