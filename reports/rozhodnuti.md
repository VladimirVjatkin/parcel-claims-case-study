# Rozhodnutí o reklamacích

Okamžik běhu: 2. 11. 2026 07:30 (Europe/Prague) · Režim: stínový — nic se nezakládá, jde o návrh.
Data: 33 řádků exportu → 32 objednávek.

| Výsledek | Počet |
|---|---|
| Založit (CREATE) | 5 |
| Ruční kontrola (NEEDS_REVIEW) | 12 |
| Nezakládat (DO_NOT_CREATE) | 15 |

## Založit (CREATE)

| Objednávka | Definice | Dní ve stavu | Důvod reklamace | Reportér | Tracking |
|---|---|---|---|---|---|
| MS-2026-120101 | B | 14 | loss | jana.svobodova@sportovna-alfa.example | IN_TRANSIT — Zásilka je na cestě k vám. O doručení vás budeme informovat SMS zprávou. |
| MS-2026-120112 | B | 17 | loss | tomas.velky@hracky-epsilon.example | IN_TRANSIT — U kurýra |
| MS-2026-120114 | B | 24 | loss | jana.svobodova@sportovna-alfa.example | IN_TRANSIT — Zásilka zpracována |
| MS-2026-120118 | B | 18 | loss | jana.svobodova@sportovna-alfa.example | IN_TRANSIT — Příjemce nebyl zastižen. Zásilka je uložena na depu Praha-Jih, doručení zopakujeme další pracovní den. |
| MS-2026-120123 | B | 16 | loss | reklamace@velkoobchod-gama.example | IN_TRANSIT — Zásilku právě nakládáme k doručení. Předpokládaný čas doručení je 14:00–16:00. |

## Ruční kontrola (NEEDS_REVIEW)

| Objednávka | Definice | Dní ve stavu | Důvody | Tracking |
|---|---|---|---|---|
| MS-2026-120001 | A | 2 | TRACKING_UNAVAILABLE — tracking stránka není k dispozici | — |
| MS-2026-120005 | A | 4 | NO_REPORTER; TRACKING_UNAVAILABLE — tracking stránka není k dispozici | — |
| MS-2026-120006 | A | 3 | TRACKING_UNAVAILABLE — tracking stránka není k dispozici | — |
| MS-2026-120007 | A | 2 | TRACKING_UNAVAILABLE — tracking stránka není k dispozici | — |
| MS-2026-120008 | A | 3 | TRACKING_UNAVAILABLE — pro dopravce Parcelo nemáme čtení tracking stránky | — |
| MS-2026-120110 | B | 20 | TRACKING_UNAVAILABLE — carrier = null, parser nelze vybrat | — |
| MS-2026-120111 | B | 18 | TRACKING_UNAVAILABLE — chybí číslo zásilky | — |
| MS-2026-120113 | B | 22 | TRACKING_UNKNOWN — Zásilku jsme nenašli | UNKNOWN — Zásilku jsme nenašli |
| MS-2026-120115 | B | 20 | TRACKING_UNKNOWN — Zásilka byla doručena 28. 10. 2026 v 10:41. Převzal: soused (Novák), Lipová 12. | UNKNOWN — Zásilka byla doručena 28. 10. 2026 v 10:41. Převzal: soused (Novák), Lipová 12. |
| MS-2026-120116 | B | 16 | AT_PICKUP_POINT_STORAGE_ACTIVE — Box Praha Florenc, úložní doba do 4. 11. 2026 | IN_TRANSIT — Zásilka je připravena k vyzvednutí. Úložní doba končí 4. 11. 2026. |
| MS-2026-120122 | B | 30 | NO_REPORTER; TRACKING_UNAVAILABLE — tracking stránka není k dispozici | — |
| PN55100121 | B | 23 | MISSING_ORDER_NUMBER; TRACKING_UNAVAILABLE — tracking stránka není k dispozici | — |

## Nezakládat (DO_NOT_CREATE)

| Objednávka | Definice | Dní ve stavu | Důvody |
|---|---|---|---|
| MS-2026-120002 | A | 1 | TOO_FEW_DAYS — 1 |
| MS-2026-120003 | A | 13 | EXCLUDED_SHIPPING_METHOD — Interní přeprava |
| MS-2026-120004 | A | 5 | EXISTING_COMPLAINT — draft |
| MS-2026-120102 | B | 13 | TOO_FEW_DAYS — 13 |
| MS-2026-120103 | B | 32 | EXCLUDED_SHIPPING_METHOD — Marketplace Delivered |
| MS-2026-120104 | B | 28 | EXCLUDED_SHIPPING_METHOD — Parcelo DE |
| MS-2026-120105 | B | 14 | DELIVERED_PER_TRACKING — Zásilka byla doručena příjemci 30. 10. 2026 v 13:12. |
| MS-2026-120106 | — | — | NOT_CANDIDATE_STATUS — delivered |
| MS-2026-120107 | — | — | NOT_CANDIDATE_STATUS — returning |
| MS-2026-120108 | B | 21 | RETURN_IN_WMS — Připraveno |
| MS-2026-120109 | B | 19 | EXISTING_COMPLAINT — open |
| MS-2026-120117 | B | 27 | DELIVERED_PER_TRACKING — Doručeno |
| MS-2026-120120 | B | 30 | EXCLUDED_SHIPPING_METHOD — Parcelo International |
| MS-2026-120124 | B | 15 | DELIVERED_PER_TRACKING — Doručeno |
| MS-2026-120125 | B | 13 | TOO_FEW_DAYS — 13 |

## Nesoulad s Mailshipem

Dopravce potvrdil doručení, Mailship má jiný stav. Reklamace se nezakládá; k prověření ve vývoji (QUESTIONS.md).

| Objednávka | Stav v Mailshipu | Citace ze stránky dopravce |
|---|---|---|
| MS-2026-120105 | carrier_picked_up | Zásilka byla doručena příjemci 30. 10. 2026 v 13:12. |
| MS-2026-120117 | carrier_picked_up | Doručeno |
| MS-2026-120124 | carrier_picked_up | Doručeno |
