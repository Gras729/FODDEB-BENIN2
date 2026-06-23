# FODDEB — Plateforme Web

**Forum des Organisations de Défense des Droits de l'Enfant au Bénin**
Site : https://foddeb.org | Email : foddeb15@gmail.com

---

## Architecture du projet

```
foddeb/
├── index.html                    # Page d'accueil publique
├── offline.html                  # Page hors-ligne (PWA)
├── manifest.json                 # Manifest PWA
├── sw.js                         # Service Worker
├── vercel.json                   # Config déploiement Vercel
├── robots.txt                    # SEO
│
├── admin/                        # 🔐 Espace administrateur
│   ├── dashboard.html            # ✅ Tableau de bord principal
│   ├── membres.html              # Gestion des membres
│   ├── dons.html                 # Gestion des dons
│   ├── projets.html              # Gestion des projets
│   ├── actualites.html           # Gestion des actualités
│   ├── newsletter.html           # Gestion newsletter
│   ├── messages.html             # Messages contact
│   ├── rapports.html             # Rapports & exports
│   ├── cartographie.html         # Carte d'impact
│   ├── bailleurs.html            # Portail bailleurs
│   ├── parametres.html           # Paramètres système
│   └── profil.html               # Profil administrateur
│
├── auth/                         # 🔑 Authentification
│   ├── login.html                # Connexion (étape 1 : id + mdp)
│   ├── otp.html                  # Vérification OTP (étape 2)
│   ├── register.html             # Inscription membre
│   └── reset-password.html       # Réinitialisation mdp
│
├── dashboard/                    # 👤 Espaces personnels
│   ├── member.html               # Dashboard membre
│   └── donor.html                # Dashboard donateur
│
├── pages/                        # 📄 Pages publiques
│   ├── a-propos.html
│   ├── projets.html
│   ├── actualites.html
│   ├── partenaires.html
│   └── contact.html
│
└── assets/
    ├── css/
    │   └── main.css              # Styles globaux partagés
    ├── js/
    │   ├── utils.js              # ✅ Utilitaires globaux
    │   ├── app.js                # Initialisation app
    │   └── services/
    │       ├── api.js            # ✅ Connecteur GAS/Sheets
    │       └── auth.js           # ✅ Auth + OTP + session
    └── icons/                    # Icônes PWA
        ├── icon-72.png
        ├── icon-96.png
        ├── icon-128.png
        ├── icon-192.png
        └── icon-512.png
```

---

## Stack technique

| Couche        | Technologie                          |
|---------------|--------------------------------------|
| Frontend      | HTML5, CSS3, JavaScript ES6+         |
| Icônes        | Iconify SVG                          |
| Graphiques    | Chart.js 4                           |
| Backend/API   | Google Apps Script (GAS)             |
| Base de données | Google Sheets                      |
| Paiement      | FedaPay                              |
| Email         | Gmail SMTP via GAS MailApp           |
| Sécurité      | reCAPTCHA v3, OTP, SHA-256 hash      |
| PWA           | Service Worker, Web Manifest         |
| Déploiement   | Vercel                               |

---

## Fichiers créés ✅

- [x] `index.html` — Page d'accueil complète
- [x] `admin/dashboard.html` — Tableau de bord admin
- [x] `manifest.json` — Config PWA
- [x] `sw.js` — Service Worker offline
- [x] `vercel.json` — Config Vercel
- [x] `assets/js/utils.js` — Utilitaires partagés
- [x] `assets/js/services/api.js` — API GAS
- [x] `assets/js/services/auth.js` — Auth + OTP
- [x] `offline.html` — Page hors ligne

## Pages à créer (prochaines étapes)

- [ ] `auth/login.html` + `auth/otp.html`
- [ ] `auth/register.html`
- [ ] `admin/membres.html`
- [ ] `admin/dons.html`
- [ ] `admin/projets.html`
- [ ] `admin/newsletter.html`
- [ ] `dashboard/member.html`
- [ ] `dashboard/donor.html`
- [ ] Pages publiques (projets, actualités, contact...)

---

## Déploiement sur Vercel

```bash
# 1. Installer Vercel CLI
npm i -g vercel

# 2. Dans le dossier foddeb/
vercel

# 3. Production
vercel --prod
```

---

## Configuration Google Apps Script

1. Créer un nouveau projet GAS sur https://script.google.com
2. Copier le code GAS backend (à fournir séparément)
3. Déployer en tant qu'application Web (accès : Tout le monde)
4. Copier l'URL de déploiement dans `assets/js/services/api.js`  
   → Remplacer `YOUR_DEPLOYMENT_ID`

---

## Contacts

- Email : foddeb15@gmail.com
- Tél : +229 01 97 69 64 26 / 01 94 08 17 10
- Siège : Agla Akplomey, Cotonou, Bénin
