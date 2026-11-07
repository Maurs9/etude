'use strict';
// Seeds the incomplete German file from the existing hand-authored dictionary.
// It must not overwrite translation work.
const fs = require('node:fs');
const path = require('node:path');
const output = path.join(__dirname, 'de.json');
if (fs.existsSync(output)) throw new Error('Refusing to overwrite de.json');
const existing = require('../../i18n-extra.js').de;
const lesson = {
  t:'Die Klaviatur und die Notennamen',
  b:`
<p>In der Musik gibt es nur <b>12 verschiedene Töne</b>. Nach dem zwölften beginnt das Muster von vorn – derselbe Ton erklingt höher. Dieser Abstand heißt <b>Oktave</b>; auf dem Klavier wiederholt sich das Muster aus 12 Tasten immer wieder.</p>
<p>Die weißen Tasten heißen <b>C D E F G A B</b> (Do Re Mi Fa Sol La Si). Dabei bezeichnet B in der internationalen Schreibweise den Ton H; das deutsche B entspricht B♭. Die schwarzen Tasten liegen dazwischen und leiten ihre Namen davon ab: Die schwarze Taste über C heißt <b>C♯</b> („Cis“); von D aus betrachtet heißt dieselbe Taste <b>D♭</b> („Des“). Eine Taste, zwei Namen – das nennt man <i>enharmonische</i> Schreibweise.</p>
<div class="demo-row"><button class="demo" data-demo="n:60">Mittleres C</button><button class="demo" data-demo="n:61">C♯ / D♭</button><button class="demo" data-demo="iv:60:12">Eine Oktave: C bis C</button></div>
<h4>Halbton- und Ganztonschritte</h4>
<p>Von einer Taste zur nächsten benachbarten Taste (schwarz oder weiß) ist es ein <b>Halbtonschritt</b> – der kleinste Abstand, den wir verwenden. Zwei Halbtonschritte ergeben einen <b>Ganztonschritt</b>. Zwischen <b>E–F</b> und <b>H–C</b> liegt keine schwarze Taste: Das sind natürliche Halbtonschritte, die jeder Tonleiter ihre Gestalt geben.</p>
<div class="demo-row"><button class="demo" data-demo="iv:64:1">Halbton: E→F</button><button class="demo" data-demo="iv:60:2">Ganzton: C→D</button></div>
<p class="learn-note">So findest du jedes C: Suche die Gruppe aus zwei schwarzen Tasten – C ist die weiße Taste unmittelbar links davon. Das mittlere C (C4) liegt nahe der Mitte des Klaviers.</p>`
};
fs.writeFileSync(output, JSON.stringify({strings:existing, lessons:{keys:lesson}}, null, 2)+'\n');
console.log('Seeded incomplete de.json.');
