/** The nightly ritual screen — two panes: command bar + entries | day spine. */
import { useEffect, useMemo, useState } from 'react';
import { api, type Category } from '../api';
import { splitOvernight } from '@shared/timeParser';
import {
  useDraft, overlapError, localId, storeCarry, type DraftEntry,
} from '../hooks/useDraft';
import { toEntries, addDays, fmtH, isoDate, type ServerDay } from '../lib/serverDay';
import { markSessionStart, endSession, fmtSec } from '../lib/sessions';
import CommandBar, { type CommitPayload } from './CommandBar';
import FormBar from './FormBar';
import EntryList from './EntryList';
import Timeline from './Timeline';

export default function LogScreen({ date, categories }: { date: string; categories: Category[] }) {
  const draft = useDraft(date);
  // Archived (deleted) categories still color existing entries, but are never offered for new ones.
  const activeCats = useMemo(() => categories.filter(c => !c.archived), [categories]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'draft' | 'finalized'>('draft');
  const [message, setMessage] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [logMode, setLogMode] = useState<'keyboard' | 'form'>('keyboard');

  // Load server-side state for this date (status + note; hydrate entries if local draft empty).
  useEffect(() => {
    setStatus('draft'); setNote(''); setSelectedId(null); setEditingId(null); setMessage(null);
    api<ServerDay>(`/days/${date}`)
      .then(day => {
        setStatus(day.status);
        setNote(day.reflection_note ?? '');
        if (draft.entries.length === 0 && day.activities.length > 0) {
          draft.setEntries(toEntries(day));
        }
      })
      .catch(() => { /* no log yet for this date — fine */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const stats = useMemo(() => {
    const tops = draft.entries.filter(e => e.parentId === null);
    const logged = tops.reduce((a, e) => a + (e.endMin - e.startMin), 0);
    return { logged, unaccounted: 1440 - logged };
  }, [draft.entries]);

  const allCategorized = draft.entries.every(e => e.categoryId !== null);

  /** Commit a parsed command-bar line into the draft. Returns error string or null. */
  const handleCommit = ({ parsed, raw, categoryId }: CommitPayload): string | null => {
    const parentId = parsed.nest ? draft.lastTopLevel?.id ?? null : null;
    if (parsed.nest && !parentId) return 'Nothing to nest under yet — log a top-level activity first';

    let segments: Array<{ startMin: number; endMin: number }>;
    if (parsed.overnight) {
      if (parsed.nest) return 'Overnight ranges can only be top-level activities';
      const [today, tomorrow] = splitOvernight(parsed);
      segments = [today];
      storeCarry(addDays(date, 1), {
        raw, parentId: null, name: parsed.name,
        startMin: tomorrow.startMin, endMin: tomorrow.endMin,
        categoryId, categoryTag: parsed.categoryTag,
      });
    } else {
      segments = [{ startMin: parsed.startMin, endMin: parsed.endMin }];
    }

    const siblings = draft.entries.filter(e => e.parentId === parentId);
    for (const seg of segments) {
      const clash = overlapError(seg, siblings, editingId);
      if (clash) return `Overlaps "${clash.name}" — adjust the times`;
    }

    const entry: DraftEntry = {
      id: editingId ?? localId(), raw, parentId,
      name: parsed.name, startMin: segments[0].startMin, endMin: segments[0].endMin,
      categoryId, categoryTag: parsed.categoryTag,
    };
    markSessionStart(date);
    if (editingId) { draft.replace(editingId, entry); setEditingId(null); }
    else draft.add(entry);
    setMessage(parsed.overnight ? { text: 'Split at midnight — the rest carries to tomorrow' } : null);
    return null;
  };

  const handleBarEmptyKey = (key: string, e: React.KeyboardEvent) => {
    const tops = draft.entries.filter(x => x.parentId === null);
    const ordered = tops.flatMap(t => [t, ...draft.entries.filter(x => x.parentId === t.id)]);
    if (ordered.length === 0) return;
    const idx = ordered.findIndex(x => x.id === selectedId);
    if (key === 'ArrowUp') { e.preventDefault(); setSelectedId(ordered[idx <= 0 ? ordered.length - 1 : idx - 1].id); }
    if (key === 'ArrowDown') { e.preventDefault(); setSelectedId(ordered[(idx + 1) % ordered.length].id); }
    if ((key === 'Delete' || key === 'Backspace') && selectedId) {
      e.preventDefault();
      const hasChildren = draft.entries.some(x => x.parentId === selectedId);
      if (!hasChildren || window.confirm('This activity has sub-activities — delete them too?')) {
        draft.remove(selectedId);
        setSelectedId(null);
      }
    }
    if ((key === 'e' || key === 'E') && selectedId) { e.preventDefault(); setEditingId(selectedId); }
  };

  const cycleCategory = (id: string) => {
    const entry = draft.entries.find(x => x.id === id);
    if (!entry || activeCats.length === 0) return;
    const idx = activeCats.findIndex(c => c.id === entry.categoryId);
    draft.setCategory(id, activeCats[(idx + 1) % activeCats.length].id);
  };

  const duplicateYesterday = async () => {
    try {
      const day = await api<ServerDay>(`/days/${addDays(date, -1)}`);
      const tops = toEntries(day).filter(e => e.parentId === null);
      if (tops.length) { draft.setEntries(tops); setMessage({ text: "Copied yesterday's top-level structure" }); }
      else setMessage({ text: 'Yesterday has no log to copy', err: true });
    } catch { setMessage({ text: 'Yesterday has no log to copy', err: true }); }
  };

  /** Finalize: replace the server day with the draft in one batch, then mark finalized. */
  const finalize = async () => {
    setBusy(true); setMessage(null);
    try {
      const existing = await api<ServerDay>(`/days/${date}`).catch(() => null);
      if (existing) await api(`/days/${existing.id}`, { method: 'DELETE' });
      const day = await api<ServerDay>('/days', { method: 'POST', body: JSON.stringify({ log_date: date }) });

      const ordered = draft.entries.filter(e => e.parentId === null)
        .flatMap(t => [t, ...draft.entries.filter(e => e.parentId === t.id)]);
      const indexOf = new Map(ordered.map((e, i) => [e.id, i]));
      if (ordered.length) {
        await api(`/days/${day.id}/activities/batch`, {
          method: 'POST',
          body: JSON.stringify({
            items: ordered.map(e => ({
              name: e.name, category_id: e.categoryId,
              start_min: e.startMin, end_min: e.endMin,
              client_parent_index: e.parentId !== null ? indexOf.get(e.parentId) : null,
            })),
          }),
        });
      }
      await api(`/days/${day.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'finalized', reflection_note: note || null }),
      });
      setStatus('finalized');
      const sec = endSession(date);
      setMessage({ text: `Day finalized — ${fmtH(stats.logged)} logged${sec !== null ? ` · session ${fmtSec(sec)}` : ''}` });
    } catch (e: any) {
      setMessage({ text: e.message, err: true });
    } finally {
      setBusy(false);
    }
  };

  const reopen = async () => {
    const day = await api<ServerDay>(`/days/${date}`);
    await api(`/days/${day.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'draft' }) });
    setStatus('draft');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && status === 'draft' && allCategorized && draft.entries.length) {
        e.preventDefault(); finalize();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault(); duplicateYesterday();
      }
      if (logMode === 'form') {
        const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement as Element)?.tagName ?? '');
        if (!inField && selectedId) {
          if (e.key === 'e' || e.key === 'E') { e.preventDefault(); setEditingId(selectedId); }
          if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            const hasChildren = draft.entries.some(x => x.parentId === selectedId);
            if (!hasChildren || window.confirm('This activity has sub-activities — delete them too?')) {
              draft.remove(selectedId); setSelectedId(null);
            }
          }
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, allCategorized, draft.entries, note, date, logMode, selectedId]);

  const switchMode = (mode: 'keyboard' | 'form') => {
    setLogMode(mode);
    setEditingId(null);
  };

  const editingEntry = editingId ? draft.entries.find(e => e.id === editingId) : null;

  return (
    <>
      <div className="subbar">
        <span className={`status-pill ${status}`}>{status}</span>
        <div className="stats">
          <span>logged <b>{fmtH(stats.logged)}</b></span>
          <span>unaccounted <b>{fmtH(stats.unaccounted)}</b></span>
        </div>
        <div className="mode-toggle">
          <button
            className={`tab${logMode === 'keyboard' ? ' active' : ''}`}
            onClick={() => switchMode('keyboard')}
            title="Log with keyboard commands"
          >Keyboard</button>
          <button
            className={`tab${logMode === 'form' ? ' active' : ''}`}
            onClick={() => switchMode('form')}
            title="Log with a form"
          >Form</button>
        </div>
      </div>
      <div className="panes">
        <section className="pane-left">
          {logMode === 'keyboard' ? (
            <CommandBar
              categories={activeCats}
              lastTopLevel={draft.lastTopLevel}
              editingRaw={editingEntry?.raw ?? null}
              disabled={status === 'finalized'}
              onCommit={handleCommit}
              onCancelEdit={() => setEditingId(null)}
              onBarEmptyKey={handleBarEmptyKey}
            />
          ) : (
            <FormBar
              categories={activeCats}
              lastTopLevel={draft.lastTopLevel}
              editingEntry={editingEntry ?? null}
              disabled={status === 'finalized'}
              onCommit={handleCommit}
              onCancelEdit={() => setEditingId(null)}
            />
          )}
          <EntryList
            entries={draft.entries}
            categories={categories}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onCycleCategory={cycleCategory}
            keyboardMode={logMode === 'keyboard'}
            onEdit={logMode === 'form' ? setEditingId : undefined}
          />
          <div className="left-foot">
            <textarea
              placeholder="Reflection — one honest sentence about today (optional)"
              value={note} onChange={e => setNote(e.target.value)}
              disabled={status === 'finalized'}
            />
            <div className="foot-actions">
              <span className={`msg${message?.err ? ' err' : ''}`}>
                {message?.text ?? (!allCategorized && draft.entries.length ? 'Set the amber categories to finalize' : '')}
              </span>
              <span className="spacer" />
              {status === 'draft' ? (
                <button className="primary" disabled={busy || !draft.entries.length || !allCategorized} onClick={finalize}>
                  Finalize day
                </button>
              ) : (
                <button onClick={reopen}>Reopen day</button>
              )}
            </div>
          </div>
        </section>
        <section className="pane-right">
          <Timeline
            entries={draft.entries}
            categories={categories}
            selectedId={selectedId}
            onSelect={setSelectedId}
            today={date === isoDate(new Date())}
          />
        </section>
      </div>
    </>
  );
}
