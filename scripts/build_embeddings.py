#!/usr/bin/env python3
"""
Build semantic embeddings for corpus texts using BGE-M3 and HNSW index.

Outputs:
  public/data/embeddings/chunks.json
  public/data/embeddings/index.hnsw
  public/data/embeddings/meta.json

Usage:
  python scripts/build_embeddings.py
  python scripts/build_embeddings.py --languages en fr --max-docs 50
"""

import argparse
import json
import math
from pathlib import Path
from typing import Iterable

import numpy as np
import hnswlib
from sentence_transformers import SentenceTransformer


CORPUS_DIR = Path("corpus")
METADATA_FILE = CORPUS_DIR / "metadata.json"
RAW_TEXTS_DIR = CORPUS_DIR / "raw_texts"

OUTPUT_DIR = Path("public") / "data" / "embeddings"
CHUNKS_FILE = OUTPUT_DIR / "chunks.json"
INDEX_FILE = OUTPUT_DIR / "index.hnsw"
META_FILE = OUTPUT_DIR / "meta.json"
EMBED_FILE = OUTPUT_DIR / "embeddings.npy"
STATE_FILE = OUTPUT_DIR / "build_state.json"

DEFAULT_MODEL = "BAAI/bge-m3"


def load_metadata() -> list[dict]:
    if not METADATA_FILE.exists():
        raise FileNotFoundError(f"Missing {METADATA_FILE}")
    return json.loads(METADATA_FILE.read_text(encoding="utf-8"))


def read_text(local_path: str) -> str | None:
    path = Path(local_path)
    if not path.exists():
        path = RAW_TEXTS_DIR / Path(local_path).name
        if not path.exists():
            return None
    return path.read_text(encoding="utf-8", errors="ignore")


def iter_chunks(text: str, words_per_chunk: int, overlap: int) -> Iterable[dict]:
    words = text.split()
    if not words:
        return

    step = max(words_per_chunk - overlap, 1)
    idx = 0
    char_pos = 0

    while idx < len(words):
        chunk_words = words[idx : idx + words_per_chunk]
        chunk_text = " ".join(chunk_words)

        # Best-effort char offsets
        start = text.find(chunk_words[0], char_pos)
        if start == -1:
            start = char_pos
        end = start + len(chunk_text)
        char_pos = end

        yield {
            "text": chunk_text,
            "start_char": start,
            "end_char": end,
        }

        idx += step


def main():
    parser = argparse.ArgumentParser(description="Build embeddings index for GEMI corpus")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="SentenceTransformer model name")
    parser.add_argument("--languages", nargs="*", help="Language codes to include (default: all)")
    parser.add_argument("--max-docs", type=int, default=None, help="Max documents to process")
    parser.add_argument("--words-per-chunk", type=int, default=600, help="Words per chunk")
    parser.add_argument("--overlap", type=int, default=80, help="Word overlap between chunks")
    parser.add_argument("--batch-size", type=int, default=16, help="Embedding batch size")
    parser.add_argument("--resume", action="store_true", help="Resume from previous run if possible")
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    metadata = load_metadata()
    if args.languages:
        wanted = set(args.languages)
        metadata = [m for m in metadata if m.get("language_code") in wanted]

    if args.max_docs:
        metadata = metadata[: args.max_docs]

    chunks = []
    texts = []

    for doc in metadata:
        local_path = doc.get("local_path")
        if not local_path:
            continue
        text = read_text(local_path)
        if not text:
            continue

        chunk_idx = 0
        for c in iter_chunks(text, args.words_per_chunk, args.overlap):
            chunks.append(
                {
                    "doc_id": doc["identifier"],
                    "chunk_id": f"{doc['identifier']}_{chunk_idx}",
                    "start_char": c["start_char"],
                    "end_char": c["end_char"],
                    "text": c["text"],
                }
            )
            texts.append(c["text"])
            chunk_idx += 1

    if not chunks:
        print("No chunks created. Check corpus files.")
        return

    CHUNKS_FILE.write_text(json.dumps(chunks, ensure_ascii=False, indent=2), encoding="utf-8")

    state = {
        "model": args.model,
        "count": len(chunks),
        "words_per_chunk": args.words_per_chunk,
        "overlap": args.overlap,
        "completed": 0,
    }

    if args.resume and STATE_FILE.exists() and EMBED_FILE.exists():
        try:
            existing = json.loads(STATE_FILE.read_text(encoding="utf-8"))
            if (
                existing.get("model") == args.model
                and existing.get("count") == len(chunks)
                and existing.get("words_per_chunk") == args.words_per_chunk
                and existing.get("overlap") == args.overlap
            ):
                state["completed"] = int(existing.get("completed", 0))
        except Exception:
            pass

    model = SentenceTransformer(args.model)
    dim = model.get_sentence_embedding_dimension()

    embeddings = np.memmap(
        EMBED_FILE, dtype="float32", mode="w+" if state["completed"] == 0 else "r+", shape=(len(chunks), dim)
    )

    for start in range(state["completed"], len(chunks), args.batch_size):
        batch_texts = texts[start : start + args.batch_size]
        batch = model.encode(batch_texts, normalize_embeddings=True, show_progress_bar=False)
        embeddings[start : start + len(batch)] = np.asarray(batch, dtype=np.float32)
        state["completed"] = start + len(batch)
        STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")
        print(f"Embedded {state['completed']}/{len(chunks)}")

    embeddings = np.asarray(embeddings, dtype=np.float32)

    index = hnswlib.Index(space="cosine", dim=dim)
    index.init_index(max_elements=len(chunks), ef_construction=200, M=64)
    index.add_items(embeddings, ids=np.arange(len(chunks)))
    index.set_ef(64)
    index.save_index(str(INDEX_FILE))

    META_FILE.write_text(
        json.dumps(
            {
                "model": args.model,
                "dim": dim,
                "count": len(chunks),
                "words_per_chunk": args.words_per_chunk,
                "overlap": args.overlap,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"✓ Wrote {len(chunks)} chunks")
    print(f"✓ Index saved to {INDEX_FILE}")
    print(f"✓ Metadata saved to {META_FILE}")


if __name__ == "__main__":
    main()
