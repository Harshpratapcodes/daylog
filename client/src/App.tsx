import { useState } from 'react';
import { getToken } from './api';
import AuthScreen from './components/AuthScreen';
import MainApp from './MainApp';

export default function App() {
  const [authed, setAuthed] = useState(() => Boolean(getToken()));
  return authed
    ? <MainApp onLogout={() => setAuthed(false)} />
    : <AuthScreen onAuthed={() => setAuthed(true)} />;
}
