document.querySelector("#versjon").textContent = "· v11";
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
  $("#navn-felt").hidden = m !== "ny";
  $("#a-fullnavn").required = m === "ny";
  $("#a-feil").textContent = "";
}
$("#fane-inn").onclick = () => velgFane("inn");
$("#fane-ny").onclick = () => velgFane("ny");

$("#skjema-auth").onsubmit = async (e) => {
  e.preventDefault();
  const email = $("#a-navn").value.trim(), password = $("#a-pass").value, feil = $("#a-feil");
  feil.textContent = "";
  if (modus === "ny") {
    const navn = $("#a-fullnavn").value.trim();
    if (navn.length < 2) return (feil.textContent = "Skriv inn fullt navn.");
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { navn } } });
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
let valg = {}; // smak-id -> antall per dag, f.eks. { monarch: 1, "mango-loco": 2 }
const MAKS = 3; // maks bokser per smak per dag

async function lastSmaker() {
  const { data, error } = await sb.from("smaker").select("*").eq("aktiv", true).order("pris").order("navn");
  if (error) return ($("#b-melding").textContent = "Kunne ikke hente smaker.");
  SMAKER = data;
  tegnSmaker();
}
function tegnSmaker() {
  // Rydd bort valg som ikke lenger går (utsolgt, skjult eller mer enn lageret)
  for (const id of Object.keys(valg)) {
    const s = SMAKER.find((x) => x.id === id), maks = s ? Math.min(MAKS, s.lager) : 0;
    if (maks <= 0) delete valg[id]; else valg[id] = Math.min(valg[id], maks);
  }
  $("#smaker").innerHTML = SMAKER.map((s) => {
    const n = valg[s.id] || 0, tom = s.lager <= 0, maks = Math.min(MAKS, s.lager);
    return `<div class="smak ${n ? "valgt" : ""} ${tom ? "utsolgt" : ""}" style="--c:${esc(s.farge)}">` +
      `<div class="smak-topp"><i>${esc(s.navn)}<small>${tom ? "Utsolgt" : s.lager + " igjen"}</small></i><b>${kr(s.pris)}</b></div>` +
      `<div class="teller" role="group" aria-label="Antall ${esc(s.navn)}">` +
      `<button type="button" data-smak="${esc(s.id)}" data-d="-1" aria-label="Færre ${esc(s.navn)}" ${n ? "" : "disabled"}>−</button>` +
      `<output>${n}</output>` +
      `<button type="button" data-smak="${esc(s.id)}" data-d="1" aria-label="Flere ${esc(s.navn)}" ${n >= maks ? "disabled" : ""}>+</button></div></div>`;
  }).join("");
}
$("#smaker").onclick = (e) => {
  const knapp = e.target.closest("[data-smak]");
  if (!knapp) return;
  const id = knapp.dataset.smak, s = SMAKER.find((x) => x.id === id);
  const ny = Math.max(0, Math.min(MAKS, s.lager, (valg[id] || 0) + Number(knapp.dataset.d)));
  if (ny) valg[id] = ny; else delete valg[id];
  tegnSmaker();
  oppdaterSum();
  document.querySelector(`[data-smak="${id}"][data-d="${knapp.dataset.d}"]:not(:disabled)`)?.focus(); // behold tastaturfokus
};
$("#dager").innerHTML = DAGER.map((d, i) => `<label><input type="checkbox" name="dag" value="${i}"><span>${d}</span></label>`).join("");

const valgteDager = () => [...document.querySelectorAll("[name=dag]:checked")].map((x) => +x.value);
function oppdaterSum() {
  const n = valgteDager().length;
  const bokser = Object.values(valg).reduce((t, a) => t + a, 0);
  const perDag = SMAKER.reduce((t, s) => t + (valg[s.id] || 0) * s.pris, 0);
  $("#sum").textContent = n && bokser
    ? `${n} ${n === 1 ? "dag" : "dager"} × ${bokser} ${bokser === 1 ? "boks" : "bokser"} = ${kr(n * perDag)}` : "";
}
$("#bestill").addEventListener("input", oppdaterSum);

// ---- Bestilling ----
$("#bestill").onsubmit = async (e) => {
  e.preventDefault();
  if (!bruker) return;
  const melding = $("#b-melding"), dager = valgteDager();
  const valgte = Object.entries(valg).map(([smak_id, antall]) => ({ smak_id, antall }));
  if (!bruker.user_metadata?.navn) return (melding.textContent = "Legg inn navnet ditt først.");
  if (!dager.length) return (melding.textContent = "Velg minst én ukedag.");
  if (!valgte.length) return (melding.textContent = "Velg minst én smak med plusstegnet.");
  const datoer = dager.map(nesteDato);
  // Alt skjer i én transaksjon i databasen: samme smak samme dag erstattes, andre smaker beholdes, og lageret trekkes ned
  const { error } = await sb.rpc("bestill", { datoer, valg: valgte });
  if (error) {
    await lastSmaker();
    const av = error.message.match(/lager: (.+)/);
    return (melding.textContent = /lager/i.test(error.message)
      ? `Ikke nok på lager${av ? " av " + av[1] : ""}. Velg færre dager eller lavere antall.`
      : "Kunne ikke lagre bestillingen. Prøv igjen.");
  }
  const navn = (id) => SMAKER.find((s) => s.id === id)?.navn || id;
  melding.textContent = `Registrert: ${valgte.map((v) => `${v.antall}× ${navn(v.smak_id)}`).join(", ")} for ${dager.length} ${dager.length === 1 ? "dag" : "dager"}.`;
  valg = {};
  e.target.reset();
  await lastSmaker();
  oppdaterSum();
  visOrdre();
  if (!$("#faner-admin").hidden) { visLager(); visNeste(); visAdmin(); } // hold admin-oversikten oppdatert
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
  $("#betaling-sum").textContent = planlagt.length ? `Du har ${kr(sum(planlagt))} planlagt fremover.` : "";
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
  await lastSmaker(); // avbestilling gir varene tilbake på lager
  visOrdre();
};

let adminVist = false;
function adminFane(admin) {
  $("#admin").hidden = !admin;
  $("#min-side").hidden = admin;
  $("#fane-utdeling").classList.toggle("aktiv", admin);
  $("#fane-min").classList.toggle("aktiv", !admin);
}
$("#fane-utdeling").onclick = async () => { adminFane(true); await lastSmaker(); visLager(); visNeste(); visAdmin(); };
$("#fane-min").onclick = () => adminFane(false);

async function vis() {
  const inn = !!bruker;
  $("#topp").hidden = inn;                 // velkomst og innlogging vises bare for besøkende
  $("#header-logginn").hidden = inn;
  $("#bruker").hidden = !inn;
  $("#las").hidden = inn;
  $("#bestill-innhold").toggleAttribute("inert", !inn); // besøkende ser skjemaet, men kan ikke bruke det
  if (!inn) {
    adminVist = false;
    $("#faner-admin").hidden = true;
    adminFane(false);
    $("#navn-boks").hidden = true;
    ["#s-brukt", "#s-bokser", "#s-planlagt"].forEach((s) => ($(s).textContent = "–"));
    $("#tom").textContent = "Logg inn for å se bestillingene dine og hvor mye du har brukt totalt.";
    $("#tom").hidden = false;
    $("#tabell").hidden = true;
    $("#b-melding").textContent = "";
    $("#betaling-sum").textContent = "";
    await lastSmaker();
    return oppdaterSum();
  }
  $("#tom").textContent = "Ingen bestillinger ennå. Velg dager og smak ovenfor.";
  $("#brukernavn").textContent = bruker.user_metadata?.navn || bruker.email;
  $("#navn-boks").hidden = !!bruker.user_metadata?.navn;
  await lastSmaker();
  oppdaterSum();
  visOrdre();
  const merke = $("#admin-merke");
  merke.hidden = true;
  const { data: erAdmin, error: adminFeil } = await sb.rpc("er_admin");
  if (adminFeil) {
    console.error("Admin-sjekk feilet:", adminFeil);
    merke.textContent = "Admin-sjekk feilet";
    merke.className = "merke merke-feil";
    merke.hidden = false;
  } else if (erAdmin) {
    merke.textContent = "Admin";
    merke.className = "merke";
    merke.hidden = false;
  } else {
    merke.textContent = "Bruker";
    merke.className = "merke merke-bruker";
    merke.hidden = false;
  }
  $("#faner-admin").hidden = !erAdmin;
  if (erAdmin) {
    if (!adminVist) { adminVist = true; adminFane(true); } // åpne på Utdeling første gang, men ikke hopp tilbake ved hver oppdatering
    visLager();
    visNeste();
    visAdmin();
  }
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
      `<p><b>${l.reduce((t, o) => t + o.antall, 0)}× ${esc(smak)}</b><br><small>${l.map((o) => esc(o.navn || o.epost) + (o.antall > 1 ? ` (${o.antall})` : "")).join(", ")}</small></p>`).join("")
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

// ---- Navn (for eksisterende brukere som mangler det) ----
$("#navn-skjema").onsubmit = async (e) => {
  e.preventDefault();
  const { data, error } = await sb.auth.updateUser({ data: { navn: $("#n-navn").value.trim() } });
  if (error) return ($("#b-melding").textContent = "Kunne ikke lagre navnet. Prøv igjen.");
  bruker = data.user;
  $("#brukernavn").textContent = bruker.user_metadata.navn;
  $("#navn-boks").hidden = true;
};

// Oversikt over de neste 14 dagene (alle brukeres bestillinger), uavhengig av kalender og egne bestillinger
async function visNeste() {
  const boks = $("#admin-neste"), start = new Date(), slutt = new Date();
  slutt.setDate(slutt.getDate() + 14);
  const { data, error } = await sb.rpc("admin_bestillinger", { fra: iso(start), til: iso(slutt) });
  if (error) return (boks.textContent = "Kunne ikke hente bestillinger.");
  const dager = {};
  data.forEach((o) => {
    const d = (dager[o.dato] ||= { tot: 0, smaker: {} });
    d.tot += o.antall;
    d.smaker[o.smak] = (d.smaker[o.smak] || 0) + o.antall;
  });
  const rader = Object.entries(dager).map(([dato, d]) =>
    `<div class="neste-rad"><b>${pent(dato)}</b><span class="neste-tot">${d.tot} ${d.tot === 1 ? "boks" : "bokser"}</span>` +
    `<span>${Object.entries(d.smaker).map(([s, n]) => `${n}× ${esc(s)}`).join(", ")}</span></div>`);
  boks.innerHTML = "<h3>Ta med de neste dagene</h3>" + (rader.length ? rader.join("") : "<p class='tom'>Ingen bestillinger de neste 14 dagene.</p>");
}

// ---- Admin: rediger lager ----
function visLager() {
  $("#admin-lager").innerHTML = "<h3>Igjen på lager</h3>" + SMAKER.map((s) =>
    `<div class="lager-rad ${s.lager <= 5 ? "lav" : ""}"><label for="l-${esc(s.id)}">${esc(s.navn)}</label>` +
    `<input id="l-${esc(s.id)}" type="number" min="0" step="1" value="${s.lager}"><button type="button" data-lager="${esc(s.id)}">Lagre</button></div>`).join("") +
    '<p id="lager-melding" class="melding" role="status">Tallet går ned automatisk når noen bestiller, og opp igjen ved avbestilling.</p>';
}
$("#admin-lager").onclick = async (e) => {
  const id = e.target.dataset.lager;
  if (!id) return;
  const n = Number(document.getElementById("l-" + id).value), melding = $("#lager-melding");
  if (!Number.isInteger(n) || n < 0) return (melding.textContent = "Skriv inn et helt tall fra 0 og oppover.");
  const { data, error } = await sb.from("smaker").update({ lager: n }).eq("id", id).select();
  if (error || !data?.length) return (melding.textContent = "Kunne ikke lagre. Du må være admin, og oppsett.sql må være kjørt.");
  await lastSmaker();
  visLager();
  $("#lager-melding").textContent = "Lagret.";
};

// Lenker til innlogging flytter markøren til e-postfeltet
document.querySelectorAll(".til-logginn").forEach((a) =>
  a.addEventListener("click", () => setTimeout(() => $("#a-navn").focus({ preventScroll: true }), 400)));
