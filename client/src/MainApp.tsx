/** Shell after auth: shared topbar (brand · tabs · date · logout), one date across views. */
import { useEffect, useState } from 'react';
import { fetchCategories, setToken, type Category } from './api';
import { isoDate, addDays } from './lib/serverDay';
import LogScreen from './components/LogScreen';
import DayReview from './components/DayReview';
import WeekView from './components/WeekView';
import Settings from './components/Settings';

type View = 'log' | 'review' | 'week' | 'settings';

export default function MainApp({ onLogout }: { onLogout: () => void }) {
  const [view, setView] = useState<View>('log');
  const [date, setDate] = useState(isoDate(new Date()));
  const [categories, setCategories] = useState<Category[]>([]);

  const loadCategories = () =>
    fetchCategories()
      .then(r => setCategories(r.categories))
      .catch(() => { setToken(null); onLogout(); });

  useEffect(() => { loadCategories(); }, [onLogout]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">daylog</span>
        <nav className="tabs" aria-label="Views">
          {(['log', 'review', 'week', 'settings'] as View[]).map(v => (
            <button key={v} className={`tab${view === v ? ' active' : ''}`} onClick={() => setView(v)}>
              {v === 'log' ? 'Tonight' : v === 'review' ? 'Review' : v === 'week' ? 'Week' : 'Settings'}
            </button>
          ))}
        </nav>
        <div className="date-nav">
          <button className="ghost" onClick={() => setDate(d => addDays(d, view === 'week' ? -7 : -1))} aria-label="Earlier">←</button>
          <span className="date">{view === 'week' ? `${addDays(date, -6)} → ${date}` : date}</span>
          <button className="ghost" onClick={() => setDate(d => addDays(d, view === 'week' ? 7 : 1))} aria-label="Later">→</button>
          {date !== isoDate(new Date()) && (
            <button className="ghost" onClick={() => setDate(isoDate(new Date()))}>today</button>
          )}
        </div>
        <span style={{ flex: 1 }} />
        <button className="ghost" onClick={() => { setToken(null); onLogout(); }}>log out</button>
      </header>

      {view === 'log' && <LogScreen date={date} categories={categories} />}
      {view === 'review' && <DayReview date={date} categories={categories} />}
      {view === 'week' && (
        <WeekView endDate={date} categories={categories}
          onOpenDay={(d) => { setDate(d); setView('review'); }} />
      )}
      {view === 'settings' && <Settings categories={categories} onCategoriesChanged={loadCategories} />}
    </div>
  );
}
