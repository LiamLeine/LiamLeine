const DAGER = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag"];

const $ = (s) => document.querySelector(s);
const kr = (n) => n.toLocaleString("nb-NO") + " kr";
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const pent = (s) => new Date(s + "T12:00").toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long" });
// Neste forekomst av ukedagen (0 = mandag), tidligst i morgen
function nesteDato(i) {
  const d = new Date();
  d.setDate(d.getDate() + ((i - ((d.getDay() + 6) % 7) + 6) % 7) + 1);
  return iso(d);
}

if (!window.supabase || SUPABASE_URL.includes("DIN-")) {
  document.querySelector("main").innerHTML =
    '<section class="boks"><h2>Supabase er ikke satt opp</h2><p>Fyll inn <code>SUPABASE_URL</code> og <code>SUPABASE_ANON_KEY</code> i <code>config.js</code>. Se README.md.</p></section>';
  throw new Error("Mangler Supabase-oppsett");
}
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let SMAKER = [], bruker = null, modus = "inn";

// ---- Innlogging ----
function velgFane(m) {
  modus = m;
  $("#fane-inn").classList.toggle("aktiv", m === "inn");
  $("#fane-ny").classList.toggle("aktiv", m === "ny");
  $("#a-knapp").textContent = m === "inn" ? "Logg inn" : "Opprett bruker";
  $("#a-pass").autocomplete = m === "inn" ? "current-password" : "new-password";
  $("#a-feil").textContent = "";
}
$("#fane-inn").onclick = () => velgFane("inn");
$("#fane-ny").onclick = () => velgFane("ny");

$("#skjema-auth").onsubmit = async (e) => {
  e.preventDefault();
  const email = $("#a-navn").value.trim(), password = $("#a-pass").value, feil = $("#a-feil");
  feil.textContent = "";
  if (modus === "ny") {
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) return (feil.textContent = error.message.includes("registered") ? "E-posten er allerede registrert." : "Kunne ikke opprette bruker: " + error.message);
    if (!data.session) return (feil.textContent = "Sjekk e-posten din og bekreft brukeren før du logger inn.");
  } else {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return (feil.textContent = error.message.includes("confirmed") ? "Bekreft e-posten din først." : "Feil e-post eller passord.");
  }
  e.target.reset();
};
$("#loggut").onclick = () => sb.auth.signOut();

// ---- Smaker (hentes fra databasen) ----
async function lastSmaker() {
  const { data, error } = await sb.from("smaker").select("*").order("pris").order("navn");
  if (error) return ($("#b-melding").textContent = "Kunne ikke hente smaker.");
  SMAKER = data;
  $("#smaker").innerHTML = SMAKER.map((s, i) =>
    `<label><input type="radio" name="smak" value="${esc(s.id)}" ${i === 0 ? "checked" : ""}><span style="--c:${esc(s.farge)}">${esc(s.navn)}<b>${kr(s.pris)}</b></span></label>`).join("");
}
$("#dager").innerHTML = DAGER.map((d, i) => `<label><input type="checkbox" name="dag" value="${i}"><span>${d}</span></label>`).join("");

const valgteDager = () => [...document.querySelectorAll("[name=dag]:checked")].map((x) => +x.value);
const valgtSmak = () => { const r = document.querySelector("[name=smak]:checked"); return r && SMAKER.find((s) => s.id === r.value); };
function oppdaterSum() {
  const n = valgteDager().length, s = valgtSmak(), a = Math.max(1, Math.min(3, +$("#antall").value || 1));
  $("#sum").textContent = n && s ? `${n} ${n === 1 ? "dag" : "dager"} × ${a} × ${kr(s.pris)} = ${kr(n * a * s.pris)}` : "";
}
$("#bestill").addEventListener("input", oppdaterSum);

// ---- Bestilling ----
$("#bestill").onsubmit = async (e) => {
  e.preventDefault();
  const melding = $("#b-melding"), dager = valgteDager(), smak = valgtSmak();
  if (!dager.length) return (melding.textContent = "Velg minst én ukedag.");
  const antall = Math.max(1, Math.min(3, +$("#antall").value || 1));
  const datoer = dager.map(nesteDato);
  // Ny bestilling erstatter eventuell eksisterende bestilling samme dag
  await sb.from("bestillinger").delete().in("dato", datoer);
  const { error } = await sb.from("bestillinger").insert(datoer.map((dato) => ({ dato, smak_id: smak.id, antall })));
  if (error) return (melding.textContent = "Kunne ikke lagre bestillingen. Prøv igjen.");
  melding.textContent = `Registrert: ${smak.navn} for ${dager.length} ${dager.length === 1 ? "dag" : "dager"}.`;
  e.target.reset();
  oppdaterSum();
  visOrdre();
};

async function visOrdre() {
  const { data, error } = await sb.from("bestillinger").select("id,dato,antall,pris,smaker(navn)").order("dato", { ascending: false });
  if (error) return ($("#b-melding").textContent = "Kunne ikke hente bestillingene dine.");
  const idag = iso(new Date());
  const sum = (l) => l.reduce((t, o) => t + o.pris * o.antall, 0);
  const brukt = data.filter((o) => o.dato <= idag), planlagt = data.filter((o) => o.dato > idag);
  $("#s-brukt").textContent = kr(sum(brukt));
  $("#s-bokser").textContent = brukt.reduce((t, o) => t + o.antall, 0);
  $("#s-planlagt").textContent = kr(sum(planlagt));
  $("#tom").hidden = data.length > 0;
  $("#tabell").hidden = !data.length;
  $("#rader").innerHTML = data.map((o) => `<tr class="${o.dato > idag ? "planlagt" : ""}">
    <td>${pent(o.dato)}</td><td>${esc(o.smaker.navn)}</td><td>${o.antall}</td><td>${kr(o.pris * o.antall)}</td>
    <td>${o.dato > idag ? `<button class="lenke" data-id="${o.id}">Avbestill</button>` : ""}</td></tr>`).join("");
}
$("#rader").onclick = async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;
  await sb.from("bestillinger").delete().eq("id", id);
  visOrdre();
};

async function vis() {
  $("#innlogging").hidden = !!bruker;
  $("#app").hidden = !bruker;
  $("#bruker").hidden = !bruker;
  if (!bruker) return;
  $("#brukernavn").textContent = bruker.email;
  await lastSmaker();
  oppdaterSum();
  visOrdre();
}
// Utløses ved sidelasting, innlogging og utlogging. setTimeout unngår deadlock i Supabase-klienten.
sb.auth.onAuthStateChange((_hendelse, sesjon) => {
  bruker = sesjon?.user ?? null;
  setTimeout(vis, 0);
});
