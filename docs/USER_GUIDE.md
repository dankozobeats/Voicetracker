## Voicetracker — Guide utilisateur

Ce guide couvre l’essentiel pour enregistrer vos revenus/dépenses, gérer vos budgets et suivre vos charges fixes.

### Connexion
- Connectez-vous avec votre compte Supabase (email/password ou magic link selon config).

### Ajouter une transaction
- **Vocale (audio)** : onglet “Enregistrer” > envoyez un fichier audio ou enregistrez. Le LLM extrait montant, type (dépense/revenu), date, description, catégorie (peut être ajustée ensuite).
- **Texte libre** : `POST /api/voice?type=text` avec `{ "text": "salaire 2500 euros le 5 janvier" }`.
- **Texte structuré (sans LLM)** : `POST /api/voice?type=text` avec `{ "transaction": { "amount": 2500, "type": "income", "date": "2025-01-05", "description": "salaire", "category_id": null } }`.

### Consulter et éditer les transactions
- Onglet **Transactions** : tableau des opérations.
- Bouton **Éditer** sur chaque ligne pour corriger montant, date, type (revenu/dépense/transfert), description ou catégorie. Sauvegarde via `/api/transactions?id=...` en PATCH.
- Suppression : passer par l’API `/api/transactions` en DELETE (option à venir en UI si besoin).

### Catégories
- Catégories disponibles : `restaurant, courses, transport, loisirs, santé, shopping, autre`.
- La catégorie est stockée dans la transaction (metadata) et utilisée pour les budgets et projections.

### Budgets
- Onglet **Budget** :
  - Ajoutez/éditez un budget par catégorie : plafond mensuel, seuil d’alerte (0-1), dates début/fin.
  - Vue Cartes ou Liste. Chaque carte affiche dépense actuelle, plafond, statut (ok/warning/over), projection de fin de mois.
- Balance globale : revenus du mois – dépenses – charges fixes. Le salaire doit être saisi comme `income` pour être compté.

### Charges fixes (récurrentes)
- Onglet **Charges fixes** :
  - Créez des règles récurrentes (montant, catégorie, description, cadence : weekly/monthly/quarterly/yearly).
  - Aperçu des occurrences futures et total des charges fixes du mois courant.
- Ces charges fixes sont intégrées dans la balance globale Budget.

### Tableau de bord
- Synthèse des transactions récentes, budgets, projections et insights (anomalies/tendances).

### API rapides
- Liste/PATCH/DELETE transactions : `/api/transactions` (query `id` pour PATCH/DELETE).
- Budgets : `/api/budget` (GET, POST, PATCH, DELETE avec `id`).
- Charges fixes : `/api/recurring` (GET, POST, PATCH, DELETE avec `id`).
- Insights : `/api/insights`.
- Voix/texte : `/api/voice` (audio multipart) ou `/api/voice?type=text`.

### Bonnes pratiques
- Toujours définir `type = income` pour les salaires/entrées afin d’alimenter la balance.
- Ajuster la catégorie après insertion vocale si nécessaire (Éditer dans Transactions).
- Fixer un seuil d’alerte (ex. 0.8) pour être notifié avant dépassement de budget.

### Dépannage
- Si une transaction vocale est catégorisée en dépense alors que c’est un revenu, ouvrez l’édition et passez `type = Revenu`.
- Si la balance ne bouge pas, vérifiez que la transaction du mois courant est bien en `income` et qu’une règle de charge fixe n’explose pas la balance.

