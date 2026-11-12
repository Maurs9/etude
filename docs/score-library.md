# Biblioteca locală de partituri

În **Pieces / Piese → Biblioteca mea**, adaugă o dată fișierele MusicXML, MXL sau MIDI de pe dispozitiv. Se pot selecta mai multe fișiere. Biblioteca păstrează copiile originale în IndexedDB și funcționează fără cont sau server de fișiere.

## Utilizare

- **Adaugă partituri**: validează fiecare fișier înainte de salvare. Duplicatele sunt identificate după conținut, chiar dacă fișierul a fost redenumit. Un fișier invalid nu împiedică importul celorlalte; sunt afișate numărul și numele celor respinse.
- Deschiderea obișnuită prin **Open file** salvează și ea originalul, după încărcarea reușită a partiturii. Dacă browserul refuză stocarea, partitura rămâne deschisă și apare un avertisment, nu o confirmare falsă de salvare.
- Caută după titlu, compozitor sau numele fișierului; filtrează favoritele și piesele deschise recent.
- **Continuă** reîncarcă originalul din bibliotecă și restabilește poziția, viteza procentuală, mâna studiată, așteptarea, metronomul și afișarea. Poziția se salvează la interacțiuni și periodic în timpul studiului; nu se reia automat sunetul.
- O rundă de exersare prin toată partitura (fără selecție, buclă sau A–B) salvează în înregistrare ziua ultimei exersări și, la o rundă cu tempo (fără „Așteaptă-mă”), cea mai bună acuratețe. Lista le afișează. Înregistrările mai vechi, fără aceste câmpuri, se încarcă normal.
- **Descarcă originalul** exportă exact fișierul importat, nu XML-ul normalizat de motorul de gravură.
- **Șterge** cere confirmare și elimină numai copia din bibliotecă. Fișierul din folderul original și partitura deja deschisă nu sunt șterse.

## Transfer pe telefon, tabletă sau alt calculator

1. Pe dispozitivul de origine, apasă **Descarcă copia bibliotecii**.
2. Copiază fișierul `etude-library.json` pe celălalt dispozitiv.
3. Deschide aceeași aplicație și folosește **Îmbină copia bibliotecii**.

Copia include fișierele originale, favoritele și pozițiile/setările de studiu. Restaurarea este o îmbinare: intrările cu același conținut deja existente sunt păstrate, nu înlocuite. Toată copia este verificată înainte de scriere; un fișier corupt sau o partitură respinsă de parser anulează restaurarea fără import parțial. O eroare de cotă anulează tranzacția.

Copia bibliotecii este separată de copia existentă a progresului general de studiu. Pentru transferul complet al aplicației, exportă-le pe ambele. Fișierul bibliotecii nu este criptat; poate conține partituri personale.

## Ce înseamnă „salvat pe dispozitiv”

- Datele aparțin browserului/profilului și originii aplicației. Un alt browser, alt profil sau alt domeniu/port are o bibliotecă separată.
- Nu există sincronizare automată. Copierea folderului `MIDI` nu adaugă automat fișierele în bibliotecă; importă-le inițial sau transferă copia bibliotecii.
- Ștergerea datelor site-ului, modul privat sau curățarea stocării pot elimina biblioteca. Solicitarea de protecție a stocării se face la import; browserul poate să o refuze. Păstrează originalele și o copie externă chiar dacă protecția este acordată.
- Pentru utilizarea offline, aplicația trebuie încărcată și pregătită online pe fiecare dispozitiv înainte de deconectare. Biblioteca nu înlocuiește instalarea/cache-ul aplicației.
- Rămâne limita importului existent: 2 MiB per fișier. Copiile de transfer sunt limitate la 64 MiB și 1000 de înregistrări; erorile sunt raportate, nu sunt trunchiate datele.
- PDF-ul nu este un format interactiv acceptat. Folosește MusicXML/MXL pentru notație și marcaje, MIDI pentru date MIDI.

## Verificări

```bash
ETUDE_DEV_SERVER=1 npx playwright test tests/e2e/score-library.spec.mjs tests/e2e/score-library-store.spec.mjs --project=app --workers=2
ETUDE_DEV_SERVER=1 ETUDE_SCORES_DIR=MIDI npx playwright test tests/e2e/score-library-collection.spec.mjs --project=app --workers=1
npm run test -- --workers=2
npm run test:unit
npm run lint
npm run typecheck
npm run build
```

Testele de stocare folosesc IndexedDB real în browser și fișiere sintetice. Corpusul personal din `MIDI` este opțional și nu este inclus în fixture-uri sau în build.
