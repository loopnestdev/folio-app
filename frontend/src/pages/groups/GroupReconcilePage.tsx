import { useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Upload, FileSpreadsheet, CheckCircle, AlertTriangle, X } from 'lucide-react';
import { useGroups } from '../../hooks/useGroups';
import { reconcileGroup } from '../../hooks/useGroupReports';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { formatDate, cn } from '../../lib/utils';
import type { GroupReconcileResult, PortfolioReconcileResult, ReconcileEntry, ReconcileDateShift, ReconcileAggregatedMatch } from '../../types';

function EntryTable({ title, entries, tone }: { title: string; entries: ReconcileEntry[]; tone: 'warn' | 'bear' }) {
  if (!entries.length) return null;
  const color = tone === 'warn' ? 'var(--c-warn)' : 'var(--c-bear)';
  return (
    <div className="mt-3">
      <p className="text-[13px] font-semibold mb-1.5" style={{ color }}>{title} ({entries.length})</p>
      <div className="overflow-x-auto rounded-xl border border-[var(--c-border)]">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[var(--c-canvas-soft)] text-[var(--c-ink-mute)]">
              <th className="text-left px-3 py-2 font-medium">Date</th>
              <th className="text-left px-3 py-2 font-medium">Type</th>
              <th className="text-left px-3 py-2 font-medium">Symbol</th>
              <th className="text-right px-3 py-2 font-medium">Qty</th>
              <th className="text-right px-3 py-2 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i} className="border-t border-[var(--c-border)]">
                <td className="px-3 py-2 text-[var(--c-ink)]">{formatDate(e.date, 'medium')}</td>
                <td className="px-3 py-2 text-[var(--c-ink)] uppercase">{e.type}</td>
                <td className="px-3 py-2 font-semibold text-[var(--c-primary)]">{e.symbol}</td>
                <td className="px-3 py-2 text-right text-[var(--c-ink)] tnum">{e.qty.toLocaleString()}</td>
                <td className="px-3 py-2 text-right text-[var(--c-ink)] tnum">{e.amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DateShiftTable({ shifts }: { shifts: ReconcileDateShift[] }) {
  if (!shifts.length) return null;
  return (
    <details className="mt-3">
      <summary className="text-[13px] font-medium text-[var(--c-ink-mute)] cursor-pointer select-none">
        {shifts.length} matched with a date difference (informational — not a discrepancy)
      </summary>
      <div className="overflow-x-auto rounded-xl border border-[var(--c-border)] mt-2">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[var(--c-canvas-soft)] text-[var(--c-ink-mute)]">
              <th className="text-left px-3 py-2 font-medium">Symbol</th>
              <th className="text-left px-3 py-2 font-medium">Database Date</th>
              <th className="text-left px-3 py-2 font-medium">Moomoo File Date</th>
              <th className="text-right px-3 py-2 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((s, i) => (
              <tr key={i} className="border-t border-[var(--c-border)]">
                <td className="px-3 py-2 font-semibold text-[var(--c-primary)]">{s.symbol}</td>
                <td className="px-3 py-2 text-[var(--c-ink)]">{formatDate(s.database_date, 'medium')}</td>
                <td className="px-3 py-2 text-[var(--c-ink)]">{formatDate(s.moomoo_date, 'medium')}</td>
                <td className="px-3 py-2 text-right text-[var(--c-ink)] tnum">{s.amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function AggregatedMatchTable({ matches }: { matches: ReconcileAggregatedMatch[] }) {
  if (!matches.length) return null;
  return (
    <details className="mt-3">
      <summary className="text-[13px] font-medium text-[var(--c-ink-mute)] cursor-pointer select-none">
        {matches.length} matched as a consolidated order (informational — not a discrepancy)
      </summary>
      <div className="mt-2 space-y-3">
        {matches.map((m, i) => (
          <div key={i} className="rounded-xl border border-[var(--c-border)] p-3 text-[13px]">
            <p className="text-[var(--c-ink)]">
              <span className="font-semibold text-[var(--c-primary)]">{m.symbol}</span>
              {' '}{m.type.toUpperCase()} — {m.total_qty.toLocaleString()} shares, {m.total_amount.toFixed(2)} total
            </p>
            <p className="text-[var(--c-ink-mute)] mt-1">
              Database: {m.database_entries.length} row{m.database_entries.length !== 1 ? 's' : ''}
              {' '}({m.database_entries.map((e) => `${formatDate(e.date, 'short')}: ${e.qty}`).join(', ')})
              {' · '}Moomoo file: {m.moomoo_entries.length} fill{m.moomoo_entries.length !== 1 ? 's' : ''}
              {' '}({m.moomoo_entries.map((e) => `${formatDate(e.date, 'short')}: ${e.qty}`).join(', ')})
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}

function PortfolioResultCard({ result }: { result: PortfolioReconcileResult }) {
  const aggregatedMooCount = result.aggregated_matches.reduce((s, m) => s + m.moomoo_entries.length, 0);
  const totalMatched = result.matched_count + aggregatedMooCount;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[16px] font-semibold text-[var(--c-ink)]">{result.portfolio_name}</p>
          <p className="text-[13px] text-[var(--c-ink-mute)] mt-0.5">
            {result.portfolio_currency}
            {result.window_start && result.window_end && (
              <> · {formatDate(result.window_start, 'medium')} – {formatDate(result.window_end, 'medium')}</>
            )}
            {' · '}{totalMatched} of {result.moomoo_entry_count} matched
            {aggregatedMooCount > 0 && ` (${aggregatedMooCount} as consolidated orders)`}
          </p>
        </div>
        {result.is_clean ? (
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--c-bull)]">
            <CheckCircle size={16} /> All clear
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--c-bear)]">
            <AlertTriangle size={16} />
            {result.missing_from_database.length + result.unexpected_in_database.length} discrepancies
          </span>
        )}
      </div>

      <EntryTable
        title="In Moomoo's file but not found in your database"
        entries={result.missing_from_database}
        tone="bear"
      />
      <EntryTable
        title="In your database but not found in Moomoo's file"
        entries={result.unexpected_in_database}
        tone="warn"
      />
      <AggregatedMatchTable matches={result.aggregated_matches} />
      <DateShiftTable shifts={result.date_shifted} />
    </Card>
  );
}

export function GroupReconcilePage() {
  const { id } = useParams<{ id: string }>();
  const { data: groups = [] } = useGroups();
  const group = groups.find((g) => g.id === id);
  const toast = useToast();

  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<GroupReconcileResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!id) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      toast.error('Invalid file type', 'Please upload the Moomoo annual .xlsx summary (not the PDF).');
      return;
    }
    setUploading(true);
    setResult(null);
    try {
      const data = await reconcileGroup(id, file);
      setResult(data);
    } catch {
      toast.error('Reconcile failed', 'Could not parse or compare the uploaded file. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [id]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/groups/${id}`}
          className="flex items-center gap-1 text-[13px] text-[var(--c-ink-mute)] hover:text-[var(--c-ink)] mb-2">
          <ArrowLeft size={13} /> {group?.name ?? 'Group'}
        </Link>
        <h1 className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)]">Reconcile Against Moomoo</h1>
        <p className="text-[15px] text-[var(--c-ink-mute)] mt-1">
          Upload Moomoo's annual "Financial Year Summary" .xlsx export to check it against what's actually saved — nothing is imported or changed.
        </p>
      </div>

      <Card>
        <div
          className={cn(
            'border-2 border-dashed rounded-2xl p-10 text-center transition-colors',
            dragging ? 'border-[var(--c-primary)] bg-[var(--c-primary-bg)]' : 'border-[var(--c-border)] hover:border-[var(--c-primary-border)]',
          )}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />

          {!uploading && (
            <>
              <div className="inline-flex items-center justify-center w-14 h-14 bg-[var(--c-primary-bg)] rounded-2xl mb-4">
                <Upload size={24} className="text-[var(--c-primary)]" />
              </div>
              <h3 className="text-[19px] font-semibold text-[var(--c-ink)] mb-2">Drop the annual .xlsx here</h3>
              <p className="text-[13px] text-[var(--c-ink-mute)] mb-5">
                Moomoo → Account → Statements → Financial Year Summary → Export as XLSX
              </p>
              <Button variant="primary" onClick={() => fileInputRef.current?.click()}>
                Choose XLSX File
              </Button>
            </>
          )}

          {uploading && (
            <div className="space-y-4">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-[var(--c-primary-bg)] rounded-2xl">
                <FileSpreadsheet size={24} className="text-[var(--c-primary)] animate-pulse" />
              </div>
              <p className="text-[15px] text-[var(--c-ink)]">Parsing and comparing against your database…</p>
            </div>
          )}
        </div>
      </Card>

      {result && (
        <>
          <Card>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {result.is_clean ? (
                  <CheckCircle size={28} className="text-[var(--c-bull)]" />
                ) : (
                  <AlertTriangle size={28} className="text-[var(--c-bear)]" />
                )}
                <div>
                  <p className="text-[17px] font-semibold text-[var(--c-ink)]">
                    {result.is_clean ? 'Everything reconciles' : 'Discrepancies found'}
                  </p>
                  <p className="text-[13px] text-[var(--c-ink-mute)]">{result.filename}</p>
                </div>
              </div>
              <button
                onClick={() => setResult(null)}
                className="text-[var(--c-ink-mute)] hover:text-[var(--c-ink)] p-1 rounded-full"
                aria-label="Dismiss"
              >
                <X size={18} />
              </button>
            </div>
          </Card>

          {result.portfolios.map((p) => (
            <PortfolioResultCard key={p.portfolio_id} result={p} />
          ))}
        </>
      )}
    </div>
  );
}
