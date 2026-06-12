/** Settings — §7.4: categories, export, and the dogfood scoreboard. */
import { useEffect, useRef, useState } from 'react';
import { api, getToken, type Category } from '../api';
import { getSessions, medianSeconds, fmtSec } from '../lib/sessions';
import { nextColor } from '../lib/palette';

export default function Settings({ categories, onCategoriesChanged }: {
  categories: Category[]; onCategoriesChanged: () => void;
}) {
  const [rows, setRows] = useState<Category[]>(categories.filter(c => !c.archived));
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(() => nextColor(categories.map(c => c.color)));
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);

  const archived = categories.filter(c => c.archived);

  useEffect(() => {
    setRows(categories.filter(c => !c.archived));
    // Suggest a palette color no existing category (archived included) is using.
    setNewColor(nextColor(categories.map(c => c.color)));
  }, [categories]);

  // Color pickers fire change per drag step — hold the save until the value settles.
  const colorTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  /** Autosave a row if it differs from the server's copy. */
  const commit = async (c: Category) => {
    const orig = categories.find(x => x.id === c.id);
    if (!orig || (orig.name === c.name.trim() && orig.color === c.color)) return;
    if (!c.name.trim()) {
      setRows(r => r.map(x => x.id === c.id ? { ...x, name: orig.name } : x));
      setMsg({ text: 'Category name can’t be empty', err: true });
      return;
    }
    try {
      await api(`/categories/${c.id}`, { method: 'PATCH', body: JSON.stringify({ name: c.name.trim(), color: c.color }) });
      setMsg({ text: `Saved "${c.name.trim()}"` });
      onCategoriesChanged();
    } catch (e: any) { setMsg({ text: e.message, err: true }); }
  };

  const add = async () => {
    if (!newName.trim()) return;
    try {
      await api('/categories', { method: 'POST', body: JSON.stringify({ name: newName.trim(), color: newColor }) });
      setNewName('');
      setMsg({ text: `Added "${newName.trim()}"` });
      onCategoriesChanged();
    } catch (e: any) { setMsg({ text: e.message, err: true }); }
  };

  const remove = async (c: Category) => {
    if (!window.confirm(`Delete category "${c.name}"? Days that already use it keep it — it just won't be offered for new entries.`)) return;
    try {
      const r = await api<{ deleted: boolean; archived: boolean }>(`/categories/${c.id}`, { method: 'DELETE' });
      setMsg({ text: r.archived ? `Deleted "${c.name}" — past days that used it keep it` : `Deleted "${c.name}"` });
      onCategoriesChanged();
    } catch (e: any) { setMsg({ text: e.message, err: true }); }
  };

  const restore = async (c: Category) => {
    try {
      await api(`/categories/${c.id}`, { method: 'PATCH', body: JSON.stringify({ archived: false }) });
      setMsg({ text: `Restored "${c.name}"` });
      onCategoriesChanged();
    } catch (e: any) { setMsg({ text: e.message, err: true }); }
  };

  const exportData = async () => {
    const res = await fetch('/api/v1/export', { headers: { authorization: `Bearer ${getToken()}` } });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `daylog-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const sessions = getSessions();
  const median = medianSeconds();
  const target = 7 * 60;

  return (
    <div className="settings-wrap">
      <h2 className="section-h">The 14-night dogfood</h2>
      <div className="tiles" style={{ maxWidth: 560 }}>
        <div className="tile">
          <div className="tile-num mono">{sessions.length}<span className="tile-of"> / 14</span></div>
          <div className="tile-label">nights logged</div>
        </div>
        <div className="tile">
          <div className="tile-num mono" style={{ color: median !== null && median > target ? 'var(--amber)' : undefined }}>
            {median !== null ? fmtSec(median) : '—'}
          </div>
          <div className="tile-label">median session (target &lt; 7m)</div>
        </div>
        <div className="tile">
          <div className="tile-num mono">{sessions.length ? fmtSec(sessions[sessions.length - 1].seconds) : '—'}</div>
          <div className="tile-label">last session</div>
        </div>
      </div>
      {sessions.length > 0 && (
        <div className="session-strip">
          {sessions.slice(-14).map(s => (
            <span key={s.date} className={`session-chip mono${s.seconds > target ? ' over' : ''}`}
              title={`${s.date}: ${fmtSec(s.seconds)}`}>
              {s.date.slice(8)}·{Math.round(s.seconds / 60)}m
            </span>
          ))}
        </div>
      )}

      <h3 className="section-h sub">Categories</h3>
      <div className="cat-rows">
        {rows.map((c, i) => (
          <div key={c.id} className="cat-row">
            <input type="color" value={c.color} aria-label={`${c.name} color`}
              onChange={e => {
                const next = { ...rows[i], color: e.target.value };
                setRows(r => r.map((x, j) => j === i ? next : x));
                clearTimeout(colorTimers.current[c.id]);
                colorTimers.current[c.id] = setTimeout(() => commit(next), 600);
              }}
              onBlur={() => { clearTimeout(colorTimers.current[c.id]); commit(rows[i]); }} />
            <input className="cat-name" value={c.name} aria-label="Category name"
              onChange={e => setRows(r => r.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
              onBlur={() => commit(rows[i])}
              onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} />
            <button className="ghost" onClick={() => remove(c)}>delete</button>
          </div>
        ))}
        <div className="cat-row">
          <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} aria-label="New category color" />
          <input className="cat-name" placeholder="new category" value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()} />
          <button onClick={add}>add</button>
        </div>
      </div>
      <div className={`msg${msg?.err ? ' err' : ''}`} style={{ minHeight: 20, fontSize: 13, color: msg?.err ? 'var(--danger)' : 'var(--text-dim)' }}>
        {msg?.text ?? ''}
      </div>

      {archived.length > 0 && (
        <>
          <h3 className="section-h sub">Deleted categories</h3>
          <p className="settings-note">
            These were deleted but still appear on the days that used them. Restore one to log with it again.
          </p>
          <div className="cat-rows">
            {archived.map(c => (
              <div key={c.id} className="cat-row archived">
                <span className="dot" style={{ width: 12, height: 12, borderRadius: 99, background: c.color, opacity: 0.6 }} />
                <span className="cat-name archived-name">{c.name}</span>
                <button className="ghost" onClick={() => restore(c)}>restore</button>
              </div>
            ))}
          </div>
        </>
      )}

      <h3 className="section-h sub">Your data</h3>
      <p className="settings-note">
        Everything Daylog knows lives in your database and leaves only when you take it.
      </p>
      <button onClick={exportData}>Export everything as JSON</button>
    </div>
  );
}
