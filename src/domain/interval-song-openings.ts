// Pitches are semitone offsets from the first note. Onsets and durations are in seconds.
// References include published scores and transcriptions, including Sheet Sage’s TheoryTab annotations.
// https://github.com/chrisdonahue/sheetsage#hooktheory-dataset
export const SONG_OPENINGS = {
  1: {
    asc: [
      { title: 'Jaws — John Williams', source: 'https://conservancy.umn.edu/server/api/core/bitstreams/b14ad9ad-c1df-418b-b810-9631b02c307a/content#page=160', notes: [[0, 0, 0.5], [1, 0.5, 0.5], [0, 1, 0.5], [1, 1.5, 2.5], [0, 6, 0.5], [1, 6.5, 0.5]] },
      { title: 'Simfonia „Din Lumea Nouă”, IV — Dvořák', source: 'https://conservancy.umn.edu/server/api/core/bitstreams/b14ad9ad-c1df-418b-b810-9631b02c307a/content#page=160', notes: [[0, 0, 0.625], [1, 0.625, 0.208], [0, 1.667, 0.625], [1, 2.292, 0.208], [0, 3.333, 0.625], [1, 3.958, 0.208], [0, 4.167, 0.625], [1, 4.792, 0.208]] },
      { title: 'Lacrimosa — Mozart', source: 'https://musetrainer.github.io/library/scores/Lacrimosa_-_Requiem.mxl', notes: [[0, 0, 0.469], [1, 0.469, 0.469], [8, 1.406, 0.469], [9, 1.875, 0.469], [1, 2.812, 0.469], [0, 3.281, 0.469], [11, 4.219, 0.469], [9, 4.687, 0.469]] },
      { title: 'Isn’t She Lovely — Stevie Wonder', source: 'https://hookpad.hooktheory.com/?idOfSong=ZOxVyYPMgdq', notes: [[0, 0, 0.375], [1, 0.375, 0.37], [0, 0.745, 0.245], [-2, 0.99, 1.01], [-4, 2, 1.01], [0, 4.02, 0.367], [1, 4.387, 0.377], [0, 4.765, 0.255]] },
      { title: 'The Raiders March — John Williams', source: 'https://hookpad.hooktheory.com/?idOfSong=LAgQZlaExyO', notes: [[0, 0, 0.35], [1, 0.35, 0.117], [3, 0.467, 0.234], [8, 0.701, 0.701], [-2, 1.869, 0.35], [0, 2.22, 0.117], [1, 2.336, 0.935], [3, 3.738, 0.35]] },
    ],
    desc: [
      { title: 'Für Elise — Beethoven', source: 'https://musetrainer.github.io/library/scores/Fur_Elise.mxl', notes: [[0, 0, 0.208], [-1, 0.208, 0.208], [0, 0.417, 0.208], [-1, 0.625, 0.208], [0, 0.833, 0.208], [-5, 1.042, 0.208], [-2, 1.25, 0.208], [-4, 1.458, 0.208]] },
      { title: 'Carol of the Bells — Mykola Leontovych', source: 'https://musetrainer.github.io/library/scores/Carol_of_the_Bells.mxl', notes: [[0, 0, 0.333], [-1, 0.333, 0.167], [0, 0.5, 0.167], [-3, 0.667, 0.167], [-8, 0.833, 0.167], [0, 1, 0.333], [-1, 1.333, 0.167], [0, 1.5, 0.167]] },
      { title: 'All My Loving — The Beatles', source: 'https://hookpad.hooktheory.com/?idOfSong=jDgXpKqNgKl', notes: [[0, 0, 0.375], [-1, 0.375, 0.188], [-1, 0.563, 0.188], [-3, 0.75, 0.75], [-1, 1.501, 0.188], [0, 1.689, 0.375], [2, 2.064, 0.375], [4, 2.439, 0.563]] },
      { title: 'Joy to the World — Casting Crowns', source: 'https://hookpad.hooktheory.com/?idOfSong=nYAg-BkBxle', notes: [[0, 0, 0.67], [-1, 0.67, 0.495], [-3, 1.165, 0.165], [-5, 1.33, 0.99], [-7, 2.32, 0.33], [-8, 2.65, 0.66], [-10, 3.31, 0.66], [-12, 3.97, 0.66]] },
      { title: 'Zborul bondarului — Rimski-Korsakov', source: 'https://github.com/00sapo/OpenEWLD/blob/master/dataset/Nikolai_Rimsky-Korsakov/Flight_of_the_Bumblebee/Flight_of_the_Bumblebee.mxl', notes: [[0, 0, 0.15], [-1, 0.15, 0.15], [-2, 0.3, 0.15], [-3, 0.45, 0.15], [-2, 0.6, 0.15], [-3, 0.75, 0.15], [-4, 0.9, 0.15], [-5, 1.05, 0.15]] },
    ],
  },
  2: {
    asc: [
      { title: 'Frère Jacques', source: 'https://www.mdc.edu/kendall/academic-departments/performing-arts-and-industries/documents/MHL_Interval_Sheet.pdf', notes: [[0, 0, 0.556], [2, 0.556, 0.556], [4, 1.111, 0.556], [0, 1.667, 0.556], [0, 2.222, 0.556], [2, 2.778, 0.556], [4, 3.333, 0.556], [0, 3.889, 0.556]] },
      { title: 'Do-Re-Mi — The Sound of Music', source: 'https://hookpad.hooktheory.com/?idOfSong=RzojeGvAxDe', notes: [[0, 0, 0.735], [2, 0.735, 0.235], [4, 0.97, 0.765], [0, 1.735, 0.245], [4, 1.98, 0.47], [0, 2.45, 0.49], [4, 2.94, 0.5], [2, 3.95, 0.725]] },
      { title: 'Never Gonna Give You Up — Rick Astley', source: 'https://hookpad.hooktheory.com/?idOfSong=nvgy-Ew_gkA', notes: [[0, 0, 0.26], [2, 0.26, 0.26], [3, 0.52, 0.265], [3, 0.785, 0.265], [5, 1.05, 0.265], [2, 1.315, 0.53], [0, 1.845, 0.132], [-2, 1.977, 1.183]] },
      { title: 'Rudolph the Red-Nosed Reindeer — Johnny Marks', source: 'https://www.mdc.edu/kendall/academic-departments/performing-arts-and-industries/documents/MHL_Interval_Sheet.pdf', notes: [[0, 0, 0.268], [2, 0.268, 0.268], [0, 0.536, 0.268], [-3, 0.804, 0.268], [5, 1.071, 0.536], [2, 1.607, 0.536], [0, 2.143, 1.071]] },
      { title: 'The Entertainer, introducere — Scott Joplin', source: 'https://musetrainer.github.io/library/scores/The_Entertainer_-_Scott_Joplin_-_1902.mxl', notes: [[0, 0, 0.25], [2, 0.25, 0.25], [-2, 0.5, 0.25], [-5, 0.75, 0.5], [-3, 1.25, 0.25], [-7, 1.5, 0.5], [-12, 2, 0.25], [-10, 2.25, 0.25]] },
    ],
    desc: [
      { title: 'Mary Had a Little Lamb', source: 'https://www.mdc.edu/kendall/academic-departments/performing-arts-and-industries/documents/MHL_Interval_Sheet.pdf', notes: [[0, 0, 0.536], [-2, 0.536, 0.536], [-4, 1.071, 0.536], [-2, 1.607, 0.536], [0, 2.143, 0.536], [0, 2.679, 0.536], [0, 3.214, 1.071]] },
      { title: 'Marșul turcesc — Mozart', source: 'https://musetrainer.github.io/library/scores/WA_Mozart_Marche_Turque_Turkish_March_fingered.mxl', notes: [[0, 0, 0.125], [-2, 0.125, 0.125], [-3, 0.25, 0.125], [-2, 0.375, 0.125], [1, 0.5, 0.25], [3, 1, 0.125], [1, 1.125, 0.125], [0, 1.25, 0.125]] },
      { title: 'Sonata Patetica, II — Beethoven', source: 'https://musetrainer.github.io/library/scores/Sonate_No._8_Pathetique_2nd_Movement.mxl', notes: [[0, 0, 1.905], [-2, 1.905, 1.905], [3, 3.81, 2.857], [1, 6.667, 0.952], [0, 7.619, 0.952], [3, 8.571, 0.952], [8, 9.524, 0.952], [10, 10.476, 0.952]] },
      { title: 'Canon în Re — Pachelbel', source: 'https://musetrainer.github.io/library/scores/Canon_in_D_3.mxl', notes: [[0, 0, 1.714], [-2, 1.714, 1.714], [-4, 3.429, 1.714], [-5, 5.143, 1.714], [-7, 6.857, 1.714], [-9, 8.571, 1.714], [-7, 10.286, 1.714], [-5, 12, 1.714]] },
      { title: 'Hit the Road Jack — Ray Charles', source: 'https://hookpad.hooktheory.com/?idOfSong=lamk_EPemDM', notes: [[0, 0, 0.74], [-2, 0.74, 0.76], [-4, 1.5, 0.74], [-5, 2.24, 0.38], [-5, 2.62, 0.19], [-9, 2.81, 0.19], [-7, 3, 0.562], [-12, 3.562, 0.188]] },
    ],
  },
  3: {
    asc: [
      { title: 'Gnossienne nr. 1 — Erik Satie', source: 'https://musetrainer.github.io/library/scores/Gnossienne_No._1.mxl', notes: [[0, 0, 0.294], [3, 0.294, 0.294], [2, 0.588, 0.588], [0, 1.176, 0.588], [-1, 1.765, 1.176], [-1, 2.941, 1.176], [0, 4.706, 0.294], [3, 5, 0.294]] },
      { title: 'Gymnopédie nr. 1 — Erik Satie', source: 'https://musetrainer.github.io/library/scores/Gymnopdie_No._1__Satie.mxl', notes: [[0, 0, 1.111], [3, 1.111, 1.111], [1, 2.222, 1.111], [0, 3.333, 1.111], [-5, 4.444, 1.111], [-7, 5.556, 1.111], [-5, 6.667, 1.111], [-4, 7.778, 1.111]] },
      { title: 'Axel F — Harold Faltermeyer', source: 'https://hookpad.hooktheory.com/?idOfSong=JkmZNOePmqn', notes: [[0, 0, 0.51], [3, 0.51, 0.398], [0, 0.907, 0.258], [0, 1.165, 0.125], [5, 1.29, 0.25], [0, 1.54, 0.255], [-2, 1.795, 0.255], [0, 2.05, 0.51]] },
      { title: 'Greensleeves', source: 'https://musetrainer.github.io/library/scores/Greensleeves_for_Piano_easy_and_beautiful.mxl', notes: [[0, 0, 0.5], [3, 0.5, 1], [5, 1.5, 0.5], [7, 2, 0.75], [8, 2.75, 0.25], [7, 3, 0.5], [5, 3.5, 1], [2, 4.5, 0.5]] },
      { title: 'Georgia on My Mind — Ray Charles', source: 'https://hookpad.hooktheory.com/?idOfSong=qveoYqWaodn', notes: [[0, 0, 0.96], [3, 0.96, 0.48], [0, 1.44, 0.48], [5, 1.92, 0.96], [3, 2.88, 0.48], [0, 3.36, 0.48], [-4, 3.84, 0.96], [-2, 4.8, 0.48]] },
    ],
    desc: [
      { title: 'Clair de lune — Debussy', source: 'https://musetrainer.github.io/library/scores/Clair_de_lune_-_Claude_Debussy.mxl', notes: [[0, 0, 1.6], [-3, 1.6, 1.6], [-5, 3.2, 0.4], [-3, 3.6, 0.4], [-5, 4, 2.8], [-7, 6.8, 0.4], [-5, 7.2, 0.4], [-7, 7.6, 0.6]] },
      { title: 'Morning Mood — Edvard Grieg', source: 'https://hookpad.hooktheory.com/?idOfSong=veoYBqqkmdn', notes: [[0, 0, 0.411], [-3, 0.411, 0.411], [-5, 0.822, 0.411], [-7, 1.233, 0.411], [-5, 1.644, 0.411], [-3, 2.054, 0.411], [0, 2.465, 0.308], [-2, 2.773, 0.103]] },
      { title: 'Shake It Off — Taylor Swift', source: 'https://hookpad.hooktheory.com/?idOfSong=VMgJkjkyxqK', notes: [[0, 0, 0.185], [-3, 0.185, 0.185], [-5, 0.37, 0.195], [-7, 0.565, 0.195], [-3, 0.76, 0.75], [-12, 2.825, 0.195], [0, 3.02, 0.18], [-3, 3.2, 0.18]] },
      { title: 'This Old Man', source: 'https://www.mdc.edu/kendall/academic-departments/performing-arts-and-industries/documents/MHL_Interval_Sheet.pdf', notes: [[0, 0, 0.536], [-3, 0.536, 0.536], [0, 1.071, 1.071], [0, 2.143, 0.536], [-3, 2.679, 0.536], [0, 3.214, 0.536], [2, 3.75, 0.536], [0, 4.286, 0.536]] },
      { title: 'Bicycle Race — Queen', source: 'https://hookpad.hooktheory.com/?idOfSong=kygzEr_BmKB', notes: [[0, 0, 0.76], [-3, 0.76, 0.175], [-7, 0.935, 0.175], [0, 1.48, 0.76], [-3, 2.24, 0.175], [-8, 2.415, 0.175], [0, 2.93, 0.71], [-3, 3.64, 0.175]] },
    ],
  },
  4: {
    asc: [
      { title: 'Sonata K. 545, I — Mozart', source: 'https://musetrainer.github.io/library/scores/Sonata_No._16_1st_Movement_K._545.mxl', notes: [[0, 0, 0.909], [4, 0.909, 0.455], [7, 1.364, 0.455], [-1, 1.818, 0.682], [0, 2.5, 0.114], [2, 2.614, 0.114], [0, 2.727, 0.455], [9, 3.636, 0.909]] },
      { title: 'When the Saints Go Marching In', source: 'https://www.mdc.edu/kendall/academic-departments/performing-arts-and-industries/documents/MHL_Interval_Sheet.pdf', notes: [[0, 0, 0.526], [4, 0.526, 0.526], [5, 1.053, 0.526], [7, 1.579, 1.579], [0, 3.158, 0.526], [4, 3.684, 0.526], [5, 4.211, 0.526], [7, 4.737, 1.579]] },
      { title: 'Kumbaya', source: 'https://dhun.nathanielschool.com/song/kumbaya.html', notes: [[0, 0, 0.577], [4, 0.577, 0.577], [7, 1.154, 0.577], [7, 1.731, 0.577], [7, 2.308, 0.577], [9, 2.885, 0.577], [9, 3.462, 0.577], [7, 4.038, 0.577]] },
      { title: 'Sir Duke — Stevie Wonder', source: 'https://hookpad.hooktheory.com/?idOfSong=_NgbnqbMgQA', notes: [[0, 0, 0.59], [4, 0.59, 0.58], [7, 1.17, 0.45], [12, 1.62, 0.15], [-3, 2.37, 0.147], [-3, 2.665, 0.147], [0, 2.96, 0.15], [-1, 3.11, 0.15]] },
      { title: 'All I Want for Christmas Is You — Mariah Carey', source: 'https://hookpad.hooktheory.com/?idOfSong=ZbgORDXQmnY', notes: [[0, 0, 0.415], [4, 0.415, 0.415], [7, 0.83, 0.435], [11, 1.265, 0.435], [12, 1.7, 0.405], [11, 2.105, 0.405], [7, 2.51, 0.43], [4, 2.94, 0.43]] },
    ],
    desc: [
      { title: 'Swing Low, Sweet Chariot', source: 'https://github.com/00sapo/OpenEWLD/blob/master/dataset/%5BTraditional%5D/Swing_Low%2C_Sweet_Chariot/Swing_Low%2C_Sweet_Chariot.mxl', notes: [[0, 0, 0.6], [-4, 0.6, 1.2], [0, 1.8, 0.6], [-4, 2.4, 0.9], [-4, 3.3, 0.3], [-7, 3.6, 0.3], [-9, 3.9, 0.9], [-4, 4.8, 0.15]] },
      { title: 'Summertime — George Gershwin', source: 'https://effendi.me/jazz/repo/I/Summertime.xml', notes: [[0, 0, 0.4], [-4, 0.4, 0.4], [0, 0.8, 0.2], [0, 1, 1.8], [-2, 2.8, 0.2], [-4, 3, 0.2], [-2, 3.2, 0.2], [0, 3.4, 0.2]] },
      { title: 'Shoo Fly, Don’t Bother Me', source: 'https://www.mdc.edu/kendall/academic-departments/performing-arts-and-industries/documents/MHL_Interval_Sheet.pdf', notes: [[0, 0, 0.517], [-4, 0.517, 0.517], [-2, 1.034, 0.259], [-4, 1.293, 0.259], [-7, 1.552, 1.034], [0, 2.586, 0.517], [-4, 3.103, 0.517], [-2, 3.621, 0.259]] },
      { title: 'Lose Yourself, introducere — Eminem', source: 'https://hookpad.hooktheory.com/?idOfSong=VMgJkJMDxqK', notes: [[0, 0, 0.44], [-4, 0.44, 0.44], [-7, 0.88, 0.455], [0, 1.335, 0.455], [-2, 1.79, 0.47], [-5, 2.26, 0.47], [-9, 2.73, 0.46], [-2, 3.19, 0.46]] },
      { title: 'Message in a Bottle — The Police', source: 'https://hookpad.hooktheory.com/?idOfSong=nvgyrPkzxkA', notes: [[0, 0, 0.2], [-4, 0.2, 0.205], [-4, 0.405, 0.605], [0, 1.01, 0.195], [-2, 1.205, 0.595], [-4, 2, 0.2], [0, 2.2, 0.2], [-4, 2.4, 0.4]] },
    ],
  },
  5: {
    asc: [
      { title: 'Amazing Grace', source: 'https://www.mdc.edu/kendall/academic-departments/performing-arts-and-industries/documents/MHL_Interval_Sheet.pdf', notes: [[0, 0, 0.588], [5, 0.588, 1.176], [9, 1.765, 0.588], [5, 2.353, 0.588], [9, 2.941, 1.176], [7, 4.118, 0.588], [5, 4.706, 1.176], [2, 5.882, 0.588]] },
      { title: 'Bella Ciao', source: 'https://musetrainer.github.io/library/scores/Bella_Ciao.mxl', notes: [[0, 0, 0.3], [5, 0.3, 0.3], [7, 0.6, 0.3], [8, 0.9, 0.3], [5, 1.2, 0.9], [0, 2.4, 0.3], [5, 2.7, 0.3], [7, 3, 0.3]] },
      { title: 'Dansul ungar nr. 5 — Brahms', source: 'https://musetrainer.github.io/library/scores/Hungarian_Dance_No_5_in_G_Minor.mxl', notes: [[0, 0, 0.692], [5, 0.692, 0.231], [8, 0.923, 0.692], [5, 1.615, 0.231], [4, 1.846, 0.692], [5, 2.538, 0.115], [7, 2.654, 0.115], [5, 2.769, 0.923]] },
      { title: 'Love Me Tender — Elvis Presley', source: 'https://hookpad.hooktheory.com/?idOfSong=VMgJqpYamqK', notes: [[0, 0, 0.38], [5, 0.38, 1.21], [4, 1.96, 0.37], [5, 2.33, 1.2], [7, 3.53, 0.4], [2, 3.93, 0.37], [7, 4.3, 1.93], [5, 6.62, 0.39]] },
      { title: 'Cantina Band — John Williams', source: 'https://hookpad.hooktheory.com/?idOfSong=_NgbnbMDgQA', notes: [[0, 0, 0.125], [5, 0.251, 0.125], [0, 0.501, 0.125], [5, 0.752, 0.125], [0, 1.002, 0.125], [5, 1.128, 0.125], [0, 1.378, 0.125], [-1, 1.629, 0.125]] },
    ],
    desc: [
      { title: 'Eine kleine Nachtmusik — Mozart', source: 'https://hookpad.hooktheory.com/?idOfSong=_NgbbnOOgQA', notes: [[0, 0, 0.48], [-5, 0.715, 0.235], [0, 0.95, 0.45], [-5, 1.63, 0.23], [0, 1.86, 0.225], [-5, 2.085, 0.225], [0, 2.31, 0.23], [4, 2.54, 0.23]] },
      { title: 'Dream Is Collapsing — Hans Zimmer', source: 'https://hookpad.hooktheory.com/?idOfSong=ANmpA-vngyM', notes: [[0, 0, 0.24], [-5, 0.24, 0.24], [0, 0.48, 0.225], [-5, 0.705, 0.225], [0, 0.93, 0.49], [0, 1.42, 0.24], [-5, 1.66, 0.24], [0, 1.9, 0.24]] },
      { title: 'Rock with You — Michael Jackson', source: 'https://hookpad.hooktheory.com/?idOfSong=ZwxKbrAwged', notes: [[0, 0, 0.52], [-5, 0.52, 0.265], [-9, 0.785, 1.05], [-12, 3.94, 0.26], [-2, 4.2, 0.52], [-5, 4.72, 0.53], [-9, 5.25, 0.53], [-12, 5.78, 0.26]] },
      { title: 'Fixing a Hole — The Beatles', source: 'https://hookpad.hooktheory.com/?idOfSong=dPoDnNGXgnM', notes: [[0, 0, 0.28], [-5, 0.28, 0.28], [-5, 0.56, 0.295], [-5, 0.855, 0.595], [-3, 1.75, 0.15], [-2, 1.9, 0.15], [0, 2.05, 0.575], [-2, 2.625, 0.275]] },
      { title: 'West End Blues — Joe «King» Oliver', source: 'https://github.com/00sapo/OpenEWLD/blob/master/dataset/Clarence_Williams-King_Oliver/West_End_Blues/West_End_Blues.mxl', notes: [[0, 0, 0.3], [-5, 0.3, 0.3], [-5, 0.6, 0.3], [0, 0.9, 0.3], [-2, 1.2, 2.7], [-6, 3.9, 0.45], [-5, 4.35, 0.15], [-2, 4.5, 0.15]] },
    ],
  },
  6: {
    asc: [
      { title: 'The Simpsons — Danny Elfman', source: 'https://cascademethod.com/wp-content/uploads/2017/10/255849786-The-Simpsons-Theme-Piano-1.pdf', notes: [[0, 0, 0.345], [6, 0.345, 0.69], [7, 1.034, 0.69], [-12, 1.724, 0.172], [6, 1.897, 0.172], [6, 2.069, 0.172], [-6, 2.241, 0.172], [6, 2.586, 0.172]] },
      { title: 'Maria — West Side Story', source: 'https://www.mdc.edu/kendall/academic-departments/performing-arts-and-industries/documents/MHL_Interval_Sheet.pdf', notes: [[0, 0, 0.566], [6, 0.566, 0.566], [7, 1.132, 1.132], [0, 2.264, 0.566], [6, 2.83, 0.566], [7, 3.396, 1.132]] },
      { title: 'Take Me with U — Prince', source: 'https://hookpad.hooktheory.com/?idOfSong=ROmNvwlpmNw', notes: [[0, 0, 0.244], [6, 0.244, 0.244], [7, 0.489, 0.244], [11, 0.733, 0.244], [0, 0.977, 0.244], [6, 1.222, 0.244], [7, 1.466, 0.244], [11, 1.71, 0.244]] },
      { title: 'Halloween — Helloween', source: 'https://hookpad.hooktheory.com/?idOfSong=dZbgOdGkxnY', notes: [[0, 0, 0.38], [6, 0.38, 0.38], [7, 0.76, 0.35], [6, 1.11, 0.35], [0, 1.46, 0.385], [6, 1.845, 0.385], [7, 2.23, 0.38], [6, 2.61, 0.38]] },
      { title: 'Drowning — A Boogie wit da Hoodie', source: 'https://hookpad.hooktheory.com/?idOfSong=YAg-PjKamle', notes: [[0, 0, 0.232], [6, 0.232, 0.48], [5, 0.713, 0.48], [3, 1.867, 0.225], [5, 2.092, 0.235], [3, 2.327, 0.47], [1, 3.737, 0.235], [5, 3.973, 0.46]] },
    ],
    desc: [
      { title: 'YYZ — Rush', source: 'https://hookpad.hooktheory.com/?idOfSong=zngRKDDDxJj', notes: [[0, 0, 0.295], [-6, 0.295, 0.147], [0, 0.442, 0.287], [0, 0.73, 0.28], [0, 1.01, 0.285], [-6, 1.295, 0.145], [0, 1.44, 0.29], [0, 1.73, 0.29]] },
      { title: 'I Love You — Billie Eilish', source: 'https://hookpad.hooktheory.com/?idOfSong=QLgnXrdEo-V', notes: [[0, 0, 0.425], [-6, 0.425, 0.213], [-2, 0.638, 0.212], [5, 0.85, 0.435], [-6, 1.285, 0.217], [-2, 1.502, 0.218], [0, 1.72, 0.43], [-6, 2.15, 0.215]] },
      { title: 'Fire on High — Electric Light Orchestra', source: 'https://hookpad.hooktheory.com/?idOfSong=d_gwkb-VgGV', notes: [[0, 0, 0.77], [-6, 0.77, 0.74], [-3, 1.51, 0.74], [-6, 2.25, 0.76], [0, 3.01, 0.8], [-6, 3.81, 0.74], [-3, 4.55, 0.78], [-6, 5.33, 0.71]] },
      { title: 'Choke — I Don’t Know How But They Found Me', source: 'https://hookpad.hooktheory.com/?idOfSong=kygz-EqrmKB', notes: [[0, 0, 0.52], [-6, 1.02, 0.49], [-8, 1.765, 0.255], [-6, 2.02, 0.49], [-3, 2.51, 0.49], [1, 3, 0.255], [2, 3.255, 0.51], [1, 3.765, 1.255]] },
      { title: 'A Smooth One — Benny Goodman', source: 'https://effendi.me/jazz/repo/I/A%20smooth%20One.xml', notes: [[0, 0, 0.312], [-6, 0.312, 0.938], [-9, 1.25, 0.312], [-7, 1.562, 0.312], [-9, 1.875, 0.312], [-12, 2.188, 0.312], [-9, 2.5, 0.312], [-5, 2.812, 0.938]] },
    ],
  },
  7: {
    asc: [
      { title: 'Also sprach Zarathustra — Richard Strauss', source: 'https://www.mdc.edu/kendall/academic-departments/performing-arts-and-industries/documents/MHL_Interval_Sheet.pdf', notes: [[0, 0, 1.429], [7, 1.429, 1.429], [12, 2.857, 2.143], [12, 5.714, 1.429], [7, 7.143, 1.429], [12, 8.571, 2.143]] },
      { title: 'Maple Leaf Rag — Scott Joplin', source: 'https://musetrainer.github.io/library/scores/Maple_Leaf_Rag_Scott_Joplin.mxl', notes: [[0, 0, 0.15], [7, 0.15, 0.15], [0, 0.3, 0.15], [4, 0.45, 0.15], [7, 0.6, 0.3], [-1, 0.9, 0.15], [7, 1.05, 0.15], [-1, 1.2, 0.15]] },
      { title: 'Suita pentru violoncel nr. 1, Preludiu — Bach', source: 'https://hookpad.hooktheory.com/?idOfSong=Dpgv-KpDmad', notes: [[0, 0, 0.204], [7, 0.204, 0.204], [16, 0.409, 0.204], [14, 0.613, 0.204], [16, 0.818, 0.204], [7, 1.022, 0.204], [16, 1.226, 0.204], [7, 1.431, 0.204]] },
      { title: 'Every Breath You Take — The Police', source: 'https://hookpad.hooktheory.com/?idOfSong=d_gwWR_NgGV', notes: [[0, 0, 0.25], [7, 0.25, 0.25], [14, 0.5, 0.26], [7, 0.76, 0.26], [16, 1.02, 0.25], [14, 1.27, 0.25], [7, 1.52, 0.26], [14, 1.78, 0.26]] },
      { title: 'In the End — Linkin Park', source: 'https://hookpad.hooktheory.com/?idOfSong=ANmpAMW-gyM', notes: [[0, 0, 0.558], [7, 0.558, 0.558], [7, 1.117, 0.558], [3, 1.675, 0.558], [2, 2.234, 0.558], [2, 2.792, 0.558], [2, 3.351, 0.558], [2, 3.909, 0.279]] },
    ],
    desc: [
      { title: 'Menuet în Sol — Christian Petzold', source: 'https://musetrainer.github.io/library/scores/Bach_Minuet_in_G_Major_BWV_Anh._114.mxl', notes: [[0, 0, 0.476], [-7, 0.476, 0.238], [-5, 0.714, 0.238], [-3, 0.952, 0.238], [-2, 1.19, 0.238], [0, 1.429, 0.476], [-7, 1.905, 0.476], [-7, 2.381, 0.476]] },
      { title: 'Lacul lebedelor, Scène — Ceaikovski', source: 'https://musetrainer.github.io/library/scores/Swan_Lake.mxl', notes: [[0, 0, 1.2], [-7, 1.2, 0.3], [-5, 1.5, 0.3], [-4, 1.8, 0.3], [-2, 2.1, 0.3], [0, 2.4, 0.9], [-4, 3.3, 0.3], [0, 3.6, 0.9]] },
      { title: 'Game of Thrones — Ramin Djawadi', source: 'https://hookpad.hooktheory.com/?idOfSong=RzojXLRAgDe', notes: [[0, 0, 0.353], [-7, 0.353, 0.353], [-4, 0.706, 0.177], [-2, 0.883, 0.177], [0, 1.059, 0.353], [-7, 1.413, 0.353], [-4, 1.766, 0.177], [-2, 1.942, 0.177]] },
      { title: 'Set Fire to the Rain — Adele', source: 'https://hookpad.hooktheory.com/?idOfSong=veoYvyYamdn', notes: [[0, 0, 0.275], [-7, 0.275, 0.275], [-4, 0.55, 0.27], [-7, 0.82, 0.27], [0, 1.09, 0.285], [-7, 1.375, 0.285], [-4, 1.66, 0.28], [0, 1.94, 0.28]] },
      { title: 'Hey You — Pink Floyd', source: 'https://hookpad.hooktheory.com/?idOfSong=_NgbPavDoQA', notes: [[0, 0, 0.27], [-7, 0.27, 0.27], [-2, 0.54, 0.265], [1, 0.805, 0.265], [-2, 1.07, 0.27], [-11, 1.34, 0.27], [-7, 1.61, 0.275], [-11, 1.885, 0.275]] },
    ],
  },
  8: {
    asc: [
      { title: 'Manhã de Carnaval — Luiz Bonfá', source: 'https://www.swiss-jazz.ch/musique-bresilienne/ManhaCarnaval.pdf', notes: [[0, 0, 0.577], [8, 0.577, 1.731], [7, 2.5, 0.192], [5, 2.692, 0.192], [5, 2.885, 1.154], [5, 4.038, 0.192], [4, 4.231, 0.192], [7, 4.423, 0.192]] },
      { title: 'In My Life — The Beatles', source: 'https://hookpad.hooktheory.com/?idOfSong=ZbgORJGkmnY', notes: [[0, 0, 0.61], [8, 0.61, 0.61], [0, 1.22, 0.295], [1, 1.515, 0.295], [3, 1.81, 0.27], [7, 2.08, 2.52], [0, 4.6, 0.59], [8, 5.19, 0.58]] },
      { title: 'High Speed — Coldplay', source: 'https://hookpad.hooktheory.com/?idOfSong=ANmpWAjOoyM', notes: [[0, 0, 0.78], [8, 0.78, 0.395], [8, 1.175, 0.395], [7, 1.57, 0.38], [7, 1.95, 0.38], [5, 2.33, 0.385], [5, 2.715, 0.385], [2, 3.1, 0.77]] },
      { title: 'Bei mir bistu shein — Sholom Secunda', source: 'https://effendi.me/jazz/repo/III/BeiMir.xml', notes: [[0, 0, 0.36], [8, 0.36, 0.48], [7, 0.84, 0.18], [5, 1.02, 0.18], [8, 1.2, 0.6], [0, 1.92, 0.36], [8, 2.28, 0.48], [7, 2.76, 0.12]] },
      { title: 'Recado Bossa Nova — Djalma Ferreira', source: 'https://effendi.me/jazz/repo/II/Recado%20Bossa%20Nova.xml', notes: [[0, 0, 0.24], [8, 0.72, 0.12], [7, 0.84, 0.12], [7, 1.32, 0.12], [3, 1.56, 0.12], [0, 1.8, 0.12], [-1, 1.92, 0.24], [8, 2.64, 0.12]] },
    ],
    desc: [
      { title: 'Under the Bridge, introducere — Red Hot Chili Peppers', source: 'https://hookpad.hooktheory.com/?idOfSong=yvmrXNNaxOW', notes: [[0, 0, 0.445], [-8, 0.445, 0.445], [-5, 0.89, 0.425], [-8, 1.315, 0.212], [0, 1.527, 0.438], [-5, 1.965, 0.675], [-13, 2.64, 0.22], [-15, 2.86, 0.22]] },
      { title: 'Dust in the Wind, introducere — Kansas', source: 'https://hookpad.hooktheory.com/?idOfSong=VMgJnnODgqK', notes: [[0, 0, 0.33], [-8, 0.33, 0.165], [-5, 0.495, 0.165], [-12, 0.66, 0.163], [0, 0.823, 0.162], [-8, 0.985, 0.162], [-5, 1.147, 0.163], [-1, 1.31, 0.31]] },
      { title: 'Blue (Da Ba Dee), introducere — Eiffel 65', source: 'https://hookpad.hooktheory.com/?idOfSong=WeglG_XJmrY', notes: [[0, 0, 0.23], [-8, 0.23, 0.23], [-3, 0.46, 0.24], [0, 0.7, 0.24], [2, 0.94, 0.23], [-5, 1.17, 0.23], [-1, 1.4, 0.23], [0, 1.63, 0.47]] },
      { title: 'Flying Home — Lionel Hampton', source: 'https://effendi.me/jazz/repo/IV_Part-1/FlyingHome.xml', notes: [[0, 0, 0.6], [-8, 0.75, 0.15], [-6, 0.9, 0.15], [-3, 1.05, 0.15], [0, 1.2, 0.15], [-1, 1.35, 0.15], [-3, 1.5, 0.15], [-5, 1.65, 0.15]] },
      { title: 'Hungarian Sonata — Richard Clayderman', source: 'https://musetrainer.github.io/library/scores/Hungarian_Sonata.mxl', notes: [[0, 0, 0.231], [-8, 0.231, 0.231], [-1, 0.462, 0.231], [-10, 0.692, 0.231], [-3, 0.923, 0.231], [-12, 1.154, 0.231], [-5, 1.385, 0.231], [-13, 1.615, 0.231]] },
    ],
  },
  9: {
    asc: [
      { title: 'My Bonnie Lies Over the Ocean', source: 'https://www.mdc.edu/kendall/academic-departments/performing-arts-and-industries/documents/MHL_Interval_Sheet.pdf', notes: [[0, 0, 0.455], [9, 0.455, 0.455], [7, 0.909, 0.455], [5, 1.364, 0.455], [7, 1.818, 0.455], [5, 2.273, 0.455], [2, 2.727, 0.909], [0, 3.636, 0.455]] },
      { title: 'Nocturna op. 9 nr. 2 — Chopin', source: 'https://musetrainer.github.io/library/scores/Chopin_-_Nocturne_Op_9_No_2_E_Flat_Major.mxl', notes: [[0, 0, 0.5], [9, 0.5, 2], [7, 2.5, 0.5], [9, 3, 0.5], [7, 3.5, 1.5], [5, 5, 1], [0, 6, 0.5], [9, 6.5, 1]] },
      { title: 'Jingle Bells, strofă — James Lord Pierpont', source: 'https://github.com/00sapo/OpenEWLD/blob/master/dataset/James_Pierpont/Jingle_Bells/Jingle_Bells.mxl', notes: [[0, 0, 0.6], [9, 0.6, 0.6], [7, 1.2, 0.6], [5, 1.8, 0.6], [0, 2.4, 1.2], [0, 4.2, 0.3], [0, 4.5, 0.3], [0, 4.8, 0.6]] },
      { title: 'Eh, Eh (Nothing Else I Can Say) — Lady Gaga', source: 'https://hookpad.hooktheory.com/?idOfSong=zngRAMnBmJj', notes: [[0, 0, 0.319], [9, 0.319, 0.319], [7, 0.639, 0.319], [9, 0.958, 0.319], [0, 1.277, 0.319], [7, 1.597, 0.319], [5, 1.916, 0.319], [7, 2.236, 0.319]] },
      { title: 'Run Away with Me, introducere — Carly Rae Jepsen', source: 'https://hookpad.hooktheory.com/?idOfSong=JNgqRqZWxrz', notes: [[0, 0, 1.497], [9, 1.497, 0.166], [4, 1.663, 0.166], [7, 1.83, 1.663], [9, 3.493, 0.166], [4, 3.66, 0.166], [2, 3.826, 1.663], [0, 5.49, 0.166]] },
    ],
    desc: [
      { title: 'The Music of the Night — Andrew Lloyd Webber', source: 'https://hookpad.hooktheory.com/?idOfSong=JNgq_jErorz', notes: [[0, 0, 1.07], [-9, 1.07, 0.99], [-2, 2.06, 1.05], [-9, 3.11, 1.05], [-4, 4.16, 0.525], [-2, 4.685, 0.525], [0, 5.21, 0.495], [1, 5.705, 0.495]] },
      { title: 'No Surprises — Radiohead', source: 'https://hookpad.hooktheory.com/?idOfSong=LAgQEPpJgyO', notes: [[0, 0, 0.41], [-9, 0.41, 0.41], [-4, 0.82, 0.425], [-9, 1.245, 0.425], [0, 1.67, 0.395], [-9, 2.065, 0.395], [-4, 2.46, 0.4], [-9, 2.86, 0.4]] },
      { title: 'Always Be My Baby — Mariah Carey', source: 'https://hookpad.hooktheory.com/?idOfSong=ZwxKNnyVged', notes: [[0, 0, 0.19], [-9, 0.19, 0.19], [0, 0.38, 0.19], [-4, 0.57, 0.19], [-4, 0.76, 0.38], [-9, 1.14, 0.19], [-9, 1.33, 0.19], [-4, 1.52, 0.195]] },
      { title: 'Over There — George M. Cohan', source: 'https://github.com/00sapo/OpenEWLD/blob/master/dataset/George_M._Cohan/Over_There/Over_There.mxl', notes: [[0, 0, 0.3], [-9, 0.3, 0.3], [-4, 0.6, 1.8], [0, 2.4, 0.3], [-9, 2.7, 0.3], [-4, 3, 1.8], [0, 4.8, 0.3], [-9, 5.1, 0.3]] },
      { title: 'Preludiu BWV 847 — Bach', source: 'https://musetrainer.github.io/library/scores/Prelude_No._2_BWV_847_in_C_Minor.mxl', notes: [[0, 0, 0.103], [-9, 0.103, 0.103], [-10, 0.207, 0.103], [-9, 0.31, 0.103], [-12, 0.414, 0.103], [-9, 0.517, 0.103], [-10, 0.621, 0.103], [-9, 0.724, 0.103]] },
    ],
  },
  10: {
    asc: [
      { title: 'Star Trek, tema originală — Alexander Courage', source: 'https://hookpad.hooktheory.com/?idOfSong=ANmp_QNqoyM', notes: [[0, 0, 0.75], [10, 0.75, 1.1], [9, 1.85, 0.37], [7, 2.22, 0.293], [5, 2.513, 0.282], [4, 2.795, 0.185], [3, 2.98, 2.63], [1, 5.61, 0.38]] },
      { title: 'Crawling — Linkin Park', source: 'https://hookpad.hooktheory.com/?idOfSong=QLgnXBlpo-V', notes: [[0, 0, 0.295], [10, 0.295, 0.85], [7, 1.145, 1.42], [5, 2.565, 0.58], [3, 3.145, 0.285], [2, 3.43, 0.57], [3, 4, 0.57], [0, 4.57, 0.285]] },
      { title: 'She Came In Through the Bathroom Window — The Beatles', source: 'https://hookpad.hooktheory.com/?idOfSong=AaoGBBWlxeQ', notes: [[0, 0, 0.19], [10, 0.19, 0.183], [9, 0.373, 0.365], [9, 0.738, 0.558], [7, 1.295, 0.188], [7, 1.483, 0.37], [2, 1.853, 0.365], [3, 2.218, 0.183]] },
      { title: 'Tom Sawyer — Rush', source: 'https://hookpad.hooktheory.com/?idOfSong=RzojXYvkgDe', notes: [[0, 0, 0.175], [10, 0.175, 0.175], [10, 0.35, 0.175], [10, 0.525, 0.35], [10, 0.875, 0.172], [10, 1.047, 0.172], [10, 1.22, 0.345], [10, 1.565, 0.34]] },
      { title: 'La cumparsita — Gerardo Matos Rodríguez', source: 'https://github.com/00sapo/OpenEWLD/blob/master/dataset/Enrique_P._Maroni-Gerardo_Matos_Rodr%C3%ADguez-Pascual_Contursi/La_cumparsita/La_cumparsita.mxl', notes: [[0, 0, 0.6], [10, 0.6, 0.6], [7, 1.2, 0.6], [4, 1.8, 0.6], [0, 2.7, 0.3], [1, 3, 0.3], [0, 3.3, 0.3], [-1, 3.6, 0.6]] },
    ],
    desc: [
      { title: 'Watermelon Man — Herbie Hancock', source: 'https://effendi.me/jazz/repo/I/Watermelon%20Man.xml', notes: [[0, 0, 3.125], [-10, 3.125, 0.312], [-10, 3.438, 0.312], [-3, 3.75, 0.312], [-1, 4.062, 0.625], [-10, 4.688, 5.312], [2, 10, 3.125], [-10, 13.125, 0.312]] },
      { title: 'Million Dollar Man — Lana Del Rey', source: 'https://hookpad.hooktheory.com/?idOfSong=DnZgWdzrxry', notes: [[0, 0, 1.24], [-10, 1.24, 0.295], [0, 1.535, 0.295], [-1, 1.83, 0.895], [-3, 3.02, 0.315], [-5, 3.335, 0.315], [-2, 3.65, 0.59], [-7, 4.24, 0.62]] },
      { title: 'Le temps des cathédrales — Notre-Dame de Paris', source: 'https://hookpad.hooktheory.com/?idOfSong=VMgJRDaygqK', notes: [[0, 0, 1.621], [-10, 1.824, 0.203], [-3, 2.027, 0.203], [-3, 2.229, 0.203], [-3, 2.432, 0.405], [-5, 2.837, 0.203], [-3, 3.04, 0.203], [-1, 3.243, 0.203]] },
      { title: 'Ordinary World, solo de chitară — Duran Duran', source: 'https://hookpad.hooktheory.com/?idOfSong=ROmNnAvzmNw', notes: [[0, 0, 0.214], [-10, 0.214, 0.214], [-15, 0.428, 0.214], [-10, 0.642, 0.214], [-1, 0.856, 0.214], [-8, 1.07, 0.214], [-15, 1.284, 0.214], [-8, 1.498, 0.214]] },
      { title: 'How Am I to Know? — Jack King', source: 'https://github.com/00sapo/OpenEWLD/blob/master/dataset/Dorothy_Parker-Jack_King/How_Am_I_to_Know%3F/How_Am_I_to_Know%3F.mxl', notes: [[0, 0, 3.6], [-10, 3.6, 0.3], [-7, 3.9, 0.3], [-4, 4.2, 0.3], [0, 4.5, 0.3], [0, 4.8, 3.6], [-11, 8.4, 0.3], [-8, 8.7, 0.3]] },
    ],
  },
  11: {
    asc: [
      { title: 'Take On Me, refren — a-ha', source: 'https://hookpad.hooktheory.com/?idOfSong=bWgMQJ-zglX', notes: [[0, 0, 1.43], [11, 1.43, 1.42], [12, 2.85, 1.42], [19, 4.27, 0.35], [21, 4.8, 0.53], [19, 5.33, 0.36], [12, 5.69, 1.42], [19, 7.11, 1.245]] },
      { title: 'Don’t Know Why — Norah Jones', source: 'https://hookpad.hooktheory.com/?idOfSong=yvgPONQKmYq', notes: [[0, 0, 1.35], [11, 1.35, 0.335], [7, 1.685, 0.335], [4, 2.02, 0.68], [4, 2.7, 0.685], [5, 3.385, 0.17], [4, 3.555, 0.34], [0, 3.895, 0.17]] },
      { title: 'Stay Home — American Football', source: 'https://hookpad.hooktheory.com/?idOfSong=JkmZqKBJoqn', notes: [[0, 0, 0.255], [11, 0.255, 0.255], [4, 0.511, 0.255], [12, 0.766, 0.255], [0, 1.022, 0.255], [11, 1.277, 0.255], [4, 1.533, 0.255], [12, 1.788, 0.255]] },
      { title: 'Cheeseburger Family — Jack Stauber', source: 'https://hookpad.hooktheory.com/?idOfSong=AaoGyABzgeQ', notes: [[0, 0, 0.78], [11, 1.15, 0.205], [9, 1.355, 0.4], [7, 1.755, 0.405], [6, 2.16, 0.4], [7, 2.56, 0.19], [6, 2.75, 0.205], [7, 2.955, 0.205]] },
      { title: 'Omen — The Prodigy', source: 'https://hookpad.hooktheory.com/?idOfSong=RzojzEGjoDe', notes: [[0, 0, 0.43], [11, 0.645, 0.215], [12, 0.86, 0.215], [11, 1.075, 0.215], [12, 1.29, 0.215], [11, 1.505, 0.215], [3, 1.72, 0.43], [2, 2.36, 0.21]] },
    ],
    desc: [
      { title: 'I Love You — Cole Porter', source: 'https://www.pianolessonsnj.com/uploads/1/8/6/8/18685284/real_book_6th_ed.pdf#page=189', notes: [[0, 0, 1], [-11, 1, 2], [-2, 3, 0.75], [-3, 3.75, 0.25], [-4, 4, 0.75], [-3, 4.75, 0.25], [-3, 5, 2]] },
      { title: 'Baba Iaga — Musorgski', source: 'https://classicalmidi.co.uk/507mouss4.mid', notes: [[0, 0, 0.05], [-11, 0.494, 0.283], [0, 1.796, 0.081], [0, 2.01, 0.075], [-11, 2.208, 0.281], [-1, 3.573, 0.06], [-10, 4.025, 0.129], [-11, 4.258, 0.065]] },
    ],
  },
  12: {
    asc: [
      { title: 'Over the Rainbow — Judy Garland', source: 'https://hookpad.hooktheory.com/?idOfSong=ANmprPQnxyM', notes: [[0, 0, 1.371], [12, 1.371, 1.371], [11, 2.743, 0.686], [7, 3.429, 0.343], [9, 3.771, 0.343], [11, 4.114, 0.686], [12, 4.8, 1.029], [0, 6.171, 0.686]] },
      { title: 'Preludiul op. 28 nr. 4 — Chopin', source: 'https://musetrainer.github.io/library/scores/Prlude_Opus_28_No._4_in_E_Minor__Chopin.mxl', notes: [[0, 0, 1.071], [12, 1.071, 0.357], [12, 1.429, 4.286], [13, 5.714, 1.429], [12, 7.143, 4.286], [13, 11.429, 1.429], [12, 12.857, 4.286], [13, 17.143, 1.429]] },
      { title: 'Schindler’s List, repriza pentru pian — John Williams', source: 'https://hookpad.hooktheory.com/?idOfSong=nvgyQELOgkA', notes: [[0, 0, 3.177], [12, 3.177, 0.53], [5, 3.707, 0.53], [12, 4.236, 0.53], [5, 4.766, 0.53], [13, 5.295, 0.53], [12, 5.825, 0.53], [8, 6.355, 0.53]] },
      { title: 'Don’t Tell Me — Madonna', source: 'https://hookpad.hooktheory.com/?idOfSong=kygzpbKzoKB', notes: [[0, 0, 0.3], [12, 0.3, 0.15], [14, 0.45, 0.15], [16, 0.6, 0.155], [12, 0.755, 0.155], [7, 0.91, 0.31], [-5, 1.22, 0.3], [2, 1.52, 0.15]] },
      { title: 'Passacaglia — Händel / Halvorsen', source: 'https://musetrainer.github.io/library/scores/Passacaglia.mxl', notes: [[0, 0, 0.231], [12, 0.231, 0.231], [11, 0.462, 0.231], [12, 0.692, 0.231], [9, 0.923, 0.231], [12, 1.154, 0.231], [7, 1.385, 0.231], [12, 1.615, 0.231]] },
    ],
    desc: [
      { title: 'Separate Ways (Worlds Apart) — Journey', source: 'https://hookpad.hooktheory.com/?idOfSong=ANmpWPjdoyM', notes: [[0, 0, 0.225], [-12, 0.225, 0.225], [-5, 0.45, 0.23], [-12, 0.68, 0.23], [2, 0.91, 0.22], [-12, 1.13, 0.22], [-5, 1.35, 0.225], [-12, 1.575, 0.225]] },
      { title: 'The Diary of Horace Wimp — Electric Light Orchestra', source: 'https://hookpad.hooktheory.com/?idOfSong=JkmZBbEPmqn', notes: [[0, 0, 0.35], [-12, 0.35, 0.35], [-12, 0.7, 0.34], [-12, 1.04, 0.35], [0, 1.39, 0.36], [-12, 1.75, 0.35], [-12, 2.1, 0.33], [-12, 2.43, 0.35]] },
      { title: 'Robbery — Juice WRLD', source: 'https://hookpad.hooktheory.com/?idOfSong=Rzoj_LlLmDe', notes: [[0, 0, 0.38], [-12, 0.38, 0.56], [-5, 0.94, 0.36], [-7, 1.3, 0.565], [5, 1.865, 0.128], [7, 1.993, 0.257], [3, 2.25, 0.75], [3, 3, 0.385]] },
      { title: 'Ring in the Season — Frozen', source: 'https://hookpad.hooktheory.com/?idOfSong=nJmBBed_mAV', notes: [[0, 0, 0.21], [-12, 0.21, 0.21], [0, 0.42, 0.205], [-12, 0.625, 0.205], [-7, 0.83, 0.108], [-8, 0.938, 0.107], [-10, 1.045, 0.215], [-5, 1.26, 0.215]] },
      { title: 'Pass the Peas — The J.B.’s', source: 'https://effendi.me/jazz/repo/I/Pass%20the%20Peas.xml', notes: [[0, 0, 0.312], [-12, 2.5, 0.156], [-9, 2.656, 0.156], [-9, 2.969, 0.469], [-7, 3.438, 0.156], [-5, 3.594, 0.156], [-5, 3.906, 0.469], [-2, 4.375, 0.156]] },
    ],
  },
} as const;
