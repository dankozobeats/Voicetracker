"""
Script de configuration automatique du modèle Groq.

Usage :
  $ export GROQ_API_KEY="gsk_...."
  $ python3 set_groq_model.py

Ce script interroge l’API Groq, détecte les modèles réellement disponibles
et choisit automatiquement le meilleur parmi :

    - llama-3.3-70b-versatile  (modèle principal recommandé)
    - llama-3.1-8b-instant     (fallback rapide)
    - qwen/qwen3-32b           (fallback supplémentaire)

Il met ensuite à jour la variable d’environnement GROQ_CHAT_MODEL.
"""

from __future__ import annotations

import json
import logging
import os
from typing import List, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

# 🔥 — NOUVELLE LISTE DES MODÈLES SUPPORTED (compatibles 2025)
SUPPORTED_MODELS = [
    "llama-3.3-70b-versatile",   # ⭐ Prioritaire
    "llama-3.1-8b-instant",      # ⚡ Rapide
    "qwen/qwen3-32b",            # 🟦 Fallback
]

GROQ_API_URL = "https://api.groq.com/openai/v1/models"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def fetch_available_models(api_key: str) -> List[str]:
    """Récupère la liste des modèles disponibles depuis l'API Groq."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    request = Request(GROQ_API_URL, headers=headers, method="GET")

    try:
        with urlopen(request) as response:
            data = json.load(response)

    except HTTPError as exc:
        message = exc.read().decode(errors="ignore") if exc.fp else str(exc)
        logger.error("Erreur HTTP %s : %s", exc.code, message)
        raise

    except URLError as exc:
        logger.error("Erreur réseau : %s", exc.reason)
        raise

    models = [
        model.get("id")
        for model in data.get("data", [])
        if isinstance(model, dict) and model.get("id")
    ]

    logger.info("Modèles récupérés : %s", models)
    return models


def select_compatible_model(available: List[str]) -> Optional[str]:
    """Choisit le premier modèle disponible dans la liste SUPPORTED_MODELS."""
    for model in SUPPORTED_MODELS:
        if model in available:
            logger.info("Modèle compatible trouvé : %s", model)
            return model
    return None


def ensure_env_model(model_name: str) -> None:
    """Met à jour GROQ_CHAT_MODEL."""
    current = os.getenv("GROQ_CHAT_MODEL")

    if current == model_name:
        logger.info("GROQ_CHAT_MODEL déjà défini sur %s", current)
        return

    os.environ["GROQ_CHAT_MODEL"] = model_name
    logger.info("GROQ_CHAT_MODEL mis à jour → %s", model_name)


def main() -> None:
    """Point d’entrée."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("❌ GROQ_API_KEY n’est pas défini.")

    logger.info("Récupération des modèles Groq…")
    available = fetch_available_models(api_key)

    chosen = select_compatible_model(available)
    if not chosen:
        raise RuntimeError(
            f"❌ Aucun des modèles supportés {SUPPORTED_MODELS} n’est disponible.\n"
            f"Modèles retournés par Groq : {available}"
        )

    ensure_env_model(chosen)
    logger.info("✅ Modèle sélectionné avec succès !")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        logger.exception("❌ Échec du réglage du modèle Groq : %s", exc)
        raise SystemExit(1)

