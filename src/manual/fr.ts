export const FR_MANUAL = `
# anyIP CLI — Manuel d'utilisation

## Présentation

anyIP.io fournit des proxies résidentiels et mobiles pour le web scraping, l'automatisation
et la collecte de données. Ce CLI vous permet de gérer vos comptes proxy, surveiller la
bande passante, créer des sessions proxy et générer des configurations complètes en langage
naturel — directement depuis votre terminal.

Documentation officielle : https://anyip.io/docs/guides/quick-start

---

## Installation

### Installation globale (recommandée)
    npm install -g anyip-cli
    anyip --help

### Depuis les sources
    git clone <repo>
    cd anyip-cli
    npm install
    npm run build
    npm link        # rend 'anyip' disponible globalement

### Sans installation (utilisation ponctuelle)
    npx anyip-cli <commande>

---

## Configuration initiale

### Option A — Invite interactive (les clés ne sont pas enregistrées dans l'historique du shell)
    anyip config set-keys

### Option B — Drapeaux
    anyip config set-keys --anyip VOTRE_CLÉ_ANYIP --claude VOTRE_CLÉ_CLAUDE

### Option C — Variables d'environnement (idéal pour CI/CD)
    export ANYIP_API_KEY=votre_clé_anyip
    export ANTHROPIC_API_KEY=votre_clé_claude

Les variables d'environnement ont toujours la priorité sur la configuration enregistrée.

La clé Claude est optionnelle — elle est uniquement requise pour : anyip generate, anyip man (hors anglais)

### Afficher la configuration enregistrée
    anyip config show          # affiche les clés masquées + chemin du fichier de config

### Effacer la configuration enregistrée
    anyip config clear

---

## Gestion des comptes

    anyip account              # lister tous les comptes proxy (vue tableau)
    anyip account me           # afficher les informations et quotas de votre compte anyIP
    anyip account list         # alias pour le tableau ci-dessus
    anyip account list --json  # sortie JSON lisible par machine
    anyip account inspect <id>             # fiche détaillée d'un compte
    anyip account inspect <id> --json      # sortie JSON
    anyip account create -d "Mon proxy" --type residential --country FR
    anyip account enable <id>
    anyip account disable <id>
    anyip account bulk-reset               # réinitialiser tous les quotas de bande passante (demande confirmation)
    anyip account bulk-reset --yes         # ignorer la confirmation (pour les scripts)

### Options de création
    -d, --description <texte>  Requis. Nom de ce compte proxy
    --type <type>              residential | mobile
    --country <code>           Code ISO, ex. FR, US, DE, TH
    --region <nom>             État ou région (minuscules), ex. ile-de-france
    --city <nom>               Ville (minuscules), ex. paris
    --session <nom>            Nom de session persistante (alphanumérique + underscore)
    --sess-time <minutes>      Durée de session 1–10080 (défaut : 7 jours)
    --quota <octets>           Limite de bande passante en octets (défaut : 1 Go = 1073741824)
    --password <mdp>           Mot de passe personnalisé (généré automatiquement si omis)

---

## Gestion des sessions

Les sessions sont des configurations de connexion proxy enregistrées localement. La commande
\`get\` en trouve ou crée une et la teste avec une vérification curl en direct.

### Trouver / créer / tester une session proxy
    anyip get                                    # utiliser le premier compte proxy, mobile, socks5
    anyip get --residential --location FR        # proxy résidentiel français
    anyip get --mobile --location US             # proxy mobile américain
    anyip get --residential --rotating           # IP tournante (nouvelle IP par connexion)
    anyip get --residential --time 30            # session persistante de 30 minutes
    anyip get --user 2                           # utiliser le compte proxy n°2 (voir : anyip account)
    anyip get --list                             # afficher les sessions correspondantes sans curl

### Gérer les sessions enregistrées
    anyip proxy list                  # toutes les sessions enregistrées
    anyip proxy list --user 1         # sessions appartenant au compte proxy n°1
    anyip proxy get <nom>             # fiche détaillée d'une session
    anyip proxy curl <nom>            # afficher la commande curl de test
    anyip proxy curl <nom> --run      # exécuter le test curl
    anyip proxy add serveur:port:utilisateur:motdepasse   # importer depuis une chaîne de connexion
    anyip proxy import proxies.txt    # import en masse (une chaîne de connexion par ligne)
    anyip proxy delete <nom>          # supprimer une session enregistrée
    anyip proxy clear                 # supprimer toutes les sessions (demande confirmation)

---

## Surveillance du trafic

    anyip traffic list                            # envoyé/reçu par jour (30 derniers jours)
    anyip traffic list --interval hourly          # résolution horaire
    anyip traffic usage                           # quota d'équipe : utilisé / restant
    anyip traffic list --from 2024-01-01          # filtrer par date de début
    anyip traffic list --to 2024-01-31            # filtrer par date de fin
    anyip traffic list --proxy <id>               # filtrer par identifiant de compte proxy
    anyip traffic list --json                     # sortie JSON
    anyip traffic export                          # afficher le CSV sur la sortie standard
    anyip traffic export -o trafic.csv            # enregistrer dans un fichier
    anyip traffic export --from 2024-01-01 -o janv.csv

---

## Données géographiques de référence

    anyip country                      # tous les pays disponibles
    anyip country --json               # sortie JSON
    anyip region FR                    # régions disponibles pour la France
    anyip region US --json
    anyip city FR "Île-de-France"      # villes d'une région (nom ou slug)
    anyip city FR                      # toutes les villes du pays, par région
    anyip city FR --tags               # region_iledefrance,city_paris (étiquettes)
    anyip asn FR                       # ASN des FAI/opérateurs pour la France

Utilisez ces commandes pour découvrir les valeurs valides pour --country, --region et le filtrage ASN.

---

## Test rapide de proxy

    anyip check 1     # vérifier le compte proxy n°1 — récupère les infos IP via ip-api.com

---

## Générateur de proxy IA

Décrivez votre cas d'usage en langage naturel. Claude l'analyse et crée automatiquement
le jeu optimal de comptes proxy.

    # Description en ligne
    anyip generate "scraper les prix Amazon dans 5 villes françaises, IP tournantes"

    # Invite interactive (sans arguments = demande une description)
    anyip generate

    # Prévisualiser le plan sans rien créer
    anyip generate "10 comptes Instagram en France, sessions persistantes" --dry-run

    # Enregistrer la liste des identifiants dans un fichier
    anyip generate "proxies résidentiels FR pour la veille SEO" --output proxies.txt

Le générateur enregistre également toutes les sessions créées localement afin que vous
puissiez immédiatement utiliser \`anyip get\` ou \`anyip proxy list\`.

---

## Tableau de bord web

Lancez une interface graphique locale dans votre navigateur pour gérer vos proxies visuellement :

    anyip serve               # ouvre http://127.0.0.1:3000 dans votre navigateur
    anyip serve --port 8080   # port personnalisé

Appuyez sur Ctrl+C pour arrêter le serveur. Le tableau de bord comprend :
- Liste des comptes avec boutons activer/désactiver
- Formulaire de générateur de proxy IA
- Aperçu du trafic
- Visionneuse de sessions

---

## Manuel

    anyip man                  # afficher ce manuel (anglais)
    anyip man --language fr    # Français
    anyip man --language zh    # Chinois (中文)
    anyip man --language ru    # Russe (Русский)
    anyip man --language es    # Espagnol

---

## Format d'URL proxy

    http://UTILISATEUR:MOTDEPASSE@gate.anyip.io:8080      (proxy HTTP)
    socks5://UTILISATEUR:MOTDEPASSE@portal.anyip.io:1080  (proxy SOCKS5)

Avec les attributs de session intégrés dans le nom d'utilisateur :

    http://user_COMPTE,type_residential,country_FR,session_ma_session:MOTDEPASSE@gate.anyip.io:8080

Attributs (séparés par des virgules dans le champ nom d'utilisateur) :
    user_XXXX       identifiant du compte proxy
    type_XXX        residential | mobile
    country_XX      code pays ISO
    region_XXX      slug région/état
    city_XXX        slug ville
    session_NOM     nom de session persistante (omis pour rotation)
    sesstime_N      durée de session en minutes

---

## Variables d'environnement

    ANYIP_API_KEY        Clé API anyIP.io (remplace la configuration enregistrée)
    ANTHROPIC_API_KEY    Clé API Claude (remplace la configuration enregistrée)
    NO_COLOR             Définir à n'importe quelle valeur pour désactiver la sortie colorée

---

## Conseils

- Utilisez \`--json\` sur toute commande de données pour rediriger la sortie : \`anyip account list --json | jq '.[].username'\`
- La commande \`anyip get\` mémorise les sessions localement — exécutez-la une fois, réutilisez la session
- Pour le scraping : utilisez \`--rotating\` (nouvelle IP par connexion, plus rapide pour les tâches sans état)
- Pour la gestion de comptes : utilisez \`--session NOM\` pour verrouiller une IP par compte
- Pour CI/CD : définissez \`ANYIP_API_KEY\` comme secret, ignorez \`anyip config set-keys\`
- Quota en octets : 1 Go = 1073741824, 5 Go = 5368709120, 10 Go = 10737418240
`;
