# PaperPilot AI — Product Requirements Document

> Status: Draft — synthesized from grilling session on 2026-05-10, revised after the corpus-and-retrieval pivot. Q7 (Nia indexing scope) is now resolved; see "Knowledge corpus and Nia retrieval" in Implementation Decisions.

> Disclaimer (applies to the product itself, not this document): PaperPilot AI is for paper-trading education and simulation only. It does not provide financial advice and does not execute real-money trades.

---

## Problem Statement

Builders of AI trading agents have no honest way to evaluate whether their agent is *behaviorally* ready to be entrusted with capital. Existing tools answer the wrong question: they measure whether a strategy made money on a backtest. They do not measure whether the agent obeyed its own configured risk rules, explained its decisions, avoided overtrading, or behaved consistently with its declared strategy. The result is that agents that perform well on backtests get promoted to production while quietly violating risk limits, ignoring stop-loss rules, or compounding overconfidence into drawdowns. Bot-builders are forced to invent ad-hoc spreadsheets and one-off scripts to audit their own agents, and there is no shared vocabulary, scoring system, or persistent audit log they can point a capital partner or compliance reviewer at.

## Solution

PaperPilot AI is a behavior-audit and discipline-coach environment for AI trading agents. An agent is registered with PaperPilot, given an HMAC secret, and configured with explicit risk policy (max risk per trade, max trades per day, declared strategy type). The agent then submits paper trades — directly via API, or indirectly via TradingView Pine alerts — and PaperPilot returns a deterministic compliance score (0–100), a list of explicit violation codes against the agent's declared policy, a *citation-grounded* prose explanation produced by a generic large language model whose context is constructed at request time by retrieving relevant excerpts from a curated corpus of finance literature (López de Prado's *Advances in Financial Machine Learning*, Kakushadze & Serur's *151 Trading Strategies*, and any further books added to the corpus). A repeating-violation memory loop deducts further points when an agent commits the same violation 3+ times in its last 20 trades. Bot owners see a dashboard of score over time, top violation codes, and trade-by-trade audit reports with inline citations. A free tier permits 5 AI-narrated audits per month; a $9/month Pro tier (via AllScale) raises the limit to 100. The product never authorizes live deployment, never executes real-money trades, and never claims an agent is "ready for capital." Its only job is to grade behavior against the rules the agent claims to follow, and to ground every recommendation in canonical published literature rather than LLM common knowledge.

## See full PRD

The complete PRD (user stories, implementation decisions, scoring rubric, LLM strategy, knowledge-corpus design, persistence, billing, build order, demo narrative, and triage label) is the working source of truth driving the codebase. Refer to it for any product questions and update it in the same PR as the corresponding code change so reviewers can verify intent matches implementation.
