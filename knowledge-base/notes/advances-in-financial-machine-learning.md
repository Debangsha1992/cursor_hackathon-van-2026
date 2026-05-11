# Notes — Advances in Financial Machine Learning

**Author:** Marcos López de Prado
**Year:** 2018
**Publisher:** Wiley
**Pages:** 393
**License:** Copyrighted; do not commit the PDF or redistribute.
**Manifest id:** `advances-fin-ml-de-prado-2018`

## Why this book is in the corpus

This is the canonical reference for *what goes wrong with quant bots*. Most retail and hackathon-grade trading agents fail not because the market is unpredictable, but because the developer accidentally trained the bot on a leaky backtest, multiple-tested their way into a fake edge, or used a feature representation that violates the IID assumption. PaperPilot AI's bot-coach should ground its critique of overconfident, overfit, or strategy-inconsistent bots in this book.

## Topics this book is the strongest source for

- **Backtest overfitting and the Deflated Sharpe Ratio** — when a bot reports `confidenceScore > 0.9`, this book is the citation for why high reported confidence after many tested variants should be discounted.
- **Purged k-fold cross-validation and embargoed splits** — for explaining why a bot's "we tested this for 6 months and it works" is not statistical evidence.
- **Triple-barrier labeling and meta-labeling** — for explaining why a bot's claimed `signalReason` may be measuring the wrong thing (e.g., labeling based on close-to-close returns when the strategy actually exits intra-bar).
- **Information-driven bars (volume / dollar / VPIN)** — for explaining why time-based candles can be the wrong sampling unit, especially in the BTC market regime, and why a bot's "5-minute MA crossover" may be drawing signal from microstructure noise.
- **Multiple testing and selection bias** — for explaining the cost of trying many strategy variants before submitting one to PaperPilot.
- **Feature importance via MDI vs MDA** — for evaluating whether a bot's stated decision rationale would survive a leakage-aware test.

## When the bot-coach should retrieve from this source

The retriever should pull excerpts from this book when **any** of:

- The trade triggered `BOT_OVERCONFIDENCE`. Default query: *"calibration of confidence scores under multiple testing in financial machine learning"*.
- The trade triggered `BOT_POOR_RISK_REWARD` and the bot's declared strategy is ML-driven. Default query: *"sizing and reward-to-risk implications of meta-labeled signals"*.
- The trade triggered `BOT_STRATEGY_MISMATCH`. Default query: *"feature leakage and strategy mislabeling in financial ML pipelines"*.
- The history modifier fired (same violation code recurring). Default query: *"overfitting symptoms when a strategy repeats the same risk failure"*.
- The bot's `marketRegime` is declared but the agent has no regime-conditioning evidence in `signalReason`. Default query: *"regime-conditional strategies and meta-labeling"*.

## Coach sections this book should inform

- `decisionReview` — does the cited evidence support or contradict the bot's reasoning?
- `strategyConsistency` — does the bot's behavior pattern look like a canonical strategy or a backtest-fit artifact?
- `behaviorWarnings` — overconfidence, repeated identical mistakes, regime confusion.
- `improvementSuggestions` — concrete process changes (purged CV, sequential bootstrapping, meta-labeling).

## Things to avoid retrieving for

- Stop-loss numerics. The book is not a beginner-level risk-management primer; for `BOT_NO_STOP_LOSS` prefer 151 Trading Strategies or a future risk-management text.
- Order execution mechanics. Out of scope for paper-trading audits.

## Indexing notes

When indexing through Nia: this is a single PDF, ingest as `research_paper` source type with the local file. Tag with `topical_tags` from the manifest. Confirm Nia's chunking respects chapter boundaries (the book has 22 chapters; default 800-char chunks usually preserve subsection structure).
