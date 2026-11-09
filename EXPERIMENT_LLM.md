# Experiment: jazykový model na tracking stránkách

## Otázka

Dokáže otevřený jazykový model přečíst stav zásilky ze stránky dopravce — hlavně ze stránky, kterou parser nepozná, protože se změnila — **a přitom neoznačit nedoručenou zásilku za doručenou**?

## Na čem jsem testoval

**26 stránek, všechny modely na všech:**

| Sada | Počet | Co to je |
|---|---|---|
| Dodané stránky | 20 | Stránky od Mailstepu, stejné jako u měření parserů (`labels.csv`) |
| Upravené stránky | 6 | Stránky známých dopravců, které jsem změnil tak, jako by dopravce upravil web. Štítky (správné odpovědi) jsem schválil **před** spuštěním modelů |

Upravené stránky (`experiments/llm/mutated/`):

| Stránka | Změna | Správně | Parser |
|---|---|---|---|
| DT9100904 (Doručto) | Nový layout: aktuální krok jen CSS třídou, bez SVG | IN_TRANSIT | UNKNOWN |
| EX7710903 (Expedo) | Anglická verze; reklama „Delivered in 24 hours!“ | DELIVERED | UNKNOWN |
| KV2026100902 (Kurýr Vltava) | Uloženo v Z-BOXu, lhůta běží; reklama „Doručeno do Z-BOXu“ | IN_TRANSIT | UNKNOWN |
| KV2026100906 (Kurýr Vltava) | Nový blok a nová věta „převzala příjemkyně“ | DELIVERED | UNKNOWN |
| PN55100905 (ParcelNord) | Seznam místo tabulky, nejstarší událost nahoře | RETURNING | UNKNOWN |
| PN55100901 (ParcelNord) | „Doručeno příjemci“ s datem 9. 11., stránka je ze 3. 11. | UNKNOWN | DELIVERED (po opravě UNKNOWN) |

Na pěti z šesti upravených stránek parser poctivě odpověděl „nevím“ — bezpečné, ale bez pomoci pro člověka. **Právě tady má model smysl.**

**Modely** (otevřené váhy, přes OpenRouter, pevný poskytovatel a kvantizace):

| Velikost | Model |
|---|---|
| Malé | Qwen3.5 9B, Ministral 3 8B |
| Střední | Gemma 4 31B, Mistral Small 3.2 24B |
| Velké | gpt-oss 120B, Llama 3.3 70B |

**Vstup** ve dvou podobách: **T** — jen viditelný text stránky; **H** — celé HTML (je v něm vidět barva, třídy, struktura). Každá stránka **3×**, temperature 0. Celkem 6 modelů × 26 stránek × 2 vstupy × 3 běhy = **936 plánovaných odpovědí** (slotů; opakované pokusy po chybě poskytovatele nepočítám).

**Kontrola odpovědi v kódu:** platný JSON, povolený stav, citace se musí na stránce skutečně nacházet. Jinak se odpověď počítá jako odmítnutá.

**Práh stanovený předem (vstup H):** 0 falešných `DELIVERED` · ≥ 75/78 platných odpovědí · ≥ 54/60 správně na dodaných stránkách · ≥ 4/6 užitečných rad na upravených (alespoň 2 ze 3 běhů dají platnou odpověď shodnou se štítkem, včetně `UNKNOWN`, je-li správný) · ≥ 24/26 stránek se stejnou odpovědí ve všech třech bězích.

## Výsledky — první běh (v1)

**Předem stanovený práh formálně nesplnil žádný model** (Gemma: nedostatek dat). Všechny falešné `DELIVERED` na H pocházejí z jediné stránky, viz níže.

### Vstup H

| Model | Dodané stránky správně | Upravené: užitečná rada | Falešná `DELIVERED` | Platné | Stabilní | Práh |
|---|---|---|---|---|---|---|
| **gpt-oss 120B** | **60/60** | **5/6** | 3 | 78/78 | 26/26 | nesplněno |
| **Gemma 4 31B**¹ | **60/60** | **5/6** | 3 | 75/78 | 23/26 | nedostatek dat |
| **Llama 3.3 70B** | 57/60 | **5/6** | 3 | 75/78 | 26/26 | nesplněno |
| **Mistral Small 3.2 24B** | 54/60 | **5/6** | 3 | 78/78 | 26/26 | nesplněno |
| Qwen3.5 9B | 43/60 | 5/6 | 2 | 59/78 | 19/26 | nesplněno |
| Ministral 3 8B | 37/60 | 3/6 | 3 | 56/78 | 23/26 | nesplněno |

¹ 4 sloty chybí kvůli omezení poskytovatele (HTTP 429), ne kvůli modelu.

**Co to znamená:**

- **Střední a velké modely přečetly upravené stránky správně.** Na pěti upravených stránkách, kde parser řekl „nevím“, gpt-oss, Llama, Mistral Small i Gemma odpověděly na vstupu H správně ve všech odpovědích (u Gemmy 3 odpovědi chybí kvůli omezení poskytovatele) — včetně anglické stránky, nového layoutu bez SVG a nové formulace „převzala příjemkyně“. gpt-oss a Gemma navíc přečetly všech 20 dodaných stránek bez chyby.
- **Všechna falešná `DELIVERED` na H pocházejí z jediné stránky** — PN55100901 (doručení s datem z budoucnosti), 3 běhy. Spletly se na ní všechny modely i parser: v promptu nebyl okamžik kontroly a rozpor mezi „Stav k 3. 11. 2026 06:00“ a událostí z 9. 11. nezachytil nikdo.
- Výsledek nepřepisuji. Pro informaci (doplněno po vyhodnocení): bez této stránky, se stejným počtem povolených chyb, by práh splnily gpt-oss, Llama a Mistral Small.
- **Malé modely nestačí:** Qwen často nevrátil odpověď (na vstupu H 19 ze 78) a odpovídal pomalu (medián ~37 s), Ministral citoval HTML značky místo textu, takže kontrola citace jeho odpovědi odmítla.

### Vstup T (jen text) je nebezpečný

gpt-oss 120B na T: jen 37/60 správně a **8 falešných `DELIVERED`, z toho 7 na dodaných stránkách** (Kurýr Vltava, Doručto). Ve výpisu textu jsou totiž všechny kroky průběhu včetně „Doručeno příjemci“ a bez značek model nepozná, který krok je aktuální. **Příprava vstupu je důležitější než velikost modelu.**

## Druhý běh (v2): okamžik kontroly v promptu

*Dodatečný běh po vyhodnocení v1, ne nezávislé ověření. Mění jedinou věc: do zprávy přibyla věta „Check moment: 3. 11. 2026 07:30 (Europe/Prague). An event or update dated after this moment does not confirm the parcel state.“*

Dva nejlepší modely, vstup H, všech 26 stránek × 3 běhy = 156 volání, 0,07 USD.

| | gpt-oss 120B v1 → v2 | Llama 3.3 70B v1 → v2 |
|---|---|---|
| PN55100901 (datum z budoucnosti) | DELIVERED → **IN_TRANSIT** (vzal poslední událost před okamžikem kontroly) | DELIVERED → **DELIVERED** |
| Falešná `DELIVERED` | 3 → **0** | 3 → 3 |
| Dodané stránky správně | 60 → 57 | 57 → 57 |
| Práh | nesplněno → **splněno** (těsně) | nesplněno → nesplněno |

- **gpt-oss okamžik kontroly použil** a falešné doručení zmizelo. Na jedné dodané stránce (EX7710117) ale nově složil citaci ze dvou míst stránky — kontrola citace ji 3× odmítla, proto 57/60. Stav určil správně, chyba je ve formě citace.
- **Llama větu viděla** (zmínila ji v odůvodnění u jiné stránky), ale u PN55100901 ji nepoužila.

## Nález pro parser

Stránka PN55100901 odhalila stejnou chybu v parseru ParcelNord. Opraveno jedním pravidlem pro všechny čtyři parsery: datum události nebo aktualizace pozdější než okamžik stažení stránky → `UNKNOWN`. Rozhodnutí ani měření dodaných stránek se nezměnila; falešná `DELIVERED` parseru 1 → 0.

## Cena a rychlost

Známé náklady obou běhů jsou přibližně 0,32 USD; u části pokusů poskytovatel cenu nevrátil (převážně odmítnuté požadavky HTTP 429). Přesná čísla jsou v `reports/llm-experiment.md`. gpt-oss 120B: ~0,00006 USD za stránku, ~2–4 s na odpověď. Podle výrobce běží gpt-oss 120B na jedné kartě s 80 GB; lokálně jsem to neověřoval.

## Závěr

1. **Model do rozhodování nepatří — jeho výsledek jde člověku jako doporučení.** U stránky, kterou parser nepozná, model navrhne stav s citací → `NEEDS_REVIEW`; nikdy sám neuzavře případ jako `DELIVERED`.
2. **Jako pojistka model funguje.** Tam, kde parser na změněné stránce poctivě řekl „nevím“, střední a velké modely na vstupu H ve všech případech kromě data z budoucnosti napověděly správně.
3. **Kontrola data a další ochrany patří do kódu, ne do promptu.** gpt-oss pokyn použil, Llama ne. Kontrola data už je v parserech; pro výstup modelu ji navrhuji stejně.
4. **Vstup musí být HTML, ne čistý text.**
5. **Kandidát pro další lokální ověření:** gpt-oss 120B, vstup H, okamžik kontroly v promptu, kontrola data v kódu. Před nasazením znovu změřit na lokálním serveru a na reálných stránkách ve stínovém provozu.

## Potenciál do budoucna *(návrh, v řezu není)*

- **Pojistka při změně stránky:** parser nepozná strukturu → model napoví stav s citací → člověk potvrdí jedním kliknutím.
- **Detektor rozbitého parseru:** častý fallback na model u jednoho dopravce = signál, že se stránka změnila.
- **Denní kontrola parseru:** na malém vzorku porovnat parser s modelem; neshoda = zkontrolovat parser (zachytí i tichou chybu parseru).
- **Pomoc při opravě parseru:** z nasbíraných stránek a rozhodnutí referentů model navrhne úpravu parseru a testy; schvaluje člověk.
- **Obraz stránky:** multimodální model může číst HTML i snímek obrazovky — tak, jak stránku vidí referent.
- **Sdílený lokální server:** stejný model může sloužit i dalším úlohám ve firmě (e-maily, dotazy klientů) se stejnými pravidly: kontroly v kódu, nejisté případy člověku, autonomie jen tam, kde je změřená.

Podrobněji v `DALSI_KROKY.md`.

## Omezení

- Hostované váhy a vymyšlená data; lokální kvantizovaná verze může být mírně horší.
- Prompt jsem psal po prohlédnutí 20 dodaných stránek — na nich jde o nejlepší možný případ. Skutečnou roli modelu ověřuje jen 6 upravených stránek; to je malý vzorek.
- v2 vznikl po vyhodnocení v1.
- Kontrola citace ověří, že citace na stránce je, ne že je ze správného bloku.
- Model nebyl doučován; doučení dává smysl až při stovkách označených stránek z fronty `NEEDS_REVIEW`.

Tabulky po bězích, citace a všechny chyby: `reports/llm-experiment.md` (`npm run llm:eval`, bez sítě).
