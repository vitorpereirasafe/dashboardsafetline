# Dashboard PCP — Planejamento de Injeção

Dashboard 100% client-side (não precisa de servidor Python/Flask) que lê PDFs de
planejamento de injeção (PCP) diretamente no navegador usando PDF.js e organiza
as remessas em giros, com 4 planos simultâneos lado a lado.

## Como funciona

- Arraste (ou clique para selecionar) um PDF em qualquer um dos 4 quadrantes.
- O parser identifica os giros (ex: "1 FALCON", "2 ANDALUZ") e as remessas
  (códigos numéricos de 4 a 7 dígitos) e seus respectivos modelos, usando a
  posição das colunas no PDF — não depende de texto fixo, então funciona com
  qualquer nome de grupo (FALCON, ANDALUZ, etc).
- Clique **duas vezes** numa remessa para marcar como **entregue** (fica verde).
- Clique duas vezes novamente numa remessa já entregue para **removê-la** da lista.
- Botão **Reset** no topo limpa os 4 planos.

## Deploy no Render (Static Site)

1. Suba este repositório para o GitHub (veja abaixo).
2. No [Render](https://dashboard.render.com), clique em **New > Static Site**.
3. Conecte o repositório `dashboard-pcp`.
4. Configure:
   - **Build Command:** (deixe vazio)
   - **Publish Directory:** `.`
5. Clique em **Create Static Site**.

O Render também detecta o `render.yaml` incluso automaticamente, caso prefira
usar **Blueprint** (`New > Blueprint`) em vez de configurar manualmente.

## Subir para o GitHub

```bash
git init
git add .
git commit -m "Dashboard PCP - leitura de PDF client-side"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/dashboard-pcp.git
git push -u origin main
```

## Estrutura

- `index.html` — aplicação completa (HTML + CSS + JS), incluindo o parser de
  PDF via [PDF.js](https://mozilla.github.io/pdf.js/) carregado por CDN.
- `render.yaml` — configuração de deploy automático no Render.

Nenhuma dependência de backend é necessária — tudo roda no navegador do usuário.
