(function (global) {
  'use strict';

  // İsterseniz Firebase Realtime Database JSON URL'nizi buraya kalıcı olarak yapıştırabilirsiniz.
  // Örnek: 'https://proje-adiniz-default-rtdb.europe-west1.firebasedatabase.app/tubitak2209a.json'
  // Boş bırakırsanız arayüzdeki "Ortak Link / Bulut" butonundan da bağlayıp paylaşım linki üretebilirsiniz.
  global.EDGE_SYNC_CONFIG = {
    cloudSyncUrl: '',
    pollIntervalMs: 4000,
  };
})(window);
