# Experiment s jazykovými modely

## Metodika

Verze promptu: v1; 20 původních a 6 změněných stránek, vstupy T/H, 3 běhy, temperature 0.
Hostované váhy přes OpenRouter; lokální nasazení vyžaduje nové ověření.
Prompt byl napsán po prohlédnutí původních stránek; nejde o nezávislé měření.
Výsledky po formální kontrole: citace z jiného bloku stránky může projít, význam citace se tím nepotvrzuje.
Práh pro H byl stanoven před spuštěním: 0 falešných DELIVERED, alespoň 75/78 OK, 54/60 správně, 4/6 užitečných a 24/26 stabilních stránek.
Odmítnutí jsou samostatné výsledky, zůstávají ve jmenovateli a nenahrazují správné UNKNOWN.

## Souhrn

| Model / vstup | Správně původní | Správně změněné | Falešná D (surová / po kontrole) | NO_ANSWER | INVALID_JSON | INVALID_STATE | QUOTE_NOT_FOUND | Neúspěšné pokusy | Cena USD | Medián ms | Skutečný poskytovatel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Parser | 20/20 | 0/6 | 1 / 1 | — | — | — | — | — | — | — | — |

Odpovědi modelů zatím nejsou uložené.

## Úplnost

| Očekáváno | Nalezeno | Chybí | Neplatné sloty |
|---|---|---|---|
| 936 | 0 | 936 | 0 |
