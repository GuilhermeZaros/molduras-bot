// lib/modelos.js — fotos-modelo (assets do bot, do Drive) que a Julia manda pro cliente
// VER como a loja faz certificado e camiseta. Não é catálogo (Sheets) — são assets fixos.
function thumb(id) {
  return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1000';
}

export const MODELOS = {
  certificado: [
    { url: thumb('15Xsk5hkw-iOw8SygwZS9jvg8CBZggqU6'),
      legenda: '1 — Com paspatur: uma borda de papel-cartão em volta, dá um acabamento mais elegante ✨' },
    { url: thumb('1-4plRkHp3qwRsk2jUi3DZF0gwf9R0woj'),
      legenda: '2 — Dois vidros: o certificado fica entre dois vidros, dá pra ver os dois lados' },
    { url: thumb('1JW8LVhNGTwCAI9tvKXN-Xwfys1_FplWX'),
      legenda: '3 — Direto na moldura: o jeito mais simples e econômico' }
  ],
  camiseta: [
    { url: thumb('13rnZu5RX-UrwWuHR3y3L-i4Y9WS3WisL'), legenda: 'Olha como a gente faz (exemplo)' },
    { url: thumb('1abv0Tt8TzvE7eyYej0uk1tdj3j0lxjI_'), legenda: 'Outro exemplo nosso' }
  ]
};

// Devolve a lista de fotos de um tipo. Lança se o tipo não existir. PURO.
export function modelosDe(tipo) {
  const lista = MODELOS[tipo];
  if (!lista) throw new Error('tipo de modelo desconhecido: ' + tipo);
  return lista;
}
