#!/usr/bin/env python3
"""
Semantic search over GEMI embeddings (BGE-M3 + HNSW).

Usage:
  python scripts/semantic_search.py --query "mechanical calculation" --k 10
"""

import argparse
import json
from pathlib import Path

import hnswlib
import numpy as np
from sentence_transformers import SentenceTransformer


EMBED_DIR = Path("public") / "data" / "embeddings"
CHUNKS_FILE = EMBED_DIR / "chunks.json"
INDEX_FILE = EMBED_DIR / "index.hnsw"
META_FILE = EMBED_DIR / "meta.json"


def load_meta() -> dict:
    if META_FILE.exists():
        return json.loads(META_FILE.read_text(encoding="utf-8"))
    return {"model": "BAAI/bge-m3", "dim": None}


def load_chunks() -> list[dict]:
    if not CHUNKS_FILE.exists():
        raise FileNotFoundError(f"Missing {CHUNKS_FILE}")
    return json.loads(CHUNKS_FILE.read_text(encoding="utf-8"))


def load_index(dim: int) -> hnswlib.Index:
    if not INDEX_FILE.exists():
        raise FileNotFoundError(f"Missing {INDEX_FILE}")
    index = hnswlib.Index(space="cosine", dim=dim)
    index.load_index(str(INDEX_FILE))
    index.set_ef(64)
    return index


def main():
    parser = argparse.ArgumentParser(description="Semantic search over embeddings")
    parser.add_argument("--query", required=True, help="Search query")
    parser.add_argument("--k", type=int, default=10, help="Top K results")
    parser.add_argument("--max-chars", type=int, default=420, help="Max chars per snippet")
    args = parser.parse_args()

    meta = load_meta()
    model = SentenceTransformer(meta.get("model", "BAAI/bge-m3"))

    query_vec = model.encode([args.query], normalize_embeddings=True)
    query_vec = np.asarray(query_vec, dtype=np.float32)
    dim = query_vec.shape[1]

    chunks = load_chunks()
    index = load_index(dim)

    labels, distances = index.knn_query(query_vec, k=min(args.k, len(chunks)))
    labels = labels[0]
    distances = distances[0]

    results = []
    for label, dist in zip(labels, distances):
        chunk = chunks[int(label)]
        score = 1.0 - float(dist)
        text = chunk.get("text", "")
        if args.max_chars and len(text) > args.max_chars:
            text = text[: args.max_chars].rstrip() + "…"
        results.append(
            {
                "doc_id": chunk.get("doc_id"),
                "chunk_id": chunk.get("chunk_id"),
                "start_char": chunk.get("start_char"),
                "end_char": chunk.get("end_char"),
                "score": score,
                "text": text,
            }
        )

    print(json.dumps({"query": args.query, "results": results}, ensure_ascii=False))


if __name__ == "__main__":
    main()
