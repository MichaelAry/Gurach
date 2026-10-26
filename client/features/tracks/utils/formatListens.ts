// features/tracks/utils/formatListens.ts

/** Русские формы числительного: 1 прослушивание / 3 прослушивания / 7 прослушиваний */
export function pluralRu(n: number, forms: [string, string, string]): string {
  const mod100 = Math.abs(n) % 100;
  const mod10 = mod100 % 10;
  if (mod100 > 10 && mod100 < 20) return forms[2];
  if (mod10 > 1 && mod10 < 5) return forms[1];
  if (mod10 === 1) return forms[0];
  return forms[2];
}

/** «3 742 прослушивания» — число в ru-локали + правильная форма слова. */
export function formatListens(n: number): string {
  const formatted = new Intl.NumberFormat('ru-RU').format(n);
  return `${formatted} ${pluralRu(n, [
    'прослушивание',
    'прослушивания',
    'прослушиваний',
  ])}`;
}
