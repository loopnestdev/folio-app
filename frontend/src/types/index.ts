// User and Auth Types
export type UserRole = 'admin' | 'standard';
export type UserStatus = 'pending' | 'approved' | 'rejected';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  status: UserStatus;
  chart_library: 'recharts' | 'echarts';
  financial_year: 'jan-dec' | 'jul-jun';
  created_at: string;
  updated_at: string;
}

// Portfolio Types
export interface Portfolio {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface PortfolioSummary {
  total_value: number;
  total_cost: number;
  total_gain: number;
  total_gain_pct: number;
  cash_balance: number;
  ytd_return: number;
  ytd_return_pct: number;
}

// Trade Types
export type TradeDirection = 'BUY' | 'SELL';
export type TradeType = 'TRADE' | 'DIVIDEND' | 'INTEREST' | 'FEE' | 'DEPOSIT' | 'WITHDRAWAL';

export interface Trade {
  id: string;
  portfolio_id: string;
  symbol: string;
  security_name: string | null;
  exchange: string | null;
  direction: TradeDirection;
  trade_type: TradeType;
  quantity: number;
  price: number;
  amount: number;
  fees: number;
  currency: string;
  trade_date: string;
  settlement_date: string | null;
  notes: string | null;
  imported_from: string | null;
  created_at: string;
}

// Holding Types
export interface Holding {
  id: string;
  portfolio_id: string;
  symbol: string;
  security_name: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  investment_type: string | null;
  quantity: number;
  avg_cost: number;
  total_cost: number;
  current_price: number | null;
  market_value: number | null;
  unrealized_gain: number | null;
  unrealized_gain_pct: number | null;
  updated_at: string;
}

// Performance Types
export interface PerformancePoint {
  date: string;
  portfolio_value: number;
  benchmark_sp500: number | null;
  benchmark_nasdaq: number | null;
  benchmark_asx200: number | null;
}

export type DateRange = 'YTD' | '1Y' | '2Y' | '3Y' | '5Y' | 'ALL' | 'CUSTOM';

export interface DateRangeConfig {
  range: DateRange;
  startDate?: string;
  endDate?: string;
}

// Statistics Types
export interface PortfolioStatistics {
  total_return_annualized: number;
  winning_months_pct: number;
  max_drawdown_monthly: number;
  std_dev_monthly: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  beta: number;
  correlation_sp500: number;
  total_return: number;
  total_return_pct: number;
}

// Monthly Profit Types
export interface MonthlyProfit {
  year: number;
  month: number;
  month_label: string;
  profit: number;
  return_pct: number;
}

// Dividend Types
export interface Dividend {
  id: string;
  portfolio_id: string;
  symbol: string;
  security_name: string | null;
  payment_date: string;
  amount: number;
  currency: string;
  is_reinvested: boolean;
  franking_pct: number | null;
}

export interface DividendSummary {
  total_dividends: number;
  total_interest: number;
  total_income: number;
  dividends: Dividend[];
}

// Capital Gains Types
export interface CapitalGain {
  id: string;
  portfolio_id: string;
  symbol: string;
  security_name: string | null;
  buy_date: string;
  sell_date: string;
  hold_period_days: number;
  quantity: number;
  cost_base: number;
  proceeds: number;
  gross_gain: number;
  cgt_discount_applicable: boolean;
  cgt_discount_pct: number;
  net_gain: number;
  is_long_term: boolean;
}

// Diversity Types
export interface DiversityAllocation {
  name: string;
  value: number;
  pct: number;
  color?: string;
}

export interface PortfolioDiversity {
  by_sector: DiversityAllocation[];
  by_investment_type: DiversityAllocation[];
  by_country: DiversityAllocation[];
  by_market: DiversityAllocation[];
}

// Tax Types
export interface TaxReport {
  financial_year: string;
  dividends_received: number;
  interest_received: number;
  capital_gains_short_term: number;
  capital_gains_long_term: number;
  cgt_discount_applied: number;
  total_taxable_income: number;
}

// Import Types
export interface ParsedTrade {
  symbol: string;
  security_name: string | null;
  direction: TradeDirection;
  trade_type: TradeType;
  quantity: number;
  price: number;
  amount: number;
  fees: number;
  trade_date: string;
  exchange: string | null;
  currency: string;
}

export interface ImportPreview {
  filename: string;
  parsed_count: number;
  trades: ParsedTrade[];
  errors: string[];
}

// Benchmark
export interface BenchmarkToggle {
  sp500: boolean;
  nasdaq: boolean;
  asx200: boolean;
}

// Chart types
export type ChartLibrary = 'recharts' | 'echarts';

// Financial year types
export type FinancialYearType = 'jan-dec' | 'jul-jun';

// API Response types
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: unknown;
}

// Pagination
export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

// Filter types
export interface TradeFilter {
  symbol?: string;
  direction?: TradeDirection;
  trade_type?: TradeType;
  start_date?: string;
  end_date?: string;
}

// Expected dividend
export interface ExpectedDividend {
  symbol: string;
  security_name: string | null;
  expected_date: string;
  estimated_amount: number;
  currency: string;
  frequency: string;
}

// Upcoming dividends
export interface UpcomingDividends {
  dividends: ExpectedDividend[];
  total_estimated: number;
}
