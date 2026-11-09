# Otázky k upřesnění

U každé otázky je stručně uvedeno, proč se ptám, jak to řez řeší teď a co by se změnilo při jiné odpovědi.

## Reklamační oddělení

1. **Brání založení nové reklamace i uzavřená reklamace, případně reklamace s jiným důvodem (např. `damaged`)?**
   Pravidlo říká, že se reklamace nezakládá podruhé, ani když existuje jen jako koncept; o uzavřených a o jiném důvodu neříká nic. Teď blokuje každá existující reklamace k objednávce v jakémkoli stavu a s jakýmkoli důvodem. V podkladech se to výsledku zatím nedotkne (uzavřené reklamace patří k jiným objednávkám), v provozu ale ano: pokud uzavřená reklamace blokovat nemá, automatizace by dnes takové případy vynechávala.

2. **Znamená „Převzal: soused“ doručení příjemci? A kdo takový případ prověřuje?**
   Stránka u MS-2026-120115 uvádí „Zásilka byla doručena … Převzal: soused (Novák)“. Doručení příjemci to nepotvrzuje, ale ani nedokazuje ztrátu. Teď jde případ do ruční kontroly (`TRACKING_UNKNOWN`). Pokud to oddělení bere jako doručení, šlo by o „nezakládat“; pokud jako ztrátu, o „založit“.

3. **Zakládáte reklamaci z důvodu ztráty i u zásilky, která leží na výdejním místě nebo v boxu a úložní doba ještě neuplynula?**
   U MS-2026-120116 stránka v den běhu (2. 11.) uvádí, že zásilka čeká v boxu Praha Florenc do 4. 11. Zásilka tedy není ztracená, jen nevyzvednutá příjemcem. Teď jde případ do ruční kontroly (`AT_PICKUP_POINT_STORAGE_ACTIVE`). Po uplynutí úložní doby se postupuje podle běžných pravidel.

4. **U definice A (zabaleno, čeká na dopravce): díváte se před založením reklamace do trackingu dopravce, nebo ji zakládáte rovnou?**
   Dopravce mohl zásilku převzít, jen se sken převzetí nepropsal do Mailshipu; tracking by to ukázal. Teď se tracking u A ověřuje, a když není dostupný, jde případ do ruční kontroly. Všech 5 objednávek A v podkladech je bez trackingu, proto jsou všechny v ruční kontrole. Kdybyste zakládali rovnou, 4 z nich by byly návrhem k založení (pátá, MS-2026-120005, nemá reportéra).

5. **Vidí klient (reportér) reklamaci založenou jako koncept? Chodí mu o ní upozornění?**
   Reportér je kontakt na straně klienta (e-shopu). Návrh nasazení počítá s fází, kdy automatizace zakládá jen koncepty a referent je potvrzuje. To je bezpečné jen tehdy, když klient koncept nevidí a nedostane o něm zprávu.

6. **Kdo smaže zamítnutý koncept?**
   Když referent koncept zamítne, ale nesmaže ho, bude podle pravidla „ani jako koncept“ blokovat založení i v dalších bězích, a to i kdyby se později ukázalo, že reklamace na místě je. Podle mého výkladu (otázka 1) by blokovala i uzavřená reklamace, proto koncept nestačí uzavřít.

7. **Jak určit reportéra u klienta, který není v matici kontaktů a nemá žádnou předchozí reklamaci?**
   U MS-2026-120005 a MS-2026-120122 reportéra nelze určit; teď jdou do ruční kontroly (`NO_REPORTER`). Zároveň: bere se „poslední reportér z historie“ podle data reklamace bez ohledu na její stav a důvod? Tak to teď řez dělá.

8. **Byli by referenti ochotni u ruční kontroly vybrat důvod rozhodnutí z krátkého seznamu a potvrdit, odkud informaci mají?**
   Např. „předáno sousedovi“, zdroj „tracking dopravce“. Z takto zaznamenaných rozhodnutí se dá postupně zlepšovat parser i model (viz `DALSI_KROKY.md`). Formulář musí být krátký, jinak vytvoří novou rutinu.

## Vývoj Mailshipu

1. **Proč Mailship ponechává stav `carrier_picked_up`, i když dopravce už potvrdil doručení příjemci?**
   U MS-2026-120105, 120117 a 120124 je na stránce dopravce doručení příjemci, Mailship ale drží „převzato dopravcem“. Právě kvůli tomu tyto objednávky vypadají jako kandidáti na ztrátu. Teď se reklamace nezakládá a případ je v reportu jako nesoulad s Mailshipem.

2. **Co přesně vrací retrack (nové vyžádání aktuálního trackingu u dopravce) a prochází jeho odpověď stejným převodem stavů dopravce na normalizovaný stav jako běžná transportní integrace?**
   Návrh počítá s retrackem jako s prvním zdrojem pravdy o doručení. U tří objednávek z otázky 1 se „doručeno“ cestou od dopravce k objednávce ztratilo; nevím, zda v převodu stavů, nebo až při změně stavu objednávky. Pokud v převodu a retrack jím prochází také, chybu zopakuje; pak je nutné číst přímo text dopravce.

3. **Proč export objednávek z Mailshipu obsahuje duplicitní řádky a prázdná pole? Je to chyba exportu, nebo běžný stav dat?**
   V podkladech (`orders.json`): MS-2026-120101 je v exportu dvakrát se shodnými údaji (zpracuje se jednou); PN55100121 nemá `orderNumber`, MS-2026-120110 nemá `carrier`, MS-2026-120111 nemá `trackingNumber` (všechny jdou do ruční kontroly). Pokud jde o chybu exportu, dá se opravit u zdroje a ruční kontroly ubude.

4. **Může mít jedna objednávka více zásilek (více čísel zásilky)?**
   Export má u objednávky jedno pole `trackingNumber` a řez s jednou zásilkou počítá. Pokud se objednávka může dělit, je nutné ověřovat každou zásilku zvlášť a rozhodnout, kdy je „nedoručená“ celá objednávka.

5. **Eviduje WMS předávací protokol (sken převzetí zásilky dopravcem)? Pokud ano, jak se k němu dostanu?**
   U definice A by protokol doložil, že dopravce zásilku převzal, i když tracking zatím nic neukazuje. Teď řez protokol nemá a spoléhá jen na tracking.

6. **Máte nebo plánujete interní server pro jazykové modely, který by sloužil více úlohám? Pokud ano, jaký model na něm běží?**
   Experiment (`EXPERIMENT_LLM.md`) doporučuje model jen jako pomocníka u stránky, kterou parser nepozná, a to lokálně. Pokud už server existuje, bylo by jednodušší použít ho; jiný model by bylo nutné ověřit stejným měřením.

7. **Smí obsah tracking stránek (jména a adresy příjemců) opustit infrastrukturu Mailstepu?**
   Předpokládám, že ne, proto navrhuji lokální model. Pokud ano, připadá v úvahu i hostovaná služba; experiment běžel přes OpenRouter jen s vymyšlenými daty.
