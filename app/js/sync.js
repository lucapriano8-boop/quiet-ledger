// Protocollo di sincronizzazione, lato telefono (dispositivo secondario). Specchio di quiet_ledger/sync/motore.py.
import * as c from "./cripto.js";
import { applicaModifiche, modificheLocali } from "./archivio.js";

const RE_LOTTO = /^lotto-(\d{4})-([0-9a-f]{12})-(\d{8})$/;
const RE_EPOCA = /^epoca-(\d{4})$/;
const PREFISSO_QR = "LS1:";

export class DispositivoScollegato extends Error {}
export class ErroreSync extends Error {}

const nomeLotto = (e, d, s) => `lotto-${String(e).padStart(4, "0")}-${d}-${String(s).padStart(8, "0")}`;
const json = (b) => JSON.parse(c.daUtf8(b));
const jsonBytes = (o) => c.utf8(JSON.stringify(o));

/** Legge il QR del PC, invia la richiesta di collegamento e restituisce il codice da confrontare. */
export async function unisciti(st, remoto, qr, nome) {
  if (!qr.startsWith(PREFISSO_QR)) throw new ErroreSync("Questo non è un QR code di Quiet Ledger.");
  let d;
  try { d = JSON.parse(c.daUtf8(c.unb64url(qr.slice(PREFISSO_QR.length)))); } catch { throw new ErroreSync("QR code non leggibile."); }
  if (d.v !== 1) throw new ErroreSync("Versione non supportata: aggiorna l'app.");
  const segreto = c.unb64url(d.p);
  const coppia = await c.nuovaCoppiaEcdh();
  st.sync = { ruolo: "secondario", nome, ecdh: c.b64(coppia.privata), pub: c.b64(coppia.pubblica),
              firma_pub_principale: c.b64(c.unb64url(d.f)), principale: d.d, epoca: 0, chiavi: {}, membri: {},
              revocati: {}, seq: 1, letto: {}, inviato: st.ultimoHlc || "" };
  const chiave = await c.hkdf(segreto, c.utf8("libro-spese/invito"));
  const richiesta = jsonBytes({ dev: st.dispositivo, nome, pub: c.b64(coppia.pubblica) });
  await remoto.scrivi(`invito-${d.i}`, await c.sigilla(chiave, richiesta, c.utf8(`invito|${d.i}`)));
  return c.codiceVerifica(segreto, coppia.pubblica);
}

async function applicaEpoche(st, remoto, riepilogo) {
  const s = st.sync;
  const era = s.epoca;
  const nuove = (await remoto.elenca("epoca-")).map((n) => [n, RE_EPOCA.exec(n)]).filter(([, m]) => m && Number(m[1]) > s.epoca)
    .map(([n, m]) => [n, Number(m[1])]).sort((a, b) => a[1] - b[1]);
  const pubPc = c.unb64(s.firma_pub_principale);
  for (const [nome, n] of nuove) {
    let contenuto;
    try {
      const inv = json(await remoto.leggi(nome));
      const grezzo = c.unb64(inv.contenuto);
      await c.verificaFirma(pubPc, grezzo, c.unb64(inv.firma));
      contenuto = json(grezzo);
    } catch { riepilogo.avvisi.push(`Ignorato un elenco dispositivi non firmato dal PC (epoca ${n})`); continue; }
    if (contenuto.epoca !== n || contenuto.principale !== s.principale) { riepilogo.avvisi.push(`Elenco dispositivi incoerente (epoca ${n})`); continue; }
    const mia = contenuto.chiavi?.[st.dispositivo];
    if (!mia) {
      if (era > 0) throw new DispositivoScollegato("Questo iPhone è stato scollegato dal PC.");
      continue;  // richiesta non ancora approvata
    }
    s.chiavi[n] = c.b64(await c.svolgi(c.unb64(s.ecdh), mia, `epoca|${n}|${st.dispositivo}`));
    s.epoca = n; s.membri = contenuto.membri; s.revocati = contenuto.revocati || {};
  }
  if (era === 0 && s.epoca > 0) {  // primo collegamento: istantanea completa dal PC
    const n = s.epoca;
    const dati = json(await c.apri(c.unb64(s.chiavi[n]), await remoto.leggi(`istantanea-${String(n).padStart(4, "0")}`), c.utf8(`istantanea|${n}`)));
    riepilogo.ricevute += applicaModifiche(st, dati.righe);
    s.letto = Object.fromEntries(Object.entries(dati.letto || {}).filter(([d]) => d !== st.dispositivo));
  }
}

/** Un giro completo: elenco dispositivi, modifiche altrui, invio delle proprie. */
export async function sincronizza(st, remoto) {
  const s = st.sync;
  const riepilogo = { ricevute: 0, inviate: 0, inAttesa: false, avvisi: [] };
  await applicaEpoche(st, remoto, riepilogo);
  if (!s.epoca) { riepilogo.inAttesa = true; return riepilogo; }
  const lotti = [];
  for (const nome of await remoto.elenca("lotto-")) {
    const m = RE_LOTTO.exec(nome);
    if (!m) continue;
    const [e, d, seq] = [Number(m[1]), m[2], Number(m[3])];
    if (d === st.dispositivo || seq <= (s.letto[d] || 0)) continue;
    if (!(d in s.membri) && !(d in s.revocati)) continue;
    if (d in s.revocati && seq > s.revocati[d]) continue;
    if (!s.chiavi[e]) continue;
    lotti.push({ nome, e, d, seq });
  }
  lotti.sort((a, b) => (a.d === b.d ? a.seq - b.seq : a.d.localeCompare(b.d)));
  for (const l of lotti) {
    let dati;
    try { dati = json(await c.apri(c.unb64(s.chiavi[l.e]), await remoto.leggi(l.nome), c.utf8(`lotto|${l.e}|${l.d}|${l.seq}`))); }
    catch { riepilogo.avvisi.push(`Ignorato un pacchetto non valido (${l.d}, n. ${l.seq})`); continue; }
    if (dati.dev !== l.d || dati.seq !== l.seq || !Array.isArray(dati.modifiche)) { riepilogo.avvisi.push("Ignorato un pacchetto incoerente"); continue; }
    riepilogo.ricevute += applicaModifiche(st, dati.modifiche);
    s.letto[l.d] = l.seq;
  }
  const mods = modificheLocali(st, s.inviato || "");
  if (mods.length) {
    const n = s.epoca, seq = s.seq;
    const blob = await c.sigilla(c.unb64(s.chiavi[n]), jsonBytes({ dev: st.dispositivo, seq, modifiche: mods }), c.utf8(`lotto|${n}|${st.dispositivo}|${seq}`));
    await remoto.scrivi(nomeLotto(n, st.dispositivo, seq), blob);
    s.seq = seq + 1;
    s.inviato = mods.reduce((a, m) => (m.m > a ? m.m : a), s.inviato || "");
    riepilogo.inviate = mods.length;
  }
  s.ultima = new Date().toISOString();
  return riepilogo;
}
