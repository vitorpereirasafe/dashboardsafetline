# Dashboard PCP — sincronizado em tempo real

Dashboard que lê PDFs de planejamento de injeção (PCP) diretamente no navegador
usando PDF.js, salva o estado em PostgreSQL no Render e organiza
as remessas em giros, com até 6 planos simultâneos em duas colunas. Os quatro
primeiros permanecem na tela principal e os planos E e F ficam logo abaixo,
acessíveis pela rolagem vertical.

## Como funciona

- Arraste (ou clique para selecionar) um PDF em qualquer um dos 6 espaços.
- O parser identifica os giros (ex: "1 FALCON", "2 ANDALUZ") e as remessas
  (códigos numéricos de 4 a 7 dígitos) e seus respectivos modelos, usando a
  posição das colunas no PDF — não depende de texto fixo, então funciona com
  qualquer nome de grupo (FALCON, ANDALUZ, etc).
- Clique **duas vezes** numa remessa para marcar como **entregue** (fica verde).
- Clique duas vezes novamente numa remessa já entregue para **removê-la** da lista.
- Botão **Reset** no topo limpa os 6 planos.
- Arraste o divisor vertical para ajustar a largura das duas colunas; dê dois
  cliques nele para voltar ao tamanho padrão.

## O que fica salvo

- Os 6 planejamentos, giros, OFs e situação de cada OF.
- Cliques vermelho, amarelo, confirmado e removido.
- Histórico de giros e planejamentos concluídos.
- Uma cópia local instantânea no navegador para suportar queda momentânea da internet.
- Atualizações ao vivo nos demais computadores com o dashboard aberto.

O indicador no topo mostra `Sincronizado`, `Salvando` ou `Offline`.

## Publicar no Render com PostgreSQL

1. Suba este repositório para o GitHub (veja abaixo).
2. No Render, abra **New > Blueprint**.
3. Conecte o repositório e selecione o arquivo `render.yaml` da raiz.
4. Confira os dois recursos que serão criados: `dashboard-pcp` e
   `dashboard-pcp-db`.
5. Clique em **Apply** e aguarde o serviço ficar `Live`.

Não crie como Static Site. A versão sincronizada precisa ser um **Web Service**.
O próprio Blueprint injeta a conexão privada do PostgreSQL no servidor; não é
necessário copiar senha ou URL do banco.

Se já existir um Static Site antigo com o nome `dashboard-pcp`, exclua-o ou
renomeie-o antes de aplicar o Blueprint, pois o tipo de serviço não pode ser
convertido de Static Site para Web Service.

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

- `index.html` — interface completa, parser de PDF e cliente de sincronização.
- `server.js` — API, persistência PostgreSQL e WebSocket em tempo real.
- `package.json` / `package-lock.json` — dependências fixadas do servidor.
- `render.yaml` — cria o Web Service e o PostgreSQL automaticamente.

## Observação sobre o plano gratuito

O projeto vem configurado com os planos gratuitos para facilitar o primeiro
teste. O serviço pode entrar em repouso depois de 15 minutos sem acessos e levar
alguns instantes para acordar. O PostgreSQL gratuito expira 30 dias após a
criação e não oferece backups. Para uso contínuo na fábrica, faça o teste e
depois altere os planos dos dois recursos no painel do Render antes desse prazo.
