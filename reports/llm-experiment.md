# Experiment s jazykovými modely

## Metodika

Verze promptu: v1; 20 původních a 6 změněných stránek, vstupy T/H, 3 běhy, temperature 0.
Hostované váhy přes OpenRouter; lokální nasazení vyžaduje nové ověření.
Prompt byl napsán po prohlédnutí původních stránek; nejde o nezávislé měření.
Výsledky po formální kontrole: citace z jiného bloku stránky může projít, význam citace se tím nepotvrzuje.
Práh pro H byl stanoven před spuštěním: 0 falešných DELIVERED, alespoň 75/78 OK, 54/60 správně, 4/6 užitečných a 24/26 stabilních stránek.
Odmítnutí jsou samostatné výsledky, zůstávají ve jmenovateli a nenahrazují správné UNKNOWN.

## Práh (vstup H)

| Model | Falešná DELIVERED | Validní | Přesnost | Užitečná | Stabilní | Práh |
|---|---|---|---|---|---|---|
| Qwen3.5 9B | 2 | 59/78 | 43/60 | 5/6 | 19/26 | nesplněno |
| Ministral 3 8B | 3 | 56/78 | 37/60 | 3/6 | 23/26 | nesplněno |
| Gemma 4 31B | 3 | 75/78 | 60/60 | 5/6 | 23/26 | nedostatek dat |
| Mistral Small 3.2 24B | 3 | 78/78 | 54/60 | 5/6 | 26/26 | nesplněno |
| gpt-oss 120B | 3 | 78/78 | 60/60 | 5/6 | 26/26 | nesplněno |
| Llama 3.3 70B | 3 | 75/78 | 57/60 | 5/6 | 26/26 | nesplněno |

## Souhrn

| Model / vstup | Správně původní | Správně změněné | Falešná D (surová / po kontrole) | NO_ANSWER | INVALID_JSON | INVALID_STATE | QUOTE_NOT_FOUND | Neúspěšné pokusy | Cena USD | Medián ms | Skutečný poskytovatel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Parser | 20/20 | 0/6 | 1 / 1 | — | — | — | — | — | — | — | — |
| Qwen3.5 9B (malý, T) | 35/60 | 11/18 | 2 / 2 | 25 | 0 | 0 | 1 | 47 | ≥ 0.031631 USD, 47 pokusů s neznámou cenou | 42070 | DeepInfra |
| Qwen3.5 9B (malý, H) | 43/60 | 14/18 | 2 / 2 | 19 | 0 | 0 | 0 | 41 | ≥ 0.032507 USD, 41 pokusů s neznámou cenou | 36633 | DeepInfra |
| Ministral 3 8B (malý, T) | 33/60 | 9/18 | 3 / 3 | 0 | 0 | 0 | 30 | 0 | 0.004324 USD | 1020.5 | Mistral |
| Ministral 3 8B (malý, H) | 37/60 | 10/18 | 3 / 3 | 0 | 0 | 0 | 22 | 0 | 0.007967 USD | 1259 | Mistral |
| Gemma 4 31B (střední, T) | 43/60 | 11/18 | 3 / 3 | 0 | 0 | 0 | 5 | 224 | ≥ 0.021283 USD, 224 pokusů s neznámou cenou | 250 | Novita |
| Gemma 4 31B (střední, H) | 60/60 | 12/18 | 3 / 3 | 0 | 0 | 0 | 0 | 221 | ≥ 0.024073 USD, 221 pokusů s neznámou cenou | 256 | Novita |
| Mistral Small 3.2 24B (střední, T) | 45/60 | 12/18 | 3 / 3 | 0 | 0 | 0 | 0 | 1 | ≥ 0.004386 USD, 1 pokusů s neznámou cenou | 1409 | Parasail |
| Mistral Small 3.2 24B (střední, H) | 54/60 | 15/18 | 3 / 3 | 0 | 0 | 0 | 0 | 0 | 0.006211 USD | 1512 | Parasail |
| gpt-oss 120B (velký, T) | 37/60 | 12/18 | 10 / 8 | 0 | 0 | 0 | 9 | 33 | ≥ 0.003481 USD, 33 pokusů s neznámou cenou | 2522 | DeepInfra |
| gpt-oss 120B (velký, H) | 60/60 | 15/18 | 3 / 3 | 0 | 0 | 0 | 0 | 36 | ≥ 0.004350 USD, 36 pokusů s neznámou cenou | 2386.5 | DeepInfra |
| Llama 3.3 70B (velký, T) | 45/60 | 12/18 | 3 / 3 | 0 | 0 | 0 | 3 | 0 | 0.046132 USD | 533.5 | CoreWeave |
| Llama 3.3 70B (velký, H) | 57/60 | 15/18 | 3 / 3 | 0 | 0 | 0 | 3 | 0 | 0.063966 USD | 580 | CoreWeave |

Pokusy s HTTP 429 se do limitu 3 nezapočítávají (upřesněno během sběru, před vyhodnocením).

| Model | Pokusy HTTP 429 |
|---|---|
| Qwen3.5 9B | 21 |
| Ministral 3 8B | 0 |
| Gemma 4 31B | 445 |
| Mistral Small 3.2 24B | 1 |
| gpt-oss 120B | 69 |
| Llama 3.3 70B | 0 |

Gemma 4 31B: 4 sloty bez odpovědi, všech 10 pokusů skončilo omezením poskytovatele (HTTP 429); jde o chybu sběru, ne modelu, práh proto nelze vyhodnotit.

## Změněné stránky

| Soubor | Štítek | Parser | Qwen3.5 9B T | Qwen3.5 9B H | Ministral 3 8B T | Ministral 3 8B H | Gemma 4 31B T | Gemma 4 31B H | Mistral Small 3.2 24B T | Mistral Small 3.2 24B H | gpt-oss 120B T | gpt-oss 120B H | Llama 3.3 70B T | Llama 3.3 70B H |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DT9100904.html | IN_TRANSIT | UNKNOWN | xxx | TTT | xxx | TTT | UUU | T-T | UUU | TTT | UUU | TTT | UUU | TTT |
| EX7710903.html | DELIVERED | UNKNOWN | DDD | DDD | DDD | xxx | DD- | DDD | DDD | DDD | DDD | DDD | DDD | DDD |
| KV2026100902.html | IN_TRANSIT | UNKNOWN | xTT | xTT | TTT | TTT | TTT | TTT | TTT | TTT | TTT | TTT | TTT | TTT |
| KV2026100906.html | DELIVERED | UNKNOWN | DDD | DDD | DDD | DDD | DDD | DD- | DDD | DDD | DDD | DDD | DDD | DDD |
| PN55100901.html | UNKNOWN | DELIVERED | xDD | DDx | DDD | DDD | DDD | DDD | DDD | DDD | xxD | DDD | DDD | DDD |
| PN55100905.html | RETURNING | UNKNOWN | RRR | RRR | xxx | Rxx | RRR | RR- | RRR | RRR | RRR | RRR | RRR | RRR |

## Chyby

| Soubor | Model | Vstup | Běh | Štítek | Výsledek | Dopad | Citace |
|---|---|---|---|---|---|---|---|
| mutated/DT9100904.html | Gemma 4 31B | T | 1 | IN_TRANSIT | UNKNOWN | EXTRA_REVIEW | PodánoV přepravěU kurýraDoručenoVráceno |
| mutated/DT9100904.html | Gemma 4 31B | T | 2 | IN_TRANSIT | UNKNOWN | EXTRA_REVIEW | PodánoV přepravěU kurýraDoručenoVráceno |
| mutated/DT9100904.html | Gemma 4 31B | T | 3 | IN_TRANSIT | UNKNOWN | EXTRA_REVIEW | PodánoV přepravěU kurýraDoručenoVráceno |
| mutated/DT9100904.html | Llama 3.3 70B | T | 1 | IN_TRANSIT | UNKNOWN | EXTRA_REVIEW | Doručeno |
| mutated/DT9100904.html | Llama 3.3 70B | T | 2 | IN_TRANSIT | UNKNOWN | EXTRA_REVIEW | Doručeno |
| mutated/DT9100904.html | Llama 3.3 70B | T | 3 | IN_TRANSIT | UNKNOWN | EXTRA_REVIEW | Doručeno |
| mutated/DT9100904.html | Ministral 3 8B | T | 1 | IN_TRANSIT | QUOTE_NOT_FOUND | odmítnutí |  |
| mutated/DT9100904.html | Ministral 3 8B | T | 2 | IN_TRANSIT | QUOTE_NOT_FOUND | odmítnutí |  |
| mutated/DT9100904.html | Ministral 3 8B | T | 3 | IN_TRANSIT | QUOTE_NOT_FOUND | odmítnutí |  |
| mutated/DT9100904.html | Mistral Small 3.2 24B | T | 1 | IN_TRANSIT | UNKNOWN | EXTRA_REVIEW | Aktualizováno 2. 11. 2026 09:05 |
| mutated/DT9100904.html | Mistral Small 3.2 24B | T | 2 | IN_TRANSIT | UNKNOWN | EXTRA_REVIEW | Aktualizováno 2. 11. 2026 09:05 |
| mutated/DT9100904.html | Mistral Small 3.2 24B | T | 3 | IN_TRANSIT | UNKNOWN | EXTRA_REVIEW | Aktualizováno 2. 11. 2026 09:05 |
| mutated/DT9100904.html | gpt-oss 120B | T | 1 | IN_TRANSIT | UNKNOWN | EXTRA_REVIEW | DoručenoVráceno |
| mutated/DT9100904.html | gpt-oss 120B | T | 2 | IN_TRANSIT | UNKNOWN | EXTRA_REVIEW | Doručeno |
| mutated/DT9100904.html | gpt-oss 120B | T | 3 | IN_TRANSIT | UNKNOWN | EXTRA_REVIEW | Doručeno |
| mutated/DT9100904.html | Qwen3.5 9B | T | 1 | IN_TRANSIT | NO_ANSWER | odmítnutí |  |
| mutated/DT9100904.html | Qwen3.5 9B | T | 2 | IN_TRANSIT | NO_ANSWER | odmítnutí |  |
| mutated/DT9100904.html | Qwen3.5 9B | T | 3 | IN_TRANSIT | NO_ANSWER | odmítnutí |  |
| mutated/EX7710903.html | Ministral 3 8B | H | 1 | DELIVERED | QUOTE_NOT_FOUND | odmítnutí | <strong class="value">Delivered</strong><p>The parcel was handed over to the recipient.</p> |
| mutated/EX7710903.html | Ministral 3 8B | H | 2 | DELIVERED | QUOTE_NOT_FOUND | odmítnutí | <strong class="value">Delivered</strong><p>The parcel was handed over to the recipient.</p> |
| mutated/EX7710903.html | Ministral 3 8B | H | 3 | DELIVERED | QUOTE_NOT_FOUND | odmítnutí | <strong class="value">Delivered</strong><p>The parcel was handed over to the recipient.</p> |
| mutated/KV2026100902.html | Qwen3.5 9B | H | 1 | IN_TRANSIT | NO_ANSWER | odmítnutí |  |
| mutated/KV2026100902.html | Qwen3.5 9B | T | 1 | IN_TRANSIT | NO_ANSWER | odmítnutí |  |
| mutated/PN55100901.html | Gemma 4 31B | H | 1 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | Gemma 4 31B | H | 2 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | Gemma 4 31B | H | 3 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | Gemma 4 31B | T | 1 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | Gemma 4 31B | T | 2 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | Gemma 4 31B | T | 3 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | Llama 3.3 70B | H | 1 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | Llama 3.3 70B | H | 2 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | Llama 3.3 70B | H | 3 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | Llama 3.3 70B | T | 1 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | Llama 3.3 70B | T | 2 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | Llama 3.3 70B | T | 3 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | Ministral 3 8B | H | 1 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | Ministral 3 8B | H | 2 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | Ministral 3 8B | H | 3 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | Ministral 3 8B | T | 1 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | 9. 11. 202612:00Praha 4Doručeno příjemci |
| mutated/PN55100901.html | Ministral 3 8B | T | 2 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | 9. 11. 202612:00Praha 4Doručeno příjemci |
| mutated/PN55100901.html | Ministral 3 8B | T | 3 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | 9. 11. 202612:00Praha 4Doručeno příjemci |
| mutated/PN55100901.html | Mistral Small 3.2 24B | H | 1 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | Mistral Small 3.2 24B | H | 2 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | Mistral Small 3.2 24B | H | 3 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | Mistral Small 3.2 24B | T | 1 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | Mistral Small 3.2 24B | T | 2 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | Mistral Small 3.2 24B | T | 3 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | gpt-oss 120B | H | 1 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | gpt-oss 120B | H | 2 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | gpt-oss 120B | H | 3 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | gpt-oss 120B | T | 1 | UNKNOWN | QUOTE_NOT_FOUND | odmítnutí | 9. 11. 2026 12:00 Praha 4 Doručeno příjemci |
| mutated/PN55100901.html | gpt-oss 120B | T | 2 | UNKNOWN | QUOTE_NOT_FOUND | odmítnutí | 9. 11. 2026 12:00 Praha 4 Doručeno příjemci |
| mutated/PN55100901.html | gpt-oss 120B | T | 3 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | Qwen3.5 9B | H | 1 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | Qwen3.5 9B | H | 2 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | Qwen3.5 9B | H | 3 | UNKNOWN | NO_ANSWER | odmítnutí |  |
| mutated/PN55100901.html | Qwen3.5 9B | T | 1 | UNKNOWN | NO_ANSWER | odmítnutí |  |
| mutated/PN55100901.html | Qwen3.5 9B | T | 2 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100901.html | Qwen3.5 9B | T | 3 | UNKNOWN | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| mutated/PN55100905.html | Ministral 3 8B | H | 2 | RETURNING | QUOTE_NOT_FOUND | odmítnutí | <li>Box Brno Lesná — Úložní doba uplynula, zásilka se vrací odesílateli.</li> |
| mutated/PN55100905.html | Ministral 3 8B | H | 3 | RETURNING | QUOTE_NOT_FOUND | odmítnutí | <li>Box Brno Lesná — Úložní doba uplynula, zásilka se vrací odesílateli.</li> |
| mutated/PN55100905.html | Ministral 3 8B | T | 1 | RETURNING | QUOTE_NOT_FOUND | odmítnutí | Zásilka se vrací odesílateli |
| mutated/PN55100905.html | Ministral 3 8B | T | 2 | RETURNING | QUOTE_NOT_FOUND | odmítnutí | Zásilka se vrací odesílateli |
| mutated/PN55100905.html | Ministral 3 8B | T | 3 | RETURNING | QUOTE_NOT_FOUND | odmítnutí | Zásilka se vrací odesílateli |
| original/DT9100112.html | gpt-oss 120B | T | 3 | IN_TRANSIT | DELIVERED | HIDDEN_PROBLEM | Doručeno |
| original/KV2026100101.html | gpt-oss 120B | T | 1 | IN_TRANSIT | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| original/KV2026100101.html | gpt-oss 120B | T | 2 | IN_TRANSIT | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| original/KV2026100101.html | gpt-oss 120B | T | 3 | IN_TRANSIT | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| original/KV2026100123.html | gpt-oss 120B | T | 1 | IN_TRANSIT | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| original/KV2026100123.html | gpt-oss 120B | T | 2 | IN_TRANSIT | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |
| original/KV2026100123.html | gpt-oss 120B | T | 3 | IN_TRANSIT | DELIVERED | HIDDEN_PROBLEM | Doručeno příjemci |

## Úplnost

| Očekáváno | Nalezeno | Chybí | Neplatné sloty |
|---|---|---|---|
| 936 | 936 | 0 | 0 |
