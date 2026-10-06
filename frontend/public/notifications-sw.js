self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const client = windows.find(
        (client) => new URL(client.url).origin === self.location.origin,
      );
      if (client) {
        await client.focus();
        client.postMessage({ type: "review-recommendation" });
      } else {
        await self.clients.openWindow("/");
      }
    })(),
  );
});
