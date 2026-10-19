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
  const { data, error } = await sb.from("smaker").select("*").eq("aktiv", true).order("pris").order("navn");
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
  const { data: erAdmin } = await sb.rpc("er_admin");
  $("#admin").hidden = !erAdmin;
  if (erAdmin) visAdmin();
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
  if (!bruker) return ($("#admin").hidden = true);
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

// ---- Admin: kalender over hva som skal med hver dag ----
let adminMnd = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let adminData = [], valgtDato = null;

async function visAdmin() {
  const forste = adminMnd, siste = new Date(forste.getFullYear(), forste.getMonth() + 1, 0);
  const start = new Date(forste); start.setDate(start.getDate() - ((forste.getDay() + 6) % 7));
  const slutt = new Date(siste); slutt.setDate(slutt.getDate() + (6 - ((siste.getDay() + 6) % 7)));
  const { data, error } = await sb.rpc("admin_bestillinger", { fra: iso(start), til: iso(slutt) });
  if (error) return ($("#kal").textContent = "Kunne ikke hente bestillinger.");
  adminData = data;
  const idag = iso(new Date());
  if (!valgtDato || !adminData.some((o) => o.dato === valgtDato))
    valgtDato = (adminData.find((o) => o.dato >= idag) || {}).dato || null;
  $("#mnd-tittel").textContent = forste.toLocaleDateString("nb-NO", { month: "long", year: "numeric" });

  let html = DAGER.map((d) => `<div class="dn">${d.slice(0, 3)}</div>`).join("");
  for (const d = new Date(start); d <= slutt; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const dato = iso(d), dagens = adminData.filter((o) => o.dato === dato);
    const perSmak = {};
    dagens.forEach((o) => (perSmak[o.smak] = (perSmak[o.smak] || 0) + o.antall));
    const tot = dagens.reduce((t, o) => t + o.antall, 0);
    const klasser = ["dag", d.getMonth() !== forste.getMonth() && "annen", dato === idag && "idag", dato === valgtDato && "valgt", tot && "har"].filter(Boolean).join(" ");
    html += `<button class="${klasser}" data-dato="${dato}"><span class="nr">${d.getDate()}</span>` +
      (tot ? `<span class="tot">${tot} ${tot === 1 ? "boks" : "bokser"}</span>` +
        Object.entries(perSmak).map(([s, n]) => `<span class="l">${n}× ${esc(s)}</span>`).join("") : "") + "</button>";
  }
  $("#kal").innerHTML = html;
  visDag();
}

function visDag() {
  const boks = $("#admin-dag");
  if (!valgtDato) return (boks.innerHTML = "<p class='tom'>Ingen bestillinger å vise ennå. Velg en dag i kalenderen.</p>");
  const dagens = adminData.filter((o) => o.dato === valgtDato);
  const grupper = {};
  dagens.forEach((o) => (grupper[o.smak] ||= []).push(o));
  const tot = dagens.reduce((t, o) => t + o.antall, 0);
  boks.innerHTML = `<h3>${pent(valgtDato)}</h3>` + (tot ? `<p><b>Ta med ${tot} ${tot === 1 ? "boks" : "bokser"} i alt</b></p>` +
    Object.entries(grupper).map(([smak, l]) =>
      `<p><b>${l.reduce((t, o) => t + o.antall, 0)}× ${esc(smak)}</b><br><small>${l.map((o) => esc(o.epost) + (o.antall > 1 ? ` (${o.antall})` : "")).join(", ")}</small></p>`).join("")
    : "<p class='tom'>Ingen bestillinger denne dagen.</p>");
}

$("#kal").onclick = (e) => {
  const knapp = e.target.closest("[data-dato]");
  if (!knapp) return;
  valgtDato = knapp.dataset.dato;
  document.querySelectorAll("#kal .dag").forEach((k) => k.classList.toggle("valgt", k === knapp));
  visDag();
};
$("#mnd-forrige").onclick = () => { adminMnd = new Date(adminMnd.getFullYear(), adminMnd.getMonth() - 1, 1); visAdmin(); };
$("#mnd-neste").onclick = () => { adminMnd = new Date(adminMnd.getFullYear(), adminMnd.getMonth() + 1, 1); visAdmin(); };
