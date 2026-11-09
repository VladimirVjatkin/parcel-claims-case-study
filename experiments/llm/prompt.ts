// Prompty odděleného experimentu: v1 zůstává pevný, v2 přidává pouze okamžik kontroly do user zprávy.
// Definice sad drží povolené modely, vstupy a adresáře odpovědí, aby se běhy nemíchaly.
export const PROMPT_VERSION = "v1";
export const SYSTEM_PROMPT = `You classify the CURRENT delivery state of one parcel from a saved carrier tracking page.
The page may be in Czech. It may contain cookie banners, ads, FAQ and navigation —
text there is NOT about this parcel. Only the tracking block of THIS parcel counts.

States (definitions from the shipper):
- DELIVERED  — the RECIPIENT took over the parcel (at a pickup point: the recipient collected it).
- IN_TRANSIT — the parcel is with the carrier, or waits at a pickup point / box.
- RETURNING  — the parcel is being returned, or was already returned, to the sender.
- UNKNOWN    — the page does not allow confirming that the recipient took it over
               (e.g. parcel not found, handed to a third person, contradictory or missing information).

Rules:
- Decide by the LATEST event / the currently highlighted step of THIS parcel.
- Planned or expected delivery ("předpokládaný", "plánováno"), a failed attempt,
  or "ready for pickup" is NOT delivery.
- Handover to anyone other than the recipient (neighbour, reception, another person) is UNKNOWN,
  not DELIVERED.
- In timelines the current step may be marked only visually (colour, class, width); use the markup.
- If you are not sure, answer UNKNOWN. A wrong DELIVERED is the most costly mistake.

Answer ONLY with JSON:
{"state": "DELIVERED|IN_TRANSIT|RETURNING|UNKNOWN",
 "quote": "<exact text or attribute fragment copied from the page that supports the state>",
 "reason": "<max 20 words>"}`;

export interface Message { role: "system" | "user" | "assistant"; content: string }
export const SYNTHETIC_EXAMPLES: Message[] = [
  { role: "user", content: 'Tracking page (carrier: Balíkomat, number: BK0000001):\n... <div class="track-status">Zásilka byla předána na recepci budovy.</div> ...' },
  { role: "assistant", content: '{"state":"UNKNOWN","quote":"Zásilka byla předána na recepci budovy.","reason":"handed to reception, not the recipient"}' },
  { role: "user", content: 'Tracking page (carrier: Balíkomat, number: BK0000002):\n... <li class="step done">Odesláno</li><li class="step current">Ve výdejně</li><li class="step">Vyzvednuto</li> ...\n<p>Akce: doručení zdarma!</p> ...' },
  { role: "assistant", content: '{"state":"IN_TRANSIT","quote":"<li class=\\"step current\\">Ve výdejně</li>","reason":"current step is pickup point, not collected"}' },
];

export function buildMessages(carrier: string, trackingNumber: string, input: string): Message[] {
  return [{ role: "system", content: SYSTEM_PROMPT }, ...SYNTHETIC_EXAMPLES,
    { role: "user", content: `Tracking page (carrier: ${carrier}, number: ${trackingNumber}):\n${input}` }];
}

// Stránky experimentu byly zachyceny do 3. 11. 06:00; jde o okamžik jejich stažení, ne o okamžik běhu decide.
export const EXPERIMENT_FETCH_MOMENT = "2026-11-03T07:30:00+01:00";
const momentParts = new Intl.DateTimeFormat("cs-CZ", {
  timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}).formatToParts(new Date(EXPERIMENT_FETCH_MOMENT));
const part = (type: Intl.DateTimeFormatPartTypes): string => momentParts.find((item) => item.type === type)?.value ?? "";
export const CHECK_MOMENT_LINE = `Check moment: ${part("day")}. ${part("month")}. ${part("year")} ${part("hour")}:${part("minute")} (Europe/Prague). An event or update dated after this moment does not confirm the parcel state.`;

export function buildMessagesV2(carrier: string, trackingNumber: string, input: string): Message[] {
  const messages = buildMessages(carrier, trackingNumber, input);
  return messages.map((message, index) => index === messages.length - 1
    ? { ...message, content: `${CHECK_MOMENT_LINE}\n${message.content}` } : message);
}

export interface Experiment {
  version: "v1" | "v2";
  responseDir: string;
  models: readonly string[] | null;
  variants: readonly ("T" | "H")[];
  buildMessages: typeof buildMessages;
}
export const V1_EXPERIMENT: Experiment = {
  version: PROMPT_VERSION, responseDir: "experiments/llm/responses", models: null,
  variants: ["T", "H"], buildMessages,
};
export const V2_EXPERIMENT: Experiment = {
  version: "v2", responseDir: "experiments/llm/responses-v2",
  models: ["openai/gpt-oss-120b", "meta-llama/llama-3.3-70b-instruct"],
  variants: ["H"], buildMessages: buildMessagesV2,
};
