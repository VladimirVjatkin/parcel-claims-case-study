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
