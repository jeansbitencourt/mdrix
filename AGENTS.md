# Instruções de trabalho para o Mdrix

## Arquitetura

- Siga com Tauri 2, Rust, React e TypeScript.
- `src/app` coordena estado e ciclo de vida do documento; `src/components` contém a interface; `src/markdown` contém a visualização.
- `src-tauri/src/commands` agrupa comandos por responsabilidade. O backend Rust mantém o acesso ao sistema de arquivos e a validação dos caminhos.
- Mantenha a renderização offline por padrão e preserve os limites de segurança para imagens locais e links externos.
- Centralize documentação em `README.md` e neste arquivo.

A separação atual entre SPA e núcleo Rust é adequada ao modelo do Tauri. Não acrescente Redux ou uma camada genérica de serviços sem uma necessidade concreta. Se `src/app/App.tsx` continuar crescendo, extraia o ciclo de vida do documento para um hook como `useDocumentSession` e centralize `invoke` em um módulo de comandos tipados, deixando o componente coordenar a interface.

## Arquivos locais

- `fixtures/` e `scripts/` são recursos locais para validação. São ignorados de propósito; não os force para o índice do Git e preserve-os na cópia de desenvolvimento.
- Não adicione outros relatórios, ADRs, planos ou documentação ao repositório.
- Não apague nem sobrescreva arquivos Markdown do usuário durante validação.

## Responsividade de documentos grandes

A abertura de um arquivo com aproximadamente 2 MiB congelou a interface por mais de um minuto. Esse bug é um bloqueador para distribuição.

Investigue as etapas separadamente, sem presumir uma causa antes de medir:

1. `load_document` e `save_document` são comandos Rust síncronos e fazem I/O. A documentação do Tauri recomenda comandos assíncronos para trabalho pesado; avalie I/O assíncrono ou `spawn_blocking`. Um comando `async` que chama `std::fs` diretamente ainda pode bloquear uma thread do runtime.
2. A interface renderiza o Markdown inteiro e mantém CodeMirror montado mesmo quando o modo de edição está oculto. Meça o custo de cada caminho e teste montar somente a superfície visível.
3. Meça o custo de serializar e enviar o texto via IPC. Só considere uma resposta binária ou transmissão em partes se o perfil mostrar que a transferência JSON é relevante.
4. Valide abertura, rolagem e edição em build de produção usando os arquivos de `fixtures/`. A interface deve continuar respondendo durante a carga e as trocas de modo não podem perder conteúdo ou posição.

A documentação oficial do Tauri informa que comandos síncronos rodam na thread principal por padrão, recomenda comandos assíncronos para tarefas pesadas e alerta que respostas JSON grandes podem ter custo. Use isso como orientação para investigar, não como prova isolada da causa do congelamento.

## Validação de mudanças

- Frontend: `npm run build`.
- Rust: `cargo fmt --manifest-path src-tauri/Cargo.toml` e `cargo check --manifest-path src-tauri/Cargo.toml`.
- Ao alterar a abertura ou renderização Markdown, valide manualmente fixtures locais relevantes e confirme que a interface continua responsiva com documentos grandes.
