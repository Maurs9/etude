# MusicXML regression fixture

`fur-elise-beethoven.mxl` is the original compressed MusicXML file used to reproduce the reported import differences, without rewriting its notation. It contains Beethoven's *Für Elise*, exported by MuseScore 3.6.0; its own identification/source and encoding metadata are preserved inside the archive.

The regression tests cover its three source pages, eighteen systems, 202 visible rests, mixed-style title, two-line composer credit and missing second-ending closure before the new forward repeat in measure 10. Synthetic fixtures in `app.spec.mjs` additionally cover valid multi-measure endings, hidden rests, dotted rests and scores without layout metadata.
