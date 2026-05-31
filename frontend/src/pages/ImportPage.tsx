import { useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Upload, FileText, CheckCircle, X, AlertCircle } from 'lucide-react';
import { usePortfolioContext } from '../contexts/PortfolioContext';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Table } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { useToast } from '../components/ui/Toast';
import { formatCurrency, formatDate } from '../lib/utils';
import type { ImportPreview, ParsedTrade } from '../types';
import { cn } from '../lib/utils';

export function ImportPage() {
  const { id } = useParams<{ id: string }>();
  const { activePortfolio } = usePortfolioContext();
  const portfolioId = id || activePortfolio?.id;
  const currency = activePortfolio?.currency || 'USD';
  const toast = useToast();

  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    const isPdf  = selectedFile.name.endsWith('.pdf');
    const isXlsx = selectedFile.name.endsWith('.xlsx');
    if (!isPdf && !isXlsx) {
      toast.error('Invalid file type', 'Please upload a Moomoo PDF or XLSX file.');
      return;
    }
    setFile(selectedFile);
    setPreview(null);
    setConfirmed(false);
    await uploadFile(selectedFile);
  }, [portfolioId]);

  const uploadFile = async (f: File) => {
    if (!portfolioId) {
      toast.error('No portfolio selected');
      return;
    }
    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', f);

    try {
      const { data } = await api.post<ImportPreview>(
        `/api/portfolios/${portfolioId}/import/parse`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => {
            if (e.total) {
              setUploadProgress(Math.round((e.loaded * 100) / e.total));
            }
          },
        },
      );
      setPreview(data);
    } catch {
      toast.error('Failed to parse file', 'Make sure this is a valid Moomoo PDF export.');
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview || !portfolioId) return;
    setConfirming(true);
    try {
      await api.post(`/api/portfolios/${portfolioId}/import/confirm`, {
        trades: preview.trades,
      });
      toast.success('Import complete', `${preview.parsed_count} trades imported successfully.`);
      setConfirmed(true);
    } catch {
      toast.error('Import failed', 'Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setConfirmed(false);
    setUploadProgress(0);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  }, [handleFileSelect]);

  const hasFx = preview?.trades.some((t) => t.currency !== currency);

  const tradeColumns = [
    { key: 'trade_date', label: 'Date', render: (v: unknown) => formatDate(String(v), 'medium') },
    {
      key: 'symbol',
      label: 'Symbol',
      render: (v: unknown) => <span className="font-semibold text-[var(--c-primary)]">{String(v)}</span>,
    },
    { key: 'security_name', label: 'Security', render: (v: unknown) => String(v || '—') },
    {
      key: 'trade_type',
      label: 'Type',
      render: (v: unknown) => (
        <Badge variant={v === 'buy' ? 'info' : v === 'sell' ? 'warning' : 'success'}>
          {String(v).toUpperCase()}
        </Badge>
      ),
    },
    { key: 'quantity', label: 'Qty', align: 'right' as const, render: (v: unknown) => Number(v).toLocaleString() },
    {
      key: 'price',
      label: 'Price',
      align: 'right' as const,
      render: (_v: unknown, row: ParsedTrade) => formatCurrency(row.price, row.currency),
    },
    {
      key: 'amount',
      label: 'Total',
      align: 'right' as const,
      render: (_v: unknown, row: ParsedTrade) => formatCurrency(row.amount + row.brokerage, row.currency),
    },
    // FX column — shown when PDF contains trades in a different currency
    ...(hasFx ? [{
      key: 'exchange_rate',
      label: `FX (→ ${currency})`,
      align: 'right' as const,
      render: (_v: unknown, row: ParsedTrade) =>
        row.currency !== currency
          ? <span className="text-[var(--c-warn)] font-medium">{row.exchange_rate.toFixed(4)}</span>
          : <span className="text-[var(--c-ink-mute)]">—</span>,
    }] : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)]">Import Trades</h1>
        <p className="text-[15px] text-[var(--c-ink-mute)] mt-1">
          Upload a Moomoo monthly PDF statement or annual XLSX summary to import your trades
        </p>
      </div>

      {/* Success state */}
      {confirmed && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 bg-[var(--c-bull-bg)] rounded-full flex items-center justify-center">
            <CheckCircle size={32} className="text-[var(--c-bull)]" />
          </div>
          <div className="text-center">
            <h2 className="text-[22px] font-semibold text-[var(--c-ink)]">Import Successful</h2>
            <p className="text-[15px] text-[var(--c-ink-mute)] mt-1">
              {preview?.parsed_count} trades have been imported to your portfolio.
            </p>
          </div>
          <Button variant="primary" onClick={handleReset}>Import Another File</Button>
        </div>
      )}

      {/* Upload area */}
      {!confirmed && (
        <>
          <Card>
            <div
              className={cn(
                'border-2 border-dashed rounded-2xl p-12 text-center transition-colors',
                dragging ? 'border-[var(--c-primary)] bg-[var(--c-primary-bg)]' : 'border-[var(--c-border)] hover:border-[var(--c-primary-border)]',
              )}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />

              {!file && !uploading && (
                <>
                  <div className="inline-flex items-center justify-center w-14 h-14 bg-[var(--c-primary-bg)] rounded-2xl mb-4">
                    <Upload size={24} className="text-[var(--c-primary)]" />
                  </div>
                  <h3 className="text-[19px] font-semibold text-[var(--c-ink)] mb-2">
                    Drop your file here
                  </h3>
                  <p className="text-[15px] text-[var(--c-ink-mute)] mb-1">
                    or click below to browse your files
                  </p>
                  <p className="text-[13px] text-[var(--c-ink-mute)] mb-5">
                    Supports Moomoo <strong>monthly PDF</strong> statements and <strong>annual XLSX</strong> summaries
                  </p>
                  <Button
                    variant="primary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose PDF or XLSX
                  </Button>
                </>
              )}

              {file && uploading && (
                <div className="space-y-4">
                  <div className="inline-flex items-center justify-center w-14 h-14 bg-[var(--c-primary-bg)] rounded-2xl">
                    <FileText size={24} className="text-[var(--c-primary)]" />
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--c-ink)]">{file.name}</p>
                    <p className="text-[13px] text-[var(--c-ink-mute)] mt-1">Parsing trades…</p>
                  </div>
                  <div className="w-full max-w-xs mx-auto bg-[var(--c-border)] rounded-full h-1.5">
                    <div
                      className="bg-[var(--c-primary)] h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-[13px] text-[var(--c-ink-mute)]">{uploadProgress}%</p>
                </div>
              )}

              {file && !uploading && !preview && (
                <div className="space-y-3">
                  <div className="inline-flex items-center justify-center w-14 h-14 bg-[var(--c-bear-bg)] rounded-2xl">
                    <AlertCircle size={24} className="text-[var(--c-bear)]" />
                  </div>
                  <p className="text-[15px] text-[var(--c-ink)]">Failed to parse. Try again.</p>
                  <Button variant="ghost" onClick={handleReset}>Try another file</Button>
                </div>
              )}
            </div>
          </Card>

          {/* Preview */}
          {preview && (
            <Card>
              <CardHeader
                title="Trade Preview"
                subtitle={`${preview.parsed_count} trades found in ${preview.filename}`}
                action={
                  <button
                    onClick={handleReset}
                    className="text-[var(--c-ink-mute)] hover:text-[var(--c-ink)] p-1 rounded-full"
                    aria-label="Remove"
                  >
                    <X size={18} />
                  </button>
                }
              />

              {preview.errors.length > 0 && (
                <div className="mb-4 bg-[var(--c-warn-bg)] border border-[var(--c-warn-border)] rounded-xl p-3">
                  <p className="text-[14px] font-semibold text-[var(--c-warn)] mb-2">Parsing Warnings</p>
                  <ul className="text-[13px] text-[var(--c-warn)] space-y-1">
                    {preview.errors.map((e, i) => <li key={i}>• {e}</li>)}
                  </ul>
                </div>
              )}

              <div className="overflow-x-auto">
                <Table<ParsedTrade>
                  columns={tradeColumns as Parameters<typeof Table<ParsedTrade>>[0]['columns']}
                  data={preview.trades}
                  emptyMessage="No trades to preview"
                />
              </div>

              {preview.parsed_count === 0 ? (
                <div className="mt-4 bg-[var(--c-canvas-soft)] border border-[var(--c-border)] rounded-xl p-4 text-[14px] text-[var(--c-ink-mute)]">
                  {preview.errors.some(e => e.includes('already imported'))
                    ? 'All trades in this file are already in your portfolio — nothing new to import.'
                    : 'No importable trades found in this file. If this is a month with no activity, this is expected.'}
                </div>
              ) : (
                <div className="mt-6 flex items-center justify-end gap-3">
                  <Button variant="ghost" onClick={handleReset}>Cancel</Button>
                  <Button
                    variant="primary"
                    onClick={handleConfirm}
                    loading={confirming}
                    icon={<CheckCircle size={18} />}
                  >
                    Confirm Import ({preview.parsed_count} trades)
                  </Button>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
