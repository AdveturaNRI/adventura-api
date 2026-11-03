import React, { useEffect, useState } from 'react';
import { ApiClient } from 'adminjs';
import { Box, Button, Header, Input, Label, MessageBox, Text } from '@adminjs/design-system';

const api = new ApiClient();
const pageName = 'desktopUpdates';

async function request(fields) {
  const data = fields && new FormData();
  if (data) Object.entries(fields).forEach(([key, value]) => data.append(key, value));
  const response = await api.getPage({ pageName, ...(data ? { method: 'post', data } : {}) });
  const result = response.data ?? response;
  if (result.error || result.forbidden) throw new Error(result.error || 'Нет доступа');
  return result;
}

export default function DesktopUpdatesAdmin() {
  const [state, setState] = useState({ releases: [], policies: {} });
  const [platform, setPlatform] = useState('win32');
  const [file, setFile] = useState(null);
  const [current, setCurrent] = useState('');
  const [minimum, setMinimum] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState('');
  const load = async () => setState(await request());
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    setCurrent(state.policies?.[platform]?.current || '');
    setMinimum(state.policies?.[platform]?.minimum || '');
  }, [platform, state]);
  const run = async (fn) => {
    setBusy(true); setError(''); setMessage('');
    try { await fn(); await load(); setMessage('Сохранено'); }
    catch (e) { setError(e.message || 'Ошибка'); }
    finally { setBusy(false); }
  };
  const upload = () => run(async () => {
    if (!file) throw new Error('Выберите установщик');
    const pattern = platform === 'win32' ? /^Adventura-Setup-(\d+\.\d+\.\d+)\.exe$/ : /^Adventura-(\d+\.\d+\.\d+)\.AppImage$/;
    const match = pattern.exec(file.name);
    if (!match) throw new Error('Имя файла должно соответствовать выбранной платформе и версии X.Y.Z');
    if (file.size > 1024 * 1024 * 1024) throw new Error('Максимальный размер файла — 1 ГБ');
    const { upload: target } = await request({ action: 'multipart-start', platform, version: match[1], file: file.name, size: String(file.size) });
    try {
      const total = Math.ceil(file.size / target.partSize);
      for (let part = 1; part <= total; part++) {
        const params = new URLSearchParams({ action: 'part', id: target.id, part: String(part) });
        const chunk = file.slice((part - 1) * target.partSize, part * target.partSize);
        let result;
        try { result = await fetch(`/admin/desktop-release-upload?${params}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: chunk, credentials: 'same-origin' }); }
        catch { throw new Error(`Не удалось передать часть ${part} из ${total}. Проверьте соединение.`); }
        if (!result.ok) {
          const details = await result.json().catch(() => ({}));
          throw new Error(details.error || `Ошибка загрузки части ${part}: HTTP ${result.status}`);
        }
        setProgress(`Загружено ${Math.round(part / total * 100)}% · часть ${part} из ${total}`);
      }
    } catch (error) {
      setProgress('');
      await request({ action: 'multipart-abort', id: target.id }).catch(() => undefined);
      throw error;
    }
    setProgress('Проверяем целостность файла…');
    try { await request({ action: 'multipart-finish', id: target.id }); }
    finally { setProgress(''); }
    setFile(null);
  });
  const deleteRelease = (release) => {
    if (!window.confirm(`Удалить версию ${release.version} и её установщик? Откат на неё станет недоступен.`)) return;
    void run(async () => {
      const result = await request({ action: 'delete', platform, version: release.version });
      if (!result.deletion?.storageDeleted) { await load(); throw new Error(result.deletion?.restored ? 'Не удалось удалить файл из хранилища. Версия сохранена, попробуйте ещё раз.' : 'Версия удалена из списка, но не удалось удалить файл из хранилища. Обратитесь к администратору.'); }
    });
  };
  return <Box variant="grey" p="xl">
    <Header>Версии десктопного приложения</Header>
    <Text>Загрузка сохраняет выпуск, но не делает его текущим. Для отката выберите ранее загруженную версию и сохраните политику.</Text>
    {error && <MessageBox message={error} variant="danger" />}
    {message && <MessageBox message={message} variant="success" />}
    {progress && <Text>{progress}</Text>}
    <Box mt="lg"><Label>Платформа</Label><select value={platform} onChange={(e) => setPlatform(e.target.value)}><option value="win32">Windows</option><option value="linux">Linux AppImage</option></select></Box>
    <Box mt="lg"><Label>Установщик (до 1 ГБ)</Label><input type="file" accept={platform === 'win32' ? '.exe' : '.AppImage'} onChange={(e) => setFile(e.target.files?.[0] || null)} /><Button disabled={busy || !file} onClick={upload}>Загрузить версию</Button></Box>
    <Box mt="xl"><Label>Текущая версия</Label><select value={current} onChange={(e) => setCurrent(e.target.value)}><option value="">Выберите выпуск</option>{state.releases.filter((r) => r.platform === platform).map((r) => <option key={r.version} value={r.version}>{r.version}</option>)}</select></Box>
    <Box mt="lg"><Label>Минимально допустимая версия</Label><Input value={minimum} placeholder="Например, 0.6.0" onChange={(e) => setMinimum(e.target.value)} /></Box>
    <Box mt="lg"><Button disabled={busy || !current || !minimum} onClick={() => run(() => request({ action: 'policy', platform, current, minimum }))}>Сохранить политику</Button></Box>
    <Box mt="xl"><Header as="h3">Загруженные версии</Header>{state.releases.filter((r) => r.platform === platform).map((r) => <Box key={r.version} display="flex" alignItems="center" style={{ gap: 12, marginBottom: 8 }}><Text>{r.version} — {r.file} ({Math.ceil(r.size / 1048576)} МБ){state.policies?.[platform]?.current === r.version ? ' · текущая' : ''}</Text><Button disabled={busy || state.policies?.[platform]?.current === r.version} onClick={() => deleteRelease(r)}>Удалить</Button></Box>)}</Box>
  </Box>;
}
