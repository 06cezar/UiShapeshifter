# Site-ul de test (E7)

Un portal de client al unui furnizor de energie **inventat** („Furnizorul Demo”), aglomerat intenționat: bandă
promoțională, meniu cu 12 intrări, meniu lateral cu 15, reclame „Sponsorizat”, carusel, tabel dens de facturi,
chestionar, bulă de chat. Butonul **„Plătește factura”** e greu de găsit: în meniul „⋯” al facturii curente, mic și gri.
Pe el verificăm fiecare punct de control, fără internet. Toate datele sunt de test.

```bash
npm run dev -w @uishapeshifter/test-site
```

Pornește pe http://localhost:5180 (`plata.html` e pagina de plată de test; nu se plătește nimic).

Ce poți încerca cu extensia: „ascunde reclamele”, „ascunde banda promoțională”, „fă textul mai mare”,
„vreau doar să plătesc factura”.
