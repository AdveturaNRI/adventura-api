import React from 'react';
import { Box, Button, Input, Label, TextArea } from '@adminjs/design-system';

/** Shared visual array editor for columns, their items and footer link groups. */
export function MarketingNestedEditor({ value = [], onChange, kind }) {
  const fields = kind === 'columns' || kind === 'groups' ? ['title']
    : kind === 'items' ? ['title', 'description', 'icon', 'accentColor'] : ['label', 'url'];
  const labels = { title: 'Заголовок', description: 'Описание', icon: 'Иконка Ionicons', accentColor: 'Цвет (#RRGGBB)', label: 'Название ссылки', url: 'URL: /путь, https:// или mailto:' };
  const patch = (index, change) => onChange(value.map((row, i) => i === index ? { ...row, ...change } : row));
  return <Box mt="md">
    {value.map((row, index) => <Box key={row.id ?? index} p="md" mt="sm" variant="white" style={{ border: '1px solid #ddd', borderRadius: 8 }}>
      {fields.map(field => <Box key={field} mt="sm"><Label>{labels[field]}</Label>
        {field === 'description' ? <TextArea width={1} value={row[field] ?? ''} onChange={e => patch(index, { [field]: e.target.value })} />
          : <Input width={1} value={row[field] ?? ''} onChange={e => patch(index, { [field]: e.target.value })} />}
      </Box>)}
      {kind === 'columns' ? <MarketingNestedEditor kind="items" value={row.items ?? []} onChange={items => patch(index, { items })} /> : null}
      {kind === 'groups' ? <MarketingNestedEditor kind="links" value={row.links ?? []} onChange={links => patch(index, { links })} /> : null}
      <Button mt="sm" size="sm" disabled={index === 0} onClick={() => { const next = [...value]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next); }}>Выше</Button>
      <Button mt="sm" size="sm" variant="danger" onClick={() => onChange(value.filter((_, i) => i !== index))}>Удалить</Button>
    </Box>)}
    <Button mt="sm" size="sm" onClick={() => onChange([...value, { id: crypto.randomUUID() }])}>Добавить {kind === 'columns' ? 'колонку' : kind === 'groups' ? 'группу' : kind === 'items' ? 'пункт' : 'ссылку'}</Button>
  </Box>;
}
