# Requirements

    - Track dividend reinvestments
    - Track portfolio investment
    - Benchmarking with NASDAQ, S&P500
    - Accept input in multiple formats, the initial input to support is PDF format
    - Sample pdf format is attached in this repository
    - The web application must be protected with a login
    - Integrate with Google directory for account
    - User can create multiple portfolios, for example, personal investment, and retirement investment
    - When user ingested the trade data, it should be associated with one of the portfolio
    - The same thing with all the required reports below, it should be associated with one of the portfolio
    - Support for Recharts library and Apache ECharts library (make sure with no known issue with security), but support that it can swapped between the two, and selectable is in settings, and auto update when we change from one to another. Default to Recharts.
    - New user can register or enroll into the application, but it must be approved by admin user before it can access the app.
    - There are 2 roles, admin, and standard user. Only admin can read the database directly.
    - The first user is always admin
    - Obviously, a user can only see its own data or portfolio.
    - Mobile access friendly
    - Generate test cases every time ne logic is introduced
    - Re-run all test cases every time changes are applied
    - All tests must pass
    - Generate README.md
    - Generate PROMPT.md
    - Generate CHANGELOG.md with initial version is v0.1.0
    - Update CLAUDE.md file with the new changes if required

## Architecture

    - Frontend is on Cloudflare, and protected by cloudflare
    - Backend is on Railway, and Supabase as I need data to be persistent
    - Use latest Vite version >6.x
    - Use DESIGN.md file as the design layout

## Reports

    - Shows total portfolio returns over any date range (YTD, 1Y, 2Y, 3Y, 5Y, custom date range, total return since inception or the start of the data, etc)
    - Shows the total return on each security sold within the selected date range
    - Show monthly profit
    - Statistics: Total Return Annualized
    - Winning Months (%)
    - Max Drawdown (Monthly)
    - Standard Deviation Monthly
    - Sharpe Ratio
    - Sortino Ratio
    - Beta
    - Correlation vs. S&P 500 (SPX)
    - Lists all trades over the selected date range
    - Shows dividend and interest payments along with the relevant totals for tax purposes
    - Able to show how much of tax I need to pay in financial year. The financial year can be customised, either from 1-July to 30-June or 1-January to 31-December
    - Shows portfolio diversity across different investment sectors, investment types, countries and markets
    - Shows true portfolio exposure to industries, investment types and sectors by listing your holdings alongside any assets held within exchange traded funds (ETFs).
    - Calculates capital gains from a Capital Gains Tax (CGT) perspective
    - Shows expected upcoming dividends and interest payments to help predict cash flow
    - Shows how each holdings or asset allocations have contributed to the overall portfolio performance
    - Compares the value of each holding by investment type, country or market over any period or currency
    - Compares performance against the maximum drawdown of your listed investments
    - Compares portfolio returns over different periods including the impact of sold securities
    - Show the current portfolio holdings
    - Some of the above requirements are taken from Sharesight features
