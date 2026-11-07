# Směr dalšího vývoje

Návrhy nad rámec zadání. Nejsou v kódu. Jádrem není „učící se model“, ale **cyklus zlepšování**: důkazy → rozhodnutí referenta → ověření výsledku → úprava systému → doklad, že úprava snížila ruční práci bez nárůstu chyb. Model je jedním z účastníků cyklu, ne cílem.

## 1. Karta případu

Ukládají se **všechny tři skupiny**, nejen `NEEDS_REVIEW` — jinak se nezjistí chyby mezi „jistými“ rozhodnutími. U části automatických rozhodnutí výběrová ruční kontrola.

- identifikace: objednávka, zásilka, klient, dopravce;
- stav při kontrole: odpovědi Mailshipu, WMS a dopravce **s časem získání**;
- stránka dopravce: URL, HTML, **screenshot pořízený ve stejný okamžik jako HTML**, výsledek načtení;
- výstup systému: extrahovaná fakta, rozhodnutí, kódy důvodů, citace;
- **verze**: pravidla, parser, model, prompt;
- zásah referenta: rozhodnutí, opravená fakta, zdroj;
- **pozdější výsledek**: co se ukázalo a zda bylo původní rozhodnutí správné.

## 2. Krátký formulář referenta

Důvod ze seznamu + **potvrdit nebo opravit fakta**, která systém vytáhl + **zdroj** (událost v trackingu, odpověď skladu, zpráva klienta) + volitelný komentář. Příklad: „předáno sousedovi“ · „příjemce převzetí nepotvrdil“ · zdroj: tracking. Dlouhý povinný text by vytvořil novou rutinu.

## 3. Rozhodnutí referenta není ověřený výsledek

Referent se také může mýlit. Učit se na **uzavřených** případech a na rozboru sporných rozhodnutí, ne na každém kliknutí.

## 4. Proč případ skončil v ruční kontrole → co zlepšovat

| Příčina | Kódy v řezu | Co zlepšovat |
|---|---|---|
| Zdroj nedostupný (stránka, API, parser pro dopravce) | `TRACKING_UNAVAILABLE` | přístup k dopravci, integrace |
| Stránka se načetla, parser nepoznal strukturu | `TRACKING_UNKNOWN` **bez citace** | parser, čtení modelem |
| Fakta jsou, význam nejednoznačný | `TRACKING_UNKNOWN` s citací | definice stavů, příklady, model |
| Zdroje si odporují | `CARRIER_PICKUP_CONFIRMED` | pořadí ověřování |
| Chybí obchodní pravidlo | `AT_PICKUP_POINT_STORAGE_ACTIVE`, `TRACKING_RETURNING` | rozhodnutí reklamačního oddělení |
| Špatná vstupní data | `MISSING_ORDER_NUMBER`, `NO_REPORTER`, `CONFLICTING_RECORDS`, `MISSING_*` | kvalita exportů |

Smysl: ukáže, **jakou část ruční práce vůbec může snížit model** — chybějící číslo objednávky model neopraví.

## 5. Signál k opravě parseru: počet, podíl a dopad

3–5 nepoznaných stránek u jednoho dopravce je výchozí signál, ale 3 z 5 není totéž co 3 z 10 000. **Jediné falešné `DELIVERED` = okamžitý rozbor.**

## 6. Oprava parseru s pomocí LLM (poloautomaticky)

Shluk podobných stránek → balík (HTML, screenshoty, rozhodnutí referentů, očekávaná fakta) → LLM navrhne změnu parseru a testy → ověření na nových případech i na **uložené sbírce starých stránek** → kontrola odpovědnou osobou → **stínový běh nové verze** → zapnutí. Aktualizace modelu stejným postupem + ověření na **případech, které nebyly použity k učení**.

## 7. HTML i obraz

Referent vidí stránku, parser čte HTML; chyby vznikají právě na tomto rozdílu (Doručto: stav jen barvou kroku). Multimodální lokální model (text + obraz; např. rodina Qwen3-VL — volbu ověřit měřením) může dostat obojí; nesoulad HTML × obraz = signál změněné stránky → člověk. Obraz je doplněk, ne náhrada.

## 8. Tři stupně učení

1. Vyřešené případy → slovníky, instrukce, parsery — hned.
2. Model dostane 3–5 **podobných ověřených případů** z databáze — až jich budou desítky až stovky.
3. Doladění (LoRA) — jen pokud 1–2 nestačí a je dost kvalitních příkladů.

Samotné ukládání záznamů váhy modelu nemění.

## 9. Doporučení pro referenta (příklad karty)

> *Doporučeno: ruční kontrola. Dopravce uvádí předání sousedovi, převzetí příjemcem potvrzeno není.*
> *Podklad: citace + zvýrazněná část screenshotu.*
> *Akce: potvrdit · zvolit jiné rozhodnutí · vyžádat informace.*

Systém si uloží, **který fakt nebo závěr člověk změnil** — to je materiál pro zlepšení.

## 10. Autonomie po kategoriích: model nemusí být bezchybný

Model s celkovou přesností kolem 90 % může převzít většinu práce, pokud **systém pozná, kdy si není jistý**:

- **Samostatně rozhoduje jen v kategoriích**, kde je přesnost změřeně vysoká a všechny kontroly souhlasí; ostatní jde člověku s doporučením. Kategorie dostávají autonomii postupně, po měření (metriky z DESIGN.md, sekce 5).
- **Znaky nejistoty → člověk:** kontrola v kódu neprošla (citace, datum), neshoda parseru a modelu nebo HTML a obrazu, různé odpovědi v opakovaných bězích, rozpor s ostatními daty objednávky.
- **Chyby se nepočítají stejně:** zbytečná ruční kontrola je přijatelná, falešné `DELIVERED` v automatické části ne.
- **Ochrana proti slepému potvrzování:** sleduje se, jak často referent s doporučením nesouhlasí (téměř nikdy = varovný signál), a část případů dostane bez doporučení ke srovnání.
- Vše, co jde ven jménem firmy, potvrzuje člověk.

Stejný postup lze použít i pro další úlohy s jazykovým modelem ve firmě (e-maily, dotazy klientů): odpověď modelu + kontroly v kódu + nejisté případy člověku + výběrový audit + autonomie po kategoriích.

## 11. Ochrana dat

Stránky a screenshoty obsahují jména a adresy → jen lokálně v infrastruktuře Mailstepu, omezený přístup, doba uchování.

---

Měřítkem úspěchu je, jakou část případů referenti zpracují rychleji, které příčiny ruční kontroly se podařilo odstranit a jak se změnil počet chyb — podle toho se rozhodne, kam investovat dál (integrace, parser, multimodální model, doladění).
