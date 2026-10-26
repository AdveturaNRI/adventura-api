import React, { useEffect, useRef } from 'react';
import { Box, FormGroup, FormMessage, Label, Text } from '@adminjs/design-system';

const TOOLS = [
  { command: 'bold', label: 'B', title: 'Жирный', style: { fontWeight: 800 } },
  { command: 'italic', label: 'I', title: 'Курсив', style: { fontStyle: 'italic', fontWeight: 700 } },
  { command: 'underline', label: 'U', title: 'Подчёркнутый', style: { textDecoration: 'underline' } },
  { command: 'strikeThrough', label: 'S', title: 'Зачёркнутый', style: { textDecoration: 'line-through' } },
  { command: 'formatBlock', argument: 'h2', label: 'H2', title: 'Заголовок' },
  { command: 'insertUnorderedList', label: '•', title: 'Список' },
  { command: 'insertOrderedList', label: '1.', title: 'Нумерованный список' },
  { command: 'formatBlock', argument: 'blockquote', label: '«»', title: 'Цитата' },
];

function looksLikeHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function toEditorHtml(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (looksLikeHtml(trimmed)) return trimmed;
  return trimmed
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function ToolButton({ title, label, style, onPress }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(event) => {
        event.preventDefault();
        onPress();
      }}
      style={{
        minWidth: 36,
        minHeight: 36,
        borderRadius: 10,
        border: '1px solid rgba(21, 122, 254, 0.28)',
        background: '#fff',
        color: '#157AFE',
        fontWeight: 800,
        fontSize: 14,
        cursor: 'pointer',
        ...style,
      }}
    >
      {label}
    </button>
  );
}

// AdminJS global reset zeroes out bold/italic/list markers; restore them inside the editor.
const editorCss = `
.partner-news-body { font-size: 15px; line-height: 1.55; color: #111827; }
.partner-news-body p { margin: 0 0 8px; }
.partner-news-body b, .partner-news-body strong { font-weight: 700; }
.partner-news-body i, .partner-news-body em { font-style: italic; }
.partner-news-body u { text-decoration: underline; }
.partner-news-body s, .partner-news-body strike { text-decoration: line-through; }
.partner-news-body h2 { margin: 8px 0; font-size: 22px; font-weight: 700; line-height: 1.3; }
.partner-news-body h3 { margin: 8px 0; font-size: 18px; font-weight: 700; }
.partner-news-body ul, .partner-news-body ol { margin: 0 0 8px; padding-left: 22px; }
.partner-news-body ul { list-style: disc outside; }
.partner-news-body ol { list-style: decimal outside; }
.partner-news-body li { display: list-item; margin-bottom: 4px; }
.partner-news-body blockquote {
  margin: 8px 0;
  padding-left: 12px;
  border-left: 3px solid #157AFE;
  color: #4b5563;
  font-style: italic;
}
.partner-news-body a { color: #157AFE; text-decoration: underline; }
`;

function BodyHtml({ html }) {
  return (
    <Box className="partner-news-body" padding="default" style={{ background: '#fff', borderRadius: 8 }}>
      <style>{editorCss}</style>
      <div dangerouslySetInnerHTML={{ __html: html || '<p></p>' }} />
    </Box>
  );
}

const PartnerPostBodyEditor = (props) => {
  const { property, record, onChange, where } = props;
  const editorRef = useRef(null);
  const value = record?.params?.[property.path] ?? '';
  const error = record?.errors?.[property.path];
  const html = toEditorHtml(value);
  const label = 'Текст';

  useEffect(() => {
    const node = editorRef.current;
    if (!node || document.activeElement === node) return;
    if (node.innerHTML !== html) node.innerHTML = html;
  }, [html]);

  if (where === 'show') {
    return (
      <FormGroup>
        <Label>{label}</Label>
        {html ? <BodyHtml html={html} /> : <Text color="grey60">Пусто</Text>}
      </FormGroup>
    );
  }

  if (where !== 'edit') return null;

  const emit = () => {
    onChange(property.path, editorRef.current?.innerHTML ?? '');
  };

  const run = (command, argument) => {
    const node = editorRef.current;
    node?.focus();
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand('defaultParagraphSeparator', false, 'p');
    document.execCommand(command, false, argument);
    emit();
  };

  const addLink = () => {
    const href = window.prompt('Ссылка', 'https://');
    if (href === null) return;
    const next = href.trim();
    if (!next) {
      run('unlink');
      return;
    }
    if (!/^https?:\/\//i.test(next)) {
      window.alert('Ссылка должна начинаться с https://');
      return;
    }
    run('createLink', next);
  };

  return (
    <FormGroup error={Boolean(error)}>
      <Label>{label}</Label>
      <div
        style={{
          border: '1px solid rgba(21, 122, 254, 0.28)',
          borderRadius: 12,
          overflow: 'hidden',
          background: '#fff',
        }}
      >
        <style>{editorCss}</style>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            padding: 8,
            background: 'rgba(21, 122, 254, 0.06)',
            borderBottom: '1px solid rgba(21, 122, 254, 0.16)',
          }}
        >
          {TOOLS.map((tool) => (
            <ToolButton
              key={`${tool.command}-${tool.label}`}
              title={tool.title}
              label={tool.label}
              style={tool.style}
              onPress={() => run(tool.command, tool.argument)}
            />
          ))}
          <ToolButton title="Ссылка" label="↗" onPress={addLink} />
        </div>
        <div
          ref={editorRef}
          className="partner-news-body"
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label={label || 'Текст'}
          onInput={emit}
          style={{ minHeight: 180, padding: 12, outline: 'none' }}
        />
      </div>
      {property.description ? (
        <Text variant="sm" color="grey60" marginTop="sm">
          {property.description}
        </Text>
      ) : null}
      {error?.message ? <FormMessage>{error.message}</FormMessage> : null}
    </FormGroup>
  );
};

export default PartnerPostBodyEditor;
