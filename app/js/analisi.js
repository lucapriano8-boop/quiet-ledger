// Analisi: porting di quiet_ledger/analisi/categorie.py e motore.py (stesse regole del programma per PC).

// ------------------------------------------------------------ categorie
const REGOLE = [
  ["Abbonamenti", ["netflix", "spotify", "disney", "amazon prime", "prime video", "dazn", "now tv", "sky", "icloud", "apple.com", "apple com", "google one", "youtube premium", "chatgpt", "openai", "adobe", "microsoft 365", "office 365", "audible", "playstation plus", "xbox game pass", "nintendo", "paramount", "infinity", "timvision", "tim vision", "crunchyroll", "kindle unlimited", "storytel", "anthropic", "claude.ai", "canva", "dropbox", "linkedin premium"]],
  ["Casa", ["affitto", "mutuo", "condominio", "ikea", "leroy merlin", "bricoman", "brico", "obi", "mondo convenienza", "idraulico", "elettricista", "arredamento"]],
  ["Utenze", ["enel", "a2a", "hera", "iren", "edison", "plenitude", "acea", "sorgenia", "engie", "illumia", "bolletta", "luce", "gas", "acqua", "tari", "rifiuti", "tim", "vodafone", "windtre", "wind tre", "iliad", "fastweb", "ho mobile", "kena", "very mobile", "postemobile", "tiscali", "eolo", "fibra", "ricarica"]],
  ["Spesa alimentare", ["esselunga", "conad", "coop", "carrefour", "lidl", "eurospin", "pam", "despar", "bennet", "iper", "ipercoop", "md", "penny", "aldi", "crai", "tigros", "famila", "sigma", "todis", "unes", "il gigante", "naturasi", "supermercato", "alimentari", "panificio", "panetteria", "macelleria", "fruttivendolo", "pescheria", "mercato"]],
  ["Ristoranti e bar", ["ristorante", "pizzeria", "bar", "trattoria", "osteria", "sushi", "mcdonald", "burger king", "just eat", "deliveroo", "glovo", "uber eats", "starbucks", "caffe", "caffetteria", "pasticceria", "gelateria", "pub", "bistrot", "kebab", "poke", "old wild west", "roadhouse", "autogrill"]],
  ["Trasporti", ["carburante", "benzina", "diesel", "q8", "ip", "tamoil", "esso", "shell", "api", "enilive", "eni station", "telepass", "autostrade", "pedaggio", "pedaggi", "trenitalia", "italo", "trenord", "atm", "atac", "gtt", "uber", "free now", "freenow", "taxi", "parcheggio", "easypark", "bolt", "flixbus", "car sharing", "enjoy", "share now"]],
  ["Auto", ["officina", "meccanico", "gommista", "tagliando", "revisione", "bollo auto", "carrozzeria", "autolavaggio"]],
  ["Banca e assicurazioni", ["assicurazione", "polizza", "rca", "unipol", "generali", "allianz", "axa", "zurich", "commissione", "commissioni", "canone conto", "imposta di bollo", "bollo conto", "interessi", "prestito", "finanziamento"]],
  ["Salute", ["farmacia", "parafarmacia", "medico", "dentista", "ospedale", "ticket sanitario", "analisi", "ottico", "ottica", "fisioterap", "veterinario", "clinica", "poliambulatorio"]],
  ["Sport e benessere", ["palestra", "gym", "mcfit", "virgin active", "piscina", "parrucchiere", "barbiere", "estetista", "yoga", "crossfit", "centro sportivo", "spa"]],
  ["Viaggi", ["booking", "airbnb", "ryanair", "easyjet", "ita airways", "alitalia", "wizz", "volotea", "hotel", "expedia", "volo", "traghetto", "moby", "grimaldi", "b&b", "agriturismo"]],
  ["Svago", ["cinema", "teatro", "ticketone", "concerto", "feltrinelli", "mondadori", "libreria", "steam", "museo", "mostra", "vivaticket", "uci", "the space", "bowling", "discoteca"]],
  ["Shopping", ["amazon", "zalando", "shein", "decathlon", "h&m", "zara", "mediaworld", "unieuro", "euronics", "ebay", "primark", "ovs", "coin", "rinascente", "sephora", "douglas", "temu", "aliexpress", "tiger", "pepco", "apple store"]],
  ["Istruzione e figli", ["scuola", "asilo", "universita", "retta", "libri scolastici", "mensa", "giocattoli", "toys"]],
  ["Regali", ["regalo", "regali", "donazione", "fiori", "fioraio"]],
];
export const CATEGORIE_PREDEFINITE = REGOLE.map((r) => r[0]).concat(["Altro"]);

export const normalizza = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9&+.]+/g, " ").trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const COMPILATE = REGOLE.map(([c, kws]) => [c, kws.map((k) => new RegExp(k.length <= 4
  ? `(^|[^a-z0-9])${esc(normalizza(k))}($|[^a-z0-9])` : esc(normalizza(k))))]);

export function categorizza(descr) {
  const d = normalizza(descr);
  for (const [c, res] of COMPILATE) if (res.some((r) => r.test(d))) return c;
  return "Altro";
}
const RUMORE = /\b(pagamento|pag|pos|carta|card|addebito|addebiti|sdd|sepa|bonifico|a favore di|favore|di|del|della|da|presso|n|nr|num|rif|ordine|ord|it|www|com|ricarica|mensile|abbonamento|canone|rinnovo|annuale|operazione|acquisto|contactless|visa|mastercard|maestro|paypal)\b/g;
export function chiaveEsercente(descr) {
  const s = normalizza(descr).replace(/[0-9]+/g, " ").replace(/[.&+]/g, " ").replace(RUMORE, " ").replace(/\s+/g, " ").trim();
  return s.split(" ").slice(0, 2).join(" ") || normalizza(descr);
}

// ------------------------------------------------------------ date e mesi (date come "AAAA-MM-GG")
export const oggiIso = () => { const d = new Date(); return iso(d); };
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const daIso = (s) => { const [y, m, g] = s.split("-").map(Number); return new Date(y, m - 1, g); };
export const chiaveMese = (s) => s.slice(0, 7);
export function meseSuccessivo(k) { let [y, m] = k.split("-").map(Number); m++; if (m > 12) { m = 1; y++; } return `${y}-${String(m).padStart(2, "0")}`; }
export function elencoMesi(da, a) { const out = []; for (let k = da; k <= a; k = meseSuccessivo(k)) out.push(k); return out; }
export function aggiungiMesi(s, n) {
  const d = daIso(s); const tot = d.getMonth() + n; const y = d.getFullYear() + Math.floor(tot / 12); const m = ((tot % 12) + 12) % 12;
  const ultimo = new Date(y, m + 1, 0).getDate();
  return iso(new Date(y, m, Math.min(d.getDate(), ultimo)));
}
const giorniTra = (a, b) => Math.round((daIso(b) - daIso(a)) / 86400000);
export const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
export function nomeMese(k, corto = false) {
  const [y, m] = k.split("-").map(Number); const n = MESI[m - 1];
  return corto ? n.slice(0, 3).replace(/^./, (c) => c.toUpperCase()) : `${n.replace(/^./, (c) => c.toUpperCase())} ${y}`;
}
const mediana = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };

// ------------------------------------------------------------ ricorrenti trovati nei movimenti
const FREQUENZE = [["Mensile", 25, 36, 1], ["Bimestrale", 54, 68, 2], ["Trimestrale", 82, 100, 3], ["Annuale", 340, 390, 12]];

function trovaRicorrenti(movimenti, fine) {
  const gruppi = new Map();
  for (const m of movimenti) { const k = chiaveEsercente(m.descrizione); if (!gruppi.has(k)) gruppi.set(k, []); gruppi.get(k).push(m); }
  const out = [];
  for (const lista of gruppi.values()) {
    if (lista.length < 2) continue;
    lista.sort((a, b) => a.data.localeCompare(b.data));
    if (new Set(lista.map((m) => chiaveMese(m.data))).size !== lista.length) continue;
    const intervalli = lista.slice(1).map((m, i) => giorniTra(lista[i].data, m.data));
    const im = mediana(intervalli);
    const f = FREQUENZE.find((f) => im >= f[1] && im <= f[2]);
    if (!f) continue;
    if (intervalli.filter((x) => x >= f[1] - 5 && x <= f[2] + 5).length / intervalli.length < 0.75) continue;
    const importi = lista.map((m) => m.importo); const med = mediana(importi);
    const fisso = Math.max(...importi.map((x) => Math.abs(x - med) / med)) <= 0.12;
    const cat = lista.at(-1).categoria;
    if (f[3] === 1 && lista.length < 3 && cat !== "Abbonamenti") continue;
    if (!fisso && !["Utenze", "Casa", "Trasporti"].includes(cat)) continue;
    const ultimo = lista.at(-1);
    const recente = fisso ? ultimo.importo : importi.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, importi.length);
    out.push({ nome: ultimo.descrizione, categoria: cat, frequenza: f[0], mesi: f[3], importo: Math.round(recente * 100) / 100,
      fisso, attivo: giorniTra(ultimo.data, fine) <= f[2] * 1.25, ultimo: ultimo.data, prossimo: aggiungiMesi(ultimo.data, f[3]),
      ids: lista.map((m) => m.uid) });
  }
  return out;
}

// ------------------------------------------------------------ abbonamenti inseriti a mano
const MESI_FREQ = { mensile: 1, annuale: 12 };
export function occorrenze(a, da, fino) {
  const passo = MESI_FREQ[a.frequenza] || 1;
  let k = 0, d = a.rinnovo;
  while (d > da) { k--; d = aggiungiMesi(a.rinnovo, k * passo); }
  const out = [];
  while (d <= fino) { if (d >= da) out.push(d); k++; d = aggiungiMesi(a.rinnovo, k * passo); }
  return out;
}
export function prossimoRinnovo(a, oggi) {
  const o = occorrenze(a, oggi, aggiungiMesi(oggi, 13));
  return o.length ? o[0] : a.rinnovo;
}

// ------------------------------------------------------------ previsione
function prevedi(movimenti, ricorrenti, mesi, manuali) {
  const target = meseSuccessivo(mesi.at(-1));
  const idsRic = new Set(ricorrenti.flatMap((r) => r.ids));
  const attesi = [];
  const chiaviManuali = new Set();
  const inizio = `${target}-01`, fine = iso(new Date(Number(target.slice(0, 4)), Number(target.slice(5)), 0));
  for (const a of manuali) {
    if (!a.attivo) continue;
    chiaviManuali.add(chiaveEsercente(a.nome));
    for (const d of occorrenze(a, inizio, fine)) attesi.push({ nome: a.nome, importo: a.importo, data: d, fisso: true });
  }
  for (const r of ricorrenti) {
    if (!r.attivo || chiaviManuali.has(chiaveEsercente(r.nome))) continue;
    let p = r.prossimo;
    while (chiaveMese(p) < target) p = aggiungiMesi(p, r.mesi);
    if (chiaveMese(p) === target) attesi.push({ nome: r.nome, importo: r.importo, data: p, fisso: r.fisso });
  }
  const finestra = mesi.slice(-6);
  const perCat = new Map();
  for (const m of movimenti) {
    const i = finestra.indexOf(chiaveMese(m.data));
    if (idsRic.has(m.uid) || i < 0) continue;
    if (!perCat.has(m.categoria)) perCat.set(m.categoria, finestra.map(() => 0));
    perCat.get(m.categoria)[i] += m.importo;
  }
  const pesi = finestra.map((_, i) => i + 1), sp = pesi.reduce((a, b) => a + b, 0);
  const voci = [];
  for (const [cat, serie] of perCat) {
    const md = mediana(serie);
    const pulita = serie.map((v) => (md > 0 ? Math.min(v, md * 2.2) : v));
    const prev = pulita.reduce((a, v, i) => a + v * pesi[i], 0) / sp;
    const mu = pulita.reduce((a, b) => a + b, 0) / pulita.length;
    const dev = Math.sqrt(pulita.reduce((a, v) => a + (v - mu) ** 2, 0) / Math.max(1, pulita.length - 1));
    if (prev > 0.5) voci.push({ categoria: cat, previsione: prev, dev, mesiAttivi: serie.filter((v) => v > 0).length });
  }
  voci.sort((a, b) => b.previsione - a.previsione);
  const variabili = voci.filter((v) => v.mesiAttivi >= finestra.length / 2);
  const totRic = attesi.reduce((a, r) => a + r.importo, 0), totVar = variabili.reduce((a, v) => a + v.previsione, 0);
  const dev = Math.sqrt(variabili.reduce((a, v) => a + v.dev ** 2, 0));
  attesi.sort((a, b) => a.data.localeCompare(b.data));
  return { mese: target, attesi, variabili, totRic, totVar, totale: totRic + totVar,
           minimo: Math.max(totRic, totRic + totVar - dev), massimo: totRic + totVar + dev };
}

// ------------------------------------------------------------ obiettivi
export function statoObiettivo(o, versamenti, oggi) {
  const acc = Math.round(versamenti.reduce((a, v) => a + v.importo, 0) * 100) / 100;
  const mancante = Math.max(0, o.traguardo - acc);
  const raggiunto = mancante <= 0.005;
  let mesiRimasti = null, alMese = null;
  if (o.scadenza) {
    const s = daIso(o.scadenza), t = daIso(oggi);
    mesiRimasti = Math.max(0, (s.getFullYear() - t.getFullYear()) * 12 + s.getMonth() - t.getMonth());
    alMese = mancante / Math.max(1, mesiRimasti);
  }
  const creatoPiu1 = iso(new Date(daIso(o.creato).getTime() + 86400000));
  const novanta = iso(new Date(daIso(oggi).getTime() - 90 * 86400000));
  const inizio = creatoPiu1 > novanta ? creatoPiu1 : novanta;
  const giorni = Math.max(30, giorniTra(inizio, oggi) + 1);
  const maturo = giorniTra(o.creato, oggi) >= 30;
  const ritmo = maturo ? versamenti.filter((v) => v.data >= inizio).reduce((a, v) => a + v.importo, 0) / giorni * 30.44 : 0;
  let stima = null;
  if (raggiunto) stima = versamenti.map((v) => v.data).sort().at(-1) || oggi;
  else if (ritmo > 0.5) stima = iso(new Date(daIso(oggi).getTime() + Math.round(mancante / ritmo * 30.44) * 86400000));
  const inRitardo = !!(o.scadenza && !raggiunto && (stima === null || stima > o.scadenza) && giorniTra(o.creato, oggi) >= 30);
  return { ...o, accantonato: acc, mancante, raggiunto, mesiRimasti, alMese, ritmo, stima, inRitardo, maturo,
           percentuale: o.traguardo ? Math.min(1, acc / o.traguardo) : 0 };
}

// ------------------------------------------------------------ analisi completa (dalle righe sincronizzate)
export function analizza(dati, oggi = oggiIso()) {
  const regole = dati.regole, stipendio = Number(dati.stipendio || 0);
  const movimenti = [], entrate = [];
  for (const t of dati.transazioni) {
    if (t.tipo === "entrata") { entrate.push(t); continue; }
    const r = regole[chiaveEsercente(t.descrizione)];
    movimenti.push({ ...t, categoria: r || t.categoria_file || categorizza(t.descrizione) });
  }
  const tutte = movimenti.concat(entrate);
  if (!tutte.length) return null;
  tutte.sort((a, b) => a.data.localeCompare(b.data));
  const mesi = elencoMesi(chiaveMese(tutte[0].data), chiaveMese(tutte.at(-1).data));
  const perMese = Object.fromEntries(mesi.map((k) => [k, { totale: 0, categorie: {}, entrate: 0, stimate: false }]));
  for (const m of movimenti) { const p = perMese[chiaveMese(m.data)]; p.totale += m.importo; p.categorie[m.categoria] = (p.categorie[m.categoria] || 0) + m.importo; }
  for (const e of entrate) perMese[chiaveMese(e.data)].entrate += e.importo;
  if (stipendio) for (const k of mesi) if (!entrate.some((e) => chiaveMese(e.data) === k && e.importo >= stipendio * 0.6)) { perMese[k].entrate += stipendio; perMese[k].stimate = true; }
  const inCorso = mesi.includes(chiaveMese(oggi)) && mesi.length > 1 ? chiaveMese(oggi) : null;
  const completi = mesi.filter((k) => k !== inCorso);
  movimenti.sort((a, b) => a.data.localeCompare(b.data));
  let fine = movimenti.length ? movimenti.at(-1).data : oggi;
  if (inCorso) { const u = iso(new Date(Number(completi.at(-1).slice(0, 4)), Number(completi.at(-1).slice(5)), 0)); if (u < fine) fine = u; }
  const ricorrenti = movimenti.length ? trovaRicorrenti(movimenti, fine) : [];
  const previsione = movimenti.length ? prevedi(movimenti, ricorrenti, completi, dati.abbonamenti) : null;
  return { movimenti, entrate, mesi, completi, perMese, inCorso, ricorrenti, previsione, stipendio,
           ultimoCompleto: completi.at(-1) };
}

export function promemoria(abbonamenti, stati, oggi) {
  const out = [];
  for (const a of abbonamenti) {
    if (!a.attivo) continue;
    const p = prossimoRinnovo(a, oggi), g = giorniTra(oggi, p), soglia = a.frequenza === "annuale" ? 30 : 7;
    if (g >= 0 && g <= soglia) out.push({ livello: a.frequenza === "annuale" ? "avviso" : "info",
      testo: `${a.nome} si rinnova ${g === 0 ? "oggi" : g === 1 ? "domani" : `tra ${g} giorni`}: ${eur(a.importo)}` });
  }
  for (const s of stati) if (s.inRitardo) out.push({ livello: "avviso", testo: `Obiettivo “${s.nome}”: al ritmo attuale non arrivi in tempo.` });
  return out;
}

const NF = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" });
const NF0 = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" });
export const eur = (v, dec = 2) => (dec ? NF : NF0).format(v);
