# AI Trading Trainer × Poly Claw Bot
### Hackathon Project Documentation
**Theme: Build something AI agents will use**

---

## Table of Contents

1. [One-Line Pitch](#one-line-pitch)
2. [The Big Idea](#the-big-idea)
3. [How It Works — The Full Loop](#how-it-works--the-full-loop)
4. [System Architecture](#system-architecture)
5. [Component Breakdown](#component-breakdown)
   - [TradingView + Pine Script Layer](#1-tradingview--pine-script-layer)
   - [Trainer Agent API](#2-trainer-agent-api)
   - [Backtest Engine](#3-backtest-engine)
   - [Risk Guardrails](#4-risk-guardrails)
   - [Paper Trade Executor](#5-paper-trade-executor)
   - [Finance LLM Talking Layer](#6-finance-llm-talking-layer--the-new-piece)
   - [Trade Edit System](#7-trade-edit-system)
   - [Agent Memory Store](#8-agent-memory-store)
6. [The LLM Stack](#the-llm-stack)
7. [Prompt Architecture](#prompt-architecture)
8. [Trade Edit JSON Schema](#trade-edit-json-schema)
9. [User Interaction Flows](#user-interaction-flows)
10. [Tech Stack Summary](#tech-stack-summary)
11. [Hackathon Build Order](#hackathon-build-order)
12. [Why This Wins the Theme](#why-this-wins-the-theme)

---

## One-Line Pitch

> An AI trading trainer that teaches Poly Claw Bot how to trade — using real TradingView signals, live backtesting, and a finance LLM that lets humans talk to the AI, understand every decision, and edit trades in plain English.

---

## The Big Idea

Most trading bots are black boxes. Poly Claw fires trades and humans either trust it or don't.

This project wraps Poly Claw in a **coaching system** — a layer that:

- Pulls real Pine Script signals from TradingView
- Backtests every proposed trade before it executes
- Enforces risk rules automatically
- Runs all paper trades in a simulated portfolio
- Lets users **talk to the system** in plain English ("why is it buying here?", "change the stop loss to 2%")
- Returns structured coaching feedback back to Poly Claw so the agent learns over time

The finance LLM (`Qwen-Open-Finance-R-8B`) is the talking layer. It reads your trading strategies as context, reasons about Poly Claw's decisions, explains them to users, and translates user edits into structured JSON that the system can act on — without any retraining.

This is not a human tool. **This is infrastructure that an AI agent uses.**

---

## How It Works — The Full Loop

```
1.  TradingView Pine Script fires a webhook → signal arrives at your API
2.  Trainer API receives signal + fetches OHLCV history from TradingView
3.  Backtest engine replays the signal on historical data → returns stats
4.  Risk guardrails check position size, max loss, exposure
5.  Paper trade executor simulates the fill with slippage
6.  Finance LLM assembles all of the above into a human-readable explanation
7.  User reads the explanation, optionally edits the trade in chat
8.  If edited → LLM emits structured JSON → API patches the trade params
9.  Final trade params go to Poly Claw → it executes on paper
10. Outcome logged → memory store updated → Poly Claw's skill profile evolves
```

Every single step is visible and editable. No black box.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        TradingView                          │
│   Pine Script runs live → Alert fires webhook on signal     │
└────────────────────────┬────────────────────────────────────┘
                         │ webhook (JSON: symbol, action, price)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Signal Parser / Webhook Receiver          │
│   Normalises payload → symbol, direction, timeframe, price  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                     Trainer Agent API                       │
│              Central hub — routes to all engines            │
└──────┬──────────────────┬───────────────────────┬───────────┘
       │                  │                       │
       ▼                  ▼                       ▼
┌──────────────┐  ┌───────────────┐  ┌───────────────────────┐
│   Backtest   │  │     Risk      │  │   Paper Trade         │
│   Engine     │  │  Guardrails   │  │   Executor            │
│              │  │               │  │                       │
│ Replay signal│  │ Max loss      │  │ Simulated fills       │
│ on OHLCV     │  │ Position size │  │ Slippage model        │
│ Win rate     │  │ Exposure cap  │  │ Live P&L tracking     │
│ Sharpe ratio │  │ Block/resize  │  │ Portfolio state       │
│ Max drawdown │  │               │  │                       │
└──────┬───────┘  └───────┬───────┘  └───────────┬───────────┘
       │                  │                       │
       └──────────────────┼───────────────────────┘
                          │ all results combined
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Finance LLM Talking Layer                      │
│         Qwen-Open-Finance-R-8B  (HuggingFace)              │
│                                                             │
│  Input:  trading strategy (system prompt / RAG)            │
│          backtest stats, risk verdict, trade params         │
│          FinGPT sentiment score on the asset                │
│          user's chat message                                │
│                                                             │
│  Output: plain English explanation + optional JSON edit     │
└────────────────────────┬────────────────────────────────────┘
                         │
               ┌─────────┴──────────┐
               │                    │
               ▼                    ▼
      Explanation shown        Edit JSON parsed
      to user in chat          → API patches trade
               │                    │
               └─────────┬──────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      Poly Claw Bot                          │
│   Receives final trade params → executes on paper           │
└────────────────────────┬────────────────────────────────────┘
                         │ outcome reported back
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Agent Memory Store                        │
│   Trade history, strategy performance, skill profile        │
│   Poly Claw's patterns, win/loss by strategy type           │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### 1. TradingView + Pine Script Layer

**What it does:** Runs your indicator/strategy logic natively on TradingView servers. No server-side Pine Script execution needed — TradingView handles it all. When a signal triggers, it fires a webhook to your API.

**How to set it up:**
- Create a TradingView Alert on any indicator or strategy
- Set the webhook URL to your Trainer API endpoint
- Customise the alert message template with JSON fields:

```json
{
  "symbol": "{{ticker}}",
  "action": "{{strategy.order.action}}",
  "price": {{close}},
  "timeframe": "{{interval}}",
  "strategy": "EMA_Cross",
  "contracts": {{strategy.order.contracts}}
}
```

**OHLCV data:** Pull historical candle data from TradingView's API for the same symbol and timeframe. This ensures the backtest runs on the exact same data the Pine Script was using — no mismatch.

**Requirements:** TradingView Essential plan or above (webhooks are a paid feature).

---

### 2. Trainer Agent API

**What it does:** The central nervous system. Receives the webhook signal, orchestrates calls to the backtest engine, risk guardrails, and paper trade executor, then assembles everything for the LLM.

**Endpoints Poly Claw can also call directly:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/signal` | POST | Receive TradingView webhook |
| `/evaluate` | POST | Score a proposed trade intent |
| `/backtest` | POST | Run a trade on historical data |
| `/risk/check` | POST | Validate position against risk rules |
| `/trade/paper` | POST | Execute a paper trade |
| `/trade/edit` | PATCH | Apply user edits to open/pending trade |
| `/memory/summary` | GET | Return Poly Claw's current skill profile |

**Tech:** FastAPI (Python) — lightweight, async, easy to add WebSocket for live chat.

---

### 3. Backtest Engine

**What it does:** Takes the incoming signal and replays it against TradingView OHLCV history. Returns a structured performance summary.

**Inputs:**
```json
{
  "symbol": "BTCUSDT",
  "direction": "long",
  "entry_price": 68400,
  "stop_loss": 67200,
  "take_profit": 71000,
  "timeframe": "15m",
  "lookback_bars": 200
}
```

**Outputs:**
```json
{
  "total_trades": 47,
  "win_rate": 0.61,
  "avg_rr": 1.8,
  "sharpe_ratio": 1.42,
  "max_drawdown": -0.082,
  "avg_hold_bars": 14,
  "expectancy": 0.34
}
```

**Library:** `backtesting.py` or `vectorbt` — both run in seconds on historical data.

---

### 4. Risk Guardrails

**What it does:** Checks the proposed trade against a set of rules before it ever reaches Poly Claw. Can block, resize, or approve.

**Rules (configurable):**

```python
RISK_RULES = {
    "max_position_pct": 0.05,        # max 5% of portfolio per trade
    "max_daily_loss_pct": 0.02,      # halt trading if down 2% on the day
    "max_open_positions": 3,          # no more than 3 trades at once
    "min_rr_ratio": 1.5,             # only take trades with RR >= 1.5
    "max_correlated_exposure": 0.10  # max 10% in correlated assets
}
```

**Output:**
```json
{
  "verdict": "resize",
  "reason": "Position size exceeds 5% portfolio limit",
  "original_size": 1500,
  "adjusted_size": 1000
}
```

---

### 5. Paper Trade Executor

**What it does:** Simulates real trade execution without touching real money. Maintains a live virtual portfolio.

**Features:**
- Simulated slippage (0.05% default, configurable)
- Simulated commission
- Live mark-to-market P&L as price updates
- Stop loss and take profit auto-trigger
- Portfolio heat tracking (total % at risk)

**Portfolio state object:**
```json
{
  "balance": 10000,
  "equity": 10340,
  "open_trades": [
    {
      "id": "trade_001",
      "symbol": "BTCUSDT",
      "direction": "long",
      "entry": 68400,
      "size": 1000,
      "stop_loss": 67200,
      "take_profit": 71000,
      "unrealised_pnl": 340,
      "opened_at": "2025-05-10T09:14:00Z"
    }
  ],
  "closed_trades": [],
  "daily_pnl": 340,
  "total_return_pct": 3.4
}
```

---

### 6. Finance LLM Talking Layer — the new piece

**What it does:** Translates everything above into a conversation. Users talk to it in plain English. It explains what Poly Claw is doing, why, and what the data says. It also detects when a user wants to edit a trade and emits structured JSON.

**Model:** `DragonLLM/Qwen-Open-Finance-R-8B` (HuggingFace, free, open source)

Why this model:
- Built on Qwen 3 with reasoning mode — thinks before it responds
- Fine-tuned on financial domain data — understands trading terminology natively
- Small enough (8B) to run on a single GPU or via HuggingFace Inference API
- Outputs structured JSON reliably when prompted correctly

**Supporting model:** `AI4Finance-Foundation/FinGPT`
- Used specifically for sentiment scoring on the asset being traded
- News, social, macro sentiment → single score fed into LLM context
- Outperforms GPT-4 on financial sentiment tasks

**How the LLM is called:**

```python
from transformers import AutoModelForCausalLM, AutoTokenizer

model_name = "DragonLLM/Qwen-Open-Finance-R-8B"
tokenizer  = AutoTokenizer.from_pretrained(model_name)
model      = AutoModelForCausalLM.from_pretrained(model_name)

messages = [
    {"role": "system", "content": SYSTEM_PROMPT},  # strategies + context
    {"role": "user",   "content": user_message}
]

response = model.chat(tokenizer, messages)
```

Or via HuggingFace Inference API (no GPU needed for hackathon):

```python
import requests

API_URL = "https://api-inference.huggingface.co/models/DragonLLM/Qwen-Open-Finance-R-8B"
headers = {"Authorization": f"Bearer {HF_TOKEN}"}

payload = {
    "inputs": formatted_prompt,
    "parameters": {"max_new_tokens": 512, "temperature": 0.3}
}

response = requests.post(API_URL, headers=headers, json=payload)
```

---

### 7. Trade Edit System

**What it does:** Lets users modify pending or open paper trades through natural language. The LLM detects edit intent and appends a structured JSON block. The frontend renders a confirmation card before the edit is applied.

**Supported edit types:**

| User says | JSON action |
|-----------|-------------|
| "Move stop loss to 67,000" | `modify_stop_loss` |
| "Tighten the take profit" | `modify_take_profit` |
| "Reduce position size by half" | `modify_size` |
| "Cancel this trade" | `cancel_trade` |
| "Close the position now" | `close_trade` |
| "Move to breakeven" | `move_to_breakeven` |

**Confirmation flow:**
```
User: "Change the stop loss to 2% instead of 3%"
  ↓
LLM responds with explanation + appended EDIT_JSON block
  ↓
Frontend parses EDIT_JSON → shows confirmation card
  ↓
User clicks Approve → API patches the paper trade
  ↓
Poly Claw receives updated params
```

---

### 8. Agent Memory Store

**What it does:** Maintains a persistent profile of Poly Claw's trading behaviour over time. Every closed trade updates this store. The LLM reads it to give contextually accurate coaching.

**Memory schema:**
```json
{
  "agent_id": "polyclaw_v1",
  "total_trades": 142,
  "win_rate": 0.58,
  "best_strategy": "EMA_Cross_15m",
  "worst_strategy": "RSI_Divergence_1h",
  "common_mistakes": [
    "entering too early on consolidation",
    "holding losers past stop zone"
  ],
  "preferred_sessions": ["london_open", "ny_open"],
  "avg_rr_achieved": 1.4,
  "skill_level": "intermediate",
  "last_updated": "2025-05-10T12:00:00Z"
}
```

This gets injected into the LLM system prompt so responses like _"Poly Claw tends to enter early on consolidation — this setup looks similar"_ are data-driven, not generic.

---

## The LLM Stack

| Model | Role | Size | Source | Cost |
|-------|------|------|--------|------|
| `DragonLLM/Qwen-Open-Finance-R-8B` | Main talking layer — chat, explain, detect edits | 8B | HuggingFace | Free |
| `AI4Finance-Foundation/FinGPT` | Sentiment scoring on asset | ~7B | HuggingFace | Free |
| `DragonLLM/Qwen-Pro-Finance-R-32B` | Upgrade path — stronger reasoning on complex strategies | 32B | Commercial license | Paid |

**For the hackathon:** run both free models via HuggingFace Inference API. No GPU needed. Just a `HF_TOKEN`.

---

## Prompt Architecture

The system prompt is assembled dynamically every call. It has four sections:

```
SYSTEM PROMPT
=============

[1. ROLE]
You are a trading coach embedded in an AI trading system.
You explain trade decisions to users in plain English, help
them understand the strategy, and allow them to edit trades
via natural language. You have access to real backtest data,
risk analysis, and market sentiment for every trade.

[2. TRADING STRATEGIES — injected from your strategy library]
Strategy: EMA Cross 15m
- Entry: 9 EMA crosses above 21 EMA on 15m chart
- Confirmation: RSI > 50
- Stop: Below recent swing low
- Target: 2R minimum
[... all your strategies listed here ...]

[3. CURRENT TRADE CONTEXT — assembled per call]
Symbol: BTCUSDT | Direction: LONG | Entry: $68,400
Stop Loss: $67,200 | Take Profit: $71,000
Backtest (last 200 bars): Win rate 61%, Sharpe 1.42, Max DD -8.2%
Risk verdict: APPROVED (position sized to $1,000 — 1% portfolio)
Sentiment score: +0.72 (bullish — FinGPT)
Poly Claw memory: tends to enter early on consolidation

[4. OUTPUT FORMAT]
- Respond conversationally in plain English
- If the user asks to modify a trade, append an EDIT_JSON block
- Never make up data — only reference figures provided above
- Keep explanations under 150 words unless the user asks for detail
```

---

## Trade Edit JSON Schema

```json
{
  "$schema": "trade_edit_v1",
  "action": "modify_stop_loss | modify_take_profit | modify_size | cancel_trade | close_trade | move_to_breakeven",
  "trade_id": "string",
  "new_value": "number | null",
  "unit": "price | percent | dollars",
  "reason": "string — user's stated reason",
  "requires_confirmation": true,
  "estimated_impact": {
    "new_risk_dollars": 768,
    "new_risk_pct": 0.02,
    "rr_ratio_change": -0.3
  }
}
```

---

## User Interaction Flows

### Flow 1 — Understanding a trade

```
Poly Claw proposes: Long BTCUSDT at $68,400
       ↓
System assembles context → LLM generates explanation
       ↓
User sees in chat:
  "Poly Claw is going long on BTC at $68,400. The 9 EMA just
   crossed above the 21 EMA on the 15-minute chart with RSI at 54
   — that's the EMA Cross strategy. Over the last 200 signals this
   setup won 61% of the time with a 1.42 Sharpe. Sentiment on BTC
   is bullish (+0.72). Stop at $67,200, targeting $71,000 for a
   2.2R trade. Position sized at $1,000 (1% risk)."
```

### Flow 2 — Editing a trade

```
User: "That stop is too tight, move it to $66,800"
       ↓
LLM detects edit intent → reasons about impact → responds:
  "Moving the stop to $66,800 increases your risk from $1,200 to
   $1,600 on this trade (1.6% of portfolio). The RR drops from
   2.2R to 1.64R — still above the 1.5R minimum.

   [EDIT_JSON]
   {
     "action": "modify_stop_loss",
     "trade_id": "trade_001",
     "new_value": 66800,
     "unit": "price",
     "estimated_impact": {
       "new_risk_dollars": 1600,
       "rr_ratio_change": -0.56
     }
   }
   [/EDIT_JSON]"
       ↓
Frontend shows: [Approve edit]  [Cancel]
       ↓
User approves → API patches trade → Poly Claw updated
```

### Flow 3 — Poly Claw asking the trainer directly (agent-to-agent)

```
Poly Claw calls: POST /evaluate
{
  "symbol": "ETHUSDT",
  "direction": "short",
  "entry": 3200,
  "stop": 3280,
  "target": 3040,
  "strategy": "RSI_Divergence"
}
       ↓
Trainer runs backtest + risk check → responds:
{
  "verdict": "caution",
  "win_rate": 0.44,
  "sharpe": 0.81,
  "risk_verdict": "approved",
  "coaching": "RSI divergence on ETH has underperformed recently.
               Consider waiting for a lower high confirmation
               before entering."
}
       ↓
Poly Claw decides whether to proceed
```

---

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Signal source | TradingView webhooks + Pine Script alerts |
| OHLCV data | TradingView REST API |
| Trainer API | Python / FastAPI |
| Backtest engine | `backtesting.py` or `vectorbt` |
| Risk rules | Custom Python rules engine |
| Paper trading | In-memory portfolio (Redis for persistence) |
| Finance LLM | `DragonLLM/Qwen-Open-Finance-R-8B` via HuggingFace Inference API |
| Sentiment model | `AI4Finance-Foundation/FinGPT` |
| Memory store | Redis / PostgreSQL |
| Frontend chat | React + WebSocket |
| Poly Claw bridge | REST API or MCP server |

---

## Hackathon Build Order

**Hour 1–2 — Core pipeline**
- FastAPI skeleton with `/signal` endpoint
- TradingView webhook receiver + signal parser
- Basic backtest engine with `backtesting.py`

**Hour 3–4 — Risk + paper trading**
- Risk rules engine
- Paper trade executor with portfolio state
- `/trade/paper` and `/trade/edit` endpoints

**Hour 5–6 — LLM talking layer**
- HuggingFace Inference API integration (Qwen-Open-Finance-R-8B)
- System prompt builder (dynamic context assembly)
- Edit JSON parser + confirmation flow

**Hour 7–8 — Frontend + Poly Claw bridge**
- React chat UI with WebSocket
- Trade confirmation card component
- Poly Claw MCP/REST integration
- Memory store (even a simple JSON file works for demo)

**Demo flow:** TradingView fires a signal live → system backtests it → LLM explains it in chat → judge types "reduce the position size by 30%" → system parses it → confirmation card appears → approve → Poly Claw gets updated params.

---

## Why This Wins the Theme

The hackathon theme is **"build something AI agents will use."**

This is not a dashboard for humans. It is:

- **Infrastructure Poly Claw depends on** to make better decisions
- **A feedback loop** that makes Poly Claw smarter over every trade
- **A coaching API** any trading agent can call before executing
- **A talking interface** that happens to also serve humans — but the primary client is the agent

The human chat interface is the demo layer. The agent API is the product.

Every tool Poly Claw calls — `/evaluate`, `/backtest`, `/risk/check`, `/memory/summary` — is designed for an AI agent to consume, not a human. The LLM talking layer is how the system communicates what the agents are doing to the humans watching.

That is the inversion that makes this project fit the theme precisely.

---

*Built for the AI Agents Hackathon — May 2025*
