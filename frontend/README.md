# Stock Prediction Frontend

This is the frontend for the Stock Prediction application, built with **React**, **TypeScript**, and **Vite**. It provides an interactive UI to view stock data, monitor automated signals, review price levels, and test historical simulations.

## Features
- **Dashboard View**: Aggregated view of quotes, signals, and dynamic price levels.
- **Simulation Mode**: Backtest signals by simulating data as of specific historical dates.
- **Trade Notes & Ledgers**: Built-in `TradeCard` combining AI-driven analyst insights with local user notes.
- **Dynamic Price Levels**: Interactive `PriceLevelCard` visualizing calculated support/resistance targets and stop-loss levels.

## Getting Started

### Prerequisites
- Node.js (v16+)
- npm or yarn

### Installation
1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

### Backend Integration
Ensure the backend is running concurrently to fetch active stock data, indicators, and predictions. The frontend communicates with the unified `/dashboard/:symbol` endpoint.

## Tech Stack
- React
- TypeScript
- Vite
