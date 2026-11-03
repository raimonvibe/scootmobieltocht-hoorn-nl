// All user-facing text of this Dutch website, in one place. Visitors who want another language use their
// browser's translation (Google/Chrome/Safari); the page is built so that this works cleanly.

const LOCALE = { nl: "nl-NL" };

const OSM = '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const OFM = '<a href="https://openfreemap.org/">OpenFreeMap</a>';
const OMT = '<a href="https://www.openmaptiles.org/">OpenMapTiles</a>';
const OMETEO = '<a href="https://open-meteo.com/">Open-Meteo</a>';
const MLIB = '<a href="https://maplibre.org/">MapLibre</a>';
const DATE = '<span id="dataDate"></span>';

const D = {
  nl: {
    skip: "Naar de routeplanner", "panel.aria": "Routeplanner",
    "sheet.less": "Paneel kleiner, meer kaart", "sheet.more": "Paneel groter",
    "sheet.peek": "Paneel is klein. Tik voor groter.", "sheet.half": "Paneel is half open. Tik voor groter.", "sheet.full": "Paneel is helemaal open. Tik voor kleiner.",
    "summary.empty": "Plan je route",
    "help.btn": "Hulp nodig?", "help.aria": "Hulp: hoe werkt het?",
    sub: 'Routes over fietspaden en rustige straten in<span translate="no" lang="nl"> Hoorn </span>en omgeving. Zonder trappen, onverhard alleen als het moet.',
    "style.label": "Stijl van de kaart", "style.liberty": "Kleur (3D)", "style.bright": "Heldere kleuren (3D)", "style.positron": "Licht (3D)", "style.dark": "Donker (3D)", "style.fiord": "Fjord, donker (3D)", "style.liberty2d": "Kleur (2D, plat)",
    "lang.label": "Taal",
    offline: "Je bent offline. Routes plannen werkt gewoon. De kaart kan stukken missen; het weer is van je laatste keer online.",
    "stops.legend": "Waar wil je heen?", locate: "Vanaf mijn locatie", locating: "Locatie zoeken…", addVia: "Tussenstop toevoegen", swap: "Route omdraaien", "swap.aria": "Van en naar omwisselen",
    "stops.hint": "Kies een plaats of wijk, of tik op de kaart om een punt te zetten.",
    "stop.from": "Vertrekpunt", "stop.to": "Bestemming", "stop.via": "Tussenstop {n}", "stop.change": "{label}: {value}. Tik om te wijzigen.", "stop.remove": "Verwijder {label}",
    "result.title": "Jouw route", "stat.dist": "afstand", "stat.time": "rijtijd", "stat.arrive": "aankomsttijd", "stat.back": "weer thuis om",
    speak: "Voorlezen", "speak.stop": "Stoppen met voorlezen", toilet: "Toilet onderweg", share: "Deel route", more: "Meer over deze route",
    follow: "Volg route", "follow.stop": "Stoppen", save: "Bewaar", saved: "Bewaard", "steps.title": "Routebeschrijving",
    "result.hint": "Kon je ergens niet langs? Tik op dat stuk van de route en kies \"Vermijd dit stuk\".",
    "vehicle.legend": "Mijn scootmobiel", "vehicle.label": "Soort scootmobiel", "vehicle.klein": "Klein / stoepmodel (6 km/u)", "vehicle.middel": "Middel (12 km/u)", "vehicle.groot": "Groot (15 km/u)",
    "profile.label": "Soort route", "profile.rustig": "Rustige route (fietspaden)", "profile.kortst": "Kortste route",
    retour: "Ik rij ook weer terug", "retour.loop": "Dit is al een rondje",
    moreSettings: "Meer instellingen", avoid: "Vermijd hekjes, klaphekken en hoge stoepranden",
    "voice.label": "Voorleesstem", "voice.female": "Vrouw", "voice.male": "Man",
    "presets.legend": "Rondritten", "saved.legend": "Mijn routes", recent: "Recent", "layers.legend": "Op de kaart",
    "status.loading": "Kaart en wegennet laden…",
    "footer.check": "Controleer de route ter plekke; de kaart kan afwijken van de werkelijkheid.",
    sources: "Bronnen en dank",
    "sources.text": `Met dank aan: de vrijwilligers van ${OSM} voor de wegen en plekken (© OpenStreetMap-bijdragers${DATE}), ${OFM} en ${OMT} voor de kaartbeelden, ${OMETEO} voor het weerbericht en ${MLIB} voor het tekenen van de kaart. Dit zijn de namen van gratis, open diensten.`,
    "data.updated": ", bijgewerkt {date}", code: "Bekijk de code!", madeBy: "Site ontwikkeld door",
    "loading.text": "De kaart en het wegennet worden geladen…", "loading.sub": "Bij je eerste bezoek kan dit een paar seconden duren.", "loading.retry": "Opnieuw proberen",
    "loading.fail": "Het laden is niet gelukt. Probeer het opnieuw.", "loading.offline": "Je bent offline. Maak verbinding met internet en probeer het opnieuw.", "status.loadfail": "Het wegennet kon niet geladen worden.",
    "map.aria": "Kaart van Hoorn en omgeving", "map.overview": "Hele route", "map.overview.aria": "Toon de hele route",
    nomap: "De kaart kan in deze browser niet getekend worden (geen WebGL). De routeplanner en routebeschrijving werken wel.",
    "picker.close": "Sluiten zonder te kiezen", "picker.search": "Zoek een plaats of wijk", "picker.from": "Waar vertrek je?", "picker.to": "Waar wil je heen?",
    "picker.here": "Mijn locatie", "picker.hereSub": "Start waar je nu bent", "picker.centre": "centrum", "picker.village": "dorp", "picker.wijk": "wijk", "picker.hamlet": "buurtschap",
    "picker.none": "Niets gevonden voor \"{q}\". Probeer een deel van de naam, of tik op de kaart.",
    "picker.count": { one: "{n} resultaat", other: "{n} resultaten" },
    "help.title": "Hoe werkt het?", "help.closeAria": "Uitleg sluiten", "help.close": "Sluiten",
    "help.plan": "Een route plannen",
    "help.plan.p1": "Tik bij <strong>Vertrekpunt</strong> en <strong>Bestemming</strong> en kies een plaats of wijk. Je kunt ook typen om te zoeken. Of tik op de kaart om een punt te zetten. De route verschijnt meteen.",
    "help.plan.p2": "Met <strong>Vanaf mijn locatie</strong> begint de route waar je nu bent.",
    "help.plan.p3": "Op de telefoon schuift het paneel over de kaart. Met de pijltjes bovenaan maak je het groter of kleiner. <strong>Hele route</strong> op de kaart laat de hele route zien.",
    "help.colors": "De kleuren van de route",
    "help.c0": "Fietspad: rustig en meestal breed", "help.c2": "Woonstraat: rustig", "help.c4": "Doorgaande weg: let op het verkeer", "help.c5": "Drukke weg: liever vermijden", "help.dashed": "Gestippeld: onverhard",
    "help.soft": "Oranje: een paaltje of hek, meestal te passeren.", "help.hard": "Rood: een klaphek of hoge stoeprand, vaak niet te passeren.",
    "help.weather": "Wind en weer",
    "help.weather.p": "De planner kijkt naar het weer van nu en de komende uren. Je ziet of je tegenwind of wind mee hebt, en of er regen of harde windstoten aankomen. Soms krijg je een tip om iets later te vertrekken.",
    "help.blocked": "Kon je ergens niet langs?",
    "help.blocked.p": "Tik op dat stuk van de route en kies <strong>Vermijd dit stuk</strong>. De planner gaat er dan voortaan omheen. Terugzetten kan onder <strong>Meer instellingen</strong>.",
    "help.onway": "Onderweg",
    "help.onway.p": "<strong>Voorlezen</strong> leest de route hardop voor, met een stem van je eigen telefoon. Die werkt ook zonder internet. Een vrouwen- of mannenstem kies je onder <strong>Meer instellingen</strong>. <strong>Toilet onderweg</strong> zoekt het dichtstbijzijnde openbare toilet en zet het als tussenstop in je route.",
    "help.install": "Op je beginscherm zetten", "help.install.p": "Dan open je de planner met één tik, net als een app.", installNow: "Zet op mijn beginscherm",
    "help.ios1": "<strong>iPhone of iPad:</strong> tik in Safari onderin op de <strong>Deel-knop</strong> (vierkantje met een pijl omhoog).", "help.ios2": "Kies <strong>Zet op beginscherm</strong> en tik op <strong>Voeg toe</strong>.",
    "help.and1": "<strong>Android:</strong> tik in Chrome rechtsboven op de <strong>drie puntjes</strong>.", "help.and2": "Kies <strong>Toevoegen aan startscherm</strong> of <strong>App installeren</strong>.",
    "help.offline": "Geen internet onderweg?",
    "help.off1": "Routes plannen werkt gewoon, in het hele gebied.", "help.off2": "De afstand, de rijtijd en de routebeschrijving staan er gewoon bij.",
    "help.off3": "De kaart laat alleen stukken zien die al eens op je scherm stonden.", "help.off4": "Het weer is het laatste bericht van toen je nog internet had (tot 24 uur oud).",
    "help.offTip": "<strong>Tip:</strong> open de planner één keer thuis met wifi en bekijk je route. Dan staan de kaart en het weer klaar voor onderweg.",
    "help.location": "Lukt je locatie niet?",
    "help.location.p": "Geef de site toestemming als je telefoon daarom vraagt. Zei je eerder nee? Tik dan op het slotje naast het webadres en zet <strong>Locatie</strong> aan. Op een laptop of computer lukt het vaak niet, want die heeft geen gps. Kies dan een plaats, of tik op de kaart.",
    "help.keys": "Sneltoetsen (met een toetsenbord)",
    "key.slash": "Plaats zoeken voor het vertrekpunt", "key.v": "Volg route starten of stoppen", "key.o": "Route omdraaien", "key.t": "Toilet onderweg toevoegen", "key.b": "Route bewaren als favoriet", "key.k": "Volgende kaartstijl", "key.q": "Deze uitleg", "key.esc": "Stoppen met volgen, venster sluiten",
    letterKeys: "Lettertoetsen gebruiken (zet uit als je spraakbesturing gebruikt)",
    // map controls
    "ctl.zoomIn": "Inzoomen", "ctl.zoomOut": "Uitzoomen", "ctl.north": "Kaart naar het noorden draaien", "ctl.locate": "Mijn locatie zoeken", "ctl.credits": "Bronvermelding van de kaart", "ctl.noLocation": "Locatie niet beschikbaar",
    "credits.map": "Kaart © {osm}-bijdragers · © {omt} · via {ofm}",
    // route types and obstacles
    cls0: "fietspad", cls1: "voetpad", cls2: "woonstraat", cls3: "erf/ventweg", cls4: "doorgaande weg", cls5: "drukke weg", cls6: "landweg",
    place0: "Fietspad", place1: "Voetpad", place2: "Straat", place3: "Weg", place6: "Landweg", placeSpot: "Plek", "place.in": "{kind} in {near}", "place.near": "{kind} bij {near}",
    obs0: "paaltje", obs1: "hek", obs2: "slagboom", obs3: "betonblok", obs4: "stoeprand", obs5: "afgeronde stoeprand", obs6: "hoge stoeprand", obs7: "klaphek / fietssluis", obs8: "draaihek", obs9: "overstap", obs10: "ketting", obs11: "zoenhekje",
    "obs.hard": "Vaak niet te passeren met een scootmobiel.", "obs.soft": "Meestal te passeren, maar smal of hinderlijk.", "obs.source": "Bron: OpenStreetMap. Klopt het niet? Meld het op openstreetmap.org.",
    "obs.none": "Geen bekende hekjes, paaltjes of hoge stoepranden op deze route.", "obs.list": "Obstakels op de route:",
    "obs.hardCount": { one: "{n} daarvan is vaak lastig voor een scootmobiel (rood).", other: "{n} daarvan zijn vaak lastig voor een scootmobiel (rood)." },
    "obs.noWay": "Er is geen route zonder.", "obs.turnOn": "Zet \"Vermijd hekjes\" aan voor een route eromheen.", "obs.show": "Toon {label}",
    // popups
    "pop.via": "Als tussenstop", "pop.to": "Als bestemming", "pop.blockQ": "Kon je hier niet langs?", "pop.block": "Vermijd dit stuk", "pop.report": "Meld op OpenStreetMap",
    "blocked.info": { one: "Je vermijdt {n} stuk dat je zelf hebt aangegeven.", other: "Je vermijdt {n} stukken die je zelf hebt aangegeven." }, "blocked.reset": "Alles terugzetten",
    "blocked.done": "Dit stuk wordt voortaan vermeden. Terugzetten kan onder Meer instellingen.",
    // planning and results
    "msg.noPath": "Daar is geen pad in de buurt.", "msg.tooFar": "Een van de punten ligt te ver van een pad.", "msg.noRoute": "Geen route gevonden tussen {a} en {b}.",
    "status.planned": "Route berekend in {ms} ms, in je eigen browser.",
    "summary.line": "{dist} · {time} · aankomst {arrive}", "summary.spoken": "{dist}, {time}, aankomst om {arrive}",
    "gist.quiet": "Rustige route: {p}% over fiets- en voetpaden.", "gist.busy": "Deels langs drukkere wegen; {p}% over fiets- en voetpaden.", "gist.mixed": "{p}% over fiets- en voetpaden, de rest over gewone straten.",
    "gist.hard": { one: "{n} lastig obstakel onderweg, zie \"Meer over deze route\".", other: "{n} lastige obstakels onderweg, zie \"Meer over deze route\"." },
    "gist.headwind": "Tegenwind op de heenweg.", "gist.tailwind": "Wind mee op de heenweg.", "gist.rain": "Kans op regen.",
    "wx.line": "Wind {ms} m/s ({bft} Bft) uit het {dir}, {temp} °C.", "wx.head": "Heen vooral tegenwind.", "wx.headBack": "Terug wind mee.", "wx.tail": "Heen wind mee.", "wx.tailBack": "Terug tegenwind.", "wx.tailWarn": "Let op: terug heb je tegenwind.",
    "wx.side": "Wind vooral van opzij.", "wx.cold": "Het is koud: kleed je warm aan.", "wx.rain": "Kans op regen de komende uren: {p}%.", "wx.saved": "(Weerbericht van {time}, opgeslagen.)",
    "wx.best": "Tip: vertrek liever om {time}. Dan heb je minder last van de wind.", "wx.bestRain": "Tip: vertrek liever om {time}. Dan heb je minder last van de wind en is de kans op regen kleiner ({p}%).",
    "warn.gust": "Harde windstoten ({ms} m/s). Rij voorzichtig op de dijk en open stukken.", "warn.unpaved": "{m} onverhard (gestippeld op de kaart).", "warn.busy": "{m} langs of over een drukke weg (rood).",
    dir0: "noorden", dir1: "noordoosten", dir2: "oosten", dir3: "zuidoosten", dir4: "zuiden", dir5: "zuidwesten", dir6: "westen", dir7: "noordwesten",
    "along.some": "Binnen {m} van de route: {list}.", "along.none": "Geen toiletten of bankjes bekend binnen {m} van de route.",
    "along.toilet": { one: "{n} toilet", other: "{n} toiletten" }, "along.bankje": { one: "{n} bankje", other: "{n} bankjes" }, "along.supermarkt": { one: "{n} supermarkt", other: "{n} supermarkten" }, "along.apotheek": { one: "{n} apotheek", other: "{n} apotheken" },
    "step.start": "Vertrek", "step.straight": "Rechtdoor", "step.back": "Keer om", "step.right": "Rechtsaf", "step.sharpRight": "Scherp rechtsaf", "step.left": "Linksaf", "step.sharpLeft": "Scherp linksaf",
    "step.via": "{turn} via {where}", "step.over": "{turn} over {where}", "step.at": "{turn} bij {mark}", "step.arrive": "Aangekomen bij {place}",
    "toilet.none": "Er is geen openbaar toilet bekend in de buurt van deze route.", "toilet.named": "Toilet: {name}", "toilet.wheel": "Rolstoeltoilet", "toilet.public": "Openbaar toilet",
    "toilet.added": "Tussenstop toegevoegd: {name}, {m} van je route. Je ziet het op de kaart als extra stop.",
    "places.none": "Er zijn geen {label} bekend in dit gebied.", "places.count": "{n} {label} bekend in dit gebied.", "places.zoom": "{label} verschijnen op de kaart als je verder inzoomt ({n} in dit stuk van de kaart).",
    "places.inView": "{n} in beeld ({all} in het hele gebied).", "places.moved": "Geen {label} in dit stuk van de kaart. De kaart schuift naar de dichtstbijzijnde ({km}).",
    "route.name": "{a} → {b}", "route.vias": { one: " ({n} tussenstop)", other: " ({n} tussenstops)" },
    "fav.removed": "Uit je favorieten gehaald.", "fav.prompt": "Naam voor deze route:", "fav.saved": "Bewaard bij Mijn routes (alleen in deze browser).", "fav.remove": "Verwijder favoriet {name}",
    "here.label": "Jij bent hier", "here.acc": "Jij bent hier, nauwkeurig tot op ongeveer {m} meter", "here.me": "Mijn locatie",
    "loc.none": "Je browser kan je locatie niet bepalen. Kies een plaats, of tik op de kaart.", "loc.search": "Je locatie wordt gezocht…",
    "loc.outside": "Je bent buiten het gebied van deze kaart (Hoorn en omgeving). Kies een plaats als vertrekpunt, of tik op de kaart.",
    "loc.found": "Gevonden! Je route begint nu bij jou.", "loc.foundRough": "Gevonden! Je route begint nu bij jou (nauwkeurig tot op ca. {km}).",
    "loc.denied": "Je hebt de site geen toestemming gegeven voor je locatie. Dat kun je aanzetten via het slotje naast het webadres.",
    "loc.fail": "Je locatie kon niet worden bepaald. Op een laptop of computer lukt dat vaak niet, want die heeft geen gps. Op je telefoon werkt het wel. Kies hier een plaats, of tik op de kaart.",
    "speak.none": "Voorlezen werkt niet in deze browser.", "speak.route": "Route van {a} naar {b}.", "speak.time": "{dist}, ongeveer {time}.", "speak.arrive": "Je bent er om {time}.", "speak.back": "Je bent weer terug om {time}.",
    "share.copied": "Link gekopieerd. Plak hem in een bericht of mail.", "share.manual": "Kopieer de link uit de adresbalk.",
    "install.done": "De planner staat nu op je beginscherm.",
    // POI kinds
    "poi.toilet": "Toiletten", "poi.bankje": "Bankjes", "poi.supermarkt": "Supermarkten", "poi.apotheek": "Apotheken", "poi.laadpunt": "Laadpunten", "poi.scootmobielwinkel": "Scootmobielwinkels",
    "poi1.toilet": "toilet", "poi1.bankje": "bankje", "poi1.supermarkt": "supermarkt", "poi1.apotheek": "apotheek", "poi1.laadpunt": "laadpunt", "poi1.scootmobielwinkel": "scootmobielwinkel",
    "poi.wheel.yes": "rolstoeltoegankelijk", "poi.wheel.limited": "beperkt rolstoeltoegankelijk", "poi.wheel.no": "niet rolstoeltoegankelijk",
    "poi.free": "gratis", "poi.paid": "betaald", "poi.backrest": "met rugleuning", "poi.noBackrest": "zonder rugleuning", "poi.open": "open: {h}",
    days: ["ma", "di", "wo", "do", "vr", "za", "zo"], "days.ph": "feestdagen", "days.off": "gesloten", "days.247": "dag en nacht",
    presets: ["Rondrit Hoorn – Zwaag – Blokker", "Dijkroute Schellinkhout – Wijdenes", "Rit naar Berkhout & Scharwoude", "Rit van Hoorn naar Wognum", "Rit langs Westwoud & Hem"],
    // units, for the screen and for speech
    "u.km": "km", "u.m": "m", "u.h": "u", "u.min": "min", "u.ms": "m/s",
    speech: [["km/u", "kilometer per uur"], ["m/s", "meter per seconde"], ["km", "kilometer"], ["m", "meter"], ["u", "uur"], ["min", "minuten"], ["°C", "graden"]],
    "sp.oneMin": "1 minuut", "sp.bft": "windkracht {n}", "sp.about": "ongeveer", "sp.percent": "procent", "sp.to": "naar",
  }

};

let lang = "nl";
export const getLang = () => lang;
export const locale = () => LOCALE[lang];
export const dict = () => D[lang];

export function setLang(l) {
  lang = D[l] ? l : "nl";
  document.documentElement.lang = lang;
}

const plurals = {};
export function t(key, vars = {}) {
  let s = D[lang][key] ?? D.nl[key] ?? key;
  if (s && typeof s === "object" && !Array.isArray(s)) {
    const pr = (plurals[lang] ||= new Intl.PluralRules(LOCALE[lang]));
    s = s[pr.select(vars.n ?? 0)] ?? s.other;
  }
  if (typeof s !== "string") return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));
}

// Fill every element marked in the HTML: data-i18n (text), data-i18n-html, and data-i18n-aria/-title/-ph.
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll("[data-i18n-html]")) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll("[data-i18n-aria]")) el.setAttribute("aria-label", t(el.dataset.i18nAria));
  for (const el of root.querySelectorAll("[data-i18n-title]")) el.setAttribute("title", t(el.dataset.i18nTitle));
  for (const el of root.querySelectorAll("[data-i18n-ph]")) el.setAttribute("placeholder", t(el.dataset.i18nPh));
}

// Numbers with the right decimal sign, and distances/times with this language's units.
export const num = (x, digits = 1) => new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(x);
export const fmtLen = (m) => (m >= 1000 ? `${num(m / 1000)} ${t("u.km")}` : `${Math.round(m / 10) * 10} ${t("u.m")}`);
export const fmtDur = (mins) => (mins >= 60 ? `${Math.floor(mins / 60)} ${t("u.h")} ${mins % 60} ${t("u.min")}` : `${mins} ${t("u.min")}`);
