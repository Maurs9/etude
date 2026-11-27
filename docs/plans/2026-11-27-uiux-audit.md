# etude: audit UI/UX și propuneri de simplificare

Data: 2026-11-27. Bază: `main` la `0c4b2bd`, dev server `npm run dev` pe 127.0.0.1:5173.
Doar analiză. Repo-ul nu a fost modificat. Nu există commit sau branch.

Prescurtări pentru dovezi:
- `SP` = the audit scratchpad folder on the author's machine. Its screenshots and scripts are not in the repo.
- `shots/<ecran>_<lățime>_<temă>_<limbă>.png` = matricea de capturi (11 ecrane × 5 lățimi × 2 teme × EN/RO = 220 capturi)
- Rapoartele echipei (în acest folder): `ux.md`, `fe.md`, `a11y.md`, `qa.md`. Scripturile și capturile lor sunt în `SP/agents/<rol>/`.
- Inventarul complet al controalelor: `SP/inventory.json` (script `SP/inventory.mjs`).

Artefacte de captură, nu bug-uri: în capturile full-page bara fixă a claviaturii apare la mijlocul paginii. Butonul roată are inel de focus pentru că scriptul a închis Setările cu Escape.

## 1. Recomandările mele pe scurt

1. **Cardul „Setul de azi”: îl păstrăm și îl comprimăm.** Îl unim cu „Lectura de azi” într-un singur card „Azi”, cu trei pași numerotați și un singur buton principal. Nu îl ascundem după prima folosire, pentru că se schimbă în fiecare zi și este punctul de intrare principal al tabului.
2. **Pagina Citește: grupăm, nu ștergem.** Patru grupuri: o bandă de stare unică, un rând sumar „Nivel și tonalitate” pliabil, „Opțiuni” pliabile pe taburile Exerciții și Generator, unitățile cărții pliate în afară de cea curentă. Nimic nu se mută în Setări.
3. **Învață pe ecran lat: layout pe trei coloane (varianta C), nu text mai lat.** Aliniem pagina la antet și folosim spațiul liber pentru o coloană dreaptă cu cuprinsul capitolului și fișa rezumat. Textul rămâne la 69 de caractere pe rând.

Niciun bug blocant. Aplicația are o bază bună: contrast de text AA în ambele teme, focus vizibil pe toate opririle, dialoguri corecte, fără overflow orizontal, fără erori în consolă, toate cele 2240 de chei traduse în RO.

## 2. Inventarul capabilităților (pasul obligatoriu)

Măsurat la 1280 px, EN, profil nou. Lista completă cu dimensiuni este în `SP/inventory.json`.

**Citește > Cartea de citire** (153 controale vizibile)
- Taburi: Cartea de citire, Exerciții pe abilități, Generator liber.
- Antet: streak (zile la rând), puncte „0 / 5 azi”.
- Card „Setul de azi”: statistici (Nivel, Prima vedere ultimele 10, Piese citite), linia setului, 5 butoane de piesă (sloturi), „Începe setul de azi” (Continuă / Gata), nota „de ce”, banner „Treci la nivelul următor” (doar când e gata).
- Card „Lectura de azi”: Încălzire de 2 minute, Piesă lungă, progres „0 din 3 gata”.
- Cartea: alegere nivel 1-8, tonalitate (Amestecat + 5), „Alte tonalități” (19, pliat), legendă, „Începe · nr. 1”, 96 de piese în 12 unități.
- „Alte moduri de exersare”: Exercițiu nou de citire (evaluat), Piese, Voce.

**Citește > Exerciții pe abilități** (108 vizibile): „Începe aici”, 6 comutatoare (Sunet, Indicii automate, Flux de note, Ritm fantomă, Scenă pe tot ecranul, Puncte slabe), 5 filtre, „Nivelul 0: note reper”, „Chei orchestrale”, ~60 de carduri de nivel, „Exercițiu personalizat” (pliat: tip, cheie, de la, până la, alterații, armuri, doar note reper, Deschide).

**Citește > Generator liber** (19 vizibile): Melodie nouă, Mâini (ambele/dreapta/stânga), Mod (pas cu pas/evaluare), Nume note, Orice octavă, Feedback instant, Deschide Piese, Start, Ascultă, tempo (−, glisor, +), Fereastră completă. În scenă: Afișare (zoom −/potrivire/+, claviatură), Termină, Următoarea.

**Învață** (33): 22 de capitole, Glosar, link „Exersează citirea”, butoane de redare din lecție, Începe verificarea, Marchează complet fără verificare, Anterior, Următor. Plus Metoda (1 buton).

**Celelalte ecrane:** Azi 12, Exersează 35, Explorează 44, Voce 15, Piese 51, Progres 10, Setări 51. Listele sunt în inventar.

Regula aplicată: fiecare propunere de mai jos spune pentru fiecare control afectat dacă **rămâne**, **se mută** (unde) sau **se grupează** (în ce). Propunerile care pierdeau o capabilitate au fost respinse (lista la secțiunea 7).

## 3. Tabelul de constatări

Severitate: blocant / major / minor. Cost: S (sub o zi, CSS sau un fișier), M (mai multe fișiere, TS + CSS + teste), L (restructurare).

| # | Ecran | Problemă | Sev. | Dovadă | Propunere | Cost |
|---|---|---|---|---|---|---|
| 1 | Citește > Carte | „Lectura de azi” spune „0 din 3 gata”, dar arată 2 rânduri numerotate 1 și 2. Al treilea pas (setul) este în cardul din stânga. | major | `read-home.ts:274` (`sideItems = [items[0], items[2]]`), `:279`, `:293`; `shots/read-book_1280_light_ro.png` | P1 | S |
| 2 | Citește > Carte | Progresul aceluiași set apare de 4 ori: puncte în antet, 5 sloturi, segmente, „0 din 3”. Două carduri vecine înseamnă amândouă „rutina de azi”. | major | `read-home.ts:253-325`; `shots/read-book_1280_light_en.png` | P1, P2 | M |
| 3 | Citește > Carte | Banda de sus și nota de jos ale cardului acoperă doar coloana stângă (se opresc la x=717 din 1248). Coloana dreaptă nu are padding sus, dreapta, jos. | major | `etude.css:149-150, 162`; `read-home.css:8`; `SP/agents/fe/read-card_1280.png` | P1 (sau fix izolat P1a) | S |
| 4 | Citește | „0 / 5 azi” numără piese, iar pe Azi „0 / 12 azi” numără răspunsuri. Banda de streak dispare pe Exerciții și Generator. | major | `ui-en.ts:1843` (`goal_txt`); `shots/today_1280_light_en.png` vs `shots/read-drills_1280_light_en.png` | P2 | S |
| 5 | Citește, 375 | Al treilea tab este tăiat. În RO se vede doar iconița de la „Generator liber”. Bara are 407 px (EN) / 463 px (RO) în 343 px, fără indiciu de scroll. | major | `etude.css:1478-1479`; `SP/agents/qa/tabs_ro.png`, `tabs_en.png` | P8 | S |
| 6 | Citește > Exerciții, 375 | Peste 20 de descrieri de nivel sunt tăiate cu „…” și pierd informație („major / minor / micșorat /…”). La 1280 apar și ele tăiate pe carduri. | major | `etude.css:1389`; `SP/agents/qa/clip.json`; `shots/read-drills_375_light_ro.png` | P8 | S |
| 7 | Citește > Exerciții | Cele 6 comutatoare globale stau negrupate între hero și lista de niveluri. Hero-ul e mai înalt decât prima listă. | major | `shots/read-drills_1280_light_en.png` | P3 | S |
| 8 | Citește > Exerciții | Un nivel deschide un ecran intermediar fără buton Start. 5 clicuri până la exercițiu. | major | `SP/agents/ux/f3_drill.png` | P5 | S |
| 9 | Citește > Generator | Tabul se deschide aproape gol: o bară rotunjită goală, Start și Ascultă dezactivate, textul trimite la butonul de deasupra. După generare, „Ambele mâini” și „Mâna stângă” devin gri fără motiv afișat. | major | `shots/read-pieces_1280_light_en.png`; `SP/agents/ux/f4_sr.png` | P4 | S |
| 10 | Citește (RO) | Aceeași funcție are 3 nume RO: „Generator liber”, „Citire la prima vedere”, „Prima vedere”. „Exerciții” denumește 3 lucruri diferite. EN „New reading exercise” nu se potrivește cu nimic. | major | `ui-ro.ts:1146, 1167, 1185`; `ui-en.ts:171`; `shots/read-book_1280_light_ro.png` | P7 | S |
| 11 | Citește, 375 | Sloturile setului taie „nivelul tău” în „nivelul t…”. | minor | `read-home.css:50`; `SP/agents/qa/readbook-top_ro.png` | P8 | S |
| 12 | Citește, 375 | Pagina Carte are 4386 px. Cele 96 de piese ocupă cea mai mare parte. „Alte moduri” stă la y≈3687. | minor | `shots/read-book_375_light_ro.png`; `SP/agents/ux/m.mjs` | P6 | M |
| 13 | Citește | Lede-ul se schimbă pe tab. Pe Exerciții și Generator are 3 rânduri fără acțiune. | minor | `etude.html:170-171` | P2 | S |
| 14 | Învață, Metoda | Conținutul începe la 20 / 100 / 220 px la dreapta antetului la 1280 / 1440 / 1920. Învață folosește `--page-max` 1240, antetul `--work-max` 1680. | major | `etude.css:27, 83, 85`; `shots/learn_1920_light_en.png`; `SP/agents/fe/measure.mjs` | P9 | S |
| 15 | Învață | Textul are 619 px (69 caractere/rând, corect) într-un panou de 872-894 px. Rămân ~200 px goi în dreapta fiecărui paragraf. | major | `etude.css:628`; `SP/agents/fe/learn-variant-baseline_1440.png` | P9 | M |
| 16 | Învață | Iconițele unor capitole apar ca pătrățele goale (Semne de drum, Dinamică, Pauze). Sunt simboluri muzicale Unicode fără font pe sistem. | minor | `shots/learn_1920_light_en.png`; `src/features/learn/index.ts:225` (`L.icon`) | P10 | S |
| 17 | Toate | Chenarele butoanelor, select-urilor și chip-urilor au contrast 1,3-1,5:1. WCAG 1.4.11 cere 3:1. | major | `etude.css:106, 166, 243` (`--line`, tokenuri `:12, :42`); `SP/agents/a11y/borders.mjs` | P11 | S |
| 18 | Exersează > Progresii | Tablist-ul „Exercițiu / Cântă împreună” răspunde doar la click. Fără săgeți, fără `aria-controls`. Din tastatură „Cântă împreună” nu e accesibil din acest control. | major | `etude.html:550-553`; `practice/index.ts:2137-2141`; `SP/agents/a11y/prog2.mjs` | P11 | S |
| 19 | Toate | La schimbarea ecranului titlul paginii nu se schimbă (rămâne și în engleză în RO). Focusul se comportă diferit între bara de sus și bara de moduri. | major | `etude.html:6`; `SP/agents/a11y/overlays.mjs` | P11 | S |
| 20 | Exersează, 375 | Bara mobilă Start acoperă elemente focusate (linkuri din subsol, `#pr-start`). | major | `etude.css:378`; `practice.css:343`; `SP/agents/a11y/obscured_practice_375x667.png` | P11 | S |
| 21 | Învață, Explorează, Citește | Prea multe opriri Tab: Învață 49, Explorează 63 (24 de taste în cercul cvintelor), Citește peste 70. | major | `circle-of-fifths.ts:272, 276`; `SP/agents/a11y/focus.mjs` | P12 | M |
| 22 | Toate, 375 | Ținte sub 24 px: linkuri din subsol, sumarul OSMD, glisorul de tempo, căsuțele din Generator. | minor | `SP/agents/a11y/targets375.json` | P11 | S |
| 23 | Voce, 375 | Mesajul „microfon indisponibil” apare sub pliu, departe de butonul apăsat. | minor | `SP/agents/qa/voice-deny_en.png` | P13 | S |
| 24 | Exersează, 375 RO | Bara de moduri se rupe pe 2 rânduri, „Explorează” rămâne singur. EN încape pe un rând. | minor | `SP/agents/qa/readbook-top_ro.png` | P8 | S |
| 25 | Piese | La 1920 lățimea e 1760 px, antetul 1680. Titlul e cu 40 px la stânga brandului. „Deschide fișier” apare de două ori. | minor | `etude.css:87`; `shots/pieces_1920_light_en.png` | P14 | S |
| 26 | Toate | Trei landmark-uri `nav` au același nume „Sections”. Butoanele de limbă nu au `lang`. | minor | `etude.html:34, 53, 890, 955` | P11 | S |
| 27 | Azi, Citește | Stelele goale (1,7:1) și săgeata „→” din plan (2,0:1) au contrast slab. | minor | `etude.css:1391, 1114` | P11 | S |
| 28 | Citește | „Rezultat nesalvat” apare ca text simplu în linia de verdict, fără acțiune de reîncercare. Nereprodus fără MIDI real. | minor | `read-play-engine.ts:1517, 1526` | de reprodus întâi | M |

## 4. Propuneri: înainte, după și harta capabilităților

### P1. Un singur card „Azi” pe Citește > Carte (răspunde la Q1)
- Înainte: două jumătăți („Setul de azi” și „Lectura de azi”), două numerotări, „0 din 3” cu 2 rânduri, benzi tăiate, coloana dreaptă fără padding.
- După: un card „Azi” cu trei pași: 1 Încălzire, 2 Setul de azi (cele 5 sloturi în linie, buton principal Începe / Continuă), 3 Piesă lungă. „0 din 3 gata” corespunde cu ce se vede. Statisticile urcă în banda de stare (P2).
- Hartă:
  - Începe / Continuă setul: rămâne (singurul buton principal, primul în ordinea Tab).
  - 5 sloturi: rămân (în pasul 2).
  - Încălzire, Piesă lungă: rămân (pașii 1 și 3).
  - Nivel, Prima vedere, Piese citite: se mută în banda de stare (P2).
  - Nota „de ce”, mesajul „setul rămâne la nivelul X”, bannerul „nivelul următor”: rămân în card.
  - Heading-ul h2 și regiunea „Azi”: rămân (navigare cu cititor de ecran).
- Fișiere: `read-home.ts:253-306`, `read-home.css`, `etude.css:149-162`, cheile `rdn_plan_*`, teste e2e Read.
- **P1a (fix izolat, S)** dacă P1 nu se aprobă: numerotare 1-3 corectă, benzile pe tot cardul, padding pe coloana dreaptă. Toate controalele rămân pe loc.
- Cost: M (P1a: S).

### P2. O bandă de stare pe toate taburile Citește
- Înainte: streak și „0 / 5 azi” doar pe Carte. Unitatea lipsește. Lede diferit pe tab.
- După: o bandă cu streak, „0 / 5 piese azi”, nivel, prima vedere, piese citite. Apare pe toate cele trei taburi. Un lede scurt comun.
- Hartă: streak rămâne. Puncte rămân. Statisticile din card se mută aici. Lede-ul lung de la Exerciții se mută ca subtitlu în hero-ul Exerciții.
- Cost: S.

### P3. „Opțiuni exercițiu” pe Citește > Exerciții
- Înainte: 6 căsuțe mereu deschise deasupra listei.
- După: un buton „Opțiuni exercițiu” (cheia `rdx_hero_opts` există deja) care deschide un panou. Butonul arată câte sunt active („3 active”).
- Hartă: Sunet, Indicii automate, Flux de note, Ritm fantomă, Scenă pe tot ecranul, Puncte slabe: se grupează în panou. Filtrele, „Nivelul 0”, „Chei orchestrale”, „Exercițiu personalizat”: rămân.
- Cost: S.

### P4. Generator liber: stare utilă la prima deschidere și „Opțiuni”
- Înainte: panou gol, bara rotunjită goală, 4 clicuri până la sunet. Opțiunile mâini gri fără explicație.
- După: la prima vizită din sesiune se generează o melodie (sau se arată ultima). Bara goală dispare. „Nume note”, „Orice octavă”, „Feedback instant” se grupează sub „Opțiuni”. Mâinile indisponibile primesc un rând de motiv.
- Hartă: Melodie nouă, Mâini, Pas cu pas / Evaluare, Start, Ascultă, tempo, Fereastră completă: rămân la vedere. Cele 3 căsuțe: se grupează în „Opțiuni”. „Deschide Piese”: rămâne în textul stării goale (care tot poate apărea la eroare).
- Risc: generarea automată poate surprinde. Doar la prima vizită pe sesiune.
- Cost: S.

### P5. Start direct pe ecranul nivelului (Exerciții)
- Înainte: nivel, apoi cardul „Exersează” fără Start. După: cardul preselectat are buton Start. Se economisește un clic.
- Hartă: Exersează rămâne. Provocare și cele 3 moduri rămân. „← Niveluri” rămâne.
- Cost: S.

### P6. Cartea nivelului: unitățile pliate în afară de cea curentă
- Înainte: 96 de butoane mereu deschise. Pe telefon ocupă cea mai mare parte din 4386 px.
- După: unitatea curentă e deschisă. Celelalte 11 apar ca rânduri cu titlu și „0/8”. „Arată toate unitățile” le deschide pe toate.
- Hartă: toate cele 96 de piese rămân accesibile (grupate pe unități pliabile). „Începe · nr. N” rămâne. Progresul pe unitate rămâne în antetul fiecărei unități.
- Cost: M.
- Variantă pentru „Nivel și tonalitate”: după ce nivelul a fost ales o dată, selectorul de nivel și tonalitate se strânge într-un rând sumar „Nivelul 1 · Amestecat · Schimbă”. Toate butoanele rămân în interior. Prima dată rămâne deschis.

### P7. Denumiri EN și RO
- Înainte: „Generator liber” / „Citire la prima vedere” / „Prima vedere”. „Exerciții” de 3 ori. EN „New reading exercise”.
- După (propunere, decizia ta): tabul RO devine „Prima vedere” sau „Citire la prima vedere”. Tabul RO „Exerciții pe abilități” devine „Exerciții de citire”. Cardul EN devine „Scored reading exercise”.
- Hartă: niciun control nu se mută. Se schimbă doar etichetele.
- Cost: S.

### P8. Pachet telefon (375 și 768)
- Taburile Citește se rup pe 2 rânduri sau au etichete scurte sub 420 px (modific `etude.css:1478-1479`).
- Descrierile nivelurilor trec pe 2 rânduri în loc de „…” (`etude.css:1389`).
- Etichetele sloturilor: „nivel” în loc de „nivelul tău”, sau 2 rânduri (`read-home.css:50`).
- Bara de moduri RO pe un rând (padding mai mic).
- Hartă: toate controalele rămân. Se schimbă doar așezarea.
- Cost: S.

### P9. Învață pe ecran lat: varianta C (răspunde la Q3)
- Înainte: lățime 1240, panou 872, text 619 px, conținutul decalat față de antet.
- După: Învață și Metoda folosesc `--work-max` (aliniate la antet). Peste 1360 px apare o coloană dreaptă lipicioasă cu „Pe această pagină” și fișa rezumat. Textul crește la 16,5 px și rămâne la 66ch.
- Hartă: lista de capitole, bara de progres, Glosar, linkul „Exersează citirea”, butoanele de redare, Începe verificarea, Marchează complet, Anterior, Următor: rămân. Fișa rezumat se mută în coloana dreaptă peste 1360 px și rămâne în lecție sub 1360 px. Cuprinsul „Pe această pagină” este adăugat.
- Fișiere: `etude.css:83-86` (aliniere, o linie), `etude.css:619, 628-629, 1143`, `src/features/learn/index.ts`, `etude.html:158-164`.
- Cost: S pentru aliniere, M pentru coloana dreaptă.

### P10. Iconițele capitolelor din Învață
- Înlocuim cele 4 simboluri fără font cu SVG inline sau glife care există în fonturile încărcate. Hartă: capitolele rămân. Cost: S. De verificat întâi pe un telefon real.

### P11. Pachet accesibilitate (fiecare S)
- Token nou `--ctl-line` (3:1) doar pe controale. `--line` rămâne pe carduri și separatoare.
- Tablist-ul Progresii primește săgeți, Home, End și tabindex mobil, ca taburile Citește.
- La fiecare rută: `document.title` localizat și focus pe h1, la fel pentru ambele bare.
- `scroll-padding-bottom` include bara mobilă Start.
- Nume distincte pentru cele 3 landmark-uri, `lang` pe butoanele de limbă, ținte de minim 24 px, contrast 3:1 pentru stele.
- Hartă: niciun control nu se mută.

### P12. Widget-uri compuse cu tabindex mobil
- Lista de capitole, cele 24 de taste din cercul cvintelor și grila de niveluri devin o singură oprire Tab, cu săgeți în interior.
- Hartă: toate elementele rămân, grupate în câte un widget. Cost: M.

### P13. Mesajul de microfon refuzat lângă butonul apăsat (Voce). Textul rămâne. Cost: S.

### P14. Piese: lățimea 1760 trece la `--work-max`. Al doilea „Deschide fișier” din zona de drop dispare, zona de drop rămâne, butonul din antet rămâne. Cost: S.

## 5. Răspunsuri directe

### Q1. Exersează > Citește: mai e nevoie de „Setul de azi”?
**Recomandare: păstrat și comprimat (P1).**
- Rolul lui: este singura acțiune zilnică a tabului. Spune ce faci acum, arată cele 5 piese și starea Începe / Continuă / Gata. Celelalte zone (cartea, nivelul) sunt navigare.
- Problema nu este cardul. Problema este că „Lectura de azi” îl dublează: același set e numărat în 4 locuri, iar „0 din 3” arată 2 rânduri (`read-home.ts:274, 279, 293`).
- Ascuns după prima folosire: respins. Setul se schimbă zilnic, deci ar dispărea exact conținutul de azi. Ar schimba și structura paginii de la o zi la alta pentru cititorul de ecran.
- Mutat: inutil. Este deja primul și trebuie să rămână primul.
- Toți patru (UX, FE, a11y, QA) au ales independent „comprimat”.

### Q2. Citește pare aglomerat. Ce grupăm, ce mutăm, ce rămâne?
- **Rămâne la vedere:** taburile, cardul „Azi” cu butonul Start, nivelul curent, unitatea curentă din carte. Pe Exerciții: filtrele și lista de niveluri. Pe Generator: Melodie nouă, Start, Ascultă, tempo, mâini, mod.
- **Se grupează:**
  - streak + „0 / 5 azi” + cele 3 statistici → o bandă de stare (P2);
  - nivel + tonalitate → rând sumar pliabil după prima alegere (P6);
  - cele 6 comutatoare de pe Exerciții → „Opțiuni exercițiu” (P3);
  - cele 3 căsuțe din Generator → „Opțiuni” (P4).
- **Se mută în secundar:** unitățile cărții, în afară de cea curentă, devin pliabile (P6). „Alte moduri de exersare” devine un rând subțire de linkuri sub carte, pentru că dublează meniul și bara de moduri.
- **În Setări:** nimic. Opțiunile se schimbă de la o sesiune la alta și trebuie să rămână lângă exercițiu.
- Condiții de accesibilitate: fiecare grup pliat are un buton real cu nume și `aria-expanded`, fără meniuri doar la hover, un heading pe grup.

### Q3. Învață: spațiu gol pe margini pe ecran lat
**Recomandare: varianta C, trei coloane (P9).** Nu lățim textul. Doar lățimea maximă mai mare (varianta A) aliniază pagina, dar mărește golul din panou la 690 px la 1920.

| Lățime | Azi: decalaj față de antet / panou / text | Varianta A (doar lățime mare) | Varianta C (recomandată) |
|---|---|---|---|
| 1280 | +20 px / 894 / 619 px, 69 car. | 0 / 934 / 619 | 0 / 934 / 681 px, 69 car. (fără coloană dreaptă sub 1360) |
| 1440 | +100 px / 872 / 619 | 0 / 1072 / 619 | 0 / 808 + coloană dreaptă / 681, 69 car. |
| 1920 | +220 px / 872 / 619 | 0 / 1312 / 619 (gol 690 px) | 0 / 840 + coloană dreaptă / 681, 69 car. |

Capturi (simulate cu CSS injectat, repo neatins), în `SP/agents/fe/`:
- 1280: `learn-variant-baseline_1280.png`, `learn-variant-A_1280.png`, `learn-variant-C_1280.png`
- 1440: `learn-variant-baseline_1440.png`, `learn-variant-A_1440.png`, `learn-variant-C_1440.png`
- 1920: `learn-variant-baseline_1920.png`, `learn-variant-A_1920.png`, `learn-variant-C_1920.png`

La 1440 coloana dreaptă are doar ~230 px și tabelul fișei se înghesuie (`learn-variant-C_1440.png`). La implementare îi dăm `minmax(260px, 1fr)`. Netestat: lecții cu portative late în panoul de 840 px.

## 6. Verificare scurtă a celorlalte ecrane
- **Explorează:** fără overflow. 24 de opriri Tab în cercul cvintelor (P12). Eticheta „Am” se taie cu 2 px la 1280. Minor.
- **Piese:** importul de fișiere invalide dă mesaje clare în EN și RO (`SP/agents/qa/pieces-err-*.png`). Lățime nealiniată și „Deschide fișier” dublu (P14). Tabul „Biblioteca mea / Piese incluse” are 850 px pe tab la 1920. Plafon de ~360 px.
- **Voce:** taburi corecte, regiuni live. Mesajul de microfon refuzat e sub pliu (P13).
- **Setări:** cel mai corect dialog din aplicație (focus prins, Escape, focus returnat). Lipsesc `lang` pe butoanele de limbă (P11).
- **Azi:** al doilea loc cu mai multe numere „azi” (sesiunea, planul, „noi azi 5”). Gravitate mică, pentru că planul este o singură listă.
- **Progres:** starea goală e bună. Butoanele au 36 px la 375 (P11).
- **Exersează:** tablist-ul Progresii nu merge din tastatură (#18). Bara mobilă Start acoperă focusul (#20).

## 7. Propuneri respinse (pierdeau o capabilitate)
- Ascunderea cardului „Setul de azi” după prima folosire: pierde intrarea zilnică.
- Păstrarea doar a butonului setului, fără rândurile Încălzire și Piesă lungă: pierde două intrări.
- Ascunderea barei claviaturii pe Învață: lecțiile o folosesc pentru demonstrații.
- Mutarea comutatoarelor de exercițiu în Setări: se schimbă per sesiune.

## 8. Top 5 schimbări, în ordinea valoare / cost

| Loc | Schimbare | Valoare | Cost | Constatări |
|---|---|---|---|---|
| 1 | Cardul „Azi” pe Citește, fix izolat P1a: numerotare 1-3 corectă, benzi pe tot cardul, padding | ecranul principal arată corect și consecvent | S | 1, 3 |
| 2 | Pachet telefon P8: taburi Citește vizibile, descrieri și sloturi netrunchiate, bara de moduri RO | taburi și informații vizibile la 375 în EN și RO | S | 5, 6, 11, 24 |
| 3 | Învață: alinierea la antet (`etude.css:83-86`, o linie) | pagina nu mai pare decalată pe 1440 și 1920 | S | 14 |
| 4 | Grupare opțiuni pe Citește: P3 + P4 | pagina Exerciții și Generator mult mai curată, nicio capabilitate pierdută | S | 7, 9 |
| 5 | Accesibilitate din P11: tablist Progresii din tastatură, token `--ctl-line`, titlu pe rută | repară singura funcție inaccesibilă din tastatură și contrastul controalelor | S | 17, 18, 19 |

Apoi, ca pași separați: P1 complet (M), coloana dreaptă din Învață (M), P7 denumiri (S, după decizia ta pe cuvinte), P10 iconițe (S, după verificare pe telefon), P6 unități pliate (M), P12 (M).

Fiecare pas se implementează separat, cu `npm run lint`, `npm run test:unit` și `npm test` verzi. Pentru pașii care ating dimensiunea bundle-ului contează suita e2e de producție (`npm test`), pentru că verificarea de dimensiune la pornire nu rulează pe dev server.

## 9. Limite ale analizei
- Browser: Chrome prin Playwright headless (versiunea fixată în proiect), nu extensia Claude in Chrome. Motiv: 220 de capturi și 4 agenți în paralel, fiecare în context propriu.
- Ținte de atingere măsurate fără `pointer:coarse`. CSS-ul le mărește pe touch, deci trebuie verificat pe telefon real.
- Iconițele lipsă din Învață depind de fonturile sistemului. De verificat pe Android și iOS.
- Nereproduse: „Rezultat nesalvat” (cere MIDI real), `forced-colors`.
- Variantele din Învață sunt simulări CSS. Nu au fost testate lecții cu widget-uri late.

## 10. Stare implementare
- 2026-11-27: P1a implementat pe branch-ul local `fix/read-today-plan-steps` (worktree `.claude/worktrees/read-today-plan-steps`). Necomis. Lint, typecheck, test:unit și npm test verzi.
