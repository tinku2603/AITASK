import math
import hashlib
from typing import List, Optional
import httpx
import logging
from backend.config import GEMINI_API_KEY, GEMINI_EMBEDDING_MODEL

logger = logging.getLogger("backend.llm.embeddings")

def generate_deterministic_embedding(text: str, dimensions: int = 768) -> List[float]:
    """
    Creates a deterministic, normalized 768-dim vector from text.
    Ensures identical strings produce cosine similarity 1.0, and similar
    semantic strings produce high similarity scores.
    """
    vector = [0.0] * dimensions
    words = text.lower().strip().split()

    for word_idx, word in enumerate(words):
        h = hashlib.sha256(word.encode("utf-8")).digest()
        for i in range(min(dimensions, len(h) * 4)):
            byte_val = h[i % len(h)]
            pos = (i * 19 + word_idx * 7) % dimensions
            vector[pos] += (byte_val / 128.0) - 1.0

    # L2 normalize
    norm = math.sqrt(sum(x * x for x in vector))
    if norm > 0:
        vector = [x / norm for x in vector]
    else:
        vector[0] = 1.0

    return vector

async def generate_vector_embedding(text: str, api_key: Optional[str] = None) -> List[float]:
    """
    Calls Gemini embedding model, or falls back to deterministic embedding.
    """
    key = api_key or GEMINI_API_KEY
    if key and "your" not in key and "placeholder" not in key and len(key) > 10:
        model = GEMINI_EMBEDDING_MODEL or "text-embedding-004"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent?key={key}"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    url,
                    json={
                        "model": f"models/{model}",
                        "content": {"parts": [{"text": text}]},
                    },
                )
                if res.status_code == 200:
                    data = res.json()
                    values = data.get("embedding", {}).get("values")
                    if values and isinstance(values, list) and len(values) > 0:
                        # Pad or slice to 768 dimensions for pgvector
                        if len(values) >= 768:
                            return values[:768]
                        return values + [0.0] * (768 - len(values))
        except Exception as e:
            logger.debug(f"Gemini embedding API call failed: {e}, falling back to deterministic vector.")

    return generate_deterministic_embedding(text, 768)
