# TÜBİTAK 2209-A Ekip İş Bölümü ve İlerleme Paneli

**Proje:** Kesintili Dağıtık Edge Sistemlerinde Bağlantı, Kaynak ve Girdi Erişilebilirliği Farkındalıklı Görev Atama ve Veri Senkronizasyonu  
**Ekip:** Zehra Sıla Özdizlekli, Hilal Ay, Fatmanur Bulut  
**Danışman:** Doğan Aydın (İKÇÜ)

## 1. GitHub Pages ile Ücretsiz Yayınlama (Tek Link)

1. GitHub'da yeni ve boş bir depo açın (ör. `tubitak-2209a-edge-takip`).
2. Bu klasörde terminali açıp depoyu gönderin:
   ```zsh
   git remote add origin https://github.com/<KULLANICI_ADIN>/<REPO_ADIN>.git
   git push -u origin main
   ```
3. GitHub'da **Settings → Pages → Build and deployment → Source** bölümünü **GitHub Actions** yapın.
4. ~1 dakika içinde siteniz `https://<KULLANICI_ADIN>.github.io/<REPO_ADIN>/` adresinde açılır.

## 2. Üçünüzün Aynı Anda Canlı Görmesi İçin (1 Dakikalık Bulut Bağlantısı)

GitHub Pages statik olduğu için 3 kişinin yaptığı güncellemelerin anında birbirinde görünmesi için ücretsiz bir Firebase Realtime Database bağlayın:

1. `https://console.firebase.google.com` → **Create a project** → **Build → Realtime Database → Create Database** → **Start in test mode** seçin.
2. Oluşan `https://...-default-rtdb....firebasedatabase.app` URL'sini kopyalayın.
3. Sitenizde sağ üstteki **Ortak Link / Bulut** butonuna tıklayıp bu adresi yapıştırın ve **Buluta Bağla** deyin.
4. **Linki Kopyala** deyip çıkan `?sync=...` linkini Hilal ve Fatmanur'a atın — hepiniz aynı canlı veritabanını görürsünüz.
