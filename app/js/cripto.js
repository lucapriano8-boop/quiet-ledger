// Mattoni crittografici: specchio esatto di quiet_ledger/sync/cripto.py (vedi PROTOCOLLO_SYNC.md).
// Solo WebCrypto del browser: nessuna libreria esterna.

const sottile = crypto.subtle;
const testo = new TextEncoder();
const leggiTesto = new TextDecoder();

export class DatiNonValidi extends Error {}

// ------------------------------------------------------------ codifiche
export const utf8 = (s) => testo.encode(s);
export const daUtf8 = (b) => leggiTesto.decode(b);

export function b64(bytes) {
  let s = "";
  const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export const b64url = (b) => b64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64url = (s) => unb64(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
export const esa = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export const casuali = (n) => crypto.getRandomValues(new Uint8Array(n));

export function concatena(...parti) {
  const n = parti.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let i = 0;
  for (const p of parti) { out.set(p, i); i += p.length; }
  return out;
}

// ------------------------------------------------------------ compressione (zlib RFC 1950 = "deflate")
async function flusso(dati, trasformazione, massimo = 64 * 1024 * 1024) {
  const lettore = new Blob([dati]).stream().pipeThrough(trasformazione).getReader();
  const pezzi = [];
  let totale = 0;
  for (;;) {
    const { value, done } = await lettore.read();
    if (done) break;
    totale += value.length;
    if (totale > massimo) { await lettore.cancel(); throw new DatiNonValidi("Contenuto troppo grande"); }
    pezzi.push(value);
  }
  return concatena(...pezzi);
}
export const comprimi = (d) => flusso(d, new CompressionStream("deflate"));
export const decomprimi = (d) => flusso(d, new DecompressionStream("deflate"));

// ------------------------------------------------------------ HKDF-SHA256 (sale vuoto = come Python salt=None)
export async function hkdf(materiale, info, lunghezza = 32) {
  const k = await sottile.importKey("raw", materiale, "HKDF", false, ["deriveBits"]);
  const bits = await sottile.deriveBits({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info }, k, lunghezza * 8);
  return new Uint8Array(bits);
}

// ------------------------------------------------------------ AES-256-GCM
const chiaveAes = (raw, usi) => sottile.importKey("raw", raw, "AES-GCM", false, usi);

export async function cifra(raw, dati, aad) {
  const nonce = casuali(12);
  const c = await sottile.encrypt({ name: "AES-GCM", iv: nonce, additionalData: aad }, await chiaveAes(raw, ["encrypt"]), dati);
  return concatena(nonce, new Uint8Array(c));
}
export async function decifra(raw, sigillato, aad) {
  if (sigillato.length < 28) throw new DatiNonValidi("File troppo corto");
  try {
    return new Uint8Array(await sottile.decrypt({ name: "AES-GCM", iv: sigillato.subarray(0, 12), additionalData: aad },
      await chiaveAes(raw, ["decrypt"]), sigillato.subarray(12)));
  } catch { throw new DatiNonValidi("Decifratura non riuscita"); }
}
// come cripto.sigilla / cripto.apri: comprime, poi cifra
export const sigilla = async (raw, dati, aad) => cifra(raw, await comprimi(dati), aad);
export const apri = async (raw, sigillato, aad) => decomprimi(await decifra(raw, sigillato, aad));

// ------------------------------------------------------------ P-256
const P256 = { name: "ECDH", namedCurve: "P-256" };

export async function nuovaCoppiaEcdh() {
  const k = await sottile.generateKey(P256, true, ["deriveBits"]);
  return { privata: new Uint8Array(await sottile.exportKey("pkcs8", k.privateKey)),
           pubblica: new Uint8Array(await sottile.exportKey("raw", k.publicKey)) };
}
const pubEcdh = async (raw) => {
  try { return await sottile.importKey("raw", raw, P256, false, []); } catch { throw new DatiNonValidi("Chiave pubblica non valida"); }
};
const privEcdh = (pkcs8) => sottile.importKey("pkcs8", pkcs8, P256, false, ["deriveBits"]);

export async function verificaFirma(pubRaw, dati, firma) {
  if (firma.length !== 64) throw new DatiNonValidi("Firma non valida");
  let pub;
  try { pub = await sottile.importKey("raw", pubRaw, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]); }
  catch { throw new DatiNonValidi("Chiave di firma non valida"); }
  const ok = await sottile.verify({ name: "ECDSA", hash: "SHA-256" }, pub, firma, dati);
  if (!ok) throw new DatiNonValidi("Firma non valida");
}

// ECIES: come cripto.svolgi
export async function svolgi(privPkcs8, avvolto, contesto) {
  try {
    const condiviso = new Uint8Array(await sottile.deriveBits({ name: "ECDH", public: await pubEcdh(unb64(avvolto.effimera)) },
      await privEcdh(privPkcs8), 256));
    const kek = await hkdf(condiviso, utf8("libro-spese/avvolgi/" + contesto));
    return await decifra(kek, concatena(unb64(avvolto.nonce), unb64(avvolto.dati)), utf8(contesto));
  } catch { throw new DatiNonValidi("Chiave non destinata a questo dispositivo"); }
}

export async function codiceVerifica(segreto, pubblica) {
  const b = await hkdf(segreto, concatena(utf8("libro-spese/verifica"), pubblica), 4);
  const n = new DataView(b.buffer).getUint32(0) % 1_000_000;
  return String(n).padStart(6, "0");
}
