/* FCM background messages. Config comes from the registration URL query string. */
importScripts("https://www.gstatic.com/firebasejs/11.1.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.1.0/firebase-messaging-compat.js");

const params = new URL(self.location.href).searchParams;
firebase.initializeApp({
  apiKey: params.get("apiKey"),
  projectId: params.get("projectId"),
  appId: params.get("appId"),
  messagingSenderId: params.get("messagingSenderId"),
});
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  // webpush.notification is shown automatically; data-only messages are shown here
  if (payload.notification) return;
  const d = payload.data || {};
  self.registration.showNotification(d.title || "Sampai", {
    body: d.body || "",
    tag: d.alertId,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [200, 100, 200, 100, 400],
    requireInteraction: true,
    data: { url: "/?alert=" + encodeURIComponent(d.alertId || "") },
  });
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    clients.matchAll({ type: "window" }).then((list) => {
      for (const c of list) if ("focus" in c) return c.focus();
      return clients.openWindow(url);
    }),
  );
});
