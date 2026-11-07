'use strict';
// Rebuild the explicitly incomplete, human-authored seed. No application data is sent anywhere.
const fs = require('node:fs');
const path = require('node:path');
const {extract} = require('./extract.cjs');
const en = extract();
const strings = require('../../i18n-extra.js').it;
const src = en.lessons.keys;
const translatedText = [
'Music uses just ', '12 different notes', '. After the twelfth, the pattern starts over — the same note, higher up. That distance is an ', 'octave', ', and the piano is simply the same 12-key pattern repeated over and over.',
'The white keys are named ', 'C D E F G A B', ' (Do Re Mi Fa Sol La Si). The black keys sit between them and borrow their names: the black key above C is ', 'C♯', ' (“C sharp”); the same key seen from D is ', 'D♭', ' (“D flat”). One key, two names — that’s called ', 'enharmonic', ' spelling.',
'Middle C', 'C♯ / D♭', 'An octave: C to C', 'Half steps ', '&amp;', ' whole steps',
'From any key to its closest neighbour (black or white) is a ', 'half step', ' (semitone) — the smallest distance we use. Two half steps make a ', 'whole step', '. Notice that ', 'E–F', ' and ', 'B–C', ' have no black key between them: those are natural half steps, and they’re what gives every scale its shape.',
'Half step: E→F', 'Whole step: C→D', 'To find any C: look for the group of two black keys — C is the white key just to their left. Middle C (C4) sits closest to the centre of the piano.'
];
const italianText = [
'La musica usa soltanto ', '12 note diverse', '. Dopo la dodicesima, lo schema ricomincia: è la stessa nota, più acuta. Questa distanza è un’', 'ottava', ' e il pianoforte non è altro che lo stesso schema di 12 tasti ripetuto più volte.',
'I tasti bianchi si chiamano ', 'C D E F G A B', ' (Do Re Mi Fa Sol La Si). I tasti neri si trovano tra quelli bianchi e ne prendono in prestito i nomi: il tasto nero sopra C è ', 'C♯', ' («do diesis»); lo stesso tasto visto da D è ', 'D♭', ' («re bemolle»). Un tasto, due nomi: è la scrittura ', 'enarmonica', '.',
'Do centrale', 'C♯ / D♭', 'Un’ottava: da C a C', 'Semitoni ', '&amp;', ' toni',
'Da un tasto qualsiasi al tasto più vicino (nero o bianco) c’è un ', 'semitono', ', la più piccola distanza utilizzata. Due semitoni formano un ', 'tono', '. Nota che tra ', 'E–F', ' e tra ', 'B–C', ' non c’è un tasto nero: sono semitoni naturali e contribuiscono a definire la struttura di ogni scala.',
'Semitono: E→F', 'Tono: C→D', 'Per trovare un C, cerca il gruppo di due tasti neri: C è il tasto bianco subito alla loro sinistra. Il do centrale (C4) si trova vicino al centro del pianoforte.'
];
let n=0;
const body = src.b.replace(/(<[^>]+>|&amp;)|([^<>&]+)/g, (all, markup, text) => {
  if (markup && markup !== '&amp;') return markup;
  const token = markup || text;
  if (!token.trim()) return token;
  const leading=token.match(/^\s*/)[0], trailing=token.match(/\s*$/)[0];
  const core=token.slice(leading.length,token.length-trailing.length);
  // Keep surrounding spaces outside the translation comparison.
  const actual = markup || core;
  const expected = translatedText[n];
  if (actual.trim() !== expected.trim()) throw Error(`Unexpected source text ${n}: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`);
  const out = italianText[n++];
  return out;
});
if(n !== translatedText.length) throw Error('Lesson translation did not consume every text fragment');
const result = {
 metadata:{language:'it',status:'INCOMPLETE: not ready for integration',schema:'strings[key]; lessons[id].t and .b; musicalLabels.{intervals,scales,chords,inversions,patterns}',source:'etude.html and existing hand-authored i18n-extra.js; no runtime fallback implied'},
 strings, lessons:{keys:{t:'La tastiera e i nomi delle note',b:body}},
 musicalLabels:{
  intervals:{1:'Seconda minore',2:'Seconda maggiore',3:'Terza minore',4:'Terza maggiore',5:'Quarta giusta',6:'Tritono',7:'Quinta giusta',8:'Sesta minore',9:'Sesta maggiore',10:'Settima minore',11:'Settima maggiore',12:'Ottava',13:'Nona minore',14:'Nona maggiore',15:'Decima minore',16:'Decima maggiore',17:'Undicesima giusta',18:'Undicesima aumentata',19:'Dodicesima giusta',20:'Tredicesima minore',21:'Tredicesima maggiore',22:'Quattordicesima minore',23:'Quattordicesima maggiore',24:'Due ottave'},
  scales:{'Major (Ionian)':'Maggiore (ionica)','Dorian':'Dorica','Phrygian':'Frigia','Lydian':'Lidia','Mixolydian':'Misolidia','Aeolian (Natural minor)':'Eolia (minore naturale)','Locrian':'Locria','Harmonic minor':'Minore armonica','Melodic minor':'Minore melodica','Harmonic major':'Maggiore armonica','Major pentatonic':'Pentatonica maggiore','Minor pentatonic':'Pentatonica minore','Blues':'Blues','Whole tone':'Toni interi','Diminished (W-H)':'Diminuita (tono-semitono)','Diminished (H-W)':'Diminuita (semitono-tono)','Phrygian dominant':'Frigia dominante','Hungarian minor':'Minore ungherese','Chromatic':'Cromatica'},
  chords:{'13':'Tredicesima','11':'Undicesima (senza terza)','maj9':'Nona maggiore','9':'Nona di dominante','m9':'Nona minore','7♭9':'Settima di dominante con nona bemolle','7♯9':'Settima di dominante con nona aumentata','maj7♯11':'Settima maggiore con undicesima aumentata','maj7':'Settima maggiore','7':'Settima di dominante','m7':'Settima minore','mMaj7':'Settima maggiore su accordo minore','m7♭5':'Settima semidiminuita','dim7':'Settima diminuita','7♯5':'Settima con quinta aumentata','7♭5':'Settima di dominante con quinta diminuita','6':'Sesta maggiore','m6':'Sesta minore','add9':'Con nona aggiunta','maj':'Maggiore','m':'Minore','dim':'Diminuito','aug':'Aumentato','sus2':'Seconda sospesa','sus4':'Quarta sospesa'},
  inversions:['stato fondamentale','primo rivolto','secondo rivolto','terzo rivolto','quarto rivolto','quinto rivolto'],
  patterns:{block:'Accordi pieni',arp:'Arpeggio (accordo spezzato)',alberti:'Basso albertino',waltz:'Valzer (3/4)',ballad:'Ballata pop',boomchick:'Basso e accordo'}
 }
};
fs.writeFileSync(path.join(__dirname,'it.json'),JSON.stringify(result,null,2)+'\n');
console.log(`Wrote incomplete seed: ${Object.keys(strings).length} strings, ${Object.keys(result.lessons).length} lessons`);
