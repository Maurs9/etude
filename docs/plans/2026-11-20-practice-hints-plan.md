# Plan de implementare pentru panoul de indicii din Practică

Panoul pliabil „Indicii din cântece”, aflat sub configurarea exercițiului din Practică, își adaptează conținutul la subiectul ales. Fiecare indiciu îi spune elevului ce să asculte sau ce mișcare să exerseze. Demonstrația funcționează și fără o piesă asociată. Când există un exemplu verificat din repertoriu, cardul arată și unde se aude trăsătura în piesă.

Înaintea acestei extinderi, panoul din Practică apare la Intervale și randează cele 12 carduri când se deschide. Redarea acordurilor și a gamelor evidențiază clapele doar în Explorare, iar redarea progresiilor din Practică programează sunetul. Extinderea presupune atât conținut nou, cât și integrarea previzualizărilor în ecranul de configurare. [Markup](../../etude.html#L484) · [Panoul existent](../../src/domain/views-runtime.ts#L5329) · [Testele existente](../../tests/e2e/practice-moved.spec.mjs)

**Domeniul acestui plan este extinderea la Acorduri, Game, Progresii, Game și arpegii și Melodii pe clape.** Catalogul de cântece pentru Intervale, paginarea, redarea frazelor și accentul audio sunt în sarcina sesiunii „Verify etude findings”. Integrarea de aici păstrează comportamentul de la Intervale disponibil în versiunea pe care pornește implementarea.

## Comportamentul panoului

- Titlul și textul scurt de introducere urmează subiectul selectat. Panoul pornește închis. Dacă elevul schimbă subiectul cu panoul deschis, conținutul se actualizează pe loc. Păstrează accesul vechi prin `#songs` și „Continuă”, care deschid Practică la Intervale cu panoul desfăcut.
- La **Acorduri**, **Game** și **Progresii**, demonstrațiile urmează tonalitatea fixă aleasă în Practică. „Toate tonalitățile” folosește Do în prima versiune. La **Game și arpegii**, fiecare fișă are o tonică reprezentativă, definită mai jos. Selectorul existent de referință și direcția rămân disponibile la Intervale.
- Un card conține un titlu, o instrucțiune scurtă și acțiunea **Ascultă indiciul**. Afișează formula, cifrajul sau digitația acolo unde ajută la interpretare. O comparație A/B folosește aceeași tonică și, pe cât permite materialul, același registru, ritm și aceeași dispunere a notelor, astfel încât diferența urmărită să fie clară.
- În modurile după ureche, redă întâi sunetul. **Arată clapele** permite verificarea la cerere. La tehnică, afișează din prima clapele și numerele degetelor, cu mâna indicată explicit. Orice deschidere temporară a claviaturii se încheie odată cu demonstrația sau când utilizatorul ascunde claviatura. Preferința salvată a utilizatorului se păstrează.
- La **Melodii pe clape**, folosește același panou pentru un singur indiciu de metodă. „Fredonează primele două-trei note. Ascultă dacă urcă, coboară sau se repetă.” Panoul rămâne în configurare, înainte de exercițiul activ.

## Conținutul de implementat

| Subiect | Acoperire la final | Primul exemplu de implementat | Regula pentru celelalte carduri |
| --- | --- | --- | --- |
| Acorduri | 25 de tipuri | În Do, `maj7` comparat cu `7`. Do, Mi și Sol rămân, iar Si devine Si♭. Redă acordurile arpegiat, apoi simultan. | Grupează triade, acorduri cu 6 sau 7 și extensii. Folosește terța, septima, absența terței sau extensia care distinge perechea. |
| Game | 19 tipuri | Do dorian comparat cu Do minor natural. Redă Sol–La–Si♭ și Sol–La♭–Si♭, apoi gama întreagă. | Alege reperul după structură. La Lydian, ♯4. La minor armonic, ♭6–♮7–1. La gamele simetrice, modelul pașilor. |
| Progresii | 10 tipuri | `ii–V–I` în Do. Redă basul Re3–Sol2–Do2 pentru două cvinte descendente, apoi Dm7–G7–Cmaj7. Scoate în evidență rezolvările Si–Do și Fa–Mi. | Redă basul în direcția descrisă și afișează simbolurile acordurilor transpuse. Folosește o referință tonală când începutul sau centrul tonal diferențiază două bucle. |
| Game și arpegii | 6 fișe | Do major, mâna dreaptă. Arată Mi(3) → Fa(1), repetă lent fragmentul, apoi redă gama completă. | Grupează gamele majore cu digitație comună, Fa și Si major, gamele majore pornite de pe clape negre, minorul armonic, arpegiile majore și arpegiile minore. |
| Melodii pe clape | 1 indiciu de metodă | Fredonează un fragment, identifică direcția și încearcă să-l cânți. | Folosește o formulare scurtă, ușor de aplicat înaintea exercițiului. |

### Reguli de precizie muzicală

- Preia intervalele acordurilor și gamele din `CHORD_TEMPLATES` și `SCALE_DEFINITIONS`. Generează formula unde structura este neambiguă. Completează cu notație specifică gamei unde aceeași distanță are alt nume, de exemplu ♭5 în Locrian și ♯4 în Lydian. Folosește denumirile muzicale localizate existente. [Teorie](../../src/domain/theory.ts)
- Preia identitatea și ordinea acordurilor din `PROGRESSION_TEMPLATES`. Compune demonstrația basului și dispunerea vocilor din date verificate, apoi derivează din aceeași secvență ce se aude și ce se evidențiază. Pentru „12-bar blues”, folosește forma de 12 măsuri deja prezentă în lecții ca sursă pentru demonstrație. Șablonul activ al exercițiului are patru evenimente și reprezintă o schemă prescurtată. [Șabloanele progresiilor](../../src/domain/theory.ts#L109) · [Forma din lecții](../../src/domain/views-runtime.ts#L6287)

### Cele șase fișe de tehnică

Fișele grupează cele patru tipuri de exercițiu deja existente. Folosește tonica fixă din Practică dacă aparține fișei. Pentru „Toate tonalitățile” sau pentru o tonică din afara fișei, redă exemplul din coloana „Tonică implicită”. Afișează tonica efectivă și mâna înainte de redare. Generează notele și digitația pentru o octavă prin `techniqueSteps`, verifică arpegiile prin `techniqueKeyAllowed` și folosește regulile existente de ortografiere a notelor. [Tipuri și tonalități](../../src/domain/technique.ts#L21) · [Pașii și digitația](../../src/domain/technique.ts#L104)

| Fișă | Tip din cod | Tonici incluse | Tonică implicită | Reper |
| --- | --- | --- | --- | --- |
| Game majore cu digitație comună | `major` | Do, Re, Mi, Sol, La | Do | La mâna dreaptă, în Do, Mi(3) → Fa(1). |
| Fa și Si major | `major` | Fa, Si | Fa | Fa are modelul distinct la dreapta (`12341234`), iar Si la stânga (`43214321`). |
| Game majore cu tonica pe clapă neagră | `major` | Re♭, Mi♭, Fa♯, La♭, Si♭ | Re♭ | Arată unde trece degetul mare în tonalitatea și mâna demonstrate. |
| Game minore armonice | `minor` | Do, Do♯, Re, Re♯, Mi, Fa, Fa♯, Sol, Sol♯, La, Si♭, Si | La | Izolează ♭6–♮7 și arată degetele generate pentru mâna aleasă. |
| Arpegii majore | `arpMajor` | Do, Re, Mi, Fa, Sol, La, Si | Do | La stânga, compară degetul folosit pentru terță în Do și Re. |
| Arpegii minore | `arpMinor` | Do, Re, Mi, Fa, Sol, La, Si | La | La stânga, compară degetul folosit pentru terță în La minor și Do minor. |

## Ordinea implementării

Tratează fiecare dintre cele trei etape ca o sarcină separată. Încheie verificarea etapei curente înainte de a începe următoarea. Pentru că sesiunea „Verify etude findings” lucrează la același panou, verifică la integrare forma curentă a codului și a testelor pentru Intervale.

### 1. Panoul și patru demonstrații de referință

1. Creează un modul pur `src/domain/practice-hints.ts`. Identifică acordurile prin simbol, gamele și progresiile prin cheile lor din catalog, iar fișele de tehnică prin identificatori proprii. Datele descriu reperul, comparația și cheia de text. Formulele, sunetul și digitația se derivă din modelele existente.
2. Conectează `#pr-songs` și `#songsList` la subiectul activ prin traseul existent de configurare din `views-runtime.ts`. La Intervale, apelează traseul de randare existent. Păstrează ID-urile, tratarea linkului `#songs` și starea de deschidere când elevul schimbă subiectul. Randează conținutul la deschidere și la schimbarea subiectului, a tonalității, a limbii sau a notației, cât timp panoul este deschis. Păstrează focusul la actualizări când acțiunea focalizată există și în noua stare. [HTML](../../etude.html#L484) · [Configurarea Practică](../../src/domain/views-runtime.ts#L18530)
3. Introdu previzualizarea în Practică folosind motorul audio și claviatura comună. O singură listă de evenimente furnizează notele, momentele și duratele pentru sunet și marcaje. Leagă afișarea clapelor de starea previzualizării din Practică, inclusiv când claviatura este închisă inițial. Redarea pornește la cererea elevului. La înlocuire, închidere, schimbarea subiectului sau a tonalității, navigare, pornirea unui exercițiu ori comanda de oprire generală, curăță sunetele și marcajele previzualizării. Verifică și cazul în care deblocarea audio se termină după anulare. Dezactivează butoanele de redare din panoul de Progresii cât timp rulează bucla **Cântă alături** și reactivează-le după oprire. [Redarea existentă](../../src/domain/views-runtime.ts#L593) · [Claviatura](../../src/domain/views-runtime.ts#L1793) · [Motorul audio](../../src/domain/audio.ts)
4. Implementează câte un exemplu complet pentru Acorduri, Game, Progresii și tehnică, din tabel. Folosește localizarea existentă pentru noile etichete și textele acestor exemple în toate cele șapte limbi. Verifică fluxul în browser înainte să extinzi conținutul.

### 2. Acoperirea completă și localizarea

1. Completează indiciile folosind identificatorii din teorie și cele șase fișe de tehnică. Completează indiciul de metodă pentru Melodii. Ține indicațiile scurte și verifică ordinea de la exemplele de bază la extensii.
2. Pune textele afișate și etichetele accesibile în sursa de localizare pentru `en`, `ro`, `es`, `fr`, `de`, `it` și `pt-BR`. Refolosește încărcarea pe limbă. Formatează numele notelor și ale acordurilor conform notației Do/C/H, inclusiv la schimbarea sistemului fără schimbarea limbii. Regenerează modulele cu `node scripts/split-locales.mjs` și verifică-le cu `node scripts/split-locales.mjs --check`. [Localizare](../../src/locales/index.js) · [Încărcare](../../src/locales/loader.ts)
3. Adaptează grila din `practice.css` la carduri cu formule, explicații și butoane. Verifică textul lung la lățime mică, ordinea de tabulare, etichetele butoanelor și marcaje care se disting și fără culoare. Respectă setarea de reducere a mișcării. [Stiluri](../../src/styles/practice.css)
4. Verifică acoperirea catalogului, tonalitățile și limbile, inclusiv la schimbarea notației cu panoul deschis.

### 3. Repere din repertoriu

Folosește `melodii_si_intervale.md` ca listă de candidați. Adaugă inițial un reper verificat acolo unde pasajul face trăsătura ușor de auzit. Afișează referința ca text, cu titlul, autorul sau interpretul, versiunea ori aranjamentul, măsura sau minutul, vocea și ce se aude. Partiturile din biblioteca personală sunt stocate pe dispozitivul utilizatorului. Pentru această etapă, aplicația are nevoie doar de textul referinței și de demonstrația generată din datele de teorie.

| Candidat | Unde se potrivește | Ce se verifică în sursă |
| --- | --- | --- |
| Satie, *Gymnopédie nr. 1* | Acord `maj7` | Prima apariție verificată a acordului Sol maj7 și vocea care conține Fa♯. |
| Tears for Fears, *Mad World* | Dorian | Tonica aranjamentului, treapta a șasea ridicată și locul unde se aude. |
| Ben E. King, *Stand by Me* | `I–vi–IV–V` | Intrarea buclei și ordinea rădăcinilor în versiunea indicată. |
| Bach, Preludiu BWV 846 | Acord major arpegiat | Prima măsură și notele care formează triada de Do. Digitația exercițiului este cea calculată de Étude. |
| Mozart, *Rondo alla turca*, K. 331 | Treapta a șaptea ridicată în La minor | În anacruza de deschidere, mâna dreaptă cântă Sol♯–La. |

**Ascultă indiciul** redă demonstrația transpusă. **Găsește în piesă** se poate oferi doar dacă partitura este inclusă în aplicație și pasajul verificat poate fi deschis direct. Verifică referințele în ediția citată și testează afișarea lor cu biblioteca goală.

Au fost verificate măsura 1 din Satie și măsura 1 din Bach, ambele în fragmentele incluse în Étude. În anacruza lui Mozart se aude septima ridicată, iar analiza înregistrării *Stand by Me* identifică progresia în măsurile 1–6. Pentru *Mad World* rămâne de verificat pasajul într-o ediție identificată. [Fragmentele incluse](../../src/domain/repertoire-data.ts#L119) · [Satie, ediția Mutopia](https://github.com/MutopiaProject/MutopiaProject/blob/master/ftp/SatieE/gymnopedie_1/gymnopedie_1.ly#L107) · [Bach, When in Rome](https://github.com/MarkGotham/When-in-Rome/blob/master/Corpus/Keyboard_Other/Bach%2C_Johann_Sebastian/The_Well-Tempered_Clavier_I/01/score.mxl) · [Mozart, ediția Mutopia](https://github.com/MutopiaProject/MutopiaProject/blob/master/ftp/MozartWA/KV331/KV331_3_RondoAllaTurca/KV331_3_RondoAllaTurca-lys/KV331_3_RondoAllaTurcaNotes.ly#L34) · [Stand by Me, Rock Corpus](https://github.com/ejhumphrey/rock_corpus/blob/master/annotations/rs200_harmony/stand_by_me_tdc.har)

## Verificare și criterii de acceptare

| Verificare | Rezultat așteptat |
| --- | --- |
| Teste unitare pentru catalog | Fiecare simbol, gamă și progresie din teoria folosită de exerciții are exact un card la acoperirea completă. Cele șase fișe de tehnică generează exemple valide. Verifică diferența Locrian/Lydian, Fa și Si major, digitația minorului armonic, arpegiile în chei permise și cele 12 măsuri de blues. |
| Teste de redare | A/B schimbă trăsătura indicată. Basul și evidențierea corespund notelor și ordinii audio. După clickuri succesive, închidere, navigare sau începerea unui exercițiu, ultima stare este cea corectă și marcajele vechi dispar. |
| Playwright pe fluxul Practică | Schimbarea subiectului actualizează conținutul când panoul este deschis. Verifică numerele de carduri, indiciul pentru Melodii, claviatura la cerere și dezactivarea redării cât timp rulează bucla de acompaniament. Rulează și testele existente de regresie pentru Intervale. |
| Tonalitate, limbă și notație | O tonalitate fixă se reflectă în etichete și sunet. „Toate tonalitățile” folosește Do la Acorduri, Game și Progresii, respectiv tonica implicită din tabel la tehnică. Schimbarea limbii actualizează textul și etichetele accesibile. Schimbarea Do/C/H redenumește notele cu același rezultat audio. |
| Verificare manuală | Parcurge exemplele cu tastatura și pe telefon, cu claviatura închisă și deschisă. Ascultă acordurile în bloc, vocile de rezolvare și progresia de blues completă. Verifică buildul offline și Standalone, precum și pornirea și oprirea audio pe dispozitiv. Consemnează verificările de dispozitiv în [runbook](../runbooks/device-smoke.md). |

Pune testele unitare de conținut și transpunere într-un fișier dedicat, de exemplu `tests/unit/practice-hints.test.mjs`. Pune scenariile noi de redare și curățare într-un spec focalizat. În `tests/e2e/practice-moved.spec.mjs`, adaptează punctual așteptările de integrare ale panoului. [Testele panoului](../../tests/e2e/practice-moved.spec.mjs#L22)

- După click pe `#pr-t-chord`, înlocuiește `expect(panel).toBeHidden()` cu verificarea că panoul e vizibil și deschis, că afișează indiciul de acorduri și că ascunde controalele de referință și direcție pentru Intervale. La întoarcerea la Intervale, verifică restaurarea conținutului și controalelor din versiunea integrată. Păstrează aserțiunile existente de redare a intervalelor dinaintea schimbării subiectului. [Testul pentru schimbarea subiectului](../../tests/e2e/practice-moved.spec.mjs#L40)
- Redenumește testul „the cards follow the language, also while another topic hides them” pentru schimbarea limbii între subiecte. În Acorduri, confirmă traducerea noului panou, apoi păstrează aserțiunile de titlu și etichetă pentru revenirea la Intervale. [Testul de limbă](../../tests/e2e/practice-moved.spec.mjs#L52)
- Păstrează testele pentru `#songs` și „Continuă”, inclusiv deschiderea panoului la Intervale și redirecționarea linkului vechi la Practică. Rulează verificările din `AGENTS.md`, inclusiv tipuri, lint, unitare, localizare, build și E2E. [Teste pentru rutele vechi](../../tests/e2e/practice-moved.spec.mjs#L64) · [AGENTS.md](../../AGENTS.md)

### Posibile completări după prima versiune

Selectorul local de referință pentru „Toate tonalitățile”, mesajul pentru redare indisponibilă pe durata buclei și evaluarea A/B cu participanți pot fi adăugate după prima versiune. Comparațiile audio A/B rămân parte din cardurile unde diferența muzicală se aude clar.

Studiile despre așteptările melodice și armonice motivează folosirea contextului și a rezolvărilor audibile. În studiul lui Zioga și colaboratorii, culorile au ajutat reproducerea secvențelor în timpul antrenamentului, iar grupurile au avut rezultate comportamentale comparabile la testul de învățare. O evaluare ulterioară în Étude poate măsura recunoașterea din sunet, într-o altă tonalitate decât cea din demonstrație. [Pearce și Wiggins](https://doi.org/10.1525/mp.2006.23.5.377) · [Cheung și colab.](https://doi.org/10.1016/j.cub.2019.09.067) · [Zioga și colab.](https://doi.org/10.1162/jocn_a_01614) · [Open Music Theory](https://github.com/open-musictheory/open-musictheory.github.io/blob/master/docs/harmony/harmonicFunctions.md)
