# Dashboard PCP — sincronizado em tempo real

Dashboard que lê PDFs de planejamento de injeção (PCP) diretamente no navegador
usando PDF.js, salva o estado em PostgreSQL no Render e organiza
as remessas em giros, com até 8 planos simultâneos em duas colunas. Os quatro
primeiros permanecem na tela principal; E/F e G/H ficam abaixo, acessíveis
pela rolagem vertical.

## Como funciona

- Arraste (ou clique para selecionar) um PDF em qualquer um dos 8 espaços.
- O parser identifica os giros (ex: "1 FALCON", "2 ANDALUZ") e as remessas
  (códigos numéricos de 4 a 7 dígitos) e seus respectivos modelos, usando a
  posição das colunas no PDF — não depende de texto fixo, então funciona com
  qualquer nome de grupo (FALCON, ANDALUZ, etc).
- Cada par de cliques avança a OF: normal → vermelho (intermediário entregou)
  → laranja (montagem iniciada) → verde (OF entregue).
- Com o mouse sobre uma OF, pressione **Enter** para removê-la diretamente.
- O tópico **Como funcionam os cliques** no menu explica os comandos na própria tela.
- O botão **Reset** limpa os 8 planos somente após digitar a senha `1111` e
  confirmar novamente a exclusão.
- Arraste o divisor vertical para ajustar a largura das duas colunas; dê dois
  cliques nele para voltar ao tamanho padrão.
- Arraste o cabeçalho de qualquer plano e solte sobre outro espaço para trocar
  os dois planejamentos de posição, levando junto OFs, cliques e estados.
- Use o pequeno **×** no cabeçalho para fechar apenas aquele planejamento; o
  sistema pede confirmação mostrando o nome antes de excluir.
- O menu **Versões** permite restaurar uma das últimas 20 alterações, sempre
  confirmando a ação e exibindo a data e o horário registrados.
- Com a pasta automática autorizada, o dashboard atualiza o arquivo anual
  **Auditoria_PCP_2026.xlsx**, preservando os registros anteriores, eliminando
  duplicidades e acrescentando abas mensais. Sem a autorização da pasta, às
  **23:59** será baixada uma nova cópia de segurança.

## O que fica salvo

- Os 8 planejamentos, giros, OFs e situação de cada OF.
- Cliques vermelho, amarelo, confirmado e removido.
- Histórico de giros e planejamentos concluídos.
- Uma cópia local instantânea no navegador para suportar queda momentânea da internet.
- Atualizações ao vivo nos demais computadores com o dashboard aberto.

O indicador no topo mostra `Sincronizado`, `Salvando` ou `Offline`.

## Menu superior

- Exibe o horário da última sincronização ao lado do status.
- Mantém visíveis somente Entregues, Pendentes, Total e Resumo.
- Reúne em **☰ Ações**: inserir planejamento, regras dos cliques, Histórico
  Excel, versões anteriores, pasta automática, restaurar tamanho dos painéis
  e Reset protegido por senha e confirmação.
- Mostra a quantidade de versões disponíveis, até o limite de 20.
- Adapta automaticamente os textos e cartões em telas menores.

## Atualizar no GitHub e no Render

1. Substitua os arquivos do repositório pelos arquivos deste pacote.
2. Confirme o commit no GitHub.
3. O Web Service existente fará o deploy automático; se necessário, use
   **Manual Deploy > Deploy latest commit** no Render.
4. Aguarde o serviço ficar `Live` e atualize a página com `Ctrl + F5`.

Não crie outro banco. O `render.yaml` continua usando o PostgreSQL existente
`safetline-os-db`, na tabela exclusiva `dashboard_state`.

Ao iniciar, o servidor converte automaticamente o estado salvo de 6 para 8
planos: A–F e todos os cliques permanecem intactos; G e H são adicionados vazios.

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
- `render.yaml` — mantém o Web Service conectado ao banco existente.

## Observação sobre o plano gratuito

O serviço gratuito pode entrar em repouso e levar alguns instantes para acordar.
