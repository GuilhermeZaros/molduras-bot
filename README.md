# Chat-bot WhatsApp + Controle de Estoque — Vera Molduras e Decoração

Sistema de atendimento automatizado no WhatsApp e de controle de estoque/financeiro
para a molduraria **Vera Molduras e Decoração** (Paranavaí-PR).

## O que faz

- **Atendente virtual no WhatsApp ("Julia")** — responde clientes, busca molduras e
  materiais no catálogo, calcula orçamento, envia fotos e entende áudio e imagem. Feita
  em Node + [Baileys](https://github.com/WhiskeySockets/Baileys) (WhatsApp) + Google Gemini.
- **Controle de estoque** — Google Sheets como banco e Google Apps Script como API e
  interface web dos funcionários: vendas (quadro/avulso), entradas, cadastro e edição de
  produtos, consulta, relatórios financeiros e um simulador de viabilidade de serviço.
- **Caderno digital (financeiro)** — lançamento de gastos e vendas pelo celular, com
  dashboard de fluxo de caixa (entradas × saídas, saldo acumulado e por categoria).
- **Oficina (ordens de serviço)** — o atendimento abre a ordem, a oficina marca como
  pronta, a Julia avisa o cliente no WhatsApp automaticamente e, na entrega, o valor
  entra no financeiro.
- **Login e papéis de acesso** — login por e-mail/senha com sessão por token; os papéis
  (atendimento, oficina, dono) controlam o que cada funcionário enxerga.

## Regras de negócio

- Moldura é cobrada pelo **perímetro** (metro linear).
- Vidro, chapa e espelho são cobrados pela **área** (m²).
- A **baixa de estoque** da moldura usa o consumo real na vara: perímetro + cantos
  (8 × perfil) + a perda dos cortes em 45° (4 × √2 × perfil, que cresce com a largura do
  perfil) + a perda da serra. A cobrança ao cliente continua pelo perímetro.
- Com **paspatur**, o quadro inteiro cresce (moldura/vidro/chapa cotados no tamanho
  externo = foto + 2 × borda) e o paspatur é cobrado por m².

## Estrutura

| Pasta | O quê |
|---|---|
| `apps-script/` | Backend no Google Apps Script: cálculo de orçamento, API JSON e a interface web dos funcionários (HTML/CSS/JS) |
| `lib/` | O bot do WhatsApp (Baileys + Gemini), as tools, a mídia (áudio/foto) e o acesso à API |
| `index.js` | Loop principal do WhatsApp |
| `scripts/` | Utilitários (chat no terminal, smoke tests) |
| `test/` | Testes automatizados (`node --test`) |

## Como rodar

```bash
npm install
npm test        # roda os testes
npm run chat    # conversa com a Julia no terminal
npm start       # sobe o bot do WhatsApp
```

O backend (Apps Script) é versionado com [clasp](https://github.com/google/clasp):
`clasp push` para subir o código e `clasp deploy` para publicar.

### Variáveis de ambiente (`.env`)

```
GEMINI_API_KEY=...      # chave do Google Gemini
APPS_SCRIPT_URL=...     # URL /exec do Web App do Apps Script
OFICINA_TOKEN=...       # token do aviso automático da oficina
```
