// Présence minimale exigée par certains navigateurs pour proposer « Installer l'application ».
// Aucune mise en cache : l'application lit toujours les données à jour sur le serveur.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
