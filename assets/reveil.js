/* Logique partagée de l'écran de réveil Linx (27/09/2026).
   Une seule copie pour toutes les pages — voir reveil.css pour le même
   principe côté style. Chaque page définit `window.LINX_CIBLE` avant de
   charger ce script (voir lab/index.html, med/index.html, etc.) ; la
   page générique (index.html) retombe sur `?cible=` puis sur LAB par
   défaut, pour rester compatible avec les raccourcis déjà distribués. */
(() => {
  const CIBLE_PAR_DEFAUT = "https://linx-lab.onrender.com/";

  const params = new URLSearchParams(location.search);
  const cible = window.LINX_CIBLE || params.get("cible") || CIBLE_PAR_DEFAUT;

  let base;
  try {
    base = new URL(cible);
  } catch (e) {
    base = new URL(CIBLE_PAR_DEFAUT);
  }
  const urlSante = new URL("/healthz", base.origin).toString();

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

  function afficherEtape(secondesEcoulees) {
    for (const [seuil, texte] of ETAPES) {
      if (secondesEcoulees >= seuil) msg.textContent = texte;
    }
    const i = Math.min(Math.floor(secondesEcoulees / 4), PROGRES.length - 1);
    bar.style.width = PROGRES[i] + "%";
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
      const rep = await fetch(urlSante, { cache: "no-store" });
      const donnees = await rep.json();
      return typeof donnees === "object" && donnees !== null && "status" in donnees;
    } catch (e) {
      // Réponse non-JSON (page HTML de Render) ou requête refusée :
      // le serveur applicatif ne répond pas encore.
      return false;
    }
  }

  async function attendreReveil() {
    const debut = Date.now();
    const LIMITE_SECONDES = 90;

    while (!annule) {
      const secondes = (Date.now() - debut) / 1000;
      afficherEtape(secondes);

      if (secondes > LIMITE_SECONDES) {
        retry.style.display = "block";
        msg.textContent = "Le serveur met plus de temps que d'habitude";
        return;
      }

      if (await verifierUneFois()) {
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
