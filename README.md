# 🏏 Cricket Auction Platform — Frontend

A high-performance, real-time cricket player auction console built with **React 18**, **Vite**, and **Tailwind CSS**. Designed for live IPL-style bidding events with zero database overhead, full dark/light theme support, custom tournament branding, and dynamic Excel roster management.

Pairs seamlessly with the [cric-auction-backend](https://github.com/thepavansai/cric-auction-backend) FastAPI service.

---

## ✨ Features

- 🎛️ **Live Bidding Console**: Viewport-optimized cockpit with quick bid increment buttons (`+1L`, `+2L`, `+5L`, `+10L`), force-sell overrides, and player card showcases.
- 🎨 **Theme Engine**: Seamless toggle between Dark & Light modes with WCAG-compliant contrast and persistent local storage.
- 🏷️ **Custom Tournament Branding**: Upload custom tournament logos (< 2MB) and organization names that dynamically update the top bar and session branding.
- 📊 **Configurable Excel Roster Import**:
  - Upload player rosters directly from `.xlsx` / `.xls` spreadsheets.
  - **Player ID Column Mapping**: Dedicated column dropdown dynamically discovers all sheet headers so you can map Player IDs with zero ambiguity.
  - **Zero Player Drop**: Safe sequential ID generation ensures valid players are never omitted even if ID cells are blank.
- 👑 **Captain Round & Phase Management**: Designated captain auction round with automated, smooth transition into the general player pool once all captains are drafted.
- ↩️ **LIFO Bid Reversal**: Undo accidental bids with one click — automatically restores team purses, roster slots, and player availability.
- 💰 **10-Team Standings Grid**: Real-time budget tracking across all teams simultaneously without vertical page scrolling.
- 📥 **Comprehensive Excel Export**: Exports two structured sheets:
  1. **Master Roster**: Complete player database with final sale status, base prices, winning bids, and teams.
  2. **Team Squads**: Sold players categorized by team with captain markers (`👑`) and total expenditure tallies.
- 🔄 **Re-auction Unsold Players**: Launch Round 2 bidding on unsold players with a single click while preserving Round 1 squads.
- 🛡️ **Session Persistence & Reload Safeguards**: Local storage autosave guards against accidental tab closures or page refreshes.

---

## 🛠️ Tech Stack

- **Framework**: [React 18](https://react.dev/)
- **Build Tool**: [Vite 5](https://vitejs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) + Custom CSS Variables
- **Icons**: [Lucide React](https://lucide.dev/)
- **Spreadsheet Engine**: [SheetJS (xlsx)](https://docs.sheetjs.com/)
- **HTTP Client**: [Axios](https://axios-http.com/)

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm** or **yarn** / **pnpm**
- **cric-auction-backend**: Running on `http://localhost:8080` (see [Backend Setup](#backend-setup))

### Installation

1. **Clone the repository:**
   ```bash
   git clone git@github.com:thepavansai/cric-auction-frontend.git
   # or: git clone https://github.com/thepavansai/cric-auction-frontend.git
   cd cric-auction-frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the local development server:**
   ```bash
   npm run dev
   ```
   The application will be running at `http://localhost:5173`.

4. **Build for production:**
   ```bash
   npm run build
   ```
   Compiled assets will be placed in the `dist/` directory.

---

## 🔌 Backend Setup

The frontend communicates with the Python FastAPI backend on `http://localhost:8080`.

1. In a separate terminal, navigate to your backend directory:
   ```bash
   cd cric-auction-backend
   uv run uvicorn cric_auction_backend.main:app --host 0.0.0.0 --port 8080 --reload
   ```
2. Verify the backend health check by visiting `http://localhost:8080/`.

---

## 📋 Excel Roster Format

The platform accepts standard `.xlsx` spreadsheets. Columns are automatically discovered with support for custom mapping in the Setup view.

### Recommended Headers

| Column | Supported Aliases / Headers | Description |
| :--- | :--- | :--- |
| **Player ID** | `PLAYER ID`, `Player ID`, `ID`, `EMP ID`, `Employee ID` | Unique player identifier (can be mapped in Setup) |
| **Full Name** | `FULL NAME`, `Full Name`, `Name`, `Player Name` | Player's display name |
| **Role** | `Select your cricket category`, `Role`, `Category` | Batsman, Bowler, All-Rounder, Wicketkeeper |
| **Skill Level** | `Select your SKILL level`, `Skill Level`, `Skill` | `Beginner` (2L), `Intermediate` (4L), `Expert` (6L) |
| **Email** | `Email`, `E-mail`, `Email Address` | Player's email address |
| **Photo** | `PLEASE UPLOAD YOUR RECENT PHOTO...`, `Photo`, `Image Path` | Local file path or image filename |

> **Note:** Captains have a fixed base price of **10 Lakhs** and can be specified by ID or Name during tournament setup.

---

## 📂 Project Structure

```
cric-auction-frontend/
├── index.html                  # HTML entrypoint & typography imports
├── package.json                # Dependencies & build scripts
├── vite.config.js              # Vite configuration
├── tailwind.config.js          # Tailwind CSS theme extension
├── postcss.config.js           # PostCSS configuration
├── src/
│   ├── main.jsx                # Application root & error boundary
│   ├── App.jsx                 # Top-level shell, routing & state machine
│   ├── index.css               # Design system tokens (dark/light themes)
│   ├── assets/
│   │   └── default-logo.png    # Default tournament branding logo
│   └── views/
│       ├── SetupView.jsx       # Tournament configuration, branding & Excel parser
│       ├── AuctionView.jsx     # Real-time bidding console, cockpit & team grid
│       └── ExportView.jsx      # Summary dashboard, squad sheets & XLSX export
└── README.md
```

---

## 🤝 Contributing

Contributions are welcome!
1. Fork the repository
2. Create your branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
