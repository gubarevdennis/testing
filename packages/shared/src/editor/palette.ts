/**
 * Text and highlight colours. Stored in documents as light-theme hex values (portable to DOCX/PDF/HTML export);
 * editor.css remaps exactly these values for the dark theme so contrast is preserved. Shared: the HTML normaliser
 * (clipboard and import alike) keeps only these colours.
 */
export const TEXT_COLORS = [
  { id: 'gray', label: 'Серый', value: '#6b7280' },
  { id: 'brown', label: 'Коричневый', value: '#8b5e3c' },
  { id: 'orange', label: 'Оранжевый', value: '#b5540e' },
  { id: 'yellow', label: 'Жёлтый', value: '#8a6d00' },
  { id: 'green', label: 'Зелёный', value: '#2f7d4f' },
  { id: 'blue', label: 'Синий', value: '#2f5fa8' },
  { id: 'purple', label: 'Фиолетовый', value: '#6e48a8' },
  { id: 'pink', label: 'Розовый', value: '#a83a73' },
  { id: 'red', label: 'Красный', value: '#b4372b' },
  { id: 'teal', label: 'Бирюзовый', value: '#23766f' },
];

export const HIGHLIGHTS = [
  { id: 'gray', label: 'Серый фон', value: '#eceef1' },
  { id: 'brown', label: 'Коричневый фон', value: '#f3ebe4' },
  { id: 'orange', label: 'Оранжевый фон', value: '#fdebdc' },
  { id: 'yellow', label: 'Жёлтый фон', value: '#fff3b0' },
  { id: 'green', label: 'Зелёный фон', value: '#e2f3e8' },
  { id: 'blue', label: 'Синий фон', value: '#e3edfb' },
  { id: 'purple', label: 'Фиолетовый фон', value: '#efe7fa' },
  { id: 'pink', label: 'Розовый фон', value: '#fae6f0' },
  { id: 'red', label: 'Красный фон', value: '#fbe4e1' },
  { id: 'teal', label: 'Бирюзовый фон', value: '#def3f1' },
];
