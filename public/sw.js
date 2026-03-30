
self.addEventListener('push', function(event) {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: 'https://cdn-icons-png.flaticon.com/512/1048/1048953.png',
      badge: 'https://cdn-icons-png.flaticon.com/512/1048/1048953.png',
      tag: data.tag || 'medication-reminder', // Previne duplicatas visuais
      renotify: true, // Faz o celular vibrar mesmo se a tag for a mesma
      vibrate: [200, 100, 200],
      data: {
        url: data.url || '/'
      },
      actions: [
        { action: 'open', title: 'Ver Agora' }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const urlToOpen = event.notification.data.url;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
