# Instruções de trabalho para o Mdrix

## Arquitetura

- Siga com Tauri 2, Rust, React e TypeScript.
- `src/app` coordena estado e ciclo de vida do documento; `src/components` contém a interface; `src/markdown` contém a visualização.
- `src-tauri/src/commands` agrupa comandos por responsabilidade. O backend Rust mantém o acesso ao sistema de arquivos e a validação dos caminhos.
- No Linux/Wayland, o seletor de arquivos deve usar o portal XDG com a janela principal como parent; mantenha também a guarda contra aberturas simultâneas na interface.
- Mantenha a renderização offline por padrão e preserve os limites de segurança para imagens locais e links externos.
- Centralize documentação em `README.md` e neste arquivo.

A separação atual entre SPA e núcleo Rust é adequada ao modelo do Tauri. Não acrescente Redux ou uma camada genérica de serviços sem uma necessidade concreta. Se `src/app/App.tsx` continuar crescendo, extraia o ciclo de vida do documento para um hook como `useDocumentSession` e centralize `invoke` em um módulo de comandos tipados, deixando o componente coordenar a interface.

## Arquivos locais

- `fixtures/` e `scripts/` são recursos locais para validação. São ignorados de propósito; não os force para o índice do Git e preserve-os na cópia de desenvolvimento.
- Não adicione outros relatórios, ADRs, planos ou documentação ao repositório.
- Não apague nem sobrescreva arquivos Markdown do usuário durante validação.

## Responsividade de documentos grandes

A abertura de um arquivo com aproximadamente 2 MiB congelava a interface por mais de um minuto. O fluxo foi alterado para manter o WebView responsivo, mas a regressão ainda é um bloqueador de distribuição até passar pela validação manual em build de produção.

Implementação atual:

- `load_document` e `save_document` movem I/O e hash para `tauri::async_runtime::spawn_blocking`; não use `std::fs` diretamente em um comando `async`.
- `MarkdownViewer` usa ReactMarkdown para documentos abaixo de 128 KiB. Acima desse limite, `markdown.worker.ts` executa parse, plugins de Markdown, realce e slugs fora da thread de interface; KaTeX é aplicado apenas aos blocos matemáticos visíveis no WebView.
- O worker envia blocos em lotes e `MarkdownWorkerRenderer` monta apenas blocos próximos à janela visível. Preserve a ordem dos slugs, a posição de rolagem e os plugins suportados ao alterar esse fluxo.
- `App.tsx` monta somente o leitor ou CodeMirror, de acordo com o modo atual. Evite voltar a manter a superfície inativa montada.
- O estado de carregamento precisa continuar visível durante a leitura do arquivo e o processamento Markdown. Erros do worker devem deixar o conteúdo acessível no modo de edição.

Valide abertura, rolagem e edição em build de produção usando os arquivos grandes de `fixtures/`. Confirme que a interface responde durante parse e montagem dos blocos, que Mermaid, matemática e imagens locais continuam funcionando e que as trocas de modo preservam conteúdo e posição. Só avalie IPC binário ou transferência em partes se uma medição mostrar que a serialização JSON continua sendo um gargalo.

A documentação oficial do Tauri informa que comandos síncronos rodam na thread principal por padrão, recomenda comandos assíncronos para tarefas pesadas e alerta que respostas JSON grandes podem ter custo. Use isso como orientação para investigar, não como prova isolada da causa do congelamento.

## Validação de mudanças

- Frontend: `npm run build`.
- Rust: `cargo fmt --manifest-path src-tauri/Cargo.toml` e `cargo check --manifest-path src-tauri/Cargo.toml`.
- Ao alterar a abertura ou renderização Markdown, valide manualmente fixtures locais relevantes e confirme que a interface continua responsiva com documentos grandes.
