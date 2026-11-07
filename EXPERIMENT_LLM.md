# Experiment: jazykový model na tracking stránkách

**Otázka:** Přečte otevřený model stav ze stránky, kterou parser nepozná, aniž by nedoručenou zásilku označil za doručenou?

**Uspořádání.** Šest otevřených modelů přes OpenRouter (pevný poskytovatel a kvantizace); 20 dodaných a 6 upravených stránek (změněná struktura, angličtina, Z-BOX, datum z budoucnosti), štítky schválené před spuštěním; vstup jako text (T) a HTML (H), 3 běhy, temperature 0. Předem stanovený práh pro H: 0 falešných `DELIVERED`, ≥ 75/78 platných odpovědí, ≥ 54/60 správně, ≥ 4/6 užitečných na upravených, ≥ 24/26 stabilních. Tabulky: `reports/llm-experiment.md` (`npm run llm:eval`, bez sítě).

## Hlavní výsledek: práh nesplnil žádný model

| Vstup H | Falešná `DELIVERED` | Platné | Správně | Užitečné | Stabilní |
|---|---|---|---|---|---|
| Qwen3.5 9B | 2 | 59/78 | 43/60 | 5/6 | 19/26 |
| Ministral 3 8B | 3 | 56/78 | 37/60 | 3/6 | 23/26 |
| Gemma 4 31B¹ | 3 | 75/78 | 60/60 | 5/6 | 23/26 |
| Mistral Small 3.2 24B | 3 | 78/78 | 54/60 | 5/6 | 26/26 |
| gpt-oss 120B | 3 | 78/78 | 60/60 | 5/6 | 26/26 |
| Llama 3.3 70B | 3 | 75/78 | 57/60 | 5/6 | 26/26 |

¹ 4 sloty chybí kvůli opakovanému HTTP 429 u poskytovatele; práh by nesplnila ani bez nich.

- Upravené stránky: parser 0/6 (před opravou níže; po ní 1/6), většina modelů 5/6 — model přečte stránku, kterou parser nepozná.
- **Všechna falešná `DELIVERED` na H jsou z jedné stránky** (PN55100901: „Doručeno příjemci“ s datem po stažení stránky). Spletly se všechny modely i parser; prompt okamžik kontroly neobsahoval. Bez této stránky (doplněno po vyhodnocení, stejný počet dovolených chyb) by práh splnily Mistral Small, gpt-oss a Llama.
- Vstup T je nebezpečnější: gpt-oss na T 8 falešných `DELIVERED` celkem, z toho 7 na dodaných stránkách.

## Prompt v2 s okamžikem kontroly (dodatečný běh, ne nezávislé ověření)

Jediná přidaná věta s okamžikem kontroly; gpt-oss a Llama, vstup H, 156 volání, 0,07 USD. **gpt-oss: falešná `DELIVERED` 3 → 0**, u PN55100901 vzal poslední událost před okamžikem kontroly; nově ale složil citaci ze dvou míst (3× `QUOTE_NOT_FOUND`), práh splnil těsně (75/78). **Llama: 3 → 3** — větu čte (zmiňuje ji v odůvodnění u jiné stránky), u PN55100901 přesto odpověděla `DELIVERED`.

**Nález:** stejná stránka odhalila chybu parseru ParcelNord. Opraveno jedním pravidlem pro všechny dopravce: datum události nebo aktualizace pozdější než okamžik stažení stránky → `UNKNOWN`. Rozhodnutí a měření dodaných stránek se nezměnila; falešná `DELIVERED` parseru 1 → 0.

## Závěr

- **Model do rozhodování nepatří.** U nepoznané stránky navrhne stav s citací do `NEEDS_REVIEW`, nikdy uzavřené `DELIVERED`.
- **Kontrola data patří do kódu**, ne do promptu (Llama ji nepoužila): v parserech už je; pro výstup modelu je to návrh.
- **Kandidát pro další lokální ověření:** gpt-oss 120B, vstup H, okamžik kontroly v promptu; hostovaně ~0,00006 USD za stránku, lokální nároky je nutné změřit.

**Omezení:** hostované váhy a vymyšlená data; prompt psaný po prohlédnutí 20 stránek (nejlepší případ), roli modelu ověřuje jen 6 upravených stránek a v2 vznikl po vyhodnocení; model nebyl doučován (doučení až při stovkách označených stránek z fronty `NEEDS_REVIEW`).
