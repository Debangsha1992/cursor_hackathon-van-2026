# PaperPilot AI — Knowledge Base

This folder is the canonical source of truth for the books, papers, and notes that ground PaperPilot AI's bot-coach. The coach does not invent trading advice; every prose explanation it returns is grounded in excerpts retrieved from this corpus by [Nia](https://docs.trynia.ai/).

## What lives here

```
knowledge-base/
├── README.md                  # this file
├── manifest.yaml              # registry of every indexed source
├── .gitignore                 # keeps copyrighted PDFs out of git
├── sources/                   # raw materials (PDFs, papers); gitignored
│   ├── advances-in-financial-machine-learning.pdf
│   └── 151-trading-strategies.pdf
└── notes/                     # markdown notes per source — what it is, when to retrieve
    ├── advances-in-financial-machine-learning.md
    └── 151-trading-strategies.md
```

## How retrieval works

1. A trading bot submits a paper trade to `POST /api/bots/trades`.
2. The deterministic rule engine (`botRuleEngine`) computes the compliance score and the list of violation codes.
3. `niaRetriever` queries `/v2/search?mode=universal` against the indexed corpus, with the query built from the trade context — declared `strategyType`, the violation codes, the `marketRegime`, and the `signalReason`.
4. The top-K retrieved excerpts (default 4) are inserted into the bot-coach LLM's system prompt under a `Reference excerpts` block, with citations.
5. The LLM produces a coach report grounded in those excerpts. Citations appear inline in the prose (e.g., *"… per López de Prado (2018), Ch. 11."*).
6. Violations and the score remain fully deterministic; retrieval and the LLM only shape the *prose*, never the *number*.

## Adding a new book

1. Drop the PDF into `sources/`. (Do not commit copyrighted PDFs — `.gitignore` already blocks them.)
2. Add an entry to `manifest.yaml` with: `id`, `title`, `authors`, `year`, `license`, `local_path`, `pages`, `topical_tags`, `when_to_retrieve` rules, and a one-paragraph `summary`.
3. Add a notes file at `notes/<id>.md` describing what the book covers and how it should inform the coach (which violation codes does it speak to, which strategies does it disambiguate).
4. Re-run the indexing step (see `notes/INDEXING.md` once the indexer module is built) so Nia ingests the new PDF and the `manifest.yaml` `nia_source_id` is updated with the resulting Nia source ID.
5. Commit `manifest.yaml` and the notes. Never commit the PDF unless its license explicitly allows redistribution.

## Why a manifest, not "just upload to Nia"

Nia stores the embeddings, but the manifest is the human-readable contract between the corpus and the coach prompt. It records:

- *Why this book is in the corpus* (which questions it can answer).
- *When to retrieve from it* (which violation codes or trade contexts trigger pulls from this source).
- *Provenance and license* (so we never accidentally republish copyrighted material).

If Nia is ever swapped for a different retrieval backend, the manifest survives and the coach prompts continue to work with minimal rewiring.

## Disclaimer

The materials in `sources/` are reference texts indexed for educational discipline-coaching prose. PaperPilot AI is paper-trading-only; nothing retrieved or generated here authorizes real-money trading.
