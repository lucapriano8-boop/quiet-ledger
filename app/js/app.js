// Quiet Ledger per iPhone: interfaccia.
import * as A from "./archivio.js";
import * as D from "./drive.js";
import * as S from "./sync.js";
import * as N from "./analisi.js";
import { VERSIONE } from "./config.js";

const $ = (s) => document.querySelector(s);
const app = $("#app"), schede = $("#schede"), dialogo = $("#dialogo");

// ------------------------------------------------------------ modelli HTML sicuri: ogni valore è testo, mai codice
class Sicuro { constructor(s) { this.s = s; } toString() { return this.s; } }
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const val = (v) => v instanceof Sicuro ? v.s : Array.isArray(v) ? v.map(val).join("") : v == null || v === false ? "" : String(v).replace(/[&<>"']/g, (c) => ESC[c]);
const h = (parti, ...valori) => new Sicuro(parti.reduce((a, p, i) => a + p + (i < valori.length ? val(valori[i]) : ""), ""));
const eur = N.eur;

// ------------------------------------------------------------ stato in memoria (svuotato al blocco)
const S0 = () => ({ dk: null, st: null, scheda: "panoramica", syncInCorso: false, esito: "", errore: "", serveAccesso: false,
                    tipo: "spesa", categoriaToccata: false, collega: null, timer: null, ritardo: null });
let s = S0();

const remoto = { elenca: D.elenca, leggi: D.leggi, scrivi: D.scrivi };
const v = () => A.vista(s.st);
const oggi = () => N.oggiIso();

async function salva() { await A.salvaDati(s.dk, s.st); }
async function cambiato() { await salva(); disegna(); clearTimeout(s.ritardo); s.ritardo = setTimeout(sincronizzaOra, 3000); }

// ------------------------------------------------------------ avvio, blocco, sblocco
async function avvio() {
  const r = D.riceviToken();
  if (r?.errore) s.errore = r.errore === "access_denied" ? "Accesso a Google annullato." : r.errore;
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", () => { s.aggiornato = true; });
  }
  schermataIniziale();
}

// Messaggio d'errore con il codice tecnico tra parentesi: serve a capire cosa è successo se qualcosa non va.
function testoErrore(e, annullato) {
  if (e?.name === "NotAllowedError") return `${annullato} Se non hai annullato tu, riprova. (NotAllowedError)`;
  return `${e?.message || "Errore imprevisto."}${e?.name && e.name !== "Error" ? ` (${e.name})` : ""}`;
}

async function schermataIniziale() {
  schede.hidden = true; document.body.classList.add("senza-schede");
  if (!(await A.esisteArchivio())) return (await A.passkeyInAttesa()) ? disegnaConfermaPasskey() : disegnaBenvenuto();
  const metodo = await A.metodoSblocco();
  app.innerHTML = h`<section class="centro">
    <img class="logo" src="icone/icona-192.png" alt="">
    <div><h1>Quiet Ledger</h1><p class="sotto">I tuoi dati sono cifrati su questo iPhone.</p></div>
    ${s.errore ? h`<p class="errore">${s.errore}</p>` : ""}
    ${metodo === "passkey"
      ? h`<button class="primario" data-azione="sblocca">Sblocca con Face ID</button>`
      : h`<form data-form="sblocca-pw" class="pila"><input type="password" name="pw" autocomplete="current-password" placeholder="Password" aria-label="Password" required>
          <button class="primario">Sblocca</button></form>`}
  </section>`;
}

function disegnaBenvenuto(conPassword = false) {
  app.innerHTML = h`<section class="centro">
    <img class="logo" src="icone/icona-192.png" alt="">
    <div><h1>Benvenuto</h1><p class="sotto">Quiet Ledger tiene le tue spese in un archivio cifrato su questo iPhone e le sincronizza con il PC attraverso il tuo Google Drive, sempre cifrate.</p></div>
    ${s.errore ? h`<p class="errore">${s.errore}</p>` : ""}
    ${conPassword ? h`<form data-form="crea-pw" class="pila" autocomplete="off">
        <input type="password" name="pw" autocomplete="new-password" placeholder="Password (almeno 12 caratteri)" aria-label="Nuova password" minlength="12" required>
        <input type="password" name="pw2" autocomplete="new-password" placeholder="Ripeti la password" aria-label="Ripeti la password" required>
        <button class="primario">Crea archivio</button>
        <p class="nota">Senza questa password i dati sul telefono non si recuperano, ma restano al sicuro sul PC.</p></form>`
      : h`<button class="primario" data-azione="crea-passkey">Proteggi con Face ID</button>
          <button class="link" data-azione="usa-password">Usa una password invece</button>`}
  </section>`;
}

function disegnaConfermaPasskey() {
  app.innerHTML = h`<section class="centro">
    <img class="logo" src="icone/icona-192.png" alt="">
    <div><h1>Ultimo passaggio</h1><p class="sotto">La passkey è stata creata. Tocca ancora una volta per attivare lo sblocco con Face ID.</p></div>
    ${s.errore ? h`<p class="errore">${s.errore}</p>` : ""}
    <button class="primario" data-azione="completa-passkey">Conferma con Face ID</button>
    <button class="link" data-azione="annulla-passkey">Ricomincia</button>
  </section>`;
}

async function dopoSblocco(dk) {
  s.dk = dk; s.errore = "";
  s.st = (await A.caricaDati(dk)) || A.nuovoStato();
  await salva();
  if (!s.st.sync?.epoca) return disegnaCollega();
  avviaSincronizzazione();
  disegna();
}

function blocca() {
  clearInterval(s.timer); clearTimeout(s.ritardo);
  if (dialogo.open) dialogo.close();
  s = S0();
  schermataIniziale();
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    document.body.classList.add("nascosto");
    if (s.dk && !s.collega?.attesa) blocca();  // si blocca appena si esce dall'app (non durante il collegamento)
  } else document.body.classList.remove("nascosto");
});

// ------------------------------------------------------------ sincronizzazione
function avviaSincronizzazione() {
  clearInterval(s.timer);
  s.timer = setInterval(sincronizzaOra, 60_000);
  sincronizzaOra();
}
async function sincronizzaOra() {
  if (!s.st?.sync?.ruolo || s.syncInCorso) return;
  if (!D.tokenValido()) { s.serveAccesso = true; disegna(); return; }
  s.syncInCorso = true; s.errore = "";
  const dk = s.dk;
  try {
    const r = await S.sincronizza(s.st, remoto);
    if (s.dk !== dk) return;  // bloccato nel frattempo
    await salva();
    s.serveAccesso = false;
    const ora = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    s.esito = `${ora} · ` + (r.ricevute || r.inviate ? [r.ricevute && `${r.ricevute} ricevute`, r.inviate && `${r.inviate} inviate`].filter(Boolean).join(", ") : "tutto aggiornato");
    if (r.avvisi.length) s.errore = r.avvisi.join(" ");
    if (r.inAttesa && s.collega) s.collega.attesa = true;
  } catch (e) {
    if (e instanceof D.AccessoRichiesto) s.serveAccesso = true;
    else if (e instanceof S.DispositivoScollegato) { await scollegato(); return; }
    else s.errore = e.message;
  } finally { s.syncInCorso = false; }
  if (s.collega?.attesa && s.st.sync.epoca) { s.collega = null; avviaSincronizzazione(); }
  if (s.dk === dk) disegna();
}
async function scollegato() {
  clearInterval(s.timer);
  await A.cancellaArchivio();
  D.dimenticaToken();
  s = S0(); s.errore = "Questo iPhone è stato scollegato dal PC: i dati sono stati cancellati dal telefono.";
  schermataIniziale();
}

// ------------------------------------------------------------ collegamento al PC
function disegnaCollega() {
  schede.hidden = true; document.body.classList.add("senza-schede");
  s.collega ??= {};
  const c = s.collega, token = D.tokenValido();
  let corpo;
  if (!D.configurato()) corpo = h`<p class="errore">Manca l'ID client di Google nella configurazione dell'app (config.js).</p>`;
  else if (!token) corpo = h`<p class="sotto"><b>1.</b> Accedi con lo stesso account Google usato sul PC. L'app potrà usare solo la propria cartella nascosta su Drive.</p>
      <button class="primario" data-azione="accedi-google">Accedi con Google</button>`;
  else if (c.codice) corpo = h`<p class="sotto"><b>3.</b> Sul PC deve comparire lo stesso codice. Se coincide, conferma sul PC.</p>
      <p class="codice num">${c.codice.slice(0, 3)} ${c.codice.slice(3)}</p>
      <p class="nota">In attesa della conferma dal PC…</p>`;
  else if (c.fotocamera) corpo = h`<video class="fotocamera" id="video" playsinline muted></video>
      <p class="nota">Inquadra il QR code mostrato dal PC (Dispositivi → Collega un iPhone).</p>
      <button data-azione="chiudi-fotocamera">Annulla</button>`;
  else corpo = h`<p class="sotto"><b>2.</b> Sul PC apri <b>Dispositivi → Collega un iPhone</b> e inquadra il QR code.</p>
      <button class="primario" data-azione="apri-fotocamera">Inquadra il QR code</button>
      <label class="bottone" for="foto-qr">Scegli una foto del QR code</label>
      <input id="foto-qr" type="file" accept="image/*" hidden>`;
  app.innerHTML = h`<section class="centro">
    <img class="logo" src="icone/icona-192.png" alt="">
    <div><h1>Collega al PC</h1><p class="sotto">Una volta sola, poi l'iPhone si aggiorna da solo.</p></div>
    ${s.errore ? h`<p class="errore">${s.errore}</p>` : ""}
    ${corpo}
  </section>`;
  if (c.fotocamera) avviaFotocamera();
}

async function avviaFotocamera() {
  const video = $("#video");
  try {
    s.collega.flusso = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
  } catch { s.collega.fotocamera = false; s.errore = "Fotocamera non disponibile: scegli una foto del QR code."; return disegnaCollega(); }
  video.srcObject = s.collega.flusso;
  await video.play();
  const tela = document.createElement("canvas"), ctx = tela.getContext("2d", { willReadFrequently: true });
  const giro = async () => {
    if (!s.collega?.fotocamera) return;
    if (video.videoWidth) {
      tela.width = video.videoWidth; tela.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const r = window.jsQR(ctx.getImageData(0, 0, tela.width, tela.height).data, tela.width, tela.height, { inversionAttempts: "dontInvert" });
      if (r?.data) { fermaFotocamera(); return qrLetto(r.data); }
    }
    requestAnimationFrame(giro);
  };
  giro();
}
function fermaFotocamera() {
  s.collega.flusso?.getTracks().forEach((t) => t.stop());
  s.collega.fotocamera = false; s.collega.flusso = null;
}
async function qrDaFoto(file) {
  const img = await createImageBitmap(file);
  const tela = document.createElement("canvas");
  const scala = Math.min(1, 1600 / Math.max(img.width, img.height));
  tela.width = Math.round(img.width * scala); tela.height = Math.round(img.height * scala);
  const ctx = tela.getContext("2d"); ctx.drawImage(img, 0, 0, tela.width, tela.height);
  const r = window.jsQR(ctx.getImageData(0, 0, tela.width, tela.height).data, tela.width, tela.height);
  if (!r?.data) { s.errore = "Nella foto non trovo un QR code leggibile."; return disegnaCollega(); }
  qrLetto(r.data);
}
async function qrLetto(testo) {
  s.errore = "";
  try {
    s.collega.codice = await S.unisciti(s.st, remoto, testo, "iPhone");
    s.collega.attesa = true;
    await salva();
    clearInterval(s.timer);
    s.timer = setInterval(sincronizzaOra, 3000);  // controlla spesso finché il PC non approva
  } catch (e) { s.errore = e.message; }
  disegnaCollega();
}

// ------------------------------------------------------------ schede principali
const ICONE = {
  panoramica: h`<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>`,
  aggiungi: h`<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>`,
  abbonamenti: h`<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/></svg>`,
  risparmi: h`<svg viewBox="0 0 24 24"><path d="M12 3v3M12 18v3M17 7.5C17 6 15 5 12 5S7 6 7 8s2 3 5 3.5 5 1.5 5 3.5-2 3-5 3-5-1-5-2.5"/></svg>`,
  altro: h`<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>`,
};
const NOMI = { panoramica: "Panoramica", aggiungi: "Aggiungi", abbonamenti: "Abbonamenti", risparmi: "Risparmi", altro: "Altro" };

function disegna() {
  if (!s.st) return;
  if (!s.st.sync?.epoca) return disegnaCollega();
  schede.hidden = false; document.body.classList.remove("senza-schede");
  schede.innerHTML = h`${Object.keys(NOMI).map((k) => h`<button data-azione="scheda" data-scheda="${k}" ${new Sicuro(s.scheda === k ? 'aria-current="page"' : "")}>${ICONE[k]}<span>${NOMI[k]}</span></button>`)}`;
  const banner = h`${s.serveAccesso ? h`<div class="avviso">L'accesso a Google Drive è scaduto. <button class="link" data-azione="accedi-google">Accedi di nuovo</button></div>` : ""}
    ${s.aggiornato ? h`<div class="avviso">App aggiornata alla versione ${VERSIONE}.</div>` : ""}`;
  const pagine = { panoramica, aggiungi, abbonamenti, risparmi, altro };
  app.innerHTML = h`${banner}${pagine[s.scheda]()}`;
  app.querySelectorAll("[data-larghezza]").forEach((el) => { el.style.width = `${el.dataset.larghezza}%`; });  // CSP: niente attributi di stile in linea
}

function chip(a, b) {
  if (!b) return h`<span class="chip piatto">nuovo</span>`;
  const p = (a - b) / b * 100;
  if (Math.abs(p) < 1) return h`<span class="chip piatto">= stabile</span>`;
  return h`<span class="chip ${p > 0 ? "su" : "giu"}">${p > 0 ? "▲" : "▼"} ${Math.abs(p).toFixed(0)}%</span>`;
}

function panoramica() {
  const d = v(), a = N.analizza(d, oggi());
  if (!a) return h`<h1>Panoramica</h1><p class="sotto">Ancora nessuna spesa. Aggiungila dalla scheda Aggiungi o importala sul PC.</p>`;
  const stati = d.obiettivi.map((o) => N.statoObiettivo(o, d.versamenti.filter((x) => x.obiettivo_uid === o.uid), oggi()));
  const prom = N.promemoria(d.abbonamenti, stati, oggi());
  const u = a.ultimoCompleto, i = a.completi.indexOf(u), prec = a.completi[i - 1];
  const tu = a.perMese[u].totale, tp = prec ? a.perMese[prec].totale : 0;
  const entr = a.perMese[u].entrate, ris = entr ? entr - tu : null;
  const conti = d.conti.reduce((x, c) => x + Number(c.saldo || 0), 0);
  const p = a.previsione;
  const ultimi = a.mesi.slice(p && !a.mesi.includes(p.mese) ? -5 : -6);
  const colonne = p && !a.mesi.includes(p.mese) ? [...ultimi, p.mese] : ultimi;  // il mese previsto come colonna tratteggiata
  const max = Math.max(...ultimi.map((k) => a.perMese[k].totale), p ? p.massimo : 0, 1);
  const W = 320, H = 150, bw = 26, passo = W / colonne.length;
  const y = (x) => H - 22 - (x / max) * (H - 34);
  const recenti = [...a.movimenti, ...a.entrate].sort((x, z) => z.data.localeCompare(x.data)).slice(0, 5);
  return h`<h1>Panoramica</h1>
  ${prom.map((x) => h`<p class="avviso">${x.testo}</p>`)}
  <div class="tessere spazio">
    ${a.inCorso ? h`<div class="tessera larga"><div class="etichetta">${N.nomeMese(a.inCorso)} · in corso</div>
      <div class="grande">${eur(a.perMese[a.inCorso].totale)}</div><div class="nota">spesi finora${p && p.mese === a.inCorso ? h` · previsti ${eur(p.totale, 0)} a fine mese` : ""}</div></div>` : ""}
    <div class="tessera"><div class="etichetta">Spese · ${N.nomeMese(u, true)}</div><div class="grande">${eur(tu, 0)}</div><div>${chip(tu, tp)}</div></div>
    <div class="tessera"><div class="etichetta">Risparmio · ${N.nomeMese(u, true)}</div>
      <div class="grande ${ris !== null && ris >= 0 ? "positivo" : ""}">${ris === null ? "—" : (ris >= 0 ? "+" : "") + eur(ris, 0)}</div>
      <div class="nota">${ris === null ? "manca lo stipendio" : `${(ris / entr * 100).toFixed(0)}% delle entrate`}</div></div>
    ${p && p.mese !== a.inCorso ? h`<div class="tessera"><div class="etichetta">Previsione · ${N.nomeMese(p.mese, true)}</div><div class="grande">${eur(p.totale, 0)}</div><div class="nota">${eur(p.minimo, 0)} – ${eur(p.massimo, 0)}</div></div>` : ""}
    <div class="tessera"><div class="etichetta">Risparmi</div><div class="grande">${d.conti.length ? eur(conti, 0) : "—"}</div><div class="nota">${d.conti.length} conti</div></div>
  </div>
  <h2>Ultimi mesi</h2>
  <div class="carta"><svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Spese degli ultimi mesi">
    <line class="linea" x1="0" x2="${W}" y1="${H - 22}" y2="${H - 22}"/>
    ${colonne.map((k, j) => {
      const x = j * passo + (passo - bw) / 2, t = a.perMese[k]?.totale || 0, corso = k === a.inCorso;
      const prevQui = p && p.mese === k;
      return h`${prevQui ? h`<rect class="previsione" x="${x}" y="${y(p.totale)}" width="${bw}" height="${H - 22 - y(p.totale)}" rx="4"/>` : ""}
        ${a.perMese[k] ? h`<rect class="colonna ${corso ? "tenue" : ""}" x="${x}" y="${y(t)}" width="${bw}" height="${Math.max(1, H - 22 - y(t))}" rx="4"/>` : ""}
        <text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" class="${k === u ? "forte" : ""}">${N.nomeMese(k, true)}${prevQui ? "*" : ""}</text>`;
    })}
  </svg>${p ? h`<p class="nota">* Il riquadro tratteggiato è la previsione per ${N.nomeMese(p.mese).toLowerCase()}${p.mese === a.inCorso ? ", il mese in corso" : ""}.</p>` : ""}</div>
  <h2>Ultime voci</h2>
  <div class="carta lista">${recenti.map((m) => h`<div class="riga"><div class="cresci"><div class="titolo">${m.descrizione}</div>
    <div class="nota">${m.data.split("-").reverse().join("/")} · ${m.tipo === "entrata" ? "Entrata" : m.categoria}</div></div>
    <div class="valore ${m.tipo === "entrata" ? "positivo" : ""}">${m.tipo === "entrata" ? "+" : ""}${eur(m.importo)}</div></div>`)}</div>`;
}

function aggiungi() {
  const d = v();
  const categorie = d.categorie.length ? d.categorie : N.CATEGORIE_PREDEFINITE;
  const descrizioni = [...new Set(d.transazioni.map((t) => t.descrizione))].slice(-300);
  const lunedi = (() => { const x = N.daIso(oggi()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return N.iso(x); })();
  const settimana = d.transazioni.filter((t) => t.data >= lunedi).sort((a, b) => b.data.localeCompare(a.data));
  const entrata = s.tipo === "entrata";
  return h`<h1>Aggiungi</h1>
  <form data-form="voce" class="pila carta" autocomplete="off">
    <div class="segmenti" role="group" aria-label="Tipo">
      <button type="button" data-azione="tipo" data-tipo="spesa" aria-pressed="${!entrata}">Spesa</button>
      <button type="button" data-azione="tipo" data-tipo="entrata" aria-pressed="${entrata}">Entrata</button></div>
    <div class="campo"><label for="importo">Importo €</label><input id="importo" name="importo" class="importo" inputmode="decimal" placeholder="0,00" required></div>
    <div class="campo"><label for="descrizione">Descrizione</label><input id="descrizione" name="descrizione" list="suggerimenti" placeholder="${entrata ? "es. Stipendio" : "es. Esselunga, Bar"}" required>
      <datalist id="suggerimenti">${descrizioni.map((x) => h`<option value="${x}">`)}</datalist></div>
    ${entrata ? "" : h`<div class="campo"><label for="categoria">Categoria</label><select id="categoria" name="categoria">${categorie.map((c) => h`<option>${c}</option>`)}</select></div>`}
    <div class="campo"><label for="data">Data</label><input id="data" name="data" type="date" value="${oggi()}" max="${oggi()}" required></div>
    <div class="campo"><label for="metodo">Pagamento</label><select id="metodo" name="metodo">${["Carta", "Bancomat", "Contanti", "Bonifico", "Satispay", "PayPal"].map((m) => h`<option>${m}</option>`)}</select></div>
    <button class="primario">Aggiungi</button>
    ${s.esitoVoce ? h`<p class="nota">${s.esitoVoce}</p>` : ""}
  </form>
  <h2>Questa settimana</h2>
  <div class="carta lista">${settimana.length ? settimana.map((t) => h`<button class="riga" data-azione="voce" data-uid="${t.uid}"><div class="cresci">
      <div class="titolo">${t.descrizione}</div><div class="nota">${t.data.split("-").reverse().slice(0, 2).join("/")} · ${t.tipo === "entrata" ? "Entrata" : t.categoria_file || N.categorizza(t.descrizione)}</div></div>
      <div class="valore ${t.tipo === "entrata" ? "positivo" : ""}">${t.tipo === "entrata" ? "+" : ""}${eur(t.importo)}</div></button>`)
    : h`<div class="riga nota">Nessuna voce da lunedì.</div>`}</div>`;
}

function abbonamenti() {
  const d = v(), o = oggi();
  const lista = d.abbonamenti.slice().sort((a, b) => N.prossimoRinnovo(a, o).localeCompare(N.prossimoRinnovo(b, o)));
  const alMese = lista.filter((a) => a.attivo).reduce((x, a) => x + a.importo / (a.frequenza === "annuale" ? 12 : 1), 0);
  return h`<h1>Abbonamenti</h1><p class="sotto">${alMese ? `${eur(alMese)} al mese · ${eur(alMese * 12, 0)} all'anno` : "Prezzo e rinnovo: ricevi un promemoria prima di ogni rinnovo."}</p>
  <h2>I tuoi abbonamenti</h2>
  <div class="carta lista">${lista.length ? lista.map((a) => {
    const p = N.prossimoRinnovo(a, o), g = Math.round((N.daIso(p) - N.daIso(o)) / 86400000);
    return h`<button class="riga" data-azione="abbonamento" data-uid="${a.uid}"><div class="cresci"><div class="titolo">${a.nome}</div>
      <div class="nota">${a.attivo ? `${a.frequenza} · rinnovo ${g === 0 ? "oggi" : g === 1 ? "domani" : g < 45 ? `tra ${g} giorni` : p.split("-").reverse().join("/")}` : "sospeso"}</div></div>
      <div class="valore">${eur(a.importo)}</div></button>`;
  }) : h`<div class="riga nota">Nessun abbonamento. Aggiungili qui o dal PC.</div>`}</div>
  <p class="spazio"><button class="primario" data-azione="abbonamento">+ Aggiungi abbonamento</button></p>`;
}

function risparmi() {
  const d = v(), o = oggi();
  const stati = d.obiettivi.map((x) => N.statoObiettivo(x, d.versamenti.filter((w) => w.obiettivo_uid === x.uid), o));
  return h`<h1>Risparmi</h1>
  <h2>Stipendio netto mensile</h2>
  <button class="riga carta" data-azione="stipendio"><div class="cresci">Stipendio</div><div class="valore">${d.stipendio ? eur(Number(d.stipendio)) : "—"}</div></button>
  <h2>Conti e contanti</h2>
  <div class="carta lista">${d.conti.length ? d.conti.map((c) => h`<button class="riga" data-azione="conto" data-uid="${c.uid}"><div class="cresci">
    <div class="titolo">${c.nome}</div><div class="nota">${c.tipo} · aggiornato ${String(c.aggiornato).split("-").reverse().join("/")}</div></div>
    <div class="valore">${eur(Number(c.saldo))}</div></button>`) : h`<div class="riga nota">Nessun conto: aggiungili dal PC o dal foglio Profilo.</div>`}</div>
  <h2>Obiettivi</h2>
  <div class="pila">${stati.map((x) => h`<div class="carta pila">
    <div class="riga semplice"><div class="cresci"><b>${x.nome}</b></div>
      <span class="nota">${x.raggiunto ? "✓ raggiunto" : x.inRitardo ? "▲ in ritardo" : x.scadenza ? "● in linea" : ""}</span></div>
    <div class="sotto num">${eur(x.accantonato, 0)} di ${eur(x.traguardo, 0)} · ${(x.percentuale * 100).toFixed(0)}%</div>
    <div class="barra ${x.raggiunto ? "ok" : x.inRitardo ? "ritardo" : ""}"><div data-larghezza="${(x.percentuale * 100).toFixed(1)}"></div></div>
    <p class="nota">${x.raggiunto ? "Traguardo raggiunto." : x.scadenza ? `Servono ${eur(x.alMese, 0)} al mese fino al ${x.scadenza.split("-").reverse().join("/")}.` : `Mancano ${eur(x.mancante, 0)}.`}</p>
    <div class="azioni"><button data-azione="versa" data-uid="${x.uid}">Versa</button><button data-azione="preleva" data-uid="${x.uid}" ${new Sicuro(x.accantonato > 0 ? "" : "disabled")}>Preleva</button></div>
  </div>`)}</div>
  <p class="spazio"><button class="primario" data-azione="obiettivo">+ Nuovo obiettivo</button></p>`;
}

function altro() {
  const sy = s.st.sync;
  return h`<h1>Altro</h1>
  <h2>Sincronizzazione</h2>
  <div class="carta pila">
    <div>Collegato a <b>${sy.membri?.[sy.principale]?.nome || "PC"}</b> tramite Google Drive.</div>
    <div class="nota">${s.syncInCorso ? "Sincronizzazione in corso…" : s.esito ? `Ultima: ${s.esito}` : "In attesa della prima sincronizzazione."}</div>
    ${s.errore ? h`<p class="errore">${s.errore}</p>` : ""}
    <button data-azione="sincronizza" ${new Sicuro(s.syncInCorso ? "disabled" : "")}>Sincronizza ora</button>
  </div>
  <h2>Sicurezza</h2>
  <div class="carta lista">
    <button class="riga" data-azione="blocca"><div class="cresci">Blocca ora</div></button>
    <button class="riga" data-azione="esci-google"><div class="cresci">Esci da Google su questo iPhone</div></button>
    <button class="riga pericolo" data-azione="cancella-tutto"><div class="cresci">Cancella tutti i dati da questo iPhone</div></button>
  </div>
  <p class="nota spazio">L'app si blocca appena passi a un'altra app. Sul telefono i dati sono cifrati con una chiave protetta da Face ID; su Drive arrivano solo file cifrati.</p>
  <p class="versione">Quiet Ledger ${VERSIONE} per iPhone</p>`;
}

// ------------------------------------------------------------ finestre di modifica
function apriDialogo(contenuto) {
  dialogo.innerHTML = String(contenuto);
  dialogo.showModal();
  dialogo.querySelector("input:not([type=hidden]), select")?.focus();
}
const numero = (x) => { const t = String(x).trim().replace(/\s|€/g, ""); const n = Number(/,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "")); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; };
const formatta = (n) => (n ?? "") === "" ? "" : Number(n).toFixed(2).replace(".", ",");
const annullaConferma = (salva = "Salva", extra = "") => h`<div class="azioni">${extra}<button type="button" data-azione="chiudi">Annulla</button><button class="primario" value="ok">${salva}</button></div>`;

function dialogoAbbonamento(uid) {
  const a = uid ? v().abbonamenti.find((x) => x.uid === uid) : null;
  const cat = v().categorie.length ? v().categorie : N.CATEGORIE_PREDEFINITE;
  apriDialogo(h`<form data-form="abbonamento" data-uid="${uid || ""}" method="dialog">
    <h3>${a ? "Modifica abbonamento" : "Nuovo abbonamento"}</h3>
    <div class="campo"><label for="a-nome">Nome</label><input id="a-nome" name="nome" value="${a?.nome || ""}" required></div>
    <div class="campo"><label for="a-importo">Prezzo €</label><input id="a-importo" name="importo" inputmode="decimal" value="${formatta(a?.importo)}" required></div>
    <div class="campo"><label for="a-freq">Frequenza</label><select id="a-freq" name="frequenza">
      <option value="mensile" ${new Sicuro(a?.frequenza === "annuale" ? "" : "selected")}>Mensile</option>
      <option value="annuale" ${new Sicuro(a?.frequenza === "annuale" ? "selected" : "")}>Annuale</option></select></div>
    <div class="campo"><label for="a-rinnovo">Prossimo rinnovo</label><input id="a-rinnovo" name="rinnovo" type="date" value="${a ? N.prossimoRinnovo(a, oggi()) : oggi()}" required></div>
    <div class="campo"><label for="a-cat">Categoria</label><select id="a-cat" name="categoria">${cat.map((c) => h`<option ${new Sicuro(c === (a?.categoria || "Abbonamenti") ? "selected" : "")}>${c}</option>`)}</select></div>
    ${a ? h`<label><input type="checkbox" name="attivo" ${new Sicuro(a.attivo ? "checked" : "")}> Attivo</label>` : ""}
    ${annullaConferma("Salva", a ? h`<button type="button" class="pericolo" data-azione="elimina" data-tabella="abbonamenti" data-uid="${uid}">Elimina</button>` : "")}
  </form>`);
}
function dialogoObiettivo() {
  apriDialogo(h`<form data-form="obiettivo" method="dialog"><h3>Nuovo obiettivo</h3>
    <div class="campo"><label for="o-nome">Nome</label><input id="o-nome" name="nome" placeholder="es. Vacanza" required></div>
    <div class="campo"><label for="o-tr">Traguardo €</label><input id="o-tr" name="traguardo" inputmode="decimal" required></div>
    <div class="campo"><label for="o-sc">Entro il (facoltativo)</label><input id="o-sc" name="scadenza" type="date" min="${oggi()}"></div>
    ${annullaConferma("Crea")}</form>`);
}
function dialogoImporto(titolo, form, uid, valore = "") {
  apriDialogo(h`<form data-form="${form}" data-uid="${uid || ""}" method="dialog"><h3>${titolo}</h3>
    <div class="campo"><label for="d-imp">Importo €</label><input id="d-imp" name="importo" class="importo" inputmode="decimal" value="${valore}" required></div>
    ${annullaConferma()}</form>`);
}
function dialogoVoce(uid) {
  const t = v().transazioni.find((x) => x.uid === uid);
  apriDialogo(h`<form method="dialog"><h3>${t.descrizione}</h3>
    <p class="sotto">${eur(t.importo)} · ${t.data.split("-").reverse().join("/")}${t.origine === "excel" ? " · importata dal PC" : ""}</p>
    <div class="azioni"><button type="button" data-azione="chiudi">Chiudi</button>
    <button type="button" class="pericolo" data-azione="elimina" data-tabella="transazioni" data-uid="${uid}">Elimina</button></div></form>`);
}
function dialogoConferma(testo, azione) {
  apriDialogo(h`<form method="dialog"><h3>Sei sicuro?</h3><p class="sotto">${testo}</p>
    <div class="azioni"><button type="button" data-azione="chiudi">Annulla</button><button type="button" class="pericolo" data-azione="${azione}" data-confermato="1">Conferma</button></div></form>`);
}

// ------------------------------------------------------------ azioni
const azioni = {
  "crea-passkey": async () => {
    try {
      const dk = await A.creaConPasskey();
      s.errore = "";
      if (dk) await dopoSblocco(dk); else disegnaConfermaPasskey();
    } catch (e) { s.errore = testoErrore(e, "Operazione annullata."); disegnaBenvenuto(); }
  },
  "completa-passkey": async () => {
    try { await dopoSblocco(await A.completaPasskey()); }
    catch (e) { s.errore = testoErrore(e, "Face ID annullato."); disegnaConfermaPasskey(); }
  },
  "annulla-passkey": async () => { await A.annullaPasskey(); s.errore = ""; disegnaBenvenuto(); },
  "usa-password": () => disegnaBenvenuto(true),
  sblocca: async () => { try { await dopoSblocco(await A.sblocca()); } catch (e) { s.errore = testoErrore(e, "Sblocco annullato."); schermataIniziale(); } },
  "accedi-google": async () => { if (s.dk) await salva(); D.accedi(); },
  "apri-fotocamera": () => { s.collega.fotocamera = true; disegnaCollega(); },
  "chiudi-fotocamera": () => { fermaFotocamera(); disegnaCollega(); },
  scheda: (el) => { s.scheda = el.dataset.scheda; s.esitoVoce = ""; disegna(); scrollTo(0, 0); },
  tipo: (el) => { s.tipo = el.dataset.tipo; disegna(); },
  voce: (el) => dialogoVoce(el.dataset.uid),
  abbonamento: (el) => dialogoAbbonamento(el.dataset.uid),
  obiettivo: () => dialogoObiettivo(),
  versa: (el) => dialogoImporto("Versa nell'obiettivo", "versa", el.dataset.uid),
  preleva: (el) => dialogoImporto("Preleva dall'obiettivo", "preleva", el.dataset.uid),
  stipendio: () => dialogoImporto("Stipendio netto mensile", "stipendio", "", formatta(v().stipendio)),
  conto: (el) => { const c = v().conti.find((x) => x.uid === el.dataset.uid); dialogoImporto(`Saldo di ${c.nome}`, "conto", c.uid, formatta(c.saldo)); },
  chiudi: () => dialogo.close(),
  elimina: async (el) => { A.elimina(s.st, el.dataset.tabella, el.dataset.uid); dialogo.close(); await cambiato(); },
  sincronizza: () => sincronizzaOra(),
  blocca: () => blocca(),
  "esci-google": () => { D.dimenticaToken(); s.serveAccesso = true; disegna(); },
  "cancella-tutto": async (el) => {
    if (!el.dataset.confermato) return dialogoConferma("Cancello archivio e chiavi da questo iPhone. I dati sul PC restano. Per riusare l'app dovrai ricollegarla.", "cancella-tutto");
    await A.cancellaArchivio(); D.dimenticaToken(); s = S0(); dialogo.close(); schermataIniziale();
  },
};

const moduli = {
  "sblocca-pw": async (f) => { try { await dopoSblocco(await A.sblocca(f.pw.value)); } catch (e) { s.errore = e.message; schermataIniziale(); } },
  "crea-pw": async (f) => {
    if (f.pw.value !== f.pw2.value) { s.errore = "Le due password non coincidono."; return disegnaBenvenuto(true); }
    try { await dopoSblocco(await A.creaConPassword(f.pw.value)); } catch (e) { s.errore = e.message; disegnaBenvenuto(true); }
  },
  voce: async (f) => {
    const imp = numero(f.importo.value);
    if (!(imp > 0)) { s.esitoVoce = "Scrivi un importo maggiore di zero."; return disegna(); }
    const id = A.uid(), entrata = s.tipo === "entrata";
    A.scriviRiga(s.st, "transazioni", id, { data: f.data.value, descrizione: f.descrizione.value.trim(), importo: imp,
      categoria_file: entrata ? "" : f.categoria.value, metodo: f.metodo.value, note: "", impronta: "manuale-" + id,
      tipo: entrata ? "entrata" : "spesa", origine: "manuale" });
    s.esitoVoce = `Aggiunta: ${f.descrizione.value.trim()}, ${eur(imp)}.`;
    await cambiato();
    $("#importo")?.focus();
  },
  abbonamento: async (f) => {
    const imp = numero(f.importo.value);
    if (!(imp > 0)) return;
    const uid = f.dataset.uid || A.uid();
    A.scriviRiga(s.st, "abbonamenti", uid, { nome: f.nome.value.trim(), importo: imp, frequenza: f.frequenza.value, rinnovo: f.rinnovo.value,
      categoria: f.categoria.value, registra_auto: 0, registrato_fino: "", attivo: f.attivo ? (f.attivo.checked ? 1 : 0) : 1, note: "" });
    await cambiato();
  },
  obiettivo: async (f) => {
    const t = numero(f.traguardo.value);
    if (!(t > 0)) return;
    A.scriviRiga(s.st, "obiettivi", A.uid(), { nome: f.nome.value.trim(), traguardo: t, scadenza: f.scadenza.value || null, creato: oggi() });
    await cambiato();
  },
  versa: async (f) => { const n = numero(f.importo.value); if (n > 0) { A.scriviRiga(s.st, "versamenti_obiettivo", A.uid(), { obiettivo_uid: f.dataset.uid, data: oggi(), importo: n, nota: "" }); await cambiato(); } },
  preleva: async (f) => { const n = numero(f.importo.value); if (n > 0) { A.scriviRiga(s.st, "versamenti_obiettivo", A.uid(), { obiettivo_uid: f.dataset.uid, data: oggi(), importo: -n, nota: "prelievo" }); await cambiato(); } },
  stipendio: async (f) => { const n = numero(f.importo.value); if (n >= 0) { A.scriviRiga(s.st, "impostazioni", "stipendio", { valore: n.toFixed(2) }); await cambiato(); } },
  conto: async (f) => { const n = numero(f.importo.value); if (Number.isFinite(n)) { A.scriviRiga(s.st, "conti", f.dataset.uid, { saldo: n, aggiornato: oggi() }); await cambiato(); } },
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-azione]");
  if (!el || el.disabled) return;
  e.preventDefault();
  azioni[el.dataset.azione]?.(el);
});
document.addEventListener("submit", (e) => {
  const f = e.target;
  if (!f.dataset.form) return;
  e.preventDefault();
  if (dialogo.open && dialogo.contains(f)) dialogo.close();
  moduli[f.dataset.form]?.(f);
});
document.addEventListener("change", (e) => {
  if (e.target.id === "foto-qr" && e.target.files[0]) qrDaFoto(e.target.files[0]);
  if (e.target.id === "categoria") s.categoriaToccata = true;
});
document.addEventListener("input", (e) => {  // categoria suggerita dalla descrizione, come sul PC
  if (e.target.id !== "descrizione" || s.categoriaToccata) return;
  const sel = $("#categoria");
  if (!sel) return;
  const r = v().regole[N.chiaveEsercente(e.target.value)];
  const ultima = v().transazioni.slice().reverse().find((t) => t.descrizione.toLowerCase() === e.target.value.trim().toLowerCase());
  const scelta = r || ultima?.categoria_file || N.categorizza(e.target.value);
  if ([...sel.options].some((o) => o.value === scelta)) sel.value = scelta;
});

// Protezione dal "clickjacking": GitHub Pages non permette di vietarlo con un'intestazione HTTP (frame-ancestors),
// quindi se la pagina viene caricata dentro un'altra pagina l'app non parte.
if (window.top !== window.self) {
  app.textContent = "Quiet Ledger si apre solo come pagina a sé, non dentro un altro sito.";
} else {
  avvio();
}
