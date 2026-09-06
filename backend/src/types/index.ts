import type { Request } from 'express';

export type UserRole = 'admin' | 'standard';
export type UserStatus = 'pending' | 'approved' | 'rejected';
export type ChartLibrary = 'recharts' | 'echarts';
export type FinancialYearStart = 'january' | 'july';
export type TradeType = 'buy' | 'sell' | 'dividend' | 'interest' | 'other_income' | 'drp' | 'split' | 'deposit' | 'withdrawal' | 'transfer_in' | 'fx_transfer_in' | 'fx_transfer_out';
export type TradeSource = 'manual' | 'pdf_import';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  status: UserStatus;
  chart_library: ChartLibrary;
  financial_year_start: FinancialYearStart;
  created_at: string;
  updated_at: string;
}

export interface Portfolio {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface Security {
  id: string;
  symbol: string;
  name: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  asset_type: string | null;
  currency: string;
}

export interface Trade {
  id: string;
  portfolio_id: string;
  security_id: string | null;
  trade_date: string;
  trade_type: TradeType;
  quantity: number;
  price: number;
  brokerage: number;
  gst: number;
  currency: string;
  exchange_rate: number;
  notes: string | null;
  source: TradeSource;
  created_at: string;
  updated_at: string;
  security?: Security;
}

export interface ParsedTrade {
  trade_date: string;
  trade_type: TradeType;
  symbol: string;
  security_name: string;
  exchange: string;
  currency: string;
  quantity: number;
  price: number;
  amount: number;
  brokerage: number;
  gst: number;
  exchange_rate?: number;
  notes?: string;
}

export interface HoldingPosition {
  security_id: string;
  symbol: string;
  security_name: string;
  exchange: string;
  currency: string;
  quantity: number;
  avg_cost: number;
  cost_base: number;
  current_price: number | null;
  market_value: number | null;
  unrealized_gain: number | null;
  unrealized_gain_pct: number | null;
}

export interface CgtLot {
  symbol: string;
  security_name: string;
  buy_date: string;
  sell_date: string;
  quantity: number;
  cost_base: number;
  proceeds: number;
  gross_gain: number;
  hold_days: number;
  cgt_discount_eligible: boolean;
  cgt_discount_amount: number;
  net_gain: number;
}

export interface Statistics {
  total_return_annualized: number;
  winning_months_pct: number;
  max_drawdown: number;
  std_dev_monthly: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  beta: number;
  correlation_sp500: number;
}

export interface AuthenticatedRequest extends Request {
  user?: Profile;
  userId?: string;
}
