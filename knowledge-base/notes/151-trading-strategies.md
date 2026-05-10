# Notes — 151 Trading Strategies

**Authors:** Zura Kakushadze, Juan Andrés Serur
**Year:** 2018
**Publisher:** SSRN working paper (id 3247865)
**Pages:** 361
**License:** Open-access, author-distributable.
**Manifest id:** `151-trading-strategies-kakushadze-serur-2018`

## Why this book is in the corpus

This is the corpus's **strategy taxonomy**. When a bot declares its `strategyType` is `mean_reversion` or `breakout`, PaperPilot AI needs a canonical reference to verify the bot's `signalReason` actually matches the textbook definition of that strategy — and a corpus to cite when telling the developer what their strategy *should* look like.

The book covers 150+ strategies with formulas, source code for backtesting, ~2,000 bibliographic references, and a 900-entry glossary across asset classes (stocks, options, fixed income, futures, FX, crypto, commodities, volatility-as-asset-class, distressed, real estate, global macro, etc.). It is descriptive, not prescriptive — making it an ideal *neutral reference* for an audit tool.

## Topics this book is the strongest source for

- **Canonical definitions of every strategy family** the bot-coach is likely to encounter:
  - Trend-following / momentum (multiple variants by horizon and asset class)
  - Mean-reversion (single-asset and pairs)
  - Statistical arbitrage and pairs trading
  - Breakout systems
  - Range trading
  - Volatility-targeting and dispersion
  - Risk arbitrage
  - Options strategies (covered calls, spreads, ladders, etc. — useful when bots dabble in derivatives)
- **Strategy-by-strategy risk profiles.** Each strategy section names the typical failure modes — useful when explaining to the bot owner what a particular agent should be guarding against.
- **Glossary and acronyms** — when a bot's `signalReason` uses a specialist term, the glossary disambiguates.

## When the bot-coach should retrieve from this source

The retriever should pull from this book when **any** of:

- The trade triggered `BOT_STRATEGY_MISMATCH`. Default query: *"canonical definition of {profile.strategyType} strategy"*.
- The trade triggered `BOT_MISSING_REASONING` and the strategy is declared. Default query: *"what reasoning is required to justify a {profile.strategyType} entry signal?"*.
- The bot's declared `strategyType` is `custom`. Default query: *"trading strategies that combine signals from {tags inferred from signalReason}"*.
- A general strategy-consistency check is needed (this is the always-on fallback retrieval target).

## Coach sections this book should inform

- `strategyConsistency` — primary contributor. Cites the canonical definition the bot is being measured against.
- `decisionReview` — does the bot's reasoning match the textbook reason for entering this strategy?
- `improvementSuggestions` — pointers to related strategy variants when the bot's current approach has known weaknesses.

## Things to avoid retrieving for

- Stop-loss and position-sizing numerics for non-derivative spot trading — the book covers structure rather than execution sizing for those cases. Use a future risk-management text.
- ML-specific overfitting concerns — that's de Prado's domain.

## Indexing notes

Open-access PDF, can be re-fetched from SSRN (`abstract=3247865`) if the local copy is lost. Ingest into Nia as `research_paper`. Confirm strategy-section chunk boundaries are preserved (each strategy is ~1 page, sections are clearly headed; default chunking should be fine but verify after first index).
