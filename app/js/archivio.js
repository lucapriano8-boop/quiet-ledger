// Archivio locale del telefono: tutti i dati in un unico blocco cifrato (AES-256-GCM) dentro IndexedDB.
// La chiave dei dati (DK) è a sua volta cifrata con una chiave che nasce da Face ID (passkey con PRF) oppure,
// in alternativa, da una password lunga (PBKDF2-SHA256, 600 000 iterazioni).
import * as c from "./cripto.js";

const DB_NOME = "quiet-ledger";
const AAD_DATI = c.utf8("quiet-ledger/locale/v1");
const INFO_PRF = c.utf8("quiet-ledger/sblocco/prf");
const ITERAZIONI_PBKDF2 = 600_000;

// ------------------------------------------------------------ IndexedDB minimale (chiave -> valore)
function apriDb() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(DB_NOME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}
async function kv(modo, fn) {
  const db = await apriDb();
  return new Promise((ok, ko) => {
    const t = db.transaction("kv", modo);
    const r = fn(t.objectStore("kv"));
    t.oncomplete = () => { db.close(); ok(r?.result); };
    t.onerror = () => { db.close(); ko(t.error); };
  });
}
const leggi = (k) => kv("readonly", (s) => s.get(k));
const scrivi = (k, v) => kv("readwrite", (s) => s.put(v, k));
const cancellaTutto = () => kv("readwrite", (s) => s.clear());

// ------------------------------------------------------------ sblocco
export const passkeyDisponibile = () => !!(window.PublicKeyCredential && navigator.credentials);

async function kekDaPrf(prf) { return c.hkdf(new Uint8Array(prf), INFO_PRF); }
async function kekDaPassword(pw, sale) {
  const k = await crypto.subtle.importKey("raw", c.utf8(pw), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sale, iterations: ITERAZIONI_PBKDF2 }, k, 256));
}

async function leggiPrf(credId, sale) {
  const a = await navigator.credentials.get({ publicKey: {
    challenge: c.casuali(32), rpId: location.hostname, userVerification: "required", timeout: 120000,
    allowCredentials: [{ type: "public-key", id: credId }],
    extensions: { prf: { eval: { first: sale } } } } });
  const r = a.getClientExtensionResults()?.prf?.results?.first;
  if (!r) throw new Error("Questo dispositivo non supporta lo sblocco con Face ID per le app web (serve iOS 18 o successivo).");
  return r;
}

export const esisteArchivio = async () => !!(await leggi("cassaforte"));

// Su iPhone Face ID si può chiedere solo come risposta diretta a un tocco. iOS 18 crea la passkey ma dà il
// segreto PRF solo all'accesso: in quel caso la creazione si completa con un secondo tocco ("Conferma con Face ID").
const IN_ATTESA = "passkey-in-attesa";
export const passkeyInAttesa = async () => !!(await leggi(IN_ATTESA));
export const annullaPasskey = () => kv("readwrite", (s) => s.delete(IN_ATTESA));

async function salvaPasskey(credId, sale, prf) {
  const dk = c.casuali(32);
  const kek = await kekDaPrf(prf);
  await scrivi("cassaforte", { v: 1, metodo: "passkey", credId: c.b64(credId), sale: c.b64(sale),
                               dk: c.b64(await c.cifra(kek, dk, c.utf8("dk"))) });
  return dk;
}

/** Crea la protezione con Face ID. Restituisce la chiave dei dati, oppure null se serve il secondo tocco. */
export async function creaConPasskey() {
  const sale = c.casuali(32);
  const cred = await navigator.credentials.create({ publicKey: {
    rp: { id: location.hostname, name: "Quiet Ledger" },
    user: { id: c.casuali(16), name: "Quiet Ledger", displayName: "Quiet Ledger" },
    challenge: c.casuali(32), timeout: 120000,
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
    extensions: { prf: { eval: { first: sale } } } } });
  const est = cred.getClientExtensionResults()?.prf;
  if (est && est.enabled === false) throw new Error("Face ID non utilizzabile qui: serve iOS 18 o successivo. Usa una password.");
  const credId = new Uint8Array(cred.rawId);
  const prf = est?.results?.first;
  if (prf) return salvaPasskey(credId, sale, prf);
  await scrivi(IN_ATTESA, { credId: c.b64(credId), sale: c.b64(sale) });
  return null;
}

/** Secondo tocco: legge il segreto PRF con Face ID e completa la protezione. */
export async function completaPasskey() {
  const p = await leggi(IN_ATTESA);
  if (!p) throw new Error("La configurazione di Face ID non è più in corso: ricomincia.");
  const credId = c.unb64(p.credId), sale = c.unb64(p.sale);
  const dk = await salvaPasskey(credId, sale, await leggiPrf(credId, sale));
  await annullaPasskey();
  return dk;
}

export async function creaConPassword(pw) {
  if (pw.length < 12) throw new Error("La password deve avere almeno 12 caratteri.");
  const sale = c.casuali(16), dk = c.casuali(32);
  await scrivi("cassaforte", { v: 1, metodo: "password", sale: c.b64(sale),
                               dk: c.b64(await c.cifra(await kekDaPassword(pw, sale), dk, c.utf8("dk"))) });
  return dk;
}

export async function metodoSblocco() { return (await leggi("cassaforte"))?.metodo; }

export async function sblocca(password) {
  const cf = await leggi("cassaforte");
  const kek = cf.metodo === "passkey"
    ? await kekDaPrf(await leggiPrf(c.unb64(cf.credId), c.unb64(cf.sale)))
    : await kekDaPassword(password, c.unb64(cf.sale));
  try { return await c.decifra(kek, c.unb64(cf.dk), c.utf8("dk")); }
  catch { throw new Error(cf.metodo === "passkey" ? "Sblocco non riuscito." : "Password errata."); }
}

// ------------------------------------------------------------ dati
export async function caricaDati(dk) {
  const blob = await leggi("dati");
  return blob ? JSON.parse(c.daUtf8(await c.apri(dk, c.unb64(blob), AAD_DATI))) : null;
}
export async function salvaDati(dk, dati) {
  await scrivi("dati", c.b64(await c.sigilla(dk, c.utf8(JSON.stringify(dati)), AAD_DATI)));
}
export async function cancellaArchivio() { await cancellaTutto(); }

// ------------------------------------------------------------ righe sincronizzate (stesso modello del PC)
export function nuovoStato() {
  return { versione: 1, dispositivo: c.esa(c.casuali(6)), ultimoHlc: "", righe: {}, sync: {} };
}

export function hlc(st) {
  const adesso = Date.now(), u = st.ultimoHlc || "";
  const ms = /^\d{13}/.test(u) ? Number(u.slice(0, 13)) : 0;
  const ctr = u[13] === "-" ? Number(u.slice(14, 19)) || 0 : 0;
  const [m, k] = adesso > ms ? [adesso, 0] : [ms, ctr + 1];
  st.ultimoHlc = `${String(m).padStart(13, "0")}-${String(k).padStart(5, "0")}.${st.dispositivo}`;
  return st.ultimoHlc;
}

export const uid = () => c.esa(c.casuali(16));

export function scriviRiga(st, t, k, d, eliminato = 0) {
  (st.righe[t] ??= {})[k] = { m: hlc(st), x: eliminato ? 1 : 0, d: { ...(st.righe[t]?.[k]?.d || {}), ...d } };
}
export const elimina = (st, t, k) => { if (st.righe[t]?.[k]) scriviRiga(st, t, k, {}, 1); };

export function modificheLocali(st, dopo) {
  const out = [];
  const suff = "." + st.dispositivo;
  for (const [t, righe] of Object.entries(st.righe))
    for (const [k, r] of Object.entries(righe))
      if (r.m > dopo && r.m.endsWith(suff)) out.push({ t, k, m: r.m, x: r.x, d: r.d });
  return out;
}

const TABELLE = new Set(["transazioni", "abbonamenti", "conti", "obiettivi", "versamenti_obiettivo", "regole_categoria",
                         "categorie", "impostazioni"]);
export function applicaModifiche(st, mods) {
  let n = 0;
  for (const r of mods) {
    if (!TABELLE.has(r.t) || typeof r.m !== "string" || typeof r.d !== "object" || r.d === null) continue;
    const loc = st.righe[r.t]?.[r.k];
    if (loc && loc.m >= r.m) continue;
    (st.righe[r.t] ??= {})[r.k] = { m: r.m, x: r.x ? 1 : 0, d: r.d };
    if (r.m.slice(0, 19) > (st.ultimoHlc || "").slice(0, 19)) st.ultimoHlc = r.m.slice(0, 19) + "." + st.dispositivo;
    n++;
  }
  return n;
}

// vista comoda per l'analisi e l'interfaccia (solo righe non eliminate)
export function vista(st) {
  const vivi = (t) => Object.entries(st.righe[t] || {}).filter(([, r]) => !r.x).map(([k, r]) => ({ uid: k, ...r.d }));
  const impostazioni = Object.fromEntries(vivi("impostazioni").map((r) => [r.uid, r.valore]));
  return {
    transazioni: vivi("transazioni").map((t) => ({ ...t, importo: Number(t.importo) })),
    abbonamenti: vivi("abbonamenti").map((a) => ({ ...a, attivo: !!a.attivo, importo: Number(a.importo) })),
    conti: vivi("conti"),
    obiettivi: vivi("obiettivi").filter((o) => o.nome),
    versamenti: vivi("versamenti_obiettivo"),
    regole: Object.fromEntries(vivi("regole_categoria").map((r) => [r.uid, r.categoria])),
    categorie: vivi("categorie").sort((a, b) => a.ordine - b.ordine).map((r) => r.uid),
    stipendio: impostazioni.stipendio,
  };
}
