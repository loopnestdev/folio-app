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
    if (!selectedFile.name.endsWith('.pdf')) {
      toast.error('Invalid file type', 'Please upload a PDF file.');
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
        filename: preview.filename,
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

  const tradeColumns = [
    { key: 'trade_date', label: 'Date', render: (v: unknown) => formatDate(String(v), 'medium') },
    { key: 'symbol', label: 'Symbol', render: (v: unknown) => <span className="font-semibold text-[#0066cc]">{String(v)}</span> },
    { key: 'security_name', label: 'Security', render: (v: unknown) => String(v || '—') },
    {
      key: 'direction',
      label: 'Direction',
      render: (v: unknown) => (
        <Badge variant={v === 'BUY' ? 'success' : 'danger'}>{String(v)}</Badge>
      ),
    },
    { key: 'quantity', label: 'Qty', align: 'right' as const, render: (v: unknown) => Number(v).toLocaleString() },
    { key: 'price', label: 'Price', align: 'right' as const, render: (v: unknown) => formatCurrency(Number(v), currency) },
    { key: 'amount', label: 'Total', align: 'right' as const, render: (v: unknown) => formatCurrency(Number(v), currency) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight text-[#1d1d1f]">Import Trades</h1>
        <p className="text-[15px] text-[#7a7a7a] mt-1">Upload a Moomoo PDF export to import your trades</p>
      </div>

      {/* Success state */}
      {confirmed && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 bg-[#34c759]/10 rounded-full flex items-center justify-center">
            <CheckCircle size={32} className="text-[#34c759]" />
          </div>
          <div className="text-center">
            <h2 className="text-[22px] font-semibold text-[#1d1d1f]">Import Successful</h2>
            <p className="text-[15px] text-[#7a7a7a] mt-1">
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
                dragging ? 'border-[#0066cc] bg-[#f0f6ff]' : 'border-[#e0e0e0] hover:border-[#0066cc]/50',
              )}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />

              {!file && !uploading && (
                <>
                  <div className="inline-flex items-center justify-center w-14 h-14 bg-[#0066cc]/10 rounded-2xl mb-4">
                    <Upload size={24} className="text-[#0066cc]" />
                  </div>
                  <h3 className="text-[19px] font-semibold text-[#1d1d1f] mb-2">
                    Drop your PDF here
                  </h3>
                  <p className="text-[15px] text-[#7a7a7a] mb-5">
                    or click below to browse your files
                  </p>
                  <Button
                    variant="primary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose PDF File
                  </Button>
                </>
              )}

              {file && uploading && (
                <div className="space-y-4">
                  <div className="inline-flex items-center justify-center w-14 h-14 bg-[#0066cc]/10 rounded-2xl">
                    <FileText size={24} className="text-[#0066cc]" />
                  </div>
                  <div>
                    <p className="font-semibold text-[#1d1d1f]">{file.name}</p>
                    <p className="text-[13px] text-[#7a7a7a] mt-1">Parsing trades…</p>
                  </div>
                  <div className="w-full max-w-xs mx-auto bg-[#e0e0e0] rounded-full h-1.5">
                    <div
                      className="bg-[#0066cc] h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-[13px] text-[#7a7a7a]">{uploadProgress}%</p>
                </div>
              )}

              {file && !uploading && !preview && (
                <div className="space-y-3">
                  <div className="inline-flex items-center justify-center w-14 h-14 bg-[#ff3b30]/10 rounded-2xl">
                    <AlertCircle size={24} className="text-[#ff3b30]" />
                  </div>
                  <p className="text-[15px] text-[#1d1d1f]">Failed to parse. Try again.</p>
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
                    className="text-[#7a7a7a] hover:text-[#1d1d1f] p-1 rounded-full"
                    aria-label="Remove"
                  >
                    <X size={18} />
                  </button>
                }
              />

              {preview.errors.length > 0 && (
                <div className="mb-4 bg-[#ff9500]/10 border border-[#ff9500]/30 rounded-xl p-3">
                  <p className="text-[14px] font-semibold text-[#8a5200] mb-2">Parsing Warnings</p>
                  <ul className="text-[13px] text-[#8a5200] space-y-1">
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
            </Card>
          )}
        </>
      )}
    </div>
  );
}
