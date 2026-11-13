/* Logique partagée de l'écran de réveil Linx (27/09/2026).
   Une seule copie pour toutes les pages — voir reveil.css pour le même
   principe côté style. Chaque page définit `window.LINX_CIBLE` avant de
   charger ce script (voir lab/index.html, med/index.html, etc.) ; la
   page générique (index.html) retombe sur `?cible=` puis sur LAB par
   défaut, pour rester compatible avec les raccourcis déjà distribués. */
(() => {
  const CIBLE_PAR_DEFAUT = "https://linx-lab.onrender.com/";

  const params = new URLSearchParams(location.search);
  // REDIRECTION OUVERTE FERMÉE (audit du 13/10/2026). `?cible=` acceptait
  // n'importe quelle adresse : un lien « byacompany.github.io/?cible=<site piège> »
  // faisait afficher notre écran de réveil de confiance, puis envoyait la
  // personne ailleurs. Seuls les services Linx connus sont acceptés ; toute
  // autre valeur retombe sur le service par défaut. (Une adresse en
  // `*.onrender.com` ne suffit pas : n'importe qui peut en créer une.)
  const SERVICES_AUTORISES = new Set([
    "linx-lab.onrender.com", "linx-med.onrender.com", "linx-bill.onrender.com",
    "linx-sghi.onrender.com", "linx-suite.onrender.com", "linx-superadmin.onrender.com",
    "linx-lab-mutualise.onrender.com", "linx-med-mutualise.onrender.com",
    "linx-bill-mutualise.onrender.com", "linx-sghi-mutualise.onrender.com",
    "linx-lab-la-grace.onrender.com", "linx-med-la-grace.onrender.com",
    "linx-bill-la-grace.onrender.com", "linx-sghi-la-grace.onrender.com",
  ]);
  function cibleAutorisee(valeur) {
    try {
      const u = new URL(valeur);
      return u.protocol === "https:" && !u.username && !u.password && !u.port &&
             SERVICES_AUTORISES.has(u.hostname);
    } catch (e) {
      return false;
    }
  }
  const demandee = params.get("cible");
  const cible = window.LINX_CIBLE ||
    (demandee && cibleAutorisee(demandee) ? demandee : CIBLE_PAR_DEFAUT);

  let base;
  try {
    base = new URL(cible);
  } catch (e) {
    base = new URL(CIBLE_PAR_DEFAUT);
  }
  // RÉVEIL DE TOUTE LA CHAÎNE (12/11/2026). Un service mutualisé (Express, démonstration) ne suffit pas : son lien
  // personnel interroge le Superadmin, qui s'endort lui aussi. `chaine=1` demande au service de ne répondre « prêt »
  // qu'une fois le Superadmin éveillé (les autres services ignorent le paramètre) ; et on réveille le Superadmin EN
  // PARALLÈLE dès l'ouverture de la page, pour que les deux démarrages se chevauchent au lieu de s'additionner.
  const urlSante = new URL("/healthz", base.origin);
  urlSante.searchParams.set("chaine", "1");
  const mutualise = /-(mutualise|la-grace)\.onrender\.com$/.test(base.hostname);
  if (mutualise) {
    // Le service que les Linx mutualisés interrogent est `linx-suite` (LINX_SUPERADMIN_URL du Blueprint mutualisé), et
    // NON `linx-superadmin` : la première version de ce réveil visait le mauvais service (13/11/2026).
    fetch("https://linx-suite.onrender.com/healthz", { mode: "no-cors", cache: "no-store" }).catch(() => {});
  }

  const msg = document.getElementById("linx-loader-msg");
  const bar = document.getElementById("linx-loader-bar");
  const retry = document.getElementById("linx-loader-retry");
  const retryLink = document.getElementById("linx-loader-retry-link");
  const retryDirect = document.getElementById("linx-loader-retry-direct");

  const ETAPES = [
    [0,  "Réveil du serveur"],
    [8,  "Connexion à la base de données"],
    [25, "Ça peut prendre jusqu'à une minute"],
    [45, "Toujours en cours, merci de patienter"],
  ];
  const PROGRES = [10, 35, 60, 80, 92];

  let annule = false;
  let etapeServeur = null;   // ce que le service dit réveiller en ce moment (statut « reveil »)
  // Au-delà de ce délai passé en « reveil », on redirige quand même : le service mutualisé sait lui-même attendre le
  // Superadmin (30 s) et afficher sa page d'attente ; l'écran ne doit jamais retenir un lien plus longtemps qu'avant
  // (13/11/2026 : une sonde défectueuse côté service restait « reveil » indéfiniment).
  const ATTENTE_CHAINE_MAX = 45;

  function afficherEtape(secondesEcoulees) {
    for (const [seuil, texte] of ETAPES) {
      if (secondesEcoulees >= seuil) msg.textContent = texte;
    }
    const i = Math.min(Math.floor(secondesEcoulees / 4), PROGRES.length - 1);
    bar.style.width = PROGRES[i] + "%";
    if (etapeServeur) msg.textContent = etapeServeur;
  }

  function redirigerVers(url) {
    location.href = url;
  }

  async function verifierUneFois() {
    // TROUVAILLE DU 27/09/2026 — Render sert bien sa PROPRE page de
    // réveil (HTML, statut 200) sur TOUTES les routes tant que le
    // conteneur démarre, /healthz compris. Un fetch en mode "no-cors" ne
    // pouvant jamais lire ni le statut ni le corps de la réponse (réponse
    // opaque par construction), il se résolvait dès CETTE page Render —
    // pas celle de l'application — et redirigeait trop tôt, droit dessus.
    // /healthz répond désormais avec un en-tête CORS ouvert
    // (Access-Control-Allow-Origin, voir app.py de chaque Linx) : on peut
    // donc lire le VRAI corps JSON, et ne considérer le serveur prêt que
    // lorsque c'est bien LUI qui répond — jamais la page d'attente Render.
    try {
      const rep = await fetch(urlSante.toString(), { cache: "no-store" });
      const donnees = await rep.json();
      if (typeof donnees !== "object" || donnees === null || !("status" in donnees)) return false;
      // « reveil » : le service répond mais attend encore une autre pièce de la chaîne (le Superadmin).
      etapeServeur = donnees.status === "reveil" ? (donnees.etape || "Réveil en cours") : null;
      return donnees.status !== "reveil";
    } catch (e) {
      // Réponse non-JSON (page HTML de Render) ou requête refusée :
      // le serveur applicatif ne répond pas encore.
      return false;
    }
  }

  async function attendreReveil() {
    const debut = Date.now();
    const LIMITE_SECONDES = 150;   // Lab + Superadmin + base : 90 s ne suffisaient pas à une chaîne entièrement endormie

    while (!annule) {
      const secondes = (Date.now() - debut) / 1000;
      afficherEtape(secondes);

      if (secondes > LIMITE_SECONDES) {
        retry.style.display = "block";
        msg.textContent = "Le serveur met plus de temps que d'habitude";
        return;
      }

      if (await verifierUneFois() || (etapeServeur && secondes > ATTENTE_CHAINE_MAX)) {
        bar.style.width = "100%";
        msg.textContent = "Serveur prêt — redirection";
        setTimeout(() => redirigerVers(cible), 400);
        return;
      }

      await new Promise(r => setTimeout(r, 2500));
    }
  }

  retryLink.addEventListener("click", (e) => {
    e.preventDefault();
    retry.style.display = "none";
    annule = false;
    attendreReveil();
  });
  retryDirect.addEventListener("click", (e) => {
    e.preventDefault();
    redirigerVers(cible);
  });

  attendreReveil();
})();
