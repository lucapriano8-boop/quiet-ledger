// Google Drive dal telefono, senza librerie di Google.
// Accesso: OAuth 2.0 con reindirizzamento (token di accesso breve, solo ambito drive.appdata).
// Il token vale circa un'ora e permette solo di leggere/scrivere la cartella nascosta dell'app,
// dove ci sono solo file cifrati.
import { GOOGLE_CLIENT_ID } from "./config.js";
import { b64url, casuali } from "./cripto.js";

const AMBITO = "https://www.googleapis.com/auth/drive.appdata";
const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const CHIAVE_TOKEN = "ql-token";

export class AccessoRichiesto extends Error {}
export class ErroreRemoto extends Error {}

const redirectUri = () => location.origin + location.pathname;

export function configurato() { return !!GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_ID.startsWith("INSERISCI"); }

/** Porta alla pagina di Google; al ritorno `riceviToken()` legge la risposta. */
export function accedi({ silenzioso = false, email = "" } = {}) {
  const stato = b64url(casuali(24));
  sessionStorage.setItem("ql-stato-oauth", stato);
  const p = new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, redirect_uri: redirectUri(), response_type: "token",
    scope: AMBITO, state: stato, include_granted_scopes: "false" });
  if (silenzioso) p.set("prompt", "none");
  if (email) p.set("login_hint", email);
  location.assign("https://accounts.google.com/o/oauth2/v2/auth?" + p);
}

/** Da chiamare all'avvio: se l'URL contiene la risposta di Google, salva il token e pulisce l'indirizzo. */
export function riceviToken() {
  if (!location.hash.includes("state=")) return null;
  const q = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, "", location.pathname);  // il token non resta nell'indirizzo né nella cronologia
  const atteso = sessionStorage.getItem("ql-stato-oauth");
  sessionStorage.removeItem("ql-stato-oauth");
  if (!atteso || q.get("state") !== atteso) return { errore: "Risposta di accesso non valida." };
  if (q.get("error")) return { errore: q.get("error") };
  if (!(q.get("scope") || "").split(" ").includes(AMBITO)) return { errore: "Serve il permesso per la cartella dell'app su Drive." };
  localStorage.setItem(CHIAVE_TOKEN, JSON.stringify({ t: q.get("access_token"), scade: Date.now() + (Number(q.get("expires_in")) || 3600) * 1000 }));
  return { ok: true };
}

export function tokenValido() {
  try {
    const t = JSON.parse(localStorage.getItem(CHIAVE_TOKEN));
    return t && t.scade - 60_000 > Date.now() ? t.t : null;
  } catch { return null; }
}
export const dimenticaToken = () => localStorage.removeItem(CHIAVE_TOKEN);

async function richiesta(url, opzioni = {}) {
  const token = tokenValido();
  if (!token) throw new AccessoRichiesto("Accesso a Google scaduto.");
  let r;
  try {
    r = await fetch(url, { ...opzioni, headers: { ...(opzioni.headers || {}), Authorization: `Bearer ${token}` },
                           cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
  } catch { throw new ErroreRemoto("Connessione a Google Drive non riuscita."); }
  if (r.status === 401) { dimenticaToken(); throw new AccessoRichiesto("Accesso a Google scaduto."); }
  if (!r.ok) throw new ErroreRemoto(`Google Drive ha risposto con un errore (${r.status}).`);
  return r;
}

const NOME_VALIDO = /^[a-z]+-[0-9a-f-]{1,64}$/;
const ids = new Map();

export async function elenca(prefisso) {
  const nomi = [];
  let pagina = null;
  do {
    const p = new URLSearchParams({ spaces: "appDataFolder", q: `name contains '${prefisso}' and trashed = false`,
                                    fields: "nextPageToken,files(id,name)", pageSize: "1000" });
    if (pagina) p.set("pageToken", pagina);
    const r = await (await richiesta(`${API}?${p}`)).json();
    for (const f of r.files || []) if (f.name.startsWith(prefisso) && NOME_VALIDO.test(f.name)) { nomi.push(f.name); if (!ids.has(f.name)) ids.set(f.name, f.id); }
    pagina = r.nextPageToken;
  } while (pagina);
  return [...new Set(nomi)].sort();
}

async function idDi(nome) {
  if (!ids.has(nome)) await elenca(nome);
  if (!ids.has(nome)) throw new ErroreRemoto(`${nome} non trovato su Drive`);
  return ids.get(nome);
}

export async function leggi(nome) {
  return new Uint8Array(await (await richiesta(`${API}/${await idDi(nome)}?alt=media`)).arrayBuffer());
}

export async function scrivi(nome, dati) {
  if (!NOME_VALIDO.test(nome)) throw new Error("Nome non valido");
  const confine = "ql" + b64url(casuali(18));
  const meta = new TextEncoder().encode(`--${confine}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: nome, parents: ["appDataFolder"] }) + `\r\n--${confine}\r\nContent-Type: application/octet-stream\r\n\r\n`);
  const coda = new TextEncoder().encode(`\r\n--${confine}--`);
  const corpo = new Uint8Array(meta.length + dati.length + coda.length);
  corpo.set(meta); corpo.set(dati, meta.length); corpo.set(coda, meta.length + dati.length);
  const r = await (await richiesta(`${UPLOAD}?uploadType=multipart&fields=id`, { method: "POST", body: corpo,
    headers: { "Content-Type": `multipart/related; boundary=${confine}` } })).json();
  ids.set(nome, r.id);
}
