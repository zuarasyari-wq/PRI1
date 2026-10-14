// Versi awal: tidak melakukan cache otomatis agar laporan selalu memakai JS terbaru.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
