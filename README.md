# Mdrix

Editor Markdown para desktop Linux, focado em abrir um documento individual, alternar entre leitura e edição e salvar no próprio arquivo. Não depende de vault, banco de dados ou serviço de rede para renderizar conteúdo.

## Arquitetura

O app usa Tauri 2, Rust, React e TypeScript. A interface é uma SPA servida no WebView do sistema; o núcleo Rust cuida da integração desktop e das operações de arquivos, chamadas pelo frontend através dos comandos Tauri. No Linux, o WebView é fornecido pelo WebKitGTK.

Essa é a arquitetura padrão prevista pelo Tauri: [visão geral da arquitetura](https://v2.tauri.app/concept/architecture/), [comandos frontend/Rust](https://v2.tauri.app/develop/calling-rust/) e [configuração de frontend](https://v2.tauri.app/start/frontend/). A documentação do Tauri recomenda Vite para aplicações SPA, como a interface deste projeto.

## Desenvolvimento

Requisitos: Rust stable, Node.js com npm, WebKitGTK 4.1 e as ferramentas nativas de compilação do Tauri para Linux.

Na raiz do repositório:

- Instale as dependências web: `npm install`
- Inicie o app em desenvolvimento: `npm run tauri dev`
- Abra uma fixture local: `npm run tauri dev -- -- -- fixtures/01-basic.md`
- Gere o frontend: `npm run build`
- Gere o executável Tauri sem pacote de distribuição: `npm run tauri build -- --no-bundle`

O app também abre documentos pela interface ou com Ctrl+O e salva com Ctrl+S.

## Estrutura

- `src/app`: estado da aplicação e ciclo de vida do documento.
- `src/components`: componentes compartilhados da interface.
- `src/markdown`: renderização de Markdown, matemática, diagramas e imagens locais.
- `src/styles`: tema e layout.
- `src-tauri/src/commands`: operações de documento, imagens locais e links externos.
- `src-tauri/src/state.rs`: estado de inicialização do app.

## Pendência de desempenho

Há um bug aberto ao abrir documentos Markdown grandes: um arquivo de aproximadamente 2 MiB congelou a interface por mais de um minuto. Isso precisa ser corrigido antes de distribuir o app. A causa ainda precisa ser isolada; a leitura e conversão do documento no backend, a transferência do texto pelo IPC e a renderização completa na interface são pontos a medir.

A interface também mantém as superfícies de leitura e edição montadas ao mesmo tempo, ocultando a inativa. Avaliar montagem sob demanda e renderização incremental, preservando a troca de modo e o conteúdo do documento.

## Recursos locais de validação

As pastas `fixtures/` e `scripts/` permanecem disponíveis na cópia de desenvolvimento para validação manual e geração de documentos grandes. São ignoradas pelo Git e não fazem parte do repositório; uma cópia recém-clonada não as inclui.
